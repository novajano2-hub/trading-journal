import type { JournalKind, NoteTemplate } from '@/domain/types';
import { NotFoundError, type TemplatesRepo } from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { rwTx } from './tx';

/** The kind's templates. Call inside a transaction that includes `db.templates`. */
async function ofKind(
  db: KeelDb,
  ws: string,
  kind: JournalKind,
): Promise<NoteTemplate[]> {
  return db.templates
    .where('workspaceId')
    .equals(ws)
    .filter((t) => t.kind === kind)
    .toArray();
}

/**
 * Makes `id` the kind's only default. With no id it changes nothing: a kind
 * may have no default (TradeZella lets it be removed), and a new note of that
 * kind then starts empty. Call inside an rw transaction that includes
 * `db.templates`.
 */
async function settleDefault(
  db: KeelDb,
  ws: string,
  kind: JournalKind,
  id?: string,
): Promise<void> {
  if (id === undefined) return;
  for (const t of await ofKind(db, ws, kind)) {
    const isDefault = t.id === id;
    if (t.isDefault !== isDefault) await db.templates.put({ ...t, isDefault });
  }
}

export function localTemplates(ctx: LocalContext): TemplatesRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.templates.where('workspaceId').equals(ws).toArray();
      return rows.sort(
        (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
      );
    },

    async save(ws, draft) {
      const db = await ctx.db();
      return rwTx(db, [db.templates], async () => {
        const stored =
          draft.id === undefined
            ? undefined
            : await db.templates.get([ws, draft.id]);
        const template: NoteTemplate = {
          ...draft,
          id: draft.id ?? ctx.newId(),
          workspaceId: ws,
          // A built-in keeps its kind.
          kind: stored?.builtIn ? stored.kind : draft.kind,
          builtIn: stored?.builtIn ?? false,
        };
        await db.templates.put(template);
        await settleDefault(
          db,
          ws,
          template.kind,
          template.isDefault ? template.id : undefined,
        );
        return (await db.templates.get([ws, template.id]))!;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.templates], async () => {
        const template = await db.templates.get([ws, id]);
        if (!template) throw new NotFoundError('template', id);
        if (template.builtIn) throw new Error('built-in template');
        await db.templates.delete([ws, id]);
      });
    },

    async setDefault(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.templates], async () => {
        const template = await db.templates.get([ws, id]);
        if (!template) throw new NotFoundError('template', id);
        await settleDefault(db, ws, template.kind, id);
      });
    },
  };
}

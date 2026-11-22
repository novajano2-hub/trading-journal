import type { Tag } from '@/domain/types';
import {
  DuplicateNameError,
  NotFoundError,
  type TagsRepo,
} from '../repository';
import type { LocalContext } from './context';
import { rwTx } from './tx';
import type { KeelDb } from './db';
import { mergePatch } from '../merge';

/** Tag names are stored trimmed and lowercase. */
const normalName = (name: string) => name.trim().toLowerCase();

/** Another tag in the workspace and category with this name, ignoring case (names stored before the rule may carry capitals). */
async function sameName(db: KeelDb, tag: Tag): Promise<Tag | undefined> {
  const wanted = tag.name.toLowerCase();
  return db.tags
    .where('workspaceId')
    .equals(tag.workspaceId)
    .filter(
      (t) =>
        t.id !== tag.id &&
        t.categoryId === tag.categoryId &&
        t.name.toLowerCase() === wanted,
    )
    .first();
}

async function assertCategory(
  db: KeelDb,
  ws: string,
  id: string,
): Promise<void> {
  if (!(await db.tagCategories.get([ws, id])))
    throw new NotFoundError('tag category', id);
}

export function localTags(ctx: LocalContext): TagsRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const [rows, categories] = await Promise.all([
        db.tags.where('workspaceId').equals(ws).toArray(),
        db.tagCategories.where('workspaceId').equals(ws).toArray(),
      ]);
      const categoryName = new Map(categories.map((c) => [c.id, c.name]));
      const nameOf = (t: Tag) => categoryName.get(t.categoryId) ?? '';
      return rows.sort(
        (a, b) =>
          nameOf(a).localeCompare(nameOf(b)) || a.name.localeCompare(b.name),
      );
    },

    async create(ws, input) {
      const db = await ctx.db();
      const tag: Tag = {
        ...input,
        name: normalName(input.name),
        id: ctx.newId(),
        workspaceId: ws,
      };
      return rwTx(db, [db.tags, db.tagCategories], async () => {
        await assertCategory(db, ws, tag.categoryId);
        const existing = await sameName(db, tag);
        if (existing) return existing;
        await db.tags.put(tag);
        return tag;
      });
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.tags, db.tagCategories], async () => {
        const tag = await db.tags.get([ws, id]);
        if (!tag) throw new NotFoundError('tag', id);
        const next: Tag = {
          ...mergePatch(tag, patch, ['description']),
          id,
          workspaceId: ws,
        };
        if (patch.name !== undefined) next.name = normalName(patch.name);
        if (next.categoryId !== tag.categoryId)
          await assertCategory(db, ws, next.categoryId);
        const clash = await sameName(db, next);
        if (clash) throw new DuplicateNameError(clash.name);
        await db.tags.put(next);
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.tags, db.trades], async () => {
        if (!(await db.tags.get([ws, id]))) throw new NotFoundError('tag', id);
        await dropTagsFromTrades(db, ws, [id]);
        await db.tags.delete([ws, id]);
      });
    },
  };
}

/** Drops `tagIds` from every trade in the workspace. Call inside an rw transaction that includes `db.trades`. */
export async function dropTagsFromTrades(
  db: KeelDb,
  ws: string,
  tagIds: readonly string[],
): Promise<void> {
  const gone = new Set(tagIds);
  if (gone.size === 0) return;
  await db.trades
    .where('workspaceId')
    .equals(ws)
    .filter((t) => t.tagIds.some((id) => gone.has(id)))
    .modify((t) => {
      t.tagIds = t.tagIds.filter((id) => !gone.has(id));
    });
}

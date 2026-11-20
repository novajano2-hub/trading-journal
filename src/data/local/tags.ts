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

/** Throws when another tag in the workspace and category has the name, ignoring case. */
async function assertUnique(db: KeelDb, tag: Tag): Promise<void> {
  const wanted = tag.name.toLowerCase();
  const clash = await db.tags
    .where('workspaceId')
    .equals(tag.workspaceId)
    .filter(
      (t) =>
        t.id !== tag.id &&
        t.category === tag.category &&
        t.name.toLowerCase() === wanted,
    )
    .first();
  if (clash) throw new DuplicateNameError(clash.name);
}

export function localTags(ctx: LocalContext): TagsRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.tags.where('workspaceId').equals(ws).toArray();
      return rows.sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
      );
    },

    async create(ws, input) {
      const db = await ctx.db();
      const tag: Tag = {
        ...input,
        name: input.name.trim(),
        id: ctx.newId(),
        workspaceId: ws,
      };
      return rwTx(db, [db.tags], async () => {
        await assertUnique(db, tag);
        await db.tags.put(tag);
        return tag;
      });
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.tags], async () => {
        const tag = await db.tags.get([ws, id]);
        if (!tag) throw new NotFoundError('tag', id);
        const next: Tag = { ...mergePatch(tag, patch), id, workspaceId: ws };
        next.name = next.name.trim();
        await assertUnique(db, next);
        await db.tags.put(next);
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.tags, db.trades], async () => {
        if (!(await db.tags.get([ws, id]))) throw new NotFoundError('tag', id);
        await db.trades
          .where('workspaceId')
          .equals(ws)
          .filter((t) => t.tagIds.includes(id))
          .modify((t) => {
            t.tagIds = t.tagIds.filter((tagId) => tagId !== id);
          });
        await db.tags.delete([ws, id]);
      });
    },
  };
}

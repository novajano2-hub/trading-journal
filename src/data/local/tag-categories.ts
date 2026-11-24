import type { TagCategory } from '@/domain/types';
import {
  DuplicateNameError,
  NotFoundError,
  type TagCategoriesRepo,
} from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { dropTagsFromTrades } from './tags';
import { rwTx } from './tx';

const COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Throws RangeError for an empty name or a colour that isn't #RRGGBB, DuplicateNameError for another category's name. */
async function assertValid(db: KeelDb, c: TagCategory): Promise<void> {
  if (c.name === '') throw new RangeError('A tag category needs a name');
  if (!COLOR.test(c.color))
    throw new RangeError(`Colour must be #RRGGBB, got "${c.color}"`);
  const wanted = c.name.toLowerCase();
  const clash = await db.tagCategories
    .where('workspaceId')
    .equals(c.workspaceId)
    .filter((x) => x.id !== c.id && x.name.toLowerCase() === wanted)
    .first();
  if (clash) throw new DuplicateNameError(clash.name);
}

export function localTagCategories(ctx: LocalContext): TagCategoriesRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.tagCategories
        .where('workspaceId')
        .equals(ws)
        .toArray();
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    },

    async create(ws, input) {
      const db = await ctx.db();
      const category: TagCategory = {
        id: ctx.newId(),
        workspaceId: ws,
        name: input.name.trim(),
        color: input.color,
        builtIn: false,
      };
      return rwTx(db, [db.tagCategories], async () => {
        await assertValid(db, category);
        await db.tagCategories.put(category);
        return category;
      });
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.tagCategories], async () => {
        const category = await db.tagCategories.get([ws, id]);
        if (!category) throw new NotFoundError('tag category', id);
        const next: TagCategory = {
          ...category,
          ...(patch.name !== undefined && { name: patch.name.trim() }),
          ...(patch.color !== undefined && { color: patch.color }),
        };
        await assertValid(db, next);
        await db.tagCategories.put(next);
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.tagCategories, db.tags, db.trades], async () => {
        const category = await db.tagCategories.get([ws, id]);
        if (!category) throw new NotFoundError('tag category', id);
        if (category.builtIn) throw new Error('built-in category');
        const tagKeys = await db.tags
          .where('workspaceId')
          .equals(ws)
          .filter((t) => t.categoryId === id)
          .primaryKeys();
        await dropTagsFromTrades(
          db,
          ws,
          tagKeys.map(([, tagId]) => tagId),
        );
        await db.tags.bulkDelete(tagKeys);
        await db.tagCategories.delete([ws, id]);
      });
    },
  };
}

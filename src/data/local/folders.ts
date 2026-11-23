import type { NoteFolder } from '@/domain/types';
import {
  DuplicateNameError,
  NotFoundError,
  type FoldersRepo,
} from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { rwTx } from './tx';

/** The trimmed name; RangeError when nothing is left. */
function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new RangeError('A folder needs a name');
  return trimmed;
}

/** Another folder in the workspace with this name, ignoring case. */
async function taken(
  db: KeelDb,
  ws: string,
  name: string,
  exceptId?: string,
): Promise<NoteFolder | undefined> {
  const wanted = name.toLowerCase();
  return db.folders
    .where('workspaceId')
    .equals(ws)
    .filter((f) => f.id !== exceptId && f.name.toLowerCase() === wanted)
    .first();
}

export function localFolders(ctx: LocalContext): FoldersRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.folders.where('workspaceId').equals(ws).toArray();
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    },

    async create(ws, name) {
      const db = await ctx.db();
      const clean = cleanName(name);
      return rwTx(db, [db.folders], async () => {
        if (await taken(db, ws, clean)) throw new DuplicateNameError(clean);
        const folder: NoteFolder = {
          id: ctx.newId(),
          workspaceId: ws,
          name: clean,
          createdAt: ctx.now().toISOString(),
        };
        await db.folders.put(folder);
        return folder;
      });
    },

    async rename(ws, id, name) {
      const db = await ctx.db();
      const clean = cleanName(name);
      return rwTx(db, [db.folders], async () => {
        const folder = await db.folders.get([ws, id]);
        if (!folder) throw new NotFoundError('folder', id);
        if (await taken(db, ws, clean, id)) throw new DuplicateNameError(clean);
        const next = { ...folder, name: clean };
        await db.folders.put(next);
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.folders, db.journal], async () => {
        if (!(await db.folders.get([ws, id])))
          throw new NotFoundError('folder', id);
        await db.journal
          .where('workspaceId')
          .equals(ws)
          .filter((e) => e.folderId === id)
          .modify((e) => {
            delete e.folderId;
          });
        await db.folders.delete([ws, id]);
      });
    },
  };
}

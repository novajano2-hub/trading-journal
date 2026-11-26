import type { StoredFile } from '@/domain/types';
import {
  FileRejected,
  IMAGE_TYPES,
  NotFoundError,
  SHOT_MAX_BYTES,
  type FilesRepo,
} from '../repository';
import type { LocalContext } from './context';
import { isQuota } from './day-shots';
import type { KeelDb } from './db';
import { refuseLockedNote } from './routine-today';
import { rwTx } from './tx';

const IMAGES: ReadonlySet<string> = new Set(IMAGE_TYPES);

const NOTE_OWNER = 'note:';

/** Upload order: the creation time, then the id for files moved under one owner at the same instant. */
function byUpload(a: StoredFile, b: StoredFile): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Throws LockedDayError when `owner` is a daily note on a finished date: its
 * images cannot change then. Other owners are never locked (B55). Call inside
 * a transaction that includes `db.journal` and `db.days`.
 */
async function refuseLockedOwner(
  db: KeelDb,
  ws: string,
  owner: string,
): Promise<void> {
  if (!owner.startsWith(NOTE_OWNER)) return;
  await refuseLockedNote(
    db,
    ws,
    await db.journal.get([ws, owner.slice(NOTE_OWNER.length)]),
  );
}

/**
 * Deletes the files of one owner, or of each owner listed, in the workspace
 * (B56). Call inside an rw transaction that includes `db.files`.
 */
export async function deleteOwnerFiles(
  db: KeelDb,
  ws: string,
  owner: string | readonly string[],
): Promise<void> {
  const owners = typeof owner === 'string' ? [owner] : owner;
  if (owners.length === 0) return;
  await db.files
    .where('[workspaceId+owner]')
    .anyOf(owners.map((o): [string, string] => [ws, o]))
    .delete();
}

/**
 * Gives every file of owner `from` to owner `to`, keeping their ids and upload
 * times. Call inside an rw transaction that includes `db.files`; a note owner
 * is not checked against the day lock here (`FilesRepo.reassign` does).
 */
export async function moveOwnerFiles(
  db: KeelDb,
  ws: string,
  from: string,
  to: string,
): Promise<void> {
  if (from === to) return;
  await db.files
    .where('[workspaceId+owner]')
    .equals([ws, from])
    .modify({ owner: to });
}

export function localFiles(ctx: LocalContext): FilesRepo {
  return {
    async list(ws, owner) {
      const db = await ctx.db();
      const rows = await db.files
        .where('[workspaceId+owner]')
        .equals([ws, owner])
        .toArray();
      return rows.sort(byUpload);
    },

    async get(ws, id) {
      return (await ctx.db()).files.get([ws, id]);
    },

    async add(ws, owner, file, opts) {
      if (opts.images && !IMAGES.has(file.type)) throw new FileRejected('type');
      if (file.bytes.byteLength > SHOT_MAX_BYTES)
        throw new FileRejected('size');
      const db = await ctx.db();
      try {
        return await rwTx(db, [db.files, db.journal, db.days], async () => {
          await refuseLockedOwner(db, ws, owner);
          const existing = await db.files
            .where('[workspaceId+owner]')
            .equals([ws, owner])
            .toArray();
          // Upload order is the creation order, so a clock tie moves on a millisecond.
          const last = existing.reduce(
            (m, f) => (f.createdAt > m ? f.createdAt : m),
            '',
          );
          let at = ctx.now().getTime();
          if (last !== '' && at <= Date.parse(last)) at = Date.parse(last) + 1;
          const stored: StoredFile = {
            id: ctx.newId(),
            workspaceId: ws,
            owner,
            bytes: file.bytes,
            type: file.type,
            name: file.name,
            size: file.bytes.byteLength,
            createdAt: new Date(at).toISOString(),
          };
          await db.files.put(stored);
          return stored;
        });
      } catch (error) {
        if (isQuota(error)) throw new FileRejected('quota');
        throw error;
      }
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.files, db.journal, db.days], async () => {
        const stored = await db.files.get([ws, id]);
        if (!stored) throw new NotFoundError('file', id);
        await refuseLockedOwner(db, ws, stored.owner);
        await db.files.delete([ws, id]);
      });
    },

    async reassign(ws, from, to) {
      if (from === to) return;
      const db = await ctx.db();
      await rwTx(db, [db.files, db.journal, db.days], async () => {
        await refuseLockedOwner(db, ws, from);
        await refuseLockedOwner(db, ws, to);
        await moveOwnerFiles(db, ws, from, to);
      });
    },
  };
}

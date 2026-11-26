import type { NoteVersion } from '@/domain/types';
import {
  NOTE_VERSION_DAYS,
  NotFoundError,
  type JournalRepo,
  type NoteVersionsRepo,
} from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { refuseLockedNote } from './routine-today';
import { rwTx } from './tx';

const KEEP_MS = NOTE_VERSION_DAYS * 86_400_000;

/** Newest first; two versions of one instant sort by id so the order is fixed. */
function newestFirst(a: NoteVersion, b: NoteVersion): number {
  if (a.savedAt !== b.savedAt) return a.savedAt < b.savedAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Every stored version of one note. Call inside a transaction that includes `db.noteVersions`. */
function versionsOf(
  db: KeelDb,
  ws: string,
  noteId: string,
): Promise<NoteVersion[]> {
  return db.noteVersions
    .where('[workspaceId+noteId]')
    .equals([ws, noteId])
    .toArray();
}

/**
 * Deletes the versions of each note listed (the note is deleted for good).
 * Call inside an rw transaction that includes `db.noteVersions`.
 */
export async function deleteNoteVersions(
  db: KeelDb,
  ws: string,
  noteIds: readonly string[],
): Promise<void> {
  if (noteIds.length === 0) return;
  await db.noteVersions
    .where('[workspaceId+noteId]')
    .anyOf(noteIds.map((id): [string, string] => [ws, id]))
    .delete();
}

/** Two bodies are the same when they serialise the same: a body is plain JSON. */
function sameBody(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Kept versions of a note's body (B39). `journal` is the journal repository:
 * a restore writes the version's body through its save, so the day lock and
 * the first-edit stamp apply to it as to any other write of the note.
 */
export function localNoteVersions(
  ctx: LocalContext,
  journal: JournalRepo,
): NoteVersionsRepo {
  /** Drops the note's versions older than 30 days; call where the note's versions were just read. */
  async function purge(
    db: KeelDb,
    rows: readonly NoteVersion[],
  ): Promise<NoteVersion[]> {
    const cutoff = ctx.now().getTime() - KEEP_MS;
    const old = rows.filter((v) => Date.parse(v.savedAt) < cutoff);
    if (old.length === 0) return [...rows];
    await db.noteVersions.bulkDelete(
      old.map((v): [string, string] => [v.workspaceId, v.id]),
    );
    const gone = new Set(old.map((v) => v.id));
    return rows.filter((v) => !gone.has(v.id));
  }

  return {
    async list(ws, noteId) {
      const db = await ctx.db();
      return rwTx(db, [db.noteVersions], async () => {
        const rows = await purge(db, await versionsOf(db, ws, noteId));
        return rows.sort(newestFirst);
      });
    },

    async keep(ws, noteId, body, kind) {
      const db = await ctx.db();
      await rwTx(db, [db.noteVersions, db.journal], async () => {
        if (!(await db.journal.get([ws, noteId])))
          throw new NotFoundError('journal entry', noteId);
        const rows = (await purge(db, await versionsOf(db, ws, noteId))).sort(
          newestFirst,
        );
        if (rows[0] !== undefined && sameBody(rows[0].body, body)) return;
        await db.noteVersions.put({
          id: ctx.newId(),
          workspaceId: ws,
          noteId,
          body: structuredClone(body),
          savedAt: ctx.now().toISOString(),
          kind,
        });
      });
    },

    async restore(ws, noteId, versionId) {
      const db = await ctx.db();
      // What the journal's save needs, and the versions, in one transaction:
      // the "before restore" row and the new body land together or not at all.
      return rwTx(
        db,
        [db.noteVersions, db.journal, db.days, db.meta, db.trackers],
        async () => {
          const entry = await db.journal.get([ws, noteId]);
          if (!entry) throw new NotFoundError('journal entry', noteId);
          const version = await db.noteVersions.get([ws, versionId]);
          if (!version || version.noteId !== noteId)
            throw new NotFoundError('note version', versionId);
          await refuseLockedNote(db, ws, entry);
          await db.noteVersions.put({
            id: ctx.newId(),
            workspaceId: ws,
            noteId,
            body: structuredClone(entry.body),
            savedAt: ctx.now().toISOString(),
            kind: 'before-restore',
          });
          return journal.save(ws, {
            ...entry,
            body: structuredClone(version.body),
          });
        },
      );
    },
  };
}

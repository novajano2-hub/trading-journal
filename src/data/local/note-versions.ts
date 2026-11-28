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

/** How a body names a stored image: `keel-file:<id>` (the editor's `FILE_REF`). */
const FILE_REF = 'keel-file:';

/** Adds every stored file a body names, wherever in the body it sits, to `into`. */
function addFileRefs(body: unknown, into: Set<string>): void {
  if (typeof body === 'string') {
    if (body.startsWith(FILE_REF) && body.length > FILE_REF.length)
      into.add(body.slice(FILE_REF.length));
  } else if (Array.isArray(body)) {
    for (const item of body) addFileRefs(item, into);
  } else if (body !== null && typeof body === 'object') {
    for (const value of Object.values(body)) addFileRefs(value, into);
  }
}

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
  /**
   * Drops the note's versions older than 30 days, then the note's images that
   * neither its body nor a kept version names (B56). Call where the note's
   * versions were just read, inside an rw transaction that includes
   * `db.noteVersions`, `db.journal` and `db.files`.
   *
   * Only images uploaded before the cutoff go: an image a purged version held
   * was uploaded before that version was kept, and a newer one may be in the
   * editor but not yet in the saved body.
   */
  async function purge(
    db: KeelDb,
    ws: string,
    noteId: string,
    rows: readonly NoteVersion[],
  ): Promise<NoteVersion[]> {
    const cutoff = ctx.now().getTime() - KEEP_MS;
    const old = rows.filter((v) => Date.parse(v.savedAt) < cutoff);
    if (old.length === 0) return [...rows];
    await db.noteVersions.bulkDelete(
      old.map((v): [string, string] => [v.workspaceId, v.id]),
    );
    const gone = new Set(old.map((v) => v.id));
    const kept = rows.filter((v) => !gone.has(v.id));

    const named = new Set<string>();
    addFileRefs((await db.journal.get([ws, noteId]))?.body, named);
    for (const v of kept) addFileRefs(v.body, named);
    const unheld = (
      await db.files
        .where('[workspaceId+owner]')
        .equals([ws, `note:${noteId}`])
        .toArray()
    ).filter((f) => !named.has(f.id) && Date.parse(f.createdAt) < cutoff);
    if (unheld.length > 0)
      await db.files.bulkDelete(
        unheld.map((f): [string, string] => [ws, f.id]),
      );
    return kept;
  }

  return {
    async list(ws, noteId) {
      const db = await ctx.db();
      return rwTx(db, [db.noteVersions, db.journal, db.files], async () => {
        const rows = await purge(
          db,
          ws,
          noteId,
          await versionsOf(db, ws, noteId),
        );
        return rows.sort(newestFirst);
      });
    },

    async keep(ws, noteId, body, kind) {
      const db = await ctx.db();
      await rwTx(db, [db.noteVersions, db.journal, db.files], async () => {
        if (!(await db.journal.get([ws, noteId])))
          throw new NotFoundError('journal entry', noteId);
        const rows = (
          await purge(db, ws, noteId, await versionsOf(db, ws, noteId))
        ).sort(newestFirst);
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

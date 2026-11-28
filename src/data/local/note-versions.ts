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

/**
 * For each of `ids`, the first note that still shows it: its body or a kept
 * version names it (`note:<id>`), or `null` when only a template does. An id
 * nothing names is absent. Reads every journal body, kept version and
 * template of the workspace. Call inside a transaction that includes
 * `db.journal`, `db.noteVersions` and `db.templates`.
 */
async function shownBy(
  db: KeelDb,
  ws: string,
  ids: ReadonlySet<string>,
): Promise<Map<string, string | null>> {
  const found = new Map<string, string | null>();
  const read = (body: unknown, owner: string | null) => {
    const refs = new Set<string>();
    addFileRefs(body, refs);
    for (const id of refs)
      if (ids.has(id) && !found.has(id)) found.set(id, owner);
  };
  for (const e of await db.journal.where('workspaceId').equals(ws).toArray())
    read(e.body, `note:${e.id}`);
  for (const v of await db.noteVersions
    .where('workspaceId')
    .equals(ws)
    .toArray())
    read(v.body, `note:${v.noteId}`);
  for (const t of await db.templates.where('workspaceId').equals(ws).toArray())
    read(t.body, null);
  return found;
}

/**
 * Deletes the note images `ids`, which their own note no longer shows, unless
 * another body in the workspace still does (B56): an image copied across
 * notes keeps its `keel-file:` reference, and a Keel note import keeps the
 * ones the workspace still has. One that another note's body or kept version
 * names moves to that note, so it goes when that note stops showing it; one
 * only a template names stays as it is. The workspace's bodies are read only
 * when there is an image to delete. Call inside an rw transaction that
 * includes `db.files`, `db.journal`, `db.noteVersions` and `db.templates`,
 * after the notes and versions that no longer count are deleted.
 */
export async function dropNoteFiles(
  db: KeelDb,
  ws: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const showing = await shownBy(db, ws, new Set(ids));
  const gone = ids.filter((id) => !showing.has(id));
  if (gone.length > 0)
    await db.files.bulkDelete(gone.map((id): [string, string] => [ws, id]));
  for (const [id, owner] of showing)
    if (owner !== null) await db.files.update([ws, id], { owner });
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
   * neither its body, a kept version nor `keeping` (the body a keep is about
   * to store) names, unless another body in the workspace still shows them
   * (`dropNoteFiles`, B56). Call where the note's versions were just read,
   * inside an rw transaction that includes `noteTables`.
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
    keeping?: unknown,
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
    addFileRefs(keeping, named);
    for (const v of kept) addFileRefs(v.body, named);
    const unheld = (
      await db.files
        .where('[workspaceId+owner]')
        .equals([ws, `note:${noteId}`])
        .toArray()
    ).filter((f) => !named.has(f.id) && Date.parse(f.createdAt) < cutoff);
    await dropNoteFiles(
      db,
      ws,
      unheld.map((f) => f.id),
    );
    return kept;
  }

  /** What a read or keep of the versions writes and reads (the purge). */
  const noteTables = (db: KeelDb) => [
    db.noteVersions,
    db.journal,
    db.files,
    db.templates,
  ];

  return {
    async list(ws, noteId) {
      const db = await ctx.db();
      return rwTx(db, noteTables(db), async () => {
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
      await rwTx(db, noteTables(db), async () => {
        if (!(await db.journal.get([ws, noteId])))
          throw new NotFoundError('journal entry', noteId);
        const rows = (
          await purge(db, ws, noteId, await versionsOf(db, ws, noteId), body)
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

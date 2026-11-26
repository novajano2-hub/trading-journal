import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import type { FrozenDay } from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import { LockedDayError, NotFoundError } from '../repository';
import { KeelDb } from './db';
import { createLocalRepository } from './local-repository';

const M = 'mine';
const DAY = 86_400_000;
const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** A repository on a clock the test moves. */
function setup(start = '2026-11-19T14:00:00.000Z') {
  const indexedDB = new IDBFactory();
  let now = new Date(start);
  let n = 0;
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    now: () => now,
    newId: () => `id-${++n}`,
    sample: async () => fixtureSample(),
  });
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  return {
    repo,
    db,
    tick: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    set: (iso: string) => {
      now = new Date(iso);
    },
  };
}

async function aNote(repo: ReturnType<typeof setup>['repo'], text = 'first') {
  return repo.journal.save(M, {
    kind: 'note',
    title: 'Opening range',
    date: '2026-11-19',
    body: doc(text),
    linkedTradeIds: [],
    tags: ['playbook'],
  });
}

test('keep stores a version, newest first, for that note only', async () => {
  const { repo, tick } = setup();
  const a = await aNote(repo);
  const b = await aNote(repo, 'other note');
  await repo.noteVersions.keep(M, a.id, doc('one'), 'auto');
  tick(60_000);
  await repo.noteVersions.keep(M, a.id, doc('two'), 'auto');
  await repo.noteVersions.keep(M, b.id, doc('elsewhere'), 'auto');

  const list = await repo.noteVersions.list(M, a.id);
  expect(list.map((v) => v.body)).toEqual([doc('two'), doc('one')]);
  expect(list.every((v) => v.noteId === a.id && v.workspaceId === M)).toBe(
    true,
  );
  expect(list[0]!.kind).toBe('auto');
  expect(list[0]!.savedAt > list[1]!.savedAt).toBe(true);
  // Another workspace's note of the same id has its own (empty) list.
  expect(await repo.noteVersions.list('sample', a.id)).toEqual([]);
});

test('keep leaves out a version the newest one already holds', async () => {
  const { repo, tick } = setup();
  const n = await aNote(repo);
  await repo.noteVersions.keep(M, n.id, doc('same'), 'auto');
  tick(1000);
  await repo.noteVersions.keep(M, n.id, doc('same'), 'auto');
  expect(await repo.noteVersions.list(M, n.id)).toHaveLength(1);
  tick(1000);
  await repo.noteVersions.keep(M, n.id, doc('changed'), 'auto');
  expect(await repo.noteVersions.list(M, n.id)).toHaveLength(2);
});

test('keep refuses a note that is not stored, so no version is left without a note', async () => {
  const { repo, db } = setup();
  await expect(
    repo.noteVersions.keep(M, 'gone', doc('x'), 'auto'),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect(await db.noteVersions.count()).toBe(0);
});

test('versions older than 30 days are removed', async () => {
  const { repo, db, tick, set } = setup('2026-10-01T12:00:00.000Z');
  const n = await aNote(repo);
  const other = await aNote(repo, 'second note');
  await repo.noteVersions.keep(M, n.id, doc('old'), 'auto');
  await repo.noteVersions.keep(M, other.id, doc('old too'), 'auto');
  tick(20 * DAY);
  await repo.noteVersions.keep(M, n.id, doc('middle'), 'auto');
  // 29 days after the first: all three are inside the 30 days.
  set('2026-10-30T12:00:00.000Z');
  expect(await repo.noteVersions.list(M, n.id)).toHaveLength(2);
  // 30 days and one second after the first: that one is gone, the later one stays.
  set('2026-10-31T12:00:01.000Z');
  const list = await repo.noteVersions.list(M, n.id);
  expect(list.map((v) => v.body)).toEqual([doc('middle')]);
  // The purge is a delete, not a hiding; the other note's old version is
  // reached when its own history is read.
  expect(await db.noteVersions.count()).toBe(2);
  expect(await repo.noteVersions.list(M, other.id)).toEqual([]);
  expect(await db.noteVersions.count()).toBe(1);
});

test('restore keeps a before-restore version and restores the body only', async () => {
  const { repo, tick } = setup();
  const n = await aNote(repo, 'draft one');
  await repo.noteVersions.keep(M, n.id, doc('draft one'), 'auto');
  tick(10 * 60_000);
  // The note moves on: new text, a new title and tag.
  await repo.journal.save(M, {
    ...n,
    title: 'Renamed note',
    tags: ['playbook', 'es'],
    folderId: 'f-1',
    favorite: true,
    body: doc('draft two'),
  });
  tick(60_000);
  const [version] = await repo.noteVersions.list(M, n.id);

  const restored = await repo.noteVersions.restore(M, n.id, version!.id);

  expect(restored.body).toEqual(doc('draft one'));
  // Only the body comes back: title, tags, folder and star stay as they are.
  expect(restored).toMatchObject({
    id: n.id,
    title: 'Renamed note',
    tags: ['playbook', 'es'],
    folderId: 'f-1',
    favorite: true,
  });
  expect(await repo.journal.get(M, n.id)).toEqual(restored);

  const list = await repo.noteVersions.list(M, n.id);
  // The version stays; the text it replaced is kept as "before restore".
  expect(list.map((v) => [v.kind, v.body])).toEqual([
    ['before-restore', doc('draft two')],
    ['auto', doc('draft one')],
  ]);
});

test('restore refuses a version that is not this note’s', async () => {
  const { repo, db } = setup();
  const a = await aNote(repo);
  const b = await aNote(repo, 'b');
  await repo.noteVersions.keep(M, b.id, doc('b old'), 'auto');
  const [theirs] = await repo.noteVersions.list(M, b.id);
  await expect(
    repo.noteVersions.restore(M, a.id, theirs!.id),
  ).rejects.toBeInstanceOf(NotFoundError);
  await expect(
    repo.noteVersions.restore(M, a.id, 'no-such-version'),
  ).rejects.toBeInstanceOf(NotFoundError);
  await expect(
    repo.noteVersions.restore(M, 'no-such-note', theirs!.id),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect((await repo.journal.get(M, a.id))!.body).toEqual(doc('first'));
  // Nothing was written by the refusals.
  expect(await db.noteVersions.count()).toBe(1);
});

test("a locked daily note's history is read-only and restore is refused", async () => {
  const { repo, db, set } = setup('2026-11-18T14:00:00.000Z');
  await repo.prefs.update({ timeZone: 'America/New_York' });
  const frozen = async (): Promise<FrozenDay> => ({
    version: (await repo.tracker.get(M)).versions[0]!,
    inputs: {},
    ticks: {},
  });
  set('2026-11-19T14:00:00.000Z');
  const note = await repo.journal.dailyNote(M, '2026-11-19');
  await repo.journal.save(M, { ...note, body: doc('morning plan') });
  await repo.noteVersions.keep(M, note.id, doc('morning plan'), 'auto');
  await repo.journal.save(M, { ...note, body: doc('after the close') });
  await repo.days.finish(M, '2026-11-19', await frozen());
  const [version] = await repo.noteVersions.list(M, note.id);
  const before = await db.noteVersions.count();

  // The history still reads on a finished day (read-only), but cannot restore.
  expect(version!.body).toEqual(doc('morning plan'));
  await expect(
    repo.noteVersions.restore(M, note.id, version!.id),
  ).rejects.toBeInstanceOf(LockedDayError);
  expect((await repo.journal.get(M, note.id))!.body).toEqual(
    doc('after the close'),
  );
  // The refusal left no "before restore" behind.
  expect(await db.noteVersions.count()).toBe(before);
});

test('deleting a note for good deletes its versions, and the trash purge does too', async () => {
  const { repo, db, tick } = setup();
  const a = await aNote(repo);
  const b = await aNote(repo, 'b');
  const keep = await aNote(repo, 'stays');
  for (const n of [a, b, keep])
    await repo.noteVersions.keep(M, n.id, doc(`v of ${n.id}`), 'auto');

  await repo.journal.remove(M, a.id);
  expect(
    (await db.noteVersions.toArray()).filter((v) => v.noteId === a.id),
  ).toEqual([]);

  // A note 31 days in Trash is purged by the next read of the journal.
  await repo.journal.trash(M, b.id);
  tick(31 * DAY);
  await repo.journal.list(M);
  const left = await db.noteVersions.toArray();
  expect(left.map((v) => v.noteId)).toEqual([keep.id]);
});

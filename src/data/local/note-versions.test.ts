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
  // The version stays; the text it replaced is kept, marked as replaced.
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
  // The refusal left no replaced version behind.
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

/** A body with a paragraph and one block image of each file id (B56). */
const withImages = (text: string, ...fileIds: string[]) => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text }] },
    ...fileIds.map((id) => ({
      type: 'image',
      attrs: { src: `keel-file:${id}`, width: null },
    })),
  ],
});
const png = () => ({
  bytes: new ArrayBuffer(4),
  type: 'image/png',
  name: 'a.png',
});

test('an image removed from a note is deleted once no kept version holds it', async () => {
  const { repo, db, tick } = setup('2026-10-01T12:00:00.000Z');
  const n = await aNote(repo);
  const other = await aNote(repo, 'another note');
  const owner = `note:${n.id}`;
  const gone = await repo.files.add(M, owner, png(), { images: true });
  const inBody = await repo.files.add(M, owner, png(), { images: true });
  const inVersion = await repo.files.add(M, owner, png(), { images: true });
  const elsewhere = await repo.files.add(M, `note:${other.id}`, png(), {
    images: true,
  });
  // Day 0: the body and its version hold the first two images.
  const first = withImages('chart', gone.id, inBody.id);
  await repo.journal.save(M, { ...n, body: first });
  await repo.noteVersions.keep(M, n.id, first, 'auto');
  // Day 20: the first image is removed and the third added, in a version too.
  tick(20 * DAY);
  const second = withImages('chart', inBody.id, inVersion.id);
  await repo.journal.save(M, { ...n, body: second });
  await repo.noteVersions.keep(M, n.id, second, 'auto');
  // Day 25: the third image leaves the body; the day-20 version still holds it.
  tick(5 * DAY);
  await repo.journal.save(M, { ...n, body: withImages('chart', inBody.id) });
  // An image uploaded now, before the editor saves the body that holds it.
  const pending = await repo.files.add(M, owner, png(), { images: true });

  // 29 days: the day-0 version is kept, so its images stay.
  tick(4 * DAY);
  await repo.noteVersions.list(M, n.id);
  expect(await db.files.get([M, gone.id])).toBeDefined();

  // 31 days: the day-0 version is purged and nothing else holds the first image.
  tick(2 * DAY);
  await repo.noteVersions.list(M, n.id);
  const left = (await db.files.toArray()).map((f) => f.id).sort();
  expect(left).toEqual(
    [inBody.id, inVersion.id, pending.id, elsewhere.id].sort(),
  );
});

test('the version purge on keep deletes the images no kept version holds', async () => {
  const { repo, db, tick } = setup('2026-10-01T12:00:00.000Z');
  const n = await aNote(repo);
  const img = await repo.files.add(M, `note:${n.id}`, png(), { images: true });
  const body = withImages('chart', img.id);
  await repo.journal.save(M, { ...n, body });
  await repo.noteVersions.keep(M, n.id, body, 'auto');
  tick(DAY);
  await repo.journal.save(M, { ...n, body: doc('no picture') });
  tick(31 * DAY);
  await repo.noteVersions.keep(M, n.id, doc('no picture now'), 'auto');
  expect(await db.files.get([M, img.id])).toBeUndefined();
  expect(await repo.noteVersions.list(M, n.id)).toHaveLength(1);
});

test("an image another note shows stays when its own note's version purge drops it, and goes once no note shows it", async () => {
  const { repo, db, tick } = setup('2026-10-01T12:00:00.000Z');
  const a = await aNote(repo);
  const b = await aNote(repo, 'b');
  const img = await repo.files.add(M, `note:${a.id}`, png(), { images: true });
  // Day 0: A shows its image, and B shows it too (an image copied across
  // notes keeps its `keel-file:` reference).
  const shown = withImages('chart', img.id);
  await repo.journal.save(M, { ...a, body: shown });
  await repo.noteVersions.keep(M, a.id, shown, 'auto');
  await repo.journal.save(M, { ...b, body: withImages('copied', img.id) });
  await repo.noteVersions.keep(M, b.id, withImages('copied', img.id), 'auto');
  // Day 1: A drops the image.
  tick(DAY);
  await repo.journal.save(M, { ...a, body: doc('no picture') });

  // Day 32: A's day-0 version is purged, but B still shows the image: it
  // stays, and moves to B, the note that shows it now.
  tick(31 * DAY);
  await repo.noteVersions.list(M, a.id);
  expect((await db.files.get([M, img.id]))?.owner).toBe(`note:${b.id}`);

  // B drops it too: B's own purge (its day-0 version goes) deletes it.
  await repo.journal.save(M, { ...b, body: doc('no picture either') });
  await repo.noteVersions.list(M, b.id);
  expect(await db.files.get([M, img.id])).toBeUndefined();
});

test('an image a kept version of another note or a template names stays through the purge', async () => {
  const { repo, db, tick } = setup('2026-10-01T12:00:00.000Z');
  const a = await aNote(repo);
  const b = await aNote(repo, 'b');
  const kept = await repo.files.add(M, `note:${a.id}`, png(), { images: true });
  const inTemplate = await repo.files.add(M, `note:${a.id}`, png(), {
    images: true,
  });
  const shown = withImages('chart', kept.id, inTemplate.id);
  await repo.journal.save(M, { ...a, body: shown });
  await repo.noteVersions.keep(M, a.id, shown, 'auto');
  await repo.templates.save(M, {
    kind: 'note',
    name: 'With a chart',
    body: withImages('template', inTemplate.id),
    isDefault: false,
  });
  tick(DAY);
  await repo.journal.save(M, { ...a, body: doc('no picture') });
  // Day 20: B keeps a version that shows the first image, then drops it.
  tick(19 * DAY);
  await repo.noteVersions.keep(M, b.id, withImages('pasted', kept.id), 'auto');
  await repo.journal.save(M, { ...b, body: doc('b without it') });

  tick(12 * DAY);
  await repo.noteVersions.list(M, a.id);
  // B's kept version names the first: it moves to B. Only a template names
  // the second: it stays where it is.
  expect((await db.files.get([M, kept.id]))?.owner).toBe(`note:${b.id}`);
  expect((await db.files.get([M, inTemplate.id]))?.owner).toBe(`note:${a.id}`);
});

test('keep never deletes an image the body it is keeping names', async () => {
  const { repo, db, tick } = setup('2026-10-01T12:00:00.000Z');
  const n = await aNote(repo);
  const img = await repo.files.add(M, `note:${n.id}`, png(), { images: true });
  const shown = withImages('chart', img.id);
  await repo.journal.save(M, { ...n, body: shown });
  await repo.noteVersions.keep(M, n.id, shown, 'auto');
  tick(DAY);
  await repo.journal.save(M, { ...n, body: doc('no picture') });
  // Day 32: the image is back in the editor (an undo) and kept as a version
  // before the editor's save reaches the stored body.
  tick(31 * DAY);
  await repo.noteVersions.keep(M, n.id, withImages('back', img.id), 'auto');
  expect(await db.files.get([M, img.id])).toBeDefined();
  expect((await repo.noteVersions.list(M, n.id)).map((v) => v.body)).toEqual([
    withImages('back', img.id),
  ]);
});

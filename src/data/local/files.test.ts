import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test, vi } from 'vitest';
import type { FrozenDay } from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import {
  ArchivedAccountError,
  FileRejected,
  LockedDayError,
  NotFoundError,
  SHOT_MAX_BYTES,
} from '../repository';
import { createLocalContext } from './context';
import { isQuota } from './day-shots';
import { KeelDb } from './db';
import { localFiles } from './files';
import { createLocalRepository } from './local-repository';

const S = 'sample';
const M = 'mine';
const DAY = 86_400_000;

/** New York is UTC-5 in November, so 08:47 there is 13:47Z. */
const at = (day: string, hhmm = '08:47') => new Date(`${day}T${hhmm}:00-05:00`);

const ids = (list: string[]) => {
  let i = 0;
  return () => list[i++] ?? `id-${i}`;
};

const png = (bytes = 4) => ({
  bytes: new ArrayBuffer(bytes),
  type: 'image/png',
  name: 'a.png',
});
const pdf = (bytes = 4) => ({
  bytes: new ArrayBuffer(bytes),
  type: 'application/pdf',
  name: 'plan.pdf',
});

function setup(opts: { now?: () => Date; newId?: () => string } = {}) {
  const indexedDB = new IDBFactory();
  const make = (o = opts) =>
    createLocalRepository({
      indexedDB,
      IDBKeyRange,
      sample: async () => fixtureSample(),
      ...o,
    });
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  return { repo: make(), make, db, indexedDB };
}

const owners = async (db: KeelDb, ws: string) =>
  (await db.files.where('workspaceId').equals(ws).toArray())
    .map((f) => f.owner)
    .sort();

test('add keeps upload order and owner', async () => {
  // Ids that sort against upload order and one clock tick for every upload:
  // only the createdAt tie-break can keep upload order.
  const clock = new Date('2026-11-20T12:00:00.000Z');
  const { repo } = setup({
    now: () => clock,
    newId: ids(['z', 'y', 'x', 'w']),
  });
  const a = await repo.files.add(S, 'trade:f-1', png(), { images: true });
  const b = await repo.files.add(S, 'trade:f-1', pdf(), { images: false });
  const c = await repo.files.add(S, 'trade:f-1', png(3), { images: true });
  const other = await repo.files.add(S, 'trade:f-2', png(), { images: true });

  expect((await repo.files.list(S, 'trade:f-1')).map((f) => f.id)).toEqual([
    a.id,
    b.id,
    c.id,
  ]);
  expect((await repo.files.list(S, 'trade:f-2')).map((f) => f.id)).toEqual([
    other.id,
  ]);
  expect(a).toMatchObject({
    workspaceId: S,
    owner: 'trade:f-1',
    type: 'image/png',
    name: 'a.png',
    size: 4,
  });
  expect(b).toMatchObject({ type: 'application/pdf', name: 'plan.pdf' });
  expect(c.size).toBe(3);
  expect(await repo.files.get(S, a.id)).toEqual(a);
  // Another workspace's rows are another list, and a missing id is undefined.
  expect(await repo.files.list(M, 'trade:f-1')).toEqual([]);
  expect(await repo.files.get(M, a.id)).toBeUndefined();
  expect(await repo.files.get(S, 'nope')).toBeUndefined();
});

test('listing does not return bytes', async () => {
  const { repo } = setup();
  const a = await repo.files.add(S, 'trade:f-1', png(8), { images: true });
  await repo.files.add(S, 'trade:f-1', pdf(3), { images: false });
  const listed = await repo.files.list(S, 'trade:f-1');
  expect(listed).toHaveLength(2);
  for (const row of listed) {
    // The metadata only: nothing of the file's contents, not even an empty buffer.
    expect(Object.keys(row).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'owner',
      'size',
      'type',
      'workspaceId',
    ]);
    expect('bytes' in row).toBe(false);
  }
  expect(listed[0]).toMatchObject({ id: a.id, name: 'a.png', size: 8 });
  // The bytes come from `get`, one file at a time.
  const got = await repo.files.get(S, a.id);
  expect(got?.bytes.byteLength).toBe(8);
});

test('add refuses a type', async () => {
  const { repo, db } = setup();
  const refused = repo.files.add(S, 'strategy:str-1', pdf(), { images: true });
  await expect(refused).rejects.toBeInstanceOf(FileRejected);
  await expect(refused).rejects.toMatchObject({ reason: 'type' });
  expect(await db.files.count()).toBe(0);
  // The four image types pass; anything else passes when it need not be an image.
  for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
    await repo.files.add(
      S,
      'strategy:str-1',
      { ...png(), type },
      { images: true },
    );
  await expect(
    repo.files.add(
      S,
      'strategy:str-1',
      { ...png(), type: 'image/svg+xml' },
      {
        images: true,
      },
    ),
  ).rejects.toMatchObject({ reason: 'type' });
  const doc = await repo.files.add(S, 'trade:f-1', pdf(), { images: false });
  expect(doc.type).toBe('application/pdf');
  expect(await db.files.count()).toBe(5);
});

test('add refuses over 10 MB', async () => {
  const { repo, db } = setup();
  await expect(
    repo.files.add(S, 'trade:f-1', png(SHOT_MAX_BYTES + 1), { images: true }),
  ).rejects.toBeInstanceOf(FileRejected);
  await expect(
    repo.files.add(S, 'trade:f-1', pdf(SHOT_MAX_BYTES + 1), { images: false }),
  ).rejects.toMatchObject({ reason: 'size' });
  expect(await db.files.count()).toBe(0);
  // Exactly 10 MB is kept.
  const kept = await repo.files.add(S, 'trade:f-1', pdf(SHOT_MAX_BYTES), {
    images: false,
  });
  expect(kept.size).toBe(SHOT_MAX_BYTES);
});

test('a quota error becomes FileRejected("quota")', async () => {
  const ctx = createLocalContext({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const files = localFiles(ctx);
  const db = await ctx.db();
  const quota = () => new DOMException('full', 'QuotaExceededError');
  const put = vi.spyOn(db.files, 'put');

  put.mockRejectedValueOnce(quota());
  const refused = files.add(S, 'trade:f-1', png(), { images: true });
  await expect(refused).rejects.toBeInstanceOf(FileRejected);
  await expect(refused).rejects.toMatchObject({ reason: 'quota' });

  // Any other failure is not dressed up as a quota one.
  put.mockRejectedValueOnce(new Error('boom'));
  await expect(
    files.add(S, 'trade:f-1', png(), { images: true }),
  ).rejects.toThrow('boom');
  expect(await db.files.count()).toBe(0);

  put.mockRestore();
  await files.add(S, 'trade:f-1', png(), { images: true });
  expect(await db.files.count()).toBe(1);
});

test('the quota check sees the browser’s error inside Dexie’s wrapper', () => {
  const quota = { name: 'QuotaExceededError' };
  expect(isQuota(quota)).toBe(true);
  expect(isQuota({ name: 'AbortError', inner: quota })).toBe(true);
  expect(isQuota({ name: 'AbortError', inner: { name: 'AbortError' } })).toBe(
    false,
  );
  expect(isQuota(new Error('boom'))).toBe(false);
  expect(isQuota(null)).toBe(false);
});

test('remove deletes one file and throws NotFoundError for a missing one', async () => {
  const { repo } = setup();
  const a = await repo.files.add(S, 'trade:f-1', png(), { images: true });
  const b = await repo.files.add(S, 'trade:f-1', png(), { images: true });
  await repo.files.remove(S, a.id);
  expect((await repo.files.list(S, 'trade:f-1')).map((f) => f.id)).toEqual([
    b.id,
  ]);
  const missing = repo.files.remove(S, a.id);
  await expect(missing).rejects.toBeInstanceOf(NotFoundError);
  await expect(missing).rejects.toMatchObject({ entity: 'file', id: a.id });
  // The same id in another workspace is another file.
  await expect(repo.files.remove(M, b.id)).rejects.toBeInstanceOf(
    NotFoundError,
  );
  expect(await repo.files.get(S, b.id)).toBeDefined();
});

test('reassign moves one owner’s files to another, in this workspace only', async () => {
  const { repo, db } = setup();
  const a = await repo.files.add(S, 'trade:f-1', png(), { images: true });
  const b = await repo.files.add(S, 'trade:f-1', pdf(), { images: false });
  const keep = await repo.files.add(S, 'trade:f-2', png(), { images: true });
  const mine = await repo.files.add(M, 'trade:f-1', png(), { images: true });
  await repo.files.reassign(S, 'trade:f-1', 'trade:f-2');
  expect(await repo.files.list(S, 'trade:f-1')).toEqual([]);
  expect(
    new Set((await repo.files.list(S, 'trade:f-2')).map((f) => f.id)),
  ).toEqual(new Set([a.id, b.id, keep.id]));
  expect((await repo.files.get(M, mine.id))?.owner).toBe('trade:f-1');
  // The bytes and names are untouched.
  expect(await db.files.get([S, b.id])).toMatchObject({
    name: 'plan.pdf',
    size: 4,
    owner: 'trade:f-2',
  });
});

test('removing a trade removes its files', async () => {
  const { repo, db } = setup();
  await repo.files.add(S, 'trade:f-1', png(), { images: true });
  await repo.files.add(S, 'trade:f-1', pdf(), { images: false });
  await repo.files.add(S, 'trade:f-2', png(), { images: true });
  // The same trade id in My workspace is another trade.
  await repo.files.add(M, 'trade:f-1', png(), { images: true });
  await repo.trades.remove(S, ['f-1']);
  expect(await repo.trades.get(S, 'f-1')).toBeUndefined();
  expect(await owners(db, S)).toEqual(['trade:f-2']);
  expect(await owners(db, M)).toEqual(['trade:f-1']);
});

test('removing several trades removes the files of each', async () => {
  const { repo, db } = setup();
  for (const id of ['f-1', 'f-2'])
    await repo.files.add(S, `trade:${id}`, png(), { images: true });
  await repo.files.add(S, 'strategy:str-1', png(), { images: true });
  await repo.trades.remove(S, ['f-1', 'f-2']);
  expect(await owners(db, S)).toEqual(['strategy:str-1']);
});

test('a refused trade removal keeps the files', async () => {
  const { repo, db } = setup();
  // f-3 is in an archived account, so removing it is refused.
  await repo.files.add(S, 'trade:f-1', png(), { images: true });
  await repo.files.add(S, 'trade:f-3', png(), { images: true });
  await expect(repo.trades.remove(S, ['f-1', 'f-3'])).rejects.toBeInstanceOf(
    ArchivedAccountError,
  );
  expect(await owners(db, S)).toEqual(['trade:f-1', 'trade:f-3']);
});

test('removing a strategy removes its photo', async () => {
  const { repo, db } = setup();
  await repo.files.add(S, 'strategy:str-1', png(), { images: true });
  await repo.files.add(S, 'trade:f-1', png(), { images: true });
  await repo.files.add(M, 'strategy:str-1', png(), { images: true });
  await repo.strategies.remove(S, 'str-1');
  expect(await owners(db, S)).toEqual(['trade:f-1']);
  expect(await owners(db, M)).toEqual(['strategy:str-1']);
});

test('clearing an account’s trades removes their files', async () => {
  const { repo, db } = setup();
  // acc-a holds f-1 and f-2; acc-b holds f-3.
  await repo.files.add(S, 'trade:f-1', png(), { images: true });
  await repo.files.add(S, 'trade:f-2', png(), { images: true });
  await repo.files.add(S, 'trade:f-3', png(), { images: true });
  await repo.accounts.clearTrades(S, 'acc-a');
  expect(await owners(db, S)).toEqual(['trade:f-3']);
});

test('purging a trashed note removes its files', async () => {
  const now = new Date('2026-11-20T12:00:00.000Z');
  const { repo, make, db } = setup({
    now: () => now,
    newId: ids(['note-f2', 'a', 'b', 'c', 'd']),
  });
  const note = await repo.journal.ensureTradeNote(S, 'f-2');
  const owner = `note:${note.id}`;
  await repo.files.add(S, owner, png(), { images: true });
  await repo.files.add(S, owner, png(), { images: true });
  await repo.files.add(S, 'note:j-1', png(), { images: true });
  await repo.journal.trash(S, note.id);

  // 29 days on it is still waiting in Trash, with its files.
  const soon = make({ now: () => new Date(+now + 29 * DAY) });
  expect((await soon.journal.list(S)).map((e) => e.id)).toContain(note.id);
  expect(await soon.files.list(S, owner)).toHaveLength(2);

  // After 30 days it is purged, and its files with it; other notes keep theirs.
  const after = make({ now: () => new Date(+now + 31 * DAY) });
  expect((await after.journal.list(S)).map((e) => e.id)).not.toContain(note.id);
  expect(await after.files.list(S, owner)).toEqual([]);
  expect(await owners(db, S)).toEqual(['note:j-1']);
});

test('deleting a note for good removes its files', async () => {
  const { repo, db } = setup();
  await repo.files.add(S, 'note:j-1', png(), { images: true });
  await repo.files.add(S, 'trade:f-1', png(), { images: true });
  await repo.journal.remove(S, 'j-1');
  expect(await owners(db, S)).toEqual(['trade:f-1']);
});

// ---- the day lock -----------------------------------------------------------

async function lockedSetup() {
  const indexedDB = new IDBFactory();
  let clock = at('2026-11-18');
  let n = 0;
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    now: () => clock,
    newId: () => `id-${++n}`,
    sample: async () => fixtureSample(),
  });
  await repo.prefs.update({ timeZone: 'America/New_York' });
  const frozen = async (): Promise<FrozenDay> => ({
    version: (await repo.tracker.get(M)).versions[0]!,
    inputs: {},
    ticks: {},
  });
  clock = at('2026-11-19');
  const note = await repo.journal.dailyNote(M, '2026-11-19');
  return { repo, note, frozen };
}

test('add refuses a locked daily note', async () => {
  const { repo, note, frozen } = await lockedSetup();
  const owner = `note:${note.id}`;
  // On an open day the note takes images.
  const open = await repo.files.add(M, owner, png(), { images: true });
  await repo.days.finish(M, '2026-11-19', await frozen());
  const locked = (p: Promise<unknown>) =>
    expect(p).rejects.toBeInstanceOf(LockedDayError);
  await locked(repo.files.add(M, owner, png(), { images: true }));
  await locked(repo.files.remove(M, open.id));
  await locked(repo.files.reassign(M, owner, 'trade:t-1'));
  await locked(repo.files.reassign(M, 'trade:t-1', owner));
  expect(await repo.files.list(M, owner)).toHaveLength(1);
});

test('the lock reaches only a finished date’s daily note', async () => {
  const { repo, frozen } = await lockedSetup();
  const plain = await repo.journal.save(M, {
    kind: 'note',
    title: 'Loose note',
    date: '2026-11-19',
    body: { type: 'doc', content: [{ type: 'paragraph' }] },
    linkedTradeIds: [],
    tags: [],
  });
  await repo.days.finish(M, '2026-11-19', await frozen());
  // A plain note and a trade on the finished date still take files (B55).
  await repo.files.add(M, `note:${plain.id}`, png(), { images: true });
  await repo.files.add(M, 'trade:t-1', pdf(), { images: false });
  // So does a note that does not exist yet: the editor may add before it saves.
  await repo.files.add(M, 'note:not-saved', png(), { images: true });
});

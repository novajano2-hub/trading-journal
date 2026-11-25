import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { defaultVersion, versionOn } from '@/domain/tracker/defaults';
import type { FrozenDay, TrackerVersion } from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import { LockedDayError, SHOT_MAX_BYTES, ShotRejected } from '../repository';
import { KeelDb } from './db';
import { createLocalRepository } from './local-repository';

const M = 'mine';

/** New York is UTC-5 in November, so 08:47 there is 13:47Z. */
const at = (day: string, hhmm = '08:47') => new Date(`${day}T${hhmm}:00-05:00`);

async function setup(start = '2026-11-18') {
  const indexedDB = new IDBFactory();
  let clock = at(start);
  let n = 0;
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    now: () => clock,
    newId: () => `id-${++n}`,
    sample: async () => fixtureSample(),
  });
  await repo.prefs.update({ timeZone: 'America/New_York' });
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  return {
    repo,
    db,
    setNow: (d: Date) => {
      clock = d;
    },
  };
}

const frozen = async (
  repo: Awaited<ReturnType<typeof setup>>['repo'],
): Promise<FrozenDay> => ({
  version: (await repo.tracker.get(M)).versions[0]!,
  inputs: {},
  ticks: {},
});

const rulesOf = (v: TrackerVersion): Omit<TrackerVersion, 'from'> => ({
  tradingDays: v.tradingDays,
  builtIn: v.builtIn,
  custom: v.custom,
});

const png = (bytes = 4) => ({
  bytes: new ArrayBuffer(bytes),
  type: 'image/png',
  name: 'a.png',
});

test('two first reads make one tracker row', async () => {
  const { repo, db } = await setup();
  const [a, b] = await Promise.all([repo.tracker.get(M), repo.tracker.get(M)]);
  expect(await db.trackers.where('workspaceId').equals(M).count()).toBe(1);
  expect(a.startedOn).toBe('2026-11-18');
  expect(b.startedOn).toBe(a.startedOn);
  expect(a.versions).toEqual([defaultVersion('2026-11-18')]);
});

test("a save today replaces today's version and keeps yesterday's", async () => {
  const { repo, setNow } = await setup('2026-11-18');
  await repo.tracker.get(M);
  setNow(at('2026-11-20'));
  const rules = rulesOf(defaultVersion('2026-11-20'));
  await repo.tracker.save(M, {
    ...rules,
    builtIn: { ...rules.builtIn, strategy: { on: false } },
  });
  const t = await repo.tracker.save(M, {
    ...rules,
    builtIn: { ...rules.builtIn, stop: { on: false } },
  });
  expect(t.versions).toHaveLength(2);
  expect(t.versions[1]!.builtIn.stop.on).toBe(false);
  expect(t.versions[1]!.builtIn.strategy.on).toBe(true);
  expect(versionOn(t, '2026-11-19')!.from).toBe('2026-11-18');
});

test('reset restores the defaults from today and keeps notes, sessions, moods, ratings and shots', async () => {
  const { repo, setNow } = await setup('2026-11-18');
  await repo.tracker.get(M);
  const note = await repo.journal.dailyNote(M, '2026-11-18');
  await repo.days.startSession(M, '2026-11-18');
  await repo.days.setTick(M, '2026-11-18', 'custom-1', true);
  await repo.days.setMood(M, '2026-11-18', { value: 4 });
  await repo.days.setRating(M, '2026-11-18', 3);
  await repo.dayShots.add(M, '2026-11-18', png());
  setNow(at('2026-11-20'));
  const rules = rulesOf(defaultVersion('2026-11-20'));
  await repo.tracker.save(M, {
    ...rules,
    builtIn: { ...rules.builtIn, stop: { on: false } },
  });
  const t = await repo.tracker.reset(M);
  expect(t.startedOn).toBe('2026-11-20');
  expect(t.versions).toEqual([defaultVersion('2026-11-20')]);
  const day = (await repo.days.list(M)).find((d) => d.id === '2026-11-18')!;
  expect(day.ticks).toBeUndefined();
  expect(day.session).toBeDefined();
  expect(day.mood).toEqual({ value: 4 });
  expect(day.rating).toBe(3);
  expect(await repo.dayShots.list(M, '2026-11-18')).toHaveLength(1);
  expect((await repo.journal.get(M, note.id))?.id).toBe(note.id);
});

test('after a reset a closed day still refuses writes', async () => {
  const { repo, setNow } = await setup('2026-11-18');
  await repo.days.finish(M, '2026-11-18', await frozen(repo));
  setNow(at('2026-11-20'));
  await repo.tracker.reset(M);
  await expect(repo.days.setRating(M, '2026-11-18', 2)).rejects.toBeInstanceOf(
    LockedDayError,
  );
});

test('a finished day refuses every write', async () => {
  const { repo, setNow } = await setup('2026-11-18');
  await repo.tracker.get(M);
  setNow(at('2026-11-19'));
  const note = await repo.journal.dailyNote(M, '2026-11-19');
  const shot = await repo.dayShots.add(M, '2026-11-19', png());
  await repo.days.finish(M, '2026-11-19', await frozen(repo));
  const locked = (p: Promise<unknown>) =>
    expect(p).rejects.toBeInstanceOf(LockedDayError);
  await locked(repo.days.setTick(M, '2026-11-19', 'r', true));
  await locked(repo.days.setRating(M, '2026-11-19', 5));
  await locked(repo.days.setMood(M, '2026-11-19', { value: 1 }));
  await locked(repo.days.startSession(M, '2026-11-19'));
  await locked(repo.dayShots.add(M, '2026-11-19', png()));
  await locked(repo.dayShots.remove(M, shot.id));
  await locked(repo.journal.save(M, { ...note }));
  await locked(repo.journal.trash(M, note.id));
  await locked(repo.journal.restore(M, note.id));
  await locked(repo.journal.remove(M, note.id));
  await locked(repo.days.finish(M, '2026-11-19', await frozen(repo)));
  // A date with no note refuses to make one.
  await repo.days.finish(M, '2026-11-18', await frozen(repo));
  await locked(repo.journal.dailyNote(M, '2026-11-18'));
  // The same writes on an open day succeed.
  await repo.days.setTick(M, '2026-11-20', 'r', true);
  await repo.days.setRating(M, '2026-11-20', 5);
  await repo.days.setMood(M, '2026-11-20', { value: 2 });
  const open = await repo.journal.dailyNote(M, '2026-11-20');
  await repo.journal.save(M, { ...open });
  await repo.journal.trash(M, open.id);
  const s = await repo.dayShots.add(M, '2026-11-20', png());
  await repo.dayShots.remove(M, s.id);
});

test('finish refuses a future date, a date before the start and a non-trading day', async () => {
  const { repo, setNow } = await setup('2026-11-18');
  await repo.tracker.get(M);
  setNow(at('2026-11-20'));
  const f = await frozen(repo);
  await expect(repo.days.finish(M, '2026-11-23', f)).rejects.toBeInstanceOf(
    RangeError,
  );
  await expect(repo.days.finish(M, '2026-11-17', f)).rejects.toBeInstanceOf(
    RangeError,
  );
  // 2026-11-21 is a Saturday.
  setNow(at('2026-11-22'));
  await expect(repo.days.finish(M, '2026-11-21', f)).rejects.toBeInstanceOf(
    RangeError,
  );
  await repo.days.startSession(M, '2026-11-22').catch(() => undefined);
  const done = await repo.days.finish(M, '2026-11-20', f);
  expect(done.finishedAt).toBeDefined();
});

test('finish ends a running session', async () => {
  const { repo } = await setup('2026-11-18');
  await repo.days.startSession(M, '2026-11-18');
  const done = await repo.days.finish(M, '2026-11-18', await frozen(repo));
  expect(done.session?.end).toBe('2026-11-18T13:47:00.000Z');
});

test("the first edit on the note's own date stamps noteStartedAt", async () => {
  const { repo, setNow } = await setup('2026-11-19');
  const note = await repo.journal.dailyNote(M, '2026-11-20');
  await repo.journal.save(M, { ...note });
  expect((await repo.days.list(M)).find((d) => d.id === '2026-11-20')).toBe(
    undefined,
  );
  setNow(at('2026-11-20'));
  await repo.journal.save(M, { ...note });
  const stamp = (await repo.days.list(M)).find(
    (d) => d.id === '2026-11-20',
  )!.noteStartedAt;
  expect(stamp).toBe('2026-11-20T13:47:00.000Z');
  setNow(at('2026-11-20', '10:00'));
  await repo.journal.save(M, { ...note });
  expect(
    (await repo.days.list(M)).find((d) => d.id === '2026-11-20')!.noteStartedAt,
  ).toBe(stamp);
});

test("a trashed daily note stays the date's note", async () => {
  const { repo, db } = await setup();
  const note = await repo.journal.dailyNote(M, '2026-11-19');
  await repo.journal.trash(M, note.id);
  const again = await repo.journal.dailyNote(M, '2026-11-19');
  expect(again.id).toBe(note.id);
  expect(again.deletedAt).toBeDefined();
  const rows = await db.journal
    .where('workspaceId')
    .equals(M)
    .filter((e) => e.kind === 'daily-review' && e.date === '2026-11-19')
    .toArray();
  expect(rows).toHaveLength(1);
});

test('shots: wrong type and over 10 MB are refused; list keeps upload order', async () => {
  const { repo } = await setup();
  await expect(
    repo.dayShots.add(M, '2026-11-18', { ...png(), type: 'image/gif' }),
  ).rejects.toMatchObject({ reason: 'type' });
  await expect(
    repo.dayShots.add(M, '2026-11-18', png(SHOT_MAX_BYTES + 1)),
  ).rejects.toBeInstanceOf(ShotRejected);
  await expect(
    repo.dayShots.add(M, '2026-11-18', png(SHOT_MAX_BYTES + 1)),
  ).rejects.toMatchObject({ reason: 'size' });
  const a = await repo.dayShots.add(M, '2026-11-18', png());
  const b = await repo.dayShots.add(M, '2026-11-18', {
    ...png(),
    type: 'image/jpeg',
    name: 'b.jpg',
  });
  await repo.dayShots.add(M, '2026-11-19', png());
  expect((await repo.dayShots.list(M, '2026-11-18')).map((s) => s.id)).toEqual([
    a.id,
    b.id,
  ]);
});

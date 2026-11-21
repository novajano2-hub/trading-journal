import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { goalsFor, withGoals } from '../goals';
import { defaultPrefs } from '../repository';
import { SAMPLE_WORKSPACE, USER_WORKSPACE } from '../workspaces';
import { createLocalRepository } from './local-repository';

const sample = async () => fixtureSample();
const open = (indexedDB: IDBFactory) =>
  createLocalRepository({ indexedDB, IDBKeyRange, sample });

test('goals persist across repository instances', async () => {
  const indexedDB = new IDBFactory();
  await open(indexedDB).prefs.update({
    goals: { mine: { weeklyNet: 150000 } },
  });
  const prefs = await open(indexedDB).prefs.get();
  expect(prefs.goals).toEqual({ mine: { weeklyNet: 150000 } });
});

test('nothing stored means no goals key, so defaults still match', async () => {
  const prefs = await open(new IDBFactory()).prefs.get();
  expect('goals' in prefs).toBe(false);
  expect(prefs).toEqual(defaultPrefs());
});

test.each([
  { dailyLossLimit: 0 },
  { weeklyNet: -100 },
  { weeklyNet: 1.5 },
  { weeklyNet: Number.NaN },
  { weeklyNet: Number.MAX_SAFE_INTEGER + 2 },
])('invalid goal %j is refused with RangeError', async (g) => {
  const repo = open(new IDBFactory());
  await expect(
    repo.prefs.update({ goals: { mine: g } }),
  ).rejects.toBeInstanceOf(RangeError);
  expect('goals' in (await repo.prefs.get())).toBe(false);
});

test('editing one workspace read-modify-write keeps the other workspace and other prefs', async () => {
  const repo = open(new IDBFactory());
  await repo.prefs.update({
    baseCurrency: 'EUR',
    pnlBasis: 'gross',
    goals: { mine: { weeklyNet: 150000, dailyLossLimit: 20000 } },
  });
  let prefs = await repo.prefs.get();
  await repo.prefs.update(withGoals(prefs, 'sample', { weeklyNet: 100000 }));
  prefs = await repo.prefs.get();
  expect(prefs).toMatchObject({ baseCurrency: 'EUR', pnlBasis: 'gross' });
  expect(goalsFor(prefs, USER_WORKSPACE)).toEqual({
    weeklyNet: 150000,
    dailyLossLimit: 20000,
  });
  expect(goalsFor(prefs, SAMPLE_WORKSPACE)).toEqual({ weeklyNet: 100000 });
  // and the reverse: editing mine leaves sample alone
  await repo.prefs.update(withGoals(prefs, 'mine', { dailyLossLimit: 30000 }));
  prefs = await repo.prefs.get();
  expect(goalsFor(prefs, SAMPLE_WORKSPACE)).toEqual({ weeklyNet: 100000 });
  expect(goalsFor(prefs, USER_WORKSPACE)).toEqual({ dailyLossLimit: 30000 });
  expect(prefs.baseCurrency).toBe('EUR');
});

test('two updates built from the same stale prefs both survive', async () => {
  const repo = open(new IDBFactory());
  const stale = await repo.prefs.get();
  await repo.prefs.update(withGoals(stale, 'sample', { weeklyNet: 100000 }));
  await repo.prefs.update(withGoals(stale, 'mine', { dailyLossLimit: 30000 }));
  const prefs = await repo.prefs.get();
  expect(goalsFor(prefs, SAMPLE_WORKSPACE)).toEqual({ weeklyNet: 100000 });
  expect(goalsFor(prefs, USER_WORKSPACE)).toEqual({ dailyLossLimit: 30000 });
});

test('clearing one workspace leaves the other intact', async () => {
  const repo = open(new IDBFactory());
  const prefs = await repo.prefs.get();
  await repo.prefs.update(withGoals(prefs, 'mine', { weeklyNet: 150000 }));
  await repo.prefs.update(withGoals(prefs, 'sample', { weeklyNet: 100000 }));
  await repo.prefs.update(withGoals(prefs, 'sample', {}));
  const after = await repo.prefs.get();
  expect(after.goals).toEqual({ mine: { weeklyNet: 150000 }, sample: {} });
  expect(goalsFor(after, SAMPLE_WORKSPACE)).toEqual({});
  expect(goalsFor(after, USER_WORKSPACE)).toEqual({ weeklyNet: 150000 });
});

test.each([null, 5, 'x'])(
  'a non-object goals entry %j is a RangeError',
  async (g) => {
    const repo = open(new IDBFactory());
    await expect(
      repo.prefs.update({ goals: { mine: g as never } }),
    ).rejects.toBeInstanceOf(RangeError);
  },
);

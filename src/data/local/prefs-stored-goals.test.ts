import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { KeelDb } from './db';
import { createLocalRepository } from './local-repository';

test('stored goal prefs are ignored and left in storage', async () => {
  const indexedDB = new IDBFactory();
  const stored = {
    displayName: 'Sam',
    goals: { sample: { weeklyNet: 100000, dailyLossLimit: 30000 } },
  };
  const seed = new KeelDb({ indexedDB, IDBKeyRange });
  await seed.open();
  await seed.meta.put({ key: 'prefs', value: stored });
  seed.close();

  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const prefs = await repo.prefs.get();
  expect(prefs.displayName).toBe('Sam');
  expect('goals' in prefs).toBe(false);

  const db = new KeelDb({ indexedDB, IDBKeyRange });
  await db.open();
  expect((await db.meta.get('prefs'))?.value).toEqual(stored);
});

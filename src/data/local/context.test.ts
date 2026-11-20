import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test, vi } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';

test('Dexie loads when the store first opens, not with the repository module', async () => {
  // Dexie opens a BroadcastChannel at module load, so loading it with the
  // module would run during the server render of every /app route.
  let loaded = false;
  vi.doMock('dexie', async (importOriginal) => {
    loaded = true;
    return importOriginal();
  });
  const { createLocalRepository } = await import('./local-repository');
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repo.workspaces.list();
  expect(loaded).toBe(false);

  expect((await repo.workspaces.getActive()).id).toBe('sample');
  expect(loaded).toBe(true);
});

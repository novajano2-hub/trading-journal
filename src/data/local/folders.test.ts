import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { DuplicateNameError, NotFoundError } from '../repository';
import { createLocalRepository } from './local-repository';

const S = 'sample';
const M = 'mine';

function setup() {
  let n = 0;
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
    newId: () => `folder-${++n}`,
  });
}

test('create trims the name and lists by name; a taken name (any case) throws', async () => {
  const repo = setup();
  const b = await repo.folders.create(S, '  Setups ');
  const a = await repo.folders.create(S, 'Ideas');
  expect(b).toMatchObject({ id: 'folder-1', workspaceId: S, name: 'Setups' });
  expect((await repo.folders.list(S)).map((f) => f.name)).toEqual([
    'Ideas',
    'Setups',
  ]);
  expect(a.createdAt).toMatch(/^\d{4}-/);
  await expect(repo.folders.create(S, 'setups')).rejects.toBeInstanceOf(
    DuplicateNameError,
  );
  await expect(repo.folders.create(S, '   ')).rejects.toBeInstanceOf(
    RangeError,
  );
  // Another workspace has its own names.
  expect((await repo.folders.create(M, 'Setups')).workspaceId).toBe(M);
});

test('rename keeps the id, refuses a name another folder has, and a missing folder', async () => {
  const repo = setup();
  const a = await repo.folders.create(S, 'Ideas');
  await repo.folders.create(S, 'Setups');
  const renamed = await repo.folders.rename(S, a.id, 'Plans');
  expect(renamed).toMatchObject({ id: a.id, name: 'Plans' });
  // Its own name, in another case, is fine.
  expect((await repo.folders.rename(S, a.id, 'plans')).name).toBe('plans');
  await expect(repo.folders.rename(S, a.id, 'SETUPS')).rejects.toBeInstanceOf(
    DuplicateNameError,
  );
  await expect(repo.folders.rename(S, 'nope', 'X')).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

test("remove moves the folder's notes to no folder, in every state", async () => {
  const repo = setup();
  const keep = await repo.folders.create(S, 'Keep');
  const gone = await repo.folders.create(S, 'Gone');
  const base = await repo.journal.get(S, 'j-1');
  const inGone = await repo.journal.save(S, {
    ...base!,
    id: 'n-1',
    folderId: gone.id,
  });
  // A trashed note leaves the folder too.
  await repo.journal.save(S, {
    ...base!,
    id: 'n-2',
    folderId: gone.id,
    deletedAt: '2026-11-19T00:00:00.000Z',
  });
  await repo.journal.save(S, { ...base!, id: 'n-3', folderId: keep.id });

  await repo.folders.remove(S, gone.id);

  expect((await repo.folders.list(S)).map((f) => f.id)).toEqual([keep.id]);
  expect(await repo.journal.get(S, inGone.id)).not.toHaveProperty('folderId');
  expect(await repo.journal.get(S, 'n-2')).not.toHaveProperty('folderId');
  expect((await repo.journal.get(S, 'n-2'))?.deletedAt).toBeDefined();
  expect((await repo.journal.get(S, 'n-3'))?.folderId).toBe(keep.id);
  await expect(repo.folders.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { KeelDb } from './db';
import { createLocalRepository } from './local-repository';

const S = 'sample';

/** The fixture with a capitalised tag, and one that collides with `tag-setup` ("breakout", Setups). */
function withCapitals() {
  const s = fixtureSample();
  s.tags.push(
    {
      id: 'tag-caps',
      workspaceId: S,
      name: 'BREAKOUT',
      categoryId: 'mistakes',
    },
    {
      id: 'tag-clash',
      workspaceId: S,
      name: 'Breakout',
      categoryId: 'setups',
      description: 'Break of the range.',
    },
  );
  // f-1: the loser only; f-2: the survivor only; f-3: both.
  s.trades[0]!.tagIds = ['tag-clash'];
  s.trades[1]!.tagIds = ['tag-setup'];
  s.trades[2]!.tagIds = ['tag-clash', 'tag-setup', 'tag-fomo'];
  return s;
}

function setup(idb = new IDBFactory()) {
  const repo = createLocalRepository({
    indexedDB: idb,
    IDBKeyRange,
    sample: async () => withCapitals(),
  });
  return { repo, idb };
}

test('tag names stored with capitals are lowercased when the store opens', async () => {
  const { repo } = setup();
  const byId = Object.fromEntries(
    (await repo.tags.list(S)).map((t) => [t.id, t.name]),
  );
  expect(byId['tag-caps']).toBe('breakout');
});

test('a capitalised name that collides is merged into the tag that has it: trades repointed once, description carried, the loser deleted', async () => {
  const { repo } = setup();
  const tags = await repo.tags.list(S);
  expect(tags.map((t) => t.id)).not.toContain('tag-clash');
  const survivor = tags.find((t) => t.id === 'tag-setup')!;
  expect(survivor.name).toBe('breakout');
  expect(survivor.description).toBe('Break of the range.');
  const tagsOf = async (id: string) => (await repo.trades.get(S, id))!.tagIds;
  expect(await tagsOf('f-1')).toEqual(['tag-setup']);
  expect(await tagsOf('f-2')).toEqual(['tag-setup']);
  expect(await tagsOf('f-3')).toEqual(['tag-setup', 'tag-fomo']);
  // The survivor stays editable.
  await expect(
    repo.tags.update(S, 'tag-setup', { description: 'Range break.' }),
  ).resolves.toMatchObject({ description: 'Range break.' });
});

test('the survivor keeps its own description', async () => {
  const idb = new IDBFactory();
  const repo = createLocalRepository({
    indexedDB: idb,
    IDBKeyRange,
    sample: async () => {
      const s = withCapitals();
      s.tags.find((t) => t.id === 'tag-setup')!.description = 'Mine.';
      return s;
    },
  });
  const survivor = (await repo.tags.list(S)).find((t) => t.id === 'tag-setup');
  expect(survivor?.description).toBe('Mine.');
});

test('the pass runs once: a capitalised name written after it is left alone on the next open', async () => {
  const { repo, idb } = setup();
  await repo.tags.list(S); // first open runs the pass
  const raw = new KeelDb({ indexedDB: idb, IDBKeyRange });
  await raw.open();
  await raw.tags.put({
    id: 'late',
    workspaceId: S,
    name: 'Late',
    categoryId: 'setups',
  });
  raw.close();
  const again = createLocalRepository({
    indexedDB: idb,
    IDBKeyRange,
    sample: async () => withCapitals(),
  });
  const names = Object.fromEntries(
    (await again.tags.list(S)).map((t) => [t.id, t.name]),
  );
  expect(names['late']).toBe('Late');
});

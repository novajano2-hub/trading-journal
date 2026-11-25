import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { createLocalRepository } from './local-repository';

const open = () =>
  createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });

test.each(['ab', 'bad name', 'a'.repeat(31), ''])(
  'username %j is refused with RangeError',
  async (username) => {
    await expect(open().prefs.update({ username })).rejects.toBeInstanceOf(
      RangeError,
    );
  },
);

test('a username of letters, digits, dots and underscores passes', async () => {
  const prefs = await open().prefs.update({ username: 'sam.k_1' });
  expect(prefs.username).toBe('sam.k_1');
});

test.each([
  { status: 'pending', at: '2026-11-25T00:00:00.000Z' },
  { status: 'done' },
  { status: 'done', at: 'yesterday' },
  { status: 'done', at: 5 },
])('onboarding %j is refused with RangeError', async (onboarding) => {
  await expect(
    open().prefs.update({ onboarding: onboarding as never }),
  ).rejects.toBeInstanceOf(RangeError);
});

test('onboarding done with an ISO time passes', async () => {
  const onboarding = {
    status: 'done' as const,
    at: '2026-11-25T10:00:00.000Z',
  };
  expect((await open().prefs.update({ onboarding })).onboarding).toEqual(
    onboarding,
  );
});

test.each(['dayColumns', 'weekColumns', 'seenTips'] as const)(
  '%s must be a list of strings',
  async (key) => {
    const repo = open();
    await expect(
      repo.prefs.update({ [key]: ['a', 3] as never }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repo.prefs.update({ [key]: 'a' as never }),
    ).rejects.toBeInstanceOf(RangeError);
    expect((await repo.prefs.update({ [key]: ['a', 'b'] }))[key]).toEqual([
      'a',
      'b',
    ]);
  },
);

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

const NOTE = { h1: 28, h2: 22, h3: 18, body: 14, strikeChecked: true };

test.each([[['fees', 7]], ['fees']])(
  'tradeStats %j that is not a list of strings is refused',
  async (tradeStats) => {
    await expect(
      open().prefs.update({ tradeStats: tradeStats as never }),
    ).rejects.toBeInstanceOf(RangeError);
  },
);

test('tradeStats as a list of strings passes', async () => {
  const prefs = await open().prefs.update({ tradeStats: ['fees', 'swap'] });
  expect(prefs.tradeStats).toEqual(['fees', 'swap']);
});

test.each([
  { ...NOTE, h1: 9 },
  { ...NOTE, h2: 41 },
  { ...NOTE, h3: 18.5 },
  { ...NOTE, body: '14' },
  { ...NOTE, strikeChecked: 'yes' },
  { h1: 28, h2: 22, h3: 18, body: 14 },
  null,
])('noteType %j is refused with RangeError', async (noteType) => {
  await expect(
    open().prefs.update({ noteType: noteType as never }),
  ).rejects.toBeInstanceOf(RangeError);
});

test('noteType within 10 to 40 passes, at the bounds too', async () => {
  const noteType = { h1: 40, h2: 10, h3: 18, body: 14, strikeChecked: false };
  expect((await open().prefs.update({ noteType })).noteType).toEqual(noteType);
});

test('strategyChooser must be a boolean', async () => {
  await expect(
    open().prefs.update({ strategyChooser: 'off' as never }),
  ).rejects.toBeInstanceOf(RangeError);
  const prefs = await open().prefs.update({ strategyChooser: false });
  expect(prefs.strategyChooser).toBe(false);
});

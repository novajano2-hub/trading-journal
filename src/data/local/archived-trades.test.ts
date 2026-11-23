import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { fixtureSample } from '../__fixtures__/sample';
import { ArchivedAccountError } from '../repository';
import { KeelDb } from './db';
import { createLocalRepository } from './local-repository';

const S = 'sample';

// The fixture: archived `acc-b` holds `f-3`; active `acc-a` holds `f-1` and `f-2`.
async function setup() {
  const indexedDB = new IDBFactory();
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: async () => fixtureSample(),
    newId: () => 'm-1',
  });
  await repo.trades.list(S);
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  await db.open();
  return { repo, db };
}

const inst = fixtureSample().trades[0]!.instrument;
const fills = [
  {
    time: '2026-11-19T14:00:00.000Z',
    side: 'buy' as const,
    qty: 1,
    price: 100,
    commission: 0,
    fees: 0,
  },
  {
    time: '2026-11-19T15:00:00.000Z',
    side: 'sell' as const,
    qty: 1,
    price: 101,
    commission: 0,
    fees: 0,
  },
];

test('update and updateMany refuse a trade of an archived account and change nothing', async () => {
  const { repo } = await setup();
  const before = await repo.trades.get(S, 'f-3');
  await expect(
    repo.trades.update(S, 'f-3', { rating: 2 }),
  ).rejects.toBeInstanceOf(ArchivedAccountError);
  const refused = repo.trades.updateMany(S, ['f-1', 'f-3'], {
    reviewed: false,
  });
  await expect(refused).rejects.toBeInstanceOf(ArchivedAccountError);
  await expect(refused).rejects.toMatchObject({
    accountIds: ['acc-b'],
    tradeIds: ['f-3'],
  });
  expect(await repo.trades.get(S, 'f-3')).toEqual(before);
  expect((await repo.trades.get(S, 'f-1'))?.rating).toBe(4);
});

test('update still works on an active account', async () => {
  const { repo } = await setup();
  await expect(
    repo.trades.update(S, 'f-1', { rating: 2 }),
  ).resolves.toMatchObject({ rating: 2 });
});

test("remove refuses an archived account's trade and deletes nothing", async () => {
  const { repo } = await setup();
  await expect(repo.trades.remove(S, ['f-1', 'f-3'])).rejects.toBeInstanceOf(
    ArchivedAccountError,
  );
  expect(await repo.trades.get(S, 'f-1')).toBeDefined();
  expect(await repo.trades.get(S, 'f-3')).toBeDefined();
  await repo.trades.remove(S, ['f-1']);
  expect(await repo.trades.get(S, 'f-1')).toBeUndefined();
});

test('createManual refuses an archived account', async () => {
  const { repo } = await setup();
  const before = (await repo.trades.list(S)).length;
  await expect(
    repo.trades.createManual(S, {
      accountId: 'acc-b',
      instrument: inst,
      fills,
    }),
  ).rejects.toBeInstanceOf(ArchivedAccountError);
  expect((await repo.trades.list(S)).length).toBe(before);
});

test('replaceManual refuses a manual trade in an archived account, and a move into one', async () => {
  const { repo, db } = await setup();
  await db.trades.put(
    makeTrade({
      id: 'manual:old',
      serial: 99,
      workspaceId: S,
      accountId: 'acc-b',
      source: 'manual',
      net: 0,
    }),
  );
  await expect(
    repo.trades.replaceManual(S, 'manual:old', {
      accountId: 'acc-b',
      instrument: inst,
      fills,
    }),
  ).rejects.toBeInstanceOf(ArchivedAccountError);
  const made = await repo.trades.createManual(S, {
    accountId: 'acc-a',
    instrument: inst,
    fills,
  });
  await expect(
    repo.trades.replaceManual(S, made.id, {
      accountId: 'acc-b',
      instrument: inst,
      fills,
    }),
  ).rejects.toBeInstanceOf(ArchivedAccountError);
});

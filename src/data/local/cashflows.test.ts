import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { NotFoundError } from '../repository';
import { createLocalRepository } from './local-repository';

const S = 'sample';
const M = 'mine';

function setup(sample = async () => fixtureSample()) {
  let n = 0;
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample,
    newId: () => `cf-${++n}`,
  });
}

test('create, list newest first, update and remove', async () => {
  const repo = setup();
  const a = await repo.cashFlows.create(S, {
    accountId: 'acc-a',
    date: '2026-11-05',
    amount: 100_000,
    note: ' Top up ',
  });
  expect(a).toMatchObject({
    id: 'cf-1',
    workspaceId: S,
    accountId: 'acc-a',
    note: 'Top up',
  });
  await repo.cashFlows.create(S, {
    accountId: 'acc-a',
    date: '2026-11-12',
    amount: -50_000,
  });
  expect((await repo.cashFlows.list(S)).map((f) => f.date)).toEqual([
    '2026-11-12',
    '2026-11-05',
  ]);
  const edited = await repo.cashFlows.update(S, a.id, {
    amount: 120_000,
    note: undefined,
  });
  expect(edited.amount).toBe(120_000);
  expect(edited.note).toBe('Top up');
  const cleared = await repo.cashFlows.update(S, a.id, { note: '' });
  expect(cleared.note).toBeUndefined();
  await repo.cashFlows.remove(S, a.id);
  expect(await repo.cashFlows.list(S)).toHaveLength(1);
  await expect(repo.cashFlows.remove(S, a.id)).rejects.toBeInstanceOf(
    NotFoundError,
  );
  expect(await repo.cashFlows.list(M)).toEqual([]);
});

test('refuses a missing account, a zero or fractional amount and a bad date', async () => {
  const repo = setup();
  const ok = { accountId: 'acc-a', date: '2026-11-05', amount: 100 };
  await expect(
    repo.cashFlows.create(S, { ...ok, accountId: 'nope' }),
  ).rejects.toBeInstanceOf(NotFoundError);
  await expect(
    repo.cashFlows.create(S, { ...ok, amount: 0 }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.cashFlows.create(S, { ...ok, amount: 1.5 }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.cashFlows.create(S, { ...ok, date: '2026-13-40' }),
  ).rejects.toBeInstanceOf(RangeError);
});

test("removing an account deletes its cash flows in the same transaction, and no one else's", async () => {
  const repo = setup();
  const empty = await repo.accounts.create(M, {
    name: 'Empty',
    broker: '',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  const other = await repo.accounts.create(M, {
    name: 'Other',
    broker: '',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  await repo.cashFlows.create(M, {
    accountId: empty.id,
    date: '2026-11-05',
    amount: 1_000,
  });
  await repo.cashFlows.create(M, {
    accountId: other.id,
    date: '2026-11-05',
    amount: 2_000,
  });
  await repo.accounts.remove(M, empty.id);
  expect((await repo.cashFlows.list(M)).map((f) => f.accountId)).toEqual([
    other.id,
  ]);
});

test('a refused account removal keeps its cash flows', async () => {
  const repo = setup();
  await repo.cashFlows.create(S, {
    accountId: 'acc-a',
    date: '2026-11-05',
    amount: 1_000,
  });
  await expect(repo.accounts.remove(S, 'acc-a')).rejects.toThrow(
    'account has trades',
  );
  expect(await repo.cashFlows.list(S)).toHaveLength(1);
});

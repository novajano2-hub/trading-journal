import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { NotFoundError } from '../repository';
import { createLocalRepository } from './local-repository';

const S = 'sample';
const M = 'mine';

function setup() {
  let n = 0;
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
    newId: () => `id-${++n}`,
  });
  return repo;
}

const fee = {
  date: '2026-11-03',
  description: ' Evaluation, Forex 100K ',
  firm: ' Sample firm ',
  category: 'evaluation-fee' as const,
  amount: -54_000,
  status: 'not-reviewed' as const,
};

test('add trims the text, leaves an empty description out and keeps the sign', async () => {
  const repo = setup();
  const t = await repo.propTxns.add(S, fee);
  expect(t).toEqual({
    id: 'id-1',
    workspaceId: S,
    date: '2026-11-03',
    description: 'Evaluation, Forex 100K',
    firm: 'Sample firm',
    category: 'evaluation-fee',
    amount: -54_000,
    status: 'not-reviewed',
  });
  const bare = await repo.propTxns.add(S, {
    ...fee,
    description: '  ',
    amount: 180_000,
    category: 'payout',
  });
  expect('description' in bare).toBe(false);
  expect(bare.amount).toBe(180_000);
});

test('list is newest date first, then by id, and per workspace', async () => {
  const repo = setup();
  await repo.propTxns.add(S, { ...fee, date: '2026-10-07' });
  await repo.propTxns.add(S, { ...fee, date: '2026-11-18' });
  await repo.propTxns.add(S, { ...fee, date: '2026-11-18' });
  await repo.propTxns.add(M, { ...fee, date: '2026-11-20' });
  expect((await repo.propTxns.list(S)).map((t) => [t.date, t.id])).toEqual([
    ['2026-11-18', 'id-2'],
    ['2026-11-18', 'id-3'],
    ['2026-10-07', 'id-1'],
  ]);
  expect(await repo.propTxns.list(M)).toHaveLength(1);
});

test('a row that cannot be is refused and nothing is written', async () => {
  const repo = setup();
  for (const bad of [
    { date: '2026-02-30' },
    { date: '3 Nov' },
    { date: '' },
    { amount: 0 },
    { amount: 12.5 },
    { amount: Number.NaN },
    { category: 'rebate' },
    { status: 'done' },
  ])
    await expect(
      repo.propTxns.add(S, { ...fee, ...bad } as never),
      JSON.stringify(bad),
    ).rejects.toBeInstanceOf(RangeError);
  expect(await repo.propTxns.list(S)).toEqual([]);
});

test('a firm may be blank: the breakdowns read it as None', async () => {
  const repo = setup();
  const t = await repo.propTxns.add(S, { ...fee, firm: '  ' });
  expect(t.firm).toBe('');
});

test('a link must name a challenge of the workspace', async () => {
  const repo = setup();
  const c = await repo.challenges.create(S, {
    name: 'Futures 50K',
    firm: 'Sample firm',
    steps: 1,
    phases: [{ step: 'step-1' }, { step: 'funded' }],
    phase: 'evaluation',
    status: 'active',
  });
  const linked = await repo.propTxns.add(S, { ...fee, challengeId: c.id });
  expect(linked.challengeId).toBe(c.id);
  await expect(
    repo.propTxns.add(S, { ...fee, challengeId: 'nope' }),
  ).rejects.toBeInstanceOf(NotFoundError);
  // Another workspace's challenge is not this one's.
  await expect(
    repo.propTxns.add(M, { ...fee, challengeId: c.id }),
  ).rejects.toBeInstanceOf(NotFoundError);
});

test('update merges the patch; undefined clears the description and the link only', async () => {
  const repo = setup();
  const c = await repo.challenges.create(S, {
    name: 'Futures 50K',
    firm: 'Sample firm',
    steps: 1,
    phases: [{ step: 'step-1' }, { step: 'funded' }],
    phase: 'evaluation',
    status: 'active',
  });
  const t = await repo.propTxns.add(S, { ...fee, challengeId: c.id });
  const reviewed = await repo.propTxns.update(S, t.id, {
    status: 'reviewed',
    category: 'reset-fee',
    amount: undefined,
  });
  expect(reviewed).toMatchObject({
    status: 'reviewed',
    category: 'reset-fee',
    amount: -54_000,
    challengeId: c.id,
    description: 'Evaluation, Forex 100K',
  });
  const cleared = await repo.propTxns.update(S, t.id, {
    description: undefined,
    challengeId: undefined,
  });
  expect('description' in cleared).toBe(false);
  expect('challengeId' in cleared).toBe(false);
  expect(await repo.propTxns.list(S)).toEqual([cleared]);
  await expect(
    repo.propTxns.update(S, t.id, { amount: 0 }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.propTxns.update(S, 'nope', { status: 'ignored' }),
  ).rejects.toBeInstanceOf(NotFoundError);
});

test('remove deletes for good and a missing id throws', async () => {
  const repo = setup();
  const t = await repo.propTxns.add(S, fee);
  await repo.propTxns.remove(S, t.id);
  expect(await repo.propTxns.list(S)).toEqual([]);
  await expect(repo.propTxns.remove(S, t.id)).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

test('removing a challenge keeps its rows and unlinks them', async () => {
  const repo = setup();
  const c = await repo.challenges.create(S, {
    name: 'Futures 50K',
    firm: 'Sample firm',
    steps: 1,
    phases: [{ step: 'step-1' }, { step: 'funded' }],
    phase: 'evaluation',
    status: 'active',
  });
  const t = await repo.propTxns.add(S, { ...fee, challengeId: c.id });
  await repo.challenges.remove(S, c.id);
  const [after] = await repo.propTxns.list(S);
  expect(after).toMatchObject({ id: t.id, amount: -54_000 });
  expect('challengeId' in after!).toBe(false);
});

test('clearing My workspace clears its rows; the sample keeps its own', async () => {
  const repo = setup();
  await repo.propTxns.add(M, fee);
  await repo.propTxns.add(S, fee);
  await repo.workspaces.clearUser();
  expect(await repo.propTxns.list(M)).toEqual([]);
  expect(await repo.propTxns.list(S)).toHaveLength(1);
});

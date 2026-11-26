import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { NotFoundError, PayoutRefusedError } from '../repository';
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

describe('logPayout (C29)', () => {
  const challenge = {
    name: 'Futures 50K',
    firm: ' Sample firm ',
    steps: 1 as const,
    phases: [{ step: 'step-1' as const }, { step: 'funded' as const }],
    phase: 'funded' as const,
    status: 'active' as const,
  };
  const payout = { amount: 90_000, date: '2026-11-17' };

  test('writes a payout in the funded challenge firm, not reviewed, and no withdrawal', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, challenge);
    const flows = await repo.cashFlows.list(S);
    const t = await repo.propTxns.logPayout(S, {
      challengeId: c.id,
      ...payout,
      description: ' First payout ',
    });
    expect(t).toEqual({
      id: 'id-2',
      workspaceId: S,
      date: '2026-11-17',
      description: 'First payout',
      firm: 'Sample firm',
      challengeId: c.id,
      category: 'payout',
      amount: 90_000,
      status: 'not-reviewed',
    });
    expect(await repo.propTxns.list(S)).toEqual([t]);
    expect(await repo.cashFlows.list(S)).toEqual(flows);
    const bare = await repo.propTxns.logPayout(S, {
      challengeId: c.id,
      ...payout,
    });
    expect('description' in bare).toBe(false);
  });

  test('refuses a challenge that is still in an evaluation, writing nothing', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, {
      ...challenge,
      phase: 'evaluation',
    });
    const attempt = repo.propTxns.logPayout(S, {
      challengeId: c.id,
      ...payout,
    });
    await expect(attempt).rejects.toBeInstanceOf(PayoutRefusedError);
    await expect(attempt).rejects.toMatchObject({
      challengeId: c.id,
      reason: 'not-funded',
    });
    expect(await repo.propTxns.list(S)).toEqual([]);
  });

  test('refuses a breached challenge, even one in its funded phase', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, challenge);
    await repo.challenges.markBreached(S, c.id, {
      reason: 'max-drawdown',
      on: '2026-11-12',
    });
    const attempt = repo.propTxns.logPayout(S, {
      challengeId: c.id,
      ...payout,
    });
    await expect(attempt).rejects.toBeInstanceOf(PayoutRefusedError);
    await expect(attempt).rejects.toMatchObject({
      challengeId: c.id,
      reason: 'breached',
    });
    expect(await repo.propTxns.list(S)).toEqual([]);
  });

  test('refuses an amount that is not income, a bad date, and a challenge that is not there', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, challenge);
    for (const amount of [0, -100, 12.5, Number.NaN])
      await expect(
        repo.propTxns.logPayout(S, {
          challengeId: c.id,
          ...payout,
          amount,
        }),
        String(amount),
      ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repo.propTxns.logPayout(S, {
        challengeId: c.id,
        ...payout,
        date: '17 Nov',
      }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repo.propTxns.logPayout(S, { challengeId: 'nope', ...payout }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // Another workspace's challenge is not this one's.
    await expect(
      repo.propTxns.logPayout(M, { challengeId: c.id, ...payout }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await repo.propTxns.list(S)).toEqual([]);
  });
});

test('clearing My workspace clears its rows; the sample keeps its own', async () => {
  const repo = setup();
  await repo.propTxns.add(M, fee);
  await repo.propTxns.add(S, fee);
  await repo.workspaces.clearUser();
  expect(await repo.propTxns.list(M)).toEqual([]);
  expect(await repo.propTxns.list(S)).toHaveLength(1);
});

test("the sample opens with its own rows, and a reset brings them back without touching My workspace's", async () => {
  const row = {
    id: 'sample-prop-txn-1',
    workspaceId: S,
    ...fee,
    description: 'Evaluation, Forex 100K',
    firm: 'Sample firm',
  };
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => ({ ...fixtureSample(), propTxns: [row] }),
    newId: () => 'extra',
  });
  expect(await repo.propTxns.list(S)).toEqual([row]);
  await repo.propTxns.add(S, { ...fee, date: '2026-11-10' });
  const mine = await repo.propTxns.add(M, fee);
  expect(await repo.propTxns.list(S)).toHaveLength(2);
  await repo.workspaces.resetSample();
  expect(await repo.propTxns.list(S)).toEqual([row]);
  expect(await repo.propTxns.list(M)).toEqual([mine]);
});

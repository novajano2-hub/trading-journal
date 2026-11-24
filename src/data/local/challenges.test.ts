import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { NotFoundError } from '../repository';
import { createLocalRepository } from './local-repository';

const S = 'sample';

function setup() {
  let n = 0;
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
    newId: () => `ch-${++n}`,
  });
}

const input = {
  name: ' Futures 50K ',
  firm: 'Apex',
  steps: 1 as const,
  phases: [
    { step: 'step-1' as const, accountId: 'acc-a' },
    { step: 'funded' as const },
  ],
  phase: 'evaluation' as const,
  status: 'active' as const,
  evaluationFee: 16_500,
};

test('create trims, lists by name, updates, clears and removes', async () => {
  const repo = setup();
  const c = await repo.challenges.create(S, input);
  expect(c).toMatchObject({ id: 'ch-1', name: 'Futures 50K' });
  const edited = await repo.challenges.update(S, c.id, {
    status: 'breached',
    failureReason: ' Daily loss limit broken. ',
    evaluationFee: undefined,
  });
  expect(edited).toMatchObject({
    status: 'breached',
    failureReason: 'Daily loss limit broken.',
  });
  expect('evaluationFee' in edited).toBe(false);
  const cleared = await repo.challenges.update(S, c.id, { failureReason: '' });
  expect('failureReason' in cleared).toBe(false);
  expect(await repo.challenges.list(S)).toHaveLength(1);
  await repo.challenges.remove(S, c.id);
  expect(await repo.challenges.list(S)).toEqual([]);
  await expect(repo.challenges.remove(S, c.id)).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

test('a challenge that cannot be is refused', async () => {
  const repo = setup();
  await expect(
    repo.challenges.create(S, { ...input, name: ' ' }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.challenges.create(S, { ...input, steps: 2 }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.challenges.create(S, { ...input, evaluationFee: -1 }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.challenges.create(S, {
      ...input,
      phases: [
        { step: 'step-1', accountId: 'acc-a' },
        { step: 'funded', accountId: 'acc-a' },
      ],
    }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.challenges.create(S, {
      ...input,
      phases: [{ step: 'step-1', accountId: 'nope' }, { step: 'funded' }],
    }),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect(await repo.challenges.list(S)).toEqual([]);
});

test('an account another challenge links is refused, naming that challenge', async () => {
  const repo = setup();
  const first = await repo.challenges.create(S, input);
  const other = {
    ...input,
    name: 'Apex 100K',
    phases: [
      { step: 'step-1' as const, accountId: 'acc-b' },
      { step: 'funded' as const },
    ],
  };
  const second = await repo.challenges.create(S, other);
  // Creating one over a linked account.
  await expect(
    repo.challenges.create(S, { ...input, name: 'Third' }),
  ).rejects.toThrow(/Futures 50K/);
  await expect(
    repo.challenges.create(S, { ...input, name: 'Third' }),
  ).rejects.toBeInstanceOf(RangeError);
  // Editing one onto the other's account.
  await expect(
    repo.challenges.update(S, second.id, {
      phases: [{ step: 'step-1', accountId: 'acc-a' }, { step: 'funded' }],
    }),
  ).rejects.toThrow(/Futures 50K/);
  // Saving a challenge with its own account is fine.
  await expect(
    repo.challenges.update(S, first.id, { status: 'passed' }),
  ).resolves.toMatchObject({ status: 'passed' });
  expect(await repo.challenges.list(S)).toHaveLength(2);
});

test('removing an account unlinks its phase and keeps the challenge', async () => {
  const repo = setup();
  const acc = await repo.accounts.create(S, {
    name: 'Empty',
    broker: 'Apex',
    type: 'prop-evaluation',
    currency: 'USD',
    startingBalance: 5_000_000,
    status: 'active',
  });
  const c = await repo.challenges.create(S, {
    ...input,
    phases: [
      { step: 'step-1', accountId: acc.id, startDate: '2026-11-02' },
      { step: 'funded' },
    ],
  });
  await repo.accounts.remove(S, acc.id);
  const [after] = await repo.challenges.list(S);
  expect(after!.id).toBe(c.id);
  expect(after!.phases).toEqual([
    { step: 'step-1', startDate: '2026-11-02' },
    { step: 'funded' },
  ]);
});

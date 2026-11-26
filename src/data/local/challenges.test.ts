import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { ChallengeBreachedError, NotFoundError } from '../repository';
import { KeelDb } from './db';
import { createLocalRepository } from './local-repository';

const S = 'sample';

function setup() {
  return setupWithDb().repo;
}

/** The repository and a handle on its store, to seed a record the methods would refuse. */
function setupWithDb() {
  let n = 0;
  const indexedDB = new IDBFactory();
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: async () => fixtureSample(),
    newId: () => `ch-${++n}`,
  });
  return { repo, db: new KeelDb({ indexedDB, IDBKeyRange }) };
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
    failureReason: ' Daily loss limit broken. ',
    evaluationFee: undefined,
  });
  expect(edited).toMatchObject({
    status: 'active',
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

test('a challenge cannot be created breached: that goes through markBreached, which records why and when', async () => {
  const repo = setup();
  const attempt = repo.challenges.create(S, { ...input, status: 'breached' });
  await expect(attempt).rejects.toBeInstanceOf(RangeError);
  await expect(attempt).rejects.toThrow(/markBreached/);
  // Nothing was written, and an ordinary status still creates.
  expect(await repo.challenges.list(S)).toEqual([]);
  await expect(
    repo.challenges.create(S, { ...input, status: 'passed' }),
  ).resolves.toMatchObject({ status: 'passed' });
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

describe('markBreached', () => {
  const on = '2026-11-12';

  test('writes the status, the reason and the date, and leaves the phase and the old text alone', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, {
      ...input,
      failureReason: 'Max drawdown limit broken on 12 Nov.',
    });
    const done = await repo.challenges.markBreached(S, c.id, {
      reason: 'max-drawdown',
      on,
    });
    expect(done).toMatchObject({
      id: c.id,
      status: 'breached',
      breachReason: 'max-drawdown',
      breachedOn: on,
      phase: 'evaluation',
      failureReason: 'Max drawdown limit broken on 12 Nov.',
    });
    expect(await repo.challenges.list(S)).toEqual([done]);
  });

  test("'other' keeps the trader's words in the failure reason, trimmed; a blank note keeps the old text", async () => {
    const repo = setup();
    const a = await repo.challenges.create(S, input);
    const doneA = await repo.challenges.markBreached(S, a.id, {
      reason: 'other',
      note: '  Firm closed my account  ',
      on,
    });
    expect(doneA).toMatchObject({
      breachReason: 'other',
      failureReason: 'Firm closed my account',
    });
    const b = await repo.challenges.create(S, {
      ...input,
      name: 'Other one',
      phases: [{ step: 'step-1' }, { step: 'funded' }],
      failureReason: 'Earlier text',
    });
    const doneB = await repo.challenges.markBreached(S, b.id, {
      reason: 'other',
      note: '   ',
      on,
    });
    expect(doneB.failureReason).toBe('Earlier text');
    // A note beside a listed reason is not stored.
    const c = await repo.challenges.create(S, {
      ...input,
      name: 'Third',
      phases: [{ step: 'step-1' }, { step: 'funded' }],
    });
    const doneC = await repo.challenges.markBreached(S, c.id, {
      reason: 'overtrading',
      note: 'ignored',
      on,
    });
    expect('failureReason' in doneC).toBe(false);
  });

  test('a breach is permanent: a second one is refused and nothing changes', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, input);
    const first = await repo.challenges.markBreached(S, c.id, {
      reason: 'overtrading',
      on,
    });
    const again = repo.challenges.markBreached(S, c.id, {
      reason: 'time-pressure',
      on: '2026-11-20',
    });
    await expect(again).rejects.toBeInstanceOf(ChallengeBreachedError);
    await expect(again).rejects.toMatchObject({ challengeId: c.id });
    expect(await repo.challenges.list(S)).toEqual([first]);
  });

  test('a challenge breached before 6C (a status and a text, no reason) is refused too', async () => {
    const { repo, db } = setupWithDb();
    const c = await repo.challenges.create(S, input);
    // Written straight to the store: update no longer sets a breach.
    await db.challenges.update([S, c.id], {
      status: 'breached',
      failureReason: 'Daily loss limit broken.',
    });
    await expect(
      repo.challenges.markBreached(S, c.id, { reason: 'other', on }),
    ).rejects.toBeInstanceOf(ChallengeBreachedError);
    await expect(
      repo.challenges.update(S, c.id, { phase: 'funded' }),
    ).rejects.toBeInstanceOf(ChallengeBreachedError);
  });

  test('update cannot set a breach: it goes through markBreached, which records why and when', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, input);
    const attempt = repo.challenges.update(S, c.id, {
      status: 'breached',
      failureReason: 'Daily loss limit broken.',
    });
    await expect(attempt).rejects.toBeInstanceOf(RangeError);
    await expect(attempt).rejects.toThrow(/markBreached/);
    // Nothing was written: no status, no failure reason, no breach facts.
    expect(await repo.challenges.list(S)).toEqual([c]);
    // The ordinary statuses still move.
    await expect(
      repo.challenges.update(S, c.id, { status: 'passed' }),
    ).resolves.toMatchObject({ status: 'passed' });
    // A breach reaches a passed challenge through markBreached too.
    await expect(
      repo.challenges.update(S, c.id, { status: 'breached' }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repo.challenges.markBreached(S, c.id, { reason: 'max-drawdown', on }),
    ).resolves.toMatchObject({
      status: 'breached',
      breachReason: 'max-drawdown',
      breachedOn: on,
    });
  });

  test('a breach locks the phase: update refuses a phase change on a breached challenge', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, input);
    const done = await repo.challenges.markBreached(S, c.id, {
      reason: 'overtrading',
      on,
    });
    const move = repo.challenges.update(S, c.id, {
      phase: 'funded',
      name: 'Renamed',
    });
    await expect(move).rejects.toBeInstanceOf(ChallengeBreachedError);
    await expect(move).rejects.toMatchObject({ challengeId: c.id });
    // Nothing was written, not even the rename riding on the same patch.
    expect(await repo.challenges.list(S)).toEqual([done]);
    // The phase it already has is no change (the edit form sends every field).
    await expect(
      repo.challenges.update(S, c.id, { phase: 'evaluation', name: 'Renamed' }),
    ).resolves.toMatchObject({ phase: 'evaluation', name: 'Renamed' });
  });

  test('a challenge that is not breached still changes phase', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, input);
    await expect(
      repo.challenges.update(S, c.id, { phase: 'funded' }),
    ).resolves.toMatchObject({ phase: 'funded', status: 'active' });
  });

  test('update refuses any status change on a breached challenge, and allows the rest', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, input);
    const done = await repo.challenges.markBreached(S, c.id, {
      reason: 'max-drawdown',
      on,
    });
    for (const status of ['active', 'passed'] as const)
      await expect(
        repo.challenges.update(S, c.id, { status }),
      ).rejects.toBeInstanceOf(ChallengeBreachedError);
    expect(await repo.challenges.list(S)).toEqual([done]);
    // The same status is no change; other fields still edit.
    await expect(
      repo.challenges.update(S, c.id, { status: 'breached', name: 'Renamed' }),
    ).resolves.toMatchObject({ name: 'Renamed', status: 'breached' });
  });

  test('a bad date or reason is refused; a missing challenge throws', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, input);
    await expect(
      repo.challenges.markBreached(S, c.id, {
        reason: 'max-drawdown',
        on: '12 Nov',
      }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repo.challenges.markBreached(S, c.id, {
        reason: 'luck' as never,
        on,
      }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repo.challenges.markBreached(S, 'nope', { reason: 'other', on }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await repo.challenges.list(S))[0]!.status).toBe('active');
  });
});

test('strategies attach to a challenge, once each, and must exist', async () => {
  const repo = setup();
  const c = await repo.challenges.create(S, {
    ...input,
    strategyIds: ['str-1', 'str-1'],
  });
  expect(c.strategyIds).toEqual(['str-1']);
  await expect(
    repo.challenges.update(S, c.id, { strategyIds: ['nope'] }),
  ).rejects.toBeInstanceOf(NotFoundError);
  const cleared = await repo.challenges.update(S, c.id, { strategyIds: [] });
  expect(cleared.strategyIds).toEqual([]);
});

test('deleting a strategy takes it off the challenges that use it', async () => {
  const repo = setup();
  const c = await repo.challenges.create(S, {
    ...input,
    strategyIds: ['str-1'],
  });
  await repo.strategies.remove(S, 'str-1');
  const [after] = await repo.challenges.list(S);
  expect(after!.id).toBe(c.id);
  expect(after!.strategyIds).toEqual([]);
});

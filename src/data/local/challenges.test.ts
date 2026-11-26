import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import {
  ChallengeBreachedError,
  NotFoundError,
  type NewChallengeEntry,
} from '../repository';
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

test('movedToFundedOn records the day a challenge moved to funded, as a real date (C-01)', async () => {
  const repo = setup();
  const c = await repo.challenges.create(S, input);
  expect('movedToFundedOn' in c).toBe(false);
  await expect(
    repo.challenges.update(S, c.id, {
      phase: 'funded',
      movedToFundedOn: '20 Nov',
    }),
  ).rejects.toBeInstanceOf(RangeError);
  expect((await repo.challenges.list(S))[0]).toEqual(c);
  const moved = await repo.challenges.update(S, c.id, {
    status: 'active',
    phase: 'funded',
    movedToFundedOn: '2026-11-20',
  });
  expect(moved).toMatchObject({
    phase: 'funded',
    movedToFundedOn: '2026-11-20',
  });
  // A later edit keeps it.
  const renamed = await repo.challenges.update(S, c.id, { name: 'Renamed' });
  expect(renamed.movedToFundedOn).toBe('2026-11-20');
  await expect(
    repo.challenges.create(S, { ...input, name: 'Bad', movedToFundedOn: 'x' }),
  ).rejects.toBeInstanceOf(RangeError);
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

describe('createMany (C-02, C-04)', () => {
  const account = (name: string) => ({
    name,
    broker: 'Apex',
    type: 'prop-evaluation' as const,
    currency: 'USD',
    startingBalance: 10_000_000,
    status: 'active' as const,
  });
  /** A challenge named `name` whose step 1 gets a new account. */
  const entry = (name: string): NewChallengeEntry => ({
    challenge: {
      name,
      firm: 'Apex',
      steps: 1 as const,
      phases: [{ step: 'step-1' as const }, { step: 'funded' as const }],
      phase: 'evaluation' as const,
      status: 'active' as const,
      evaluationFee: 54_900,
    },
    newAccounts: [
      { step: 'step-1' as const, account: account(`${name} eval`) },
    ],
  });

  test('writes every challenge with its new accounts linked to the phase asked', async () => {
    const repo = setup();
    const made = await repo.challenges.createMany(S, [
      entry('Apex 100K'),
      entry('Apex 100K 2'),
      entry('Apex 100K 3'),
    ]);
    expect(made.map((c) => c.name)).toEqual([
      'Apex 100K',
      'Apex 100K 2',
      'Apex 100K 3',
    ]);
    const accounts = (await repo.accounts.list(S)).filter(
      (a) => a.type === 'prop-evaluation' && a.name.endsWith(' eval'),
    );
    expect(accounts.map((a) => a.name).sort()).toEqual([
      'Apex 100K 2 eval',
      'Apex 100K 3 eval',
      'Apex 100K eval',
    ]);
    for (const c of made) {
      const linked = accounts.find((a) => a.id === c.phases[0]!.accountId)!;
      expect(linked.name).toBe(`${c.name} eval`);
      expect(c).toMatchObject({ status: 'active', evaluationFee: 54_900 });
    }
    expect(await repo.challenges.list(S)).toHaveLength(3);
  });

  test('keeps a link to an existing account, and a phase with no account', async () => {
    const repo = setup();
    const [c] = await repo.challenges.createMany(S, [
      {
        challenge: {
          ...entry('Mixed').challenge,
          phases: [{ step: 'step-1', accountId: 'acc-a' }, { step: 'funded' }],
        },
        newAccounts: [],
      },
    ]);
    expect(c!.phases).toEqual([
      { step: 'step-1', accountId: 'acc-a' },
      { step: 'funded' },
    ]);
  });

  test('is all or nothing: item 3 failing writes no challenge and no account', async () => {
    const repo = setup();
    const accountsBefore = await repo.accounts.list(S);
    const bad = entry('Third');
    bad.challenge.name = '  ';
    const attempt = repo.challenges.createMany(S, [
      entry('First'),
      entry('Second'),
      bad,
    ]);
    await expect(attempt).rejects.toBeInstanceOf(RangeError);
    expect(await repo.challenges.list(S)).toEqual([]);
    expect(await repo.accounts.list(S)).toEqual(accountsBefore);
  });

  test('is all or nothing for a link to an account that is not there', async () => {
    const repo = setup();
    const accountsBefore = await repo.accounts.list(S);
    const ghost = entry('Ghost');
    ghost.challenge.phases = [
      { step: 'step-1', accountId: 'nope' },
      { step: 'funded' },
    ];
    ghost.newAccounts = [];
    await expect(
      repo.challenges.createMany(S, [entry('First'), ghost]),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await repo.challenges.list(S)).toEqual([]);
    expect(await repo.accounts.list(S)).toEqual(accountsBefore);
  });

  test('refuses no items, a bare breached status, and a new account for a phase that is not there or is already linked', async () => {
    const repo = setup();
    await expect(repo.challenges.createMany(S, [])).rejects.toBeInstanceOf(
      RangeError,
    );
    const bare = entry('Bare');
    bare.challenge.status = 'breached';
    await expect(repo.challenges.createMany(S, [bare])).rejects.toThrow(
      /breach/,
    );
    const stray = entry('Stray');
    stray.newAccounts = [{ step: 'step-2', account: account('x') }];
    await expect(repo.challenges.createMany(S, [stray])).rejects.toBeInstanceOf(
      RangeError,
    );
    const both = entry('Both');
    both.challenge.phases = [
      { step: 'step-1', accountId: 'acc-a' },
      { step: 'funded' },
    ];
    await expect(repo.challenges.createMany(S, [both])).rejects.toBeInstanceOf(
      RangeError,
    );
    expect(await repo.challenges.list(S)).toEqual([]);
  });

  test('a breach is written with the challenge: status, reason, date and, for other, the words; and it is permanent', async () => {
    const repo = setup();
    const [a, b] = await repo.challenges.createMany(S, [
      {
        ...entry('Listed'),
        breach: { reason: 'overtrading', note: 'ignored', on: '2026-11-12' },
      },
      {
        ...entry('Own words'),
        breach: {
          reason: 'other',
          note: '  Firm closed it  ',
          on: '2026-11-13',
        },
      },
    ]);
    expect(a).toMatchObject({
      status: 'breached',
      breachReason: 'overtrading',
      breachedOn: '2026-11-12',
      phase: 'evaluation',
    });
    expect('failureReason' in a!).toBe(false);
    expect(b).toMatchObject({
      status: 'breached',
      breachReason: 'other',
      breachedOn: '2026-11-13',
      failureReason: 'Firm closed it',
    });
    expect(await repo.challenges.list(S)).toEqual([a, b]);
    await expect(
      repo.challenges.update(S, a!.id, { status: 'active' }),
    ).rejects.toBeInstanceOf(ChallengeBreachedError);
    await expect(
      repo.challenges.markBreached(S, a!.id, {
        reason: 'other',
        on: '2026-11-14',
      }),
    ).rejects.toBeInstanceOf(ChallengeBreachedError);
  });

  test('a bad breach date or reason refuses the whole batch', async () => {
    const repo = setup();
    for (const breach of [
      { reason: 'overtrading' as const, on: '12 Nov' },
      { reason: 'luck' as never, on: '2026-11-12' },
    ])
      await expect(
        repo.challenges.createMany(S, [
          entry('Fine'),
          { ...entry('Broken'), breach },
        ]),
      ).rejects.toBeInstanceOf(RangeError);
    expect(await repo.challenges.list(S)).toEqual([]);
  });

  test('create itself still refuses a bare breached status', async () => {
    const repo = setup();
    await expect(
      repo.challenges.create(S, { ...input, status: 'breached' }),
    ).rejects.toThrow(/markBreached/);
  });
});

describe('a breach locks the steps (C-05)', () => {
  const two = {
    ...input,
    steps: 2 as const,
    phases: [
      { step: 'step-1' as const, accountId: 'acc-a' },
      { step: 'step-2' as const },
      { step: 'funded' as const },
    ],
  };

  test('update refuses a steps change or a different set of phases on a breached challenge, and writes nothing', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, two);
    const done = await repo.challenges.markBreached(S, c.id, {
      reason: 'overtrading',
      on: '2026-11-12',
    });
    const one = repo.challenges.update(S, c.id, {
      steps: 1,
      phases: [{ step: 'step-1', accountId: 'acc-a' }, { step: 'funded' }],
      name: 'Renamed',
    });
    await expect(one).rejects.toBeInstanceOf(ChallengeBreachedError);
    await expect(one).rejects.toMatchObject({ challengeId: c.id });
    await expect(
      repo.challenges.update(S, c.id, { steps: 1 }),
    ).rejects.toBeInstanceOf(ChallengeBreachedError);
    await expect(
      repo.challenges.update(S, c.id, {
        phases: [{ step: 'step-1', accountId: 'acc-a' }, { step: 'funded' }],
      }),
    ).rejects.toBeInstanceOf(ChallengeBreachedError);
    expect(await repo.challenges.list(S)).toEqual([done]);
  });

  test('the same steps and phases are no change, and a start date or an account link still edits', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, two);
    await repo.challenges.markBreached(S, c.id, {
      reason: 'overtrading',
      on: '2026-11-12',
    });
    await expect(
      repo.challenges.update(S, c.id, {
        steps: 2,
        phases: [
          { step: 'step-1', accountId: 'acc-a' },
          { step: 'step-2' },
          { step: 'funded' },
        ],
        name: 'Renamed',
      }),
    ).resolves.toMatchObject({ name: 'Renamed', steps: 2, status: 'breached' });
    await expect(
      repo.challenges.update(S, c.id, {
        phases: [
          { step: 'step-1', accountId: 'acc-a', startDate: '2026-10-01' },
          { step: 'step-2' },
          { step: 'funded' },
        ],
      }),
    ).resolves.toMatchObject({
      phases: [
        { step: 'step-1', accountId: 'acc-a', startDate: '2026-10-01' },
        { step: 'step-2' },
        { step: 'funded' },
      ],
    });
  });

  test('a challenge that is not breached still changes its steps', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, two);
    await expect(
      repo.challenges.update(S, c.id, {
        steps: 1,
        phases: [{ step: 'step-1', accountId: 'acc-a' }, { step: 'funded' }],
      }),
    ).resolves.toMatchObject({ steps: 1 });
  });
});

describe('update with new accounts (C-02)', () => {
  const account = {
    name: 'Funded account',
    broker: 'Apex',
    type: 'prop-funded' as const,
    currency: 'USD',
    startingBalance: 5_000_000,
    status: 'active' as const,
  };

  test('creates the account and links it to the phase in the same write', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, input);
    const next = await repo.challenges.update(
      S,
      c.id,
      { name: 'Renamed', phases: c.phases },
      [{ step: 'funded', account }],
    );
    const made = (await repo.accounts.list(S)).find(
      (a) => a.name === 'Funded account',
    )!;
    expect(next.phases).toEqual([
      { step: 'step-1', accountId: 'acc-a' },
      { step: 'funded', accountId: made.id },
    ]);
    expect(await repo.challenges.list(S)).toEqual([next]);
  });

  test('a refused update leaves no account behind', async () => {
    const repo = setup();
    const c = await repo.challenges.create(S, input);
    const before = await repo.accounts.list(S);
    await expect(
      repo.challenges.update(S, c.id, { name: ' ' }, [
        { step: 'funded', account },
      ]),
    ).rejects.toBeInstanceOf(RangeError);
    // A phase that is not there, or already linked.
    await expect(
      repo.challenges.update(S, c.id, {}, [{ step: 'step-2', account }]),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repo.challenges.update(S, c.id, {}, [{ step: 'step-1', account }]),
    ).rejects.toBeInstanceOf(RangeError);
    expect(await repo.accounts.list(S)).toEqual(before);
    expect(await repo.challenges.list(S)).toEqual([c]);
  });
});

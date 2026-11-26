import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { defaultMetricContext } from '../metrics/context';
import type {
  Account,
  BreachReason,
  Cents,
  Challenge,
  PropTxn,
  PropTxnCategory,
  PropTxnStatus,
  Trade,
} from '../types';
import {
  accountSize,
  accountsGroup,
  breachInsights,
  breakdown,
  challengeType,
  filterChallenges,
  firstStart,
  firstTradeDays,
  filterItems,
  passRates,
  roiSeries,
  spendItems,
  startedOn,
  totals,
} from './finance';

const ctx = defaultMetricContext('America/New_York');

const A = 'Sample firm A';
const B = 'Sample firm B';
const C = 'Sample firm C';

// The Plan 6C comps' sample (04-prop-dashboard and 07-prop-transactions).

const account = (
  id: string,
  size: Cents,
  extra: Partial<Account> = {},
): Account => ({
  id,
  workspaceId: 'w',
  name: id,
  broker: 'Sample',
  type: 'prop-evaluation',
  currency: 'USD',
  startingBalance: size,
  status: 'active',
  ...extra,
});
const ACCOUNTS: Account[] = [
  account('f100', 10_000_000),
  account('x100', 10_000_000),
  account('f50e', 5_000_000),
  account('f50f', 5_000_000, { type: 'prop-funded' }),
  account('f50s', 5_000_000),
  account('x50', 5_000_000),
];

const challenge = (id: string, over: Partial<Challenge>): Challenge => ({
  id,
  workspaceId: 'w',
  name: id,
  firm: A,
  steps: 1,
  phases: [],
  phase: 'evaluation',
  status: 'active',
  ...over,
});
/** Futures 100K: 2-step, step 1 active, started 1 Oct. */
const F100 = challenge('c-f100', {
  firm: A,
  steps: 2,
  phases: [
    { step: 'step-1', accountId: 'f100', startDate: '2026-10-01' },
    { step: 'step-2' },
    { step: 'funded' },
  ],
  evaluationFee: 32_500,
});
/** Forex 100K: 2-step, step 1 active, started 3 Nov. */
const X100 = challenge('c-x100', {
  firm: B,
  steps: 2,
  phases: [
    { step: 'step-1', accountId: 'x100', startDate: '2026-11-03' },
    { step: 'step-2' },
    { step: 'funded' },
  ],
  evaluationFee: 54_000,
});
/** Futures 50K: 1-step, passed and funded; no transaction holds its fees. */
const F50 = challenge('c-f50', {
  firm: A,
  phases: [
    { step: 'step-1', accountId: 'f50e', startDate: '2026-09-14' },
    { step: 'funded', accountId: 'f50f', startDate: '2026-09-30' },
  ],
  phase: 'funded',
  evaluationFee: 16_500,
  activationFee: 8_500,
  strategyIds: ['s-orb'],
});
/** Futures 50K, September: breached on 17 Sep, 15 days in. */
const F50S = challenge('c-f50s', {
  firm: A,
  phases: [
    { step: 'step-1', accountId: 'f50s', startDate: '2026-09-02' },
    { step: 'funded' },
  ],
  status: 'breached',
  evaluationFee: 16_500,
  strategyIds: ['s-orb', 's-fade'],
  breachReason: 'overtrading',
  breachedOn: '2026-09-17',
});
/** Forex 50K: breached on 16 Oct, 11 days in. */
const X50 = challenge('c-x50', {
  firm: B,
  phases: [
    { step: 'step-1', accountId: 'x50', startDate: '2026-10-05' },
    { step: 'funded' },
  ],
  status: 'breached',
  evaluationFee: 34_500,
  breachReason: 'max-drawdown',
  breachedOn: '2026-10-16',
});
const CHALLENGES = [F100, X100, F50, F50S, X50];

const txn = (
  id: string,
  date: string,
  description: string,
  firm: string,
  challengeId: string | undefined,
  category: PropTxnCategory,
  amount: Cents,
  status: PropTxnStatus,
): PropTxn => ({
  id,
  workspaceId: 'w',
  date,
  description,
  firm,
  ...(challengeId !== undefined && { challengeId }),
  category,
  amount,
  status,
});
const T1 = txn(
  't1',
  '2026-11-18',
  'Card refund, duplicate charge',
  A,
  'c-f100',
  'uncategorized',
  16_500,
  'ignored',
);
const T2 = txn(
  't2',
  '2026-11-16',
  'Payout',
  A,
  'c-f50',
  'payout',
  270_000,
  'not-reviewed',
);
const T3 = txn(
  't3',
  '2026-11-10',
  'Market data fee',
  C,
  undefined,
  'uncategorized',
  -2_900,
  'not-reviewed',
);
const T4 = txn(
  't4',
  '2026-11-03',
  'Evaluation, Forex 100K',
  B,
  'c-x100',
  'evaluation-fee',
  -54_000,
  'reviewed',
);
const T5 = txn(
  't5',
  '2026-11-02',
  'Payout',
  A,
  'c-f50',
  'payout',
  180_000,
  'reviewed',
);
const T6 = txn(
  't6',
  '2026-10-28',
  'Reset',
  A,
  'c-f100',
  'reset-fee',
  -9_900,
  'reviewed',
);
const T7 = txn(
  't7',
  '2026-10-07',
  'Reset',
  A,
  'c-f100',
  'reset-fee',
  -9_900,
  'not-reviewed',
);
const T8 = txn(
  't8',
  '2026-10-05',
  'Evaluation, Forex 50K',
  B,
  'c-x50',
  'evaluation-fee',
  -34_500,
  'reviewed',
);
const T9 = txn(
  't9',
  '2026-10-01',
  'Evaluation, Futures 100K',
  A,
  'c-f100',
  'evaluation-fee',
  -32_500,
  'reviewed',
);
const TXNS = [T1, T2, T3, T4, T5, T6, T7, T8, T9];

const trade = (accountId: string, net: Cents, day: string): Trade =>
  makeTrade({
    accountId,
    net,
    openedAt: `${day}T14:00:00Z`,
    closedAt: `${day}T15:00:00Z`,
  });
/** The two breached phases lose 2,512.40 and 1,980.10; trades outside their window must not count. */
const TRADES: Trade[] = [
  trade('f50s', 99_999, '2026-09-01'), // before the phase starts
  trade('f50s', 120_000, '2026-09-03'),
  trade('f50s', -200_000, '2026-09-08'),
  trade('f50s', -171_240, '2026-09-16'),
  trade('f50s', 50_000, '2026-09-18'), // after the breach
  trade('x50', 77_000, '2026-10-02'), // before the phase starts
  trade('x50', 85_000, '2026-10-06'),
  trade('x50', -283_010, '2026-10-12'),
  trade('x50', -10_000, '2026-10-20'), // after the breach
  trade('f100', -1_000_000, '2026-10-10'), // another account
];

const ITEMS = spendItems(CHALLENGES, TXNS);
const rowOf = <R extends { key: string }>(rows: R[], key: string): R => {
  const r = rows.find((x) => x.key === key);
  if (!r) throw new Error(`no row ${key}`);
  return r;
};

describe('challengeType', () => {
  test('1-step and 2-step come from steps', () => {
    expect(challengeType(F100)).toBe('2-step');
    expect(challengeType(X50)).toBe('1-step');
    expect(challengeType(F50)).toBe('1-step');
  });

  test('a challenge created in the funded phase is straight to funded', () => {
    const s2f = challenge('s2f', {
      phase: 'funded',
      phases: [{ step: 'funded', accountId: 'f50f', startDate: '2026-11-01' }],
    });
    expect(challengeType(s2f)).toBe('s2f');
    expect(challengeType({ ...s2f, steps: 2 })).toBe('s2f');
  });

  test('a funded challenge whose evaluation was linked or dated keeps its steps', () => {
    const linked = challenge('l', {
      steps: 2,
      phase: 'funded',
      phases: [
        { step: 'step-1', accountId: 'f50e' },
        { step: 'step-2' },
        { step: 'funded', accountId: 'f50f' },
      ],
    });
    const dated = challenge('d', {
      phase: 'funded',
      phases: [{ step: 'step-1', startDate: '2026-09-01' }, { step: 'funded' }],
    });
    expect(challengeType(linked)).toBe('2-step');
    expect(challengeType(dated)).toBe('1-step');
  });

  test('an evaluation with nothing linked yet is not straight to funded', () => {
    const fresh = challenge('n', {
      steps: 2,
      phases: [{ step: 'step-1' }, { step: 'step-2' }, { step: 'funded' }],
    });
    expect(challengeType(fresh)).toBe('2-step');
  });

  test('an unlinked, undated evaluation moved to funded keeps its steps and its passed evaluation (C-01)', () => {
    const phases: Challenge['phases'] = [
      { step: 'step-1' },
      { step: 'funded' },
    ];
    const moved = challenge('m', {
      phase: 'funded',
      phases,
      movedToFundedOn: '2026-11-20',
    });
    expect(challengeType(moved)).toBe('1-step');
    expect(challengeType({ ...moved, steps: 2 })).toBe('2-step');
    // The same phases without the move are a challenge created in the funded phase.
    expect(challengeType(challenge('c', { phase: 'funded', phases }))).toBe(
      's2f',
    );
    // The pass rate counts the moved one, 1 of 1, and the type filter files it under 1-step.
    expect(passRates([moved], [], 'firm').overall).toEqual({
      passed: 1,
      attempted: 1,
    });
    expect(passRates([moved], [], 'type').rows).toEqual([
      expect.objectContaining({ key: '1-step', passed: 1, attempted: 1 }),
    ]);
    // Still moved after its funded account breached: the evaluation passed.
    expect(
      passRates(
        [{ ...moved, status: 'breached', breachedOn: '2026-11-25' }],
        [],
        'firm',
      ).overall,
    ).toEqual({ passed: 1, attempted: 1 });
  });
});

describe('accountsGroup (C62)', () => {
  test('the comps sample splits 2, 1, 2', () => {
    const groups = CHALLENGES.map((c) => accountsGroup(c));
    expect(groups.filter((g) => g === 'evaluations')).toHaveLength(2);
    expect(groups.filter((g) => g === 'funded')).toHaveLength(1);
    expect(groups.filter((g) => g === 'breached')).toHaveLength(2);
    expect(accountsGroup(F100)).toBe('evaluations');
    expect(accountsGroup(F50)).toBe('funded');
    expect(accountsGroup(X50)).toBe('breached');
  });

  test('an active evaluation is in Evaluations; passed waits in Funded; funded is Funded', () => {
    expect(accountsGroup(challenge('a', { status: 'active' }))).toBe(
      'evaluations',
    );
    expect(accountsGroup(challenge('p', { status: 'passed' }))).toBe('funded');
    expect(
      accountsGroup(challenge('f', { phase: 'funded', status: 'active' })),
    ).toBe('funded');
  });

  test('a breach is Breached whatever the phase, and never leaves it', () => {
    expect(
      accountsGroup(challenge('b1', { phase: 'funded', status: 'breached' })),
    ).toBe('breached');
    expect(accountsGroup(challenge('b2', { status: 'breached' }))).toBe(
      'breached',
    );
  });
});

describe('firstStart', () => {
  test('is the earliest start date any phase has', () => {
    expect(firstStart(F50)).toBe('2026-09-14');
    expect(
      firstStart(
        challenge('x', {
          phases: [
            { step: 'step-1' },
            { step: 'funded', startDate: '2026-10-02' },
          ],
        }),
      ),
    ).toBe('2026-10-02');
  });

  test('is undefined when no phase has one', () => {
    expect(firstStart(challenge('n', { phases: [{ step: 'step-1' }] }))).toBe(
      undefined,
    );
  });
});

describe('startedOn', () => {
  const trade = (accountId: string, openedAt: string): Trade =>
    makeTrade({ accountId, net: 1_000, openedAt, closedAt: openedAt });

  test('the earliest day each account first traded, in the profile zone', () => {
    const days = firstTradeDays(
      [
        trade('f50e', '2026-09-16T14:00:00Z'),
        trade('f50e', '2026-09-15T14:00:00Z'),
        // 02:00 UTC on the 12th is still the 11th in New York.
        trade('f50f', '2026-09-12T02:00:00Z'),
      ],
      'America/New_York',
    );
    expect([...days]).toEqual([
      ['f50e', '2026-09-15'],
      ['f50f', '2026-09-11'],
    ]);
  });

  test('a start date wins; with none it is the day its first account traded', () => {
    const days = new Map([
      ['f100', '2026-10-09'],
      ['f50f', '2026-09-30'],
    ]);
    expect(startedOn(F50, days)).toBe('2026-09-14');
    const undated = challenge('u', {
      phases: [
        { step: 'step-1', accountId: 'f100' },
        { step: 'funded', accountId: 'f50f' },
      ],
    });
    expect(startedOn(undated, days)).toBe('2026-09-30');
  });

  test('is null with no start date and no trade', () => {
    expect(
      startedOn(challenge('n', { phases: [{ step: 'step-1' }] }), new Map()),
    ).toBeNull();
  });
});

describe('accountSize', () => {
  test("is the first phase account's starting balance", () => {
    expect(accountSize(F100, ACCOUNTS)).toBe(10_000_000);
    expect(accountSize(F50, ACCOUNTS)).toBe(5_000_000);
  });

  test('skips a phase with no account, and is null when none is linked', () => {
    const second = challenge('s', {
      phases: [{ step: 'step-1' }, { step: 'step-2', accountId: 'x50' }],
    });
    expect(accountSize(second, ACCOUNTS)).toBe(5_000_000);
    expect(
      accountSize(
        challenge('none', { phases: [{ step: 'step-1' }] }),
        ACCOUNTS,
      ),
    ).toBeNull();
    const gone = challenge('gone', {
      phases: [{ step: 'step-1', accountId: 'deleted' }],
    });
    expect(accountSize(gone, ACCOUNTS)).toBeNull();
  });
});

describe('spendItems', () => {
  test('keeps the transactions that count, and adds the fees nothing else holds', () => {
    expect(ITEMS.map((i) => i.id).sort()).toEqual(
      [
        't2',
        't3',
        't4',
        't5',
        't6',
        't7',
        't8',
        't9',
        'fee-c-f50-evaluation-fee',
        'fee-c-f50-activation-fee',
        'fee-c-f50s-evaluation-fee',
      ].sort(),
    );
  });

  test('an ignored row never counts', () => {
    expect(ITEMS.some((i) => i.id === 't1')).toBe(false);
    expect(totals(spendItems(CHALLENGES, TXNS)).earned).toBe(450_000);
    // Even handed to totals directly, an ignored row stays out.
    expect(totals([...ITEMS, T1]).earned).toBe(450_000);
  });

  test('a fee field counts once', () => {
    const c = challenge('c1', {
      evaluationFee: 16_500,
      phases: [{ step: 'step-1', startDate: '2026-09-02' }],
    });
    const alone = spendItems([c], []);
    expect(totals(alone).spent).toBe(16_500);
    expect(alone[0]).toMatchObject({
      date: '2026-09-02',
      firm: A,
      challengeId: 'c1',
      category: 'evaluation-fee',
      amount: -16_500,
    });
    const linked = txn(
      'x',
      '2026-09-02',
      'Fee',
      A,
      'c1',
      'evaluation-fee',
      -16_500,
      'reviewed',
    );
    expect(totals(spendItems([c], [linked])).spent).toBe(16_500);
    expect(spendItems([c], [linked])).toEqual([linked]);
  });

  test('a linked transaction replaces only the field of its own category', () => {
    const c = challenge('c1', { evaluationFee: 16_500, activationFee: 8_500 });
    const linked = txn(
      'x',
      '2026-09-02',
      'Fee',
      A,
      'c1',
      'evaluation-fee',
      -16_500,
      'reviewed',
    );
    const items = spendItems([c], [linked]);
    expect(items.map((i) => i.category).sort()).toEqual([
      'activation-fee',
      'evaluation-fee',
    ]);
    expect(totals(items).spent).toBe(25_000);
  });

  test("another challenge's transaction, an unlinked one, an ignored one and a refund do not replace the field", () => {
    const c = challenge('c1', { evaluationFee: 16_500 });
    const others = [
      txn(
        'a',
        '2026-09-02',
        'Other',
        A,
        'c2',
        'evaluation-fee',
        -16_500,
        'reviewed',
      ),
      txn(
        'b',
        '2026-09-02',
        'Unlinked',
        A,
        undefined,
        'evaluation-fee',
        -16_500,
        'reviewed',
      ),
      txn(
        'c',
        '2026-09-02',
        'Ignored',
        A,
        'c1',
        'evaluation-fee',
        -16_500,
        'ignored',
      ),
      txn(
        'd',
        '2026-09-02',
        'Refund',
        A,
        'c1',
        'evaluation-fee',
        16_500,
        'reviewed',
      ),
    ];
    const t = totals(spendItems([c], others));
    // The field's 165.00 plus the two other-challenge and unlinked costs.
    expect(t.spent).toBe(16_500 * 3);
    expect(t.earned).toBe(16_500);
  });

  test('the fee dates on the first start, and has no date when the challenge has none', () => {
    const c = challenge('c1', {
      evaluationFee: 100,
      phases: [
        { step: 'step-1' },
        { step: 'step-2', startDate: '2026-10-20' },
        { step: 'funded', startDate: '2026-10-02' },
      ],
    });
    expect(spendItems([c], [])[0]!.date).toBe('2026-10-02');
    expect(
      spendItems([{ ...c, phases: [{ step: 'step-1' }] }], [])[0]!.date,
    ).toBe('');
  });

  test('no fee, a zero fee and an unset fee add nothing', () => {
    const none = challenge('c1', {});
    const zero = challenge('c2', { evaluationFee: 0, activationFee: 0 });
    expect(spendItems([none, zero], [])).toEqual([]);
  });
});

describe('totals', () => {
  test("the comps' sample: spent, earned, net, ROI and payouts", () => {
    const t = totals(ITEMS);
    expect(t.spent).toBe(185_200);
    expect(t.earned).toBe(450_000);
    expect(t.net).toBe(264_800);
    expect(t.roi).toBeCloseTo(1.43, 3);
    expect(t.payouts).toBe(2);
  });

  test('a positive fee row is earned', () => {
    const refund = txn(
      'r',
      '2026-11-01',
      'Refund',
      A,
      'c1',
      'evaluation-fee',
      16_500,
      'reviewed',
    );
    const t = totals([refund]);
    expect(t.earned).toBe(16_500);
    expect(t.spent).toBe(0);
  });

  test('an uncategorized cost is spent', () => {
    const cost = txn(
      'u',
      '2026-11-01',
      'Data',
      C,
      undefined,
      'uncategorized',
      -2_900,
      'not-reviewed',
    );
    const t = totals([cost]);
    expect(t.spent).toBe(2_900);
    expect(t.earned).toBe(0);
    expect(t.net).toBe(-2_900);
  });

  test('affiliate income is earned, a negative payout is spent and not a payout', () => {
    const income = txn(
      'i',
      '2026-11-01',
      'Referral',
      A,
      undefined,
      'affiliate-income',
      5_000,
      'reviewed',
    );
    const back = txn(
      'b',
      '2026-11-01',
      'Clawback',
      A,
      undefined,
      'payout',
      -1_000,
      'reviewed',
    );
    const t = totals([income, back]);
    expect(t.earned).toBe(5_000);
    expect(t.spent).toBe(1_000);
    expect(t.payouts).toBe(0);
  });

  test('ROI is None with no spend, and the money is zero with no rows', () => {
    expect(totals([])).toEqual({
      spent: 0,
      earned: 0,
      net: 0,
      roi: null,
      payouts: 0,
    });
    const only = txn(
      'p',
      '2026-11-01',
      'Payout',
      A,
      undefined,
      'payout',
      100_000,
      'reviewed',
    );
    expect(totals([only]).roi).toBeNull();
  });

  test('a loss gives a negative ROI', () => {
    const cost = txn(
      'u',
      '2026-11-01',
      'Fee',
      A,
      undefined,
      'reset-fee',
      -10_000,
      'reviewed',
    );
    const win = txn(
      'p',
      '2026-11-02',
      'Payout',
      A,
      undefined,
      'payout',
      2_500,
      'reviewed',
    );
    expect(totals([cost, win]).roi).toBeCloseTo(-0.75, 6);
  });
});

describe('roiSeries', () => {
  test('1y ending 25 Nov: a point a day, the last one the totals', () => {
    const s = roiSeries(ITEMS, '1y', '2026-11-25');
    expect(s).toHaveLength(365);
    expect(s[0]!.date).toBe('2025-11-26');
    const last = s[s.length - 1]!;
    expect(last.date).toBe('2026-11-25');
    expect(last.income).toBe(450_000);
    expect(last.costs).toBe(185_200);
    expect(last.net).toBe(264_800);
  });

  test('points are cumulative, and the net is income less costs at every point', () => {
    const s = roiSeries(ITEMS, '1y', '2026-11-25');
    for (let i = 0; i < s.length; i++) {
      const p = s[i]!;
      expect(p.net).toBe(p.income - p.costs);
      if (i > 0) {
        expect(p.income).toBeGreaterThanOrEqual(s[i - 1]!.income);
        expect(p.costs).toBeGreaterThanOrEqual(s[i - 1]!.costs);
      }
    }
    const at = (d: string) => s.find((p) => p.date === d)!;
    expect(at('2026-09-01').costs).toBe(0);
    expect(at('2026-09-02').costs).toBe(16_500); // Futures 50K, September's fee, on its start
    expect(at('2026-09-13').costs).toBe(16_500);
    expect(at('2026-09-14').costs).toBe(41_500); // Futures 50K's two fees
    expect(at('2026-11-01').income).toBe(0);
    expect(at('2026-11-02').income).toBe(180_000);
    expect(at('2026-11-15').income).toBe(180_000);
    expect(at('2026-11-16').income).toBe(450_000);
  });

  test('1w counts what happened in the week only', () => {
    const s = roiSeries(ITEMS, '1w', '2026-11-18');
    expect(s.map((p) => p.date)).toEqual([
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ]);
    expect(s[3]!.income).toBe(0);
    expect(s[4]!.income).toBe(270_000);
    expect(s[6]!).toEqual({
      date: '2026-11-18',
      income: 270_000,
      costs: 0,
      net: 270_000,
    });
  });

  test('1m is thirty days', () => {
    const s = roiSeries(ITEMS, '1m', '2026-11-25');
    expect(s).toHaveLength(30);
    expect(s[0]!.date).toBe('2026-10-27');
    const last = s[29]!;
    expect(last.income).toBe(450_000);
    // 28 Oct reset, 3 Nov Forex 100K, 10 Nov data fee.
    expect(last.costs).toBe(9_900 + 54_000 + 2_900);
  });

  test('rows after the end, before the window, undated or ignored stay out', () => {
    const rows: PropTxn[] = [
      txn(
        'late',
        '2026-11-26',
        'After',
        A,
        undefined,
        'payout',
        1_000,
        'reviewed',
      ),
      txn(
        'early',
        '2026-11-11',
        'Before',
        A,
        undefined,
        'payout',
        2_000,
        'reviewed',
      ),
      txn('undated', '', 'No date', A, undefined, 'payout', 4_000, 'reviewed'),
      txn(
        'ignored',
        '2026-11-20',
        'Ignored',
        A,
        undefined,
        'payout',
        8_000,
        'ignored',
      ),
      txn('in', '2026-11-20', 'In', A, undefined, 'payout', 16_000, 'reviewed'),
    ];
    const last = roiSeries(rows, '1w', '2026-11-25').at(-1)!;
    expect(last.income).toBe(16_000);
  });

  test('no rows gives a flat line of zeros', () => {
    const s = roiSeries([], '1w', '2026-11-25');
    expect(s).toHaveLength(7);
    expect(s.every((p) => p.income === 0 && p.costs === 0 && p.net === 0)).toBe(
      true,
    );
  });
});

describe('breakdown', () => {
  test('by firm: net, spent, earned and challenges', () => {
    const rows = breakdown(ITEMS, CHALLENGES, ACCOUNTS, 'firm');
    expect(rows.map((r) => r.key)).toEqual([A, B, C]);
    expect(rowOf(rows, A)).toEqual({
      key: A,
      label: A,
      spent: 93_800,
      earned: 450_000,
      net: 356_200,
      count: 3,
    });
    expect(rowOf(rows, B)).toMatchObject({
      spent: 88_500,
      earned: 0,
      net: -88_500,
      count: 2,
    });
    expect(rowOf(rows, C)).toMatchObject({
      spent: 2_900,
      earned: 0,
      net: -2_900,
      count: 0,
    });
  });

  test('by fee: the negative amounts by category, in the category order', () => {
    const rows = breakdown(ITEMS, CHALLENGES, ACCOUNTS, 'fee');
    expect(rows.map((r) => [r.key, r.spent])).toEqual([
      ['evaluation-fee', 154_000],
      ['activation-fee', 8_500],
      ['reset-fee', 19_800],
      ['uncategorized', 2_900],
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      'Evaluation fee',
      'Activation fee',
      'Reset fee',
      'Uncategorized',
    ]);
    // Payouts and the ignored refund are not costs; a fee row is all spent.
    expect(rows.every((r) => r.earned === 0 && r.net === -r.spent)).toBe(true);
    expect(rows.map((r) => r.count)).toEqual([5, 1, 2, 1]);
  });

  test('by fee: a positive fee row is not in it, and a negative payout is', () => {
    const rows = breakdown(
      [
        txn(
          'r',
          '2026-11-01',
          'Refund',
          A,
          undefined,
          'evaluation-fee',
          16_500,
          'reviewed',
        ),
        txn(
          'b',
          '2026-11-01',
          'Clawback',
          A,
          undefined,
          'payout',
          -1_000,
          'reviewed',
        ),
      ],
      [],
      [],
      'fee',
    );
    expect(rows.map((r) => [r.key, r.spent])).toEqual([['payout', 1_000]]);
  });

  test('by type: 1-step, 2-step and the rows with no challenge', () => {
    const rows = breakdown(ITEMS, CHALLENGES, ACCOUNTS, 'type');
    expect(rows.map((r) => [r.key, r.label])).toEqual([
      ['1-step', '1-step'],
      ['2-step', '2-step'],
      ['none', 'None'],
    ]);
    expect(rowOf(rows, '1-step')).toMatchObject({
      spent: 76_000,
      earned: 450_000,
      net: 374_000,
      count: 3,
    });
    expect(rowOf(rows, '2-step')).toMatchObject({
      spent: 106_300,
      earned: 0,
      net: -106_300,
      count: 2,
    });
    expect(rowOf(rows, 'none')).toMatchObject({
      spent: 2_900,
      net: -2_900,
      count: 0,
    });
  });

  test('the challenges in view count; every challenge still groups its rows', () => {
    const inView = CHALLENGES.filter((c) => c.status === 'breached');
    const all = breakdown(ITEMS, CHALLENGES, ACCOUNTS, 'type');
    const some = breakdown(ITEMS, CHALLENGES, ACCOUNTS, 'type', inView);
    // The money is the same: a row linked to a challenge outside the view is still its group's.
    expect(some.map((r) => [r.key, r.spent, r.earned])).toEqual(
      all.map((r) => [r.key, r.spent, r.earned]),
    );
    expect(
      some.map((r) => [r.key, r.count]),
      'counts',
    ).toEqual([
      ['1-step', inView.filter((c) => c.steps === 1).length],
      ['2-step', inView.filter((c) => c.steps === 2).length],
      ['none', 0],
    ]);
  });

  test('a straight to funded row is labelled in words', () => {
    const s2f = challenge('s2f', {
      phase: 'funded',
      phases: [{ step: 'funded', accountId: 'f50f' }],
    });
    const pay = txn(
      'p',
      '2026-11-01',
      'Payout',
      A,
      's2f',
      'payout',
      100_000,
      'reviewed',
    );
    const rows = breakdown([pay], [s2f], ACCOUNTS, 'type');
    expect(rows).toEqual([
      {
        key: 's2f',
        label: 'Straight to funded',
        spent: 0,
        earned: 100_000,
        net: 100_000,
        count: 1,
      },
    ]);
  });

  test('by size: smallest first, an unlinked account or challenge last', () => {
    const rows = breakdown(ITEMS, CHALLENGES, ACCOUNTS, 'size');
    expect(rows.map((r) => r.key)).toEqual(['5000000', '10000000', 'none']);
    expect(rows.map((r) => r.label)).toEqual(['50,000', '100,000', 'None']);
    expect(rowOf(rows, '5000000')).toMatchObject({
      spent: 76_000,
      earned: 450_000,
      count: 3,
    });
    expect(rowOf(rows, '10000000')).toMatchObject({
      spent: 106_300,
      earned: 0,
      count: 2,
    });
    const unlinked = challenge('u', { phases: [{ step: 'step-1' }] });
    const fee = txn(
      'f',
      '2026-11-01',
      'Fee',
      A,
      'u',
      'reset-fee',
      -100,
      'reviewed',
    );
    expect(breakdown([fee], [unlinked], ACCOUNTS, 'size')).toEqual([
      {
        key: 'none',
        label: 'None',
        spent: 100,
        earned: 0,
        net: -100,
        count: 1,
      },
    ]);
  });

  test('a transaction linked to a challenge outside the list reads as none', () => {
    const rows = breakdown([T9], [], ACCOUNTS, 'type');
    expect(rows.map((r) => r.key)).toEqual(['none']);
  });

  test('every view but fee adds up to the totals', () => {
    const t = totals(ITEMS);
    for (const by of ['firm', 'type', 'size'] as const) {
      const rows = breakdown(ITEMS, CHALLENGES, ACCOUNTS, by);
      expect(rows.reduce((n, r) => n + r.net, 0)).toBe(t.net);
      expect(rows.reduce((n, r) => n + r.spent, 0)).toBe(t.spent);
      expect(rows.reduce((n, r) => n + r.earned, 0)).toBe(t.earned);
    }
    const fee = breakdown(ITEMS, CHALLENGES, ACCOUNTS, 'fee');
    expect(fee.reduce((n, r) => n + r.spent, 0)).toBe(t.spent);
  });

  test('an ignored row is not counted here either, and no row means no breakdown', () => {
    const rows = breakdown(TXNS, CHALLENGES, ACCOUNTS, 'firm');
    expect(rowOf(rows, A).earned).toBe(450_000);
    expect(breakdown([], CHALLENGES, ACCOUNTS, 'firm')).toEqual([]);
  });
});

describe('passRates', () => {
  /** An evaluation step with an account linked: not straight to funded. */
  const EVALUATED: Challenge['phases'] = [
    { step: 'step-1', accountId: 'f50e', startDate: '2026-09-14' },
    { step: 'funded', accountId: 'f50f' },
  ];

  test('by firm: passed over attempted, an active challenge not counted', () => {
    const r = passRates(CHALLENGES, ACCOUNTS, 'firm');
    expect(r.overall).toEqual({ passed: 1, attempted: 3 });
    expect(r.rows).toEqual([
      { key: A, label: A, passed: 1, attempted: 2 },
      { key: B, label: B, passed: 0, attempted: 1 },
    ]);
  });

  test('a group with only active challenges has no row', () => {
    const extra = challenge('d', { firm: 'Sample firm D' });
    const r = passRates([...CHALLENGES, extra], ACCOUNTS, 'firm');
    expect(r.rows.map((x) => x.key)).toEqual([A, B]);
    expect(r.overall).toEqual({ passed: 1, attempted: 3 });
  });

  test('by type', () => {
    const r = passRates(CHALLENGES, ACCOUNTS, 'type');
    expect(r.rows).toEqual([
      { key: '1-step', label: '1-step', passed: 1, attempted: 3 },
    ]);
  });

  test('by size: smallest first', () => {
    const big = challenge('big', {
      status: 'passed',
      phases: [{ step: 'step-1', accountId: 'f100' }],
    });
    const r = passRates([...CHALLENGES, big], ACCOUNTS, 'size');
    expect(r.rows).toEqual([
      { key: '5000000', label: '50,000', passed: 1, attempted: 3 },
      { key: '10000000', label: '100,000', passed: 1, attempted: 1 },
    ]);
    expect(r.overall).toEqual({ passed: 2, attempted: 4 });
  });

  test('by strategy: a challenge counts under each of its strategies, once overall', () => {
    const r = passRates(CHALLENGES, ACCOUNTS, 'strategy');
    expect(r.overall).toEqual({ passed: 1, attempted: 3 });
    expect(r.rows).toEqual([
      { key: 's-orb', label: 's-orb', passed: 1, attempted: 2 },
      { key: 's-fade', label: 's-fade', passed: 0, attempted: 1 },
      { key: 'none', label: 'None', passed: 0, attempted: 1 },
    ]);
  });

  test("passed means status 'passed', or moved to funded (breached there or not)", () => {
    const rate = (c: Challenge) => passRates([c], [], 'firm').overall;
    expect(rate(challenge('a', { status: 'passed' }))).toEqual({
      passed: 1,
      attempted: 1,
    });
    expect(
      rate(challenge('b', { phase: 'funded', phases: EVALUATED })),
    ).toEqual({ passed: 1, attempted: 1 });
    // Breached in an evaluation phase: attempted, not passed.
    expect(rate(challenge('c', { status: 'breached' }))).toEqual({
      passed: 0,
      attempted: 1,
    });
    expect(rate(challenge('d', {}))).toEqual({ passed: 0, attempted: 0 });
  });

  test('a challenge breached in its funded phase moved to funded: it counts as passed (C32)', () => {
    const rate = (cs: Challenge[]) => passRates(cs, [], 'firm').overall;
    expect(
      rate([
        challenge('e', {
          phase: 'funded',
          status: 'breached',
          phases: EVALUATED,
        }),
      ]),
    ).toEqual({ passed: 1, attempted: 1 });
    // Three evaluations passed, then the funded accounts breached: 3 of 3.
    expect(
      rate(
        ['p1', 'p2', 'p3'].map((id) =>
          challenge(id, {
            phase: 'funded',
            status: 'breached',
            phases: EVALUATED,
            breachedOn: '2026-10-20',
          }),
        ),
      ),
    ).toEqual({ passed: 3, attempted: 3 });
    // An evaluation breach beside them still fails.
    expect(
      rate([
        challenge('p', {
          phase: 'funded',
          status: 'breached',
          phases: EVALUATED,
        }),
        challenge('q', { status: 'breached', phases: EVALUATED }),
      ]),
    ).toEqual({ passed: 1, attempted: 2 });
  });

  test('a straight-to-funded challenge is in neither passed nor attempted, in every view (Ruling 12)', () => {
    const base = passRates(CHALLENGES, ACCOUNTS, 'firm').overall;
    const s2f = (id: string, over: Partial<Challenge>) =>
      challenge(id, {
        phase: 'funded',
        phases: [
          { step: 'funded', accountId: 'f50f', startDate: '2026-11-01' },
        ],
        strategyIds: ['s-orb'],
        ...over,
      });
    const extras = [
      s2f('s-active', {}),
      s2f('s-passed', { status: 'passed' }),
      s2f('s-breached', { status: 'breached', breachedOn: '2026-11-10' }),
    ];
    for (const e of extras) expect(challengeType(e)).toBe('s2f');
    for (const by of ['firm', 'type', 'size', 'strategy'] as const) {
      expect(passRates(extras, ACCOUNTS, by)).toEqual({
        overall: { passed: 0, attempted: 0 },
        rows: [],
      });
      expect(passRates([...CHALLENGES, ...extras], ACCOUNTS, by)).toEqual(
        passRates(CHALLENGES, ACCOUNTS, by),
      );
    }
    expect(
      passRates([...CHALLENGES, ...extras], ACCOUNTS, 'firm').overall,
    ).toEqual(base);
  });

  test('no challenge gives zero over zero', () => {
    expect(passRates([], [], 'firm')).toEqual({
      overall: { passed: 0, attempted: 0 },
      rows: [],
    });
  });
});

describe('breachInsights', () => {
  test('evaluation: reasons, days, P&L, size and firm of the two breaches', () => {
    const r = breachInsights(CHALLENGES, ACCOUNTS, TRADES, ctx, 'evaluation');
    // Tied at one each: the most recent breach (16 Oct) comes first.
    expect(r.reasons).toEqual([
      { reason: 'max-drawdown', count: 1, share: 0.5 },
      { reason: 'overtrading', count: 1, share: 0.5 },
    ]);
    expect(r.avgDays).toBe(13); // 15 and 11
    expect(r.avgPnl).toBe(-224_625); // -2,512.40 and -1,980.10
    expect(r.commonSize).toBe(5_000_000);
    expect(r.commonFirm).toBe(B); // one each, B broke last
  });

  test('funded: no breach, so no reasons and no figures', () => {
    expect(breachInsights(CHALLENGES, ACCOUNTS, TRADES, ctx, 'funded')).toEqual(
      {
        reasons: [],
        avgDays: null,
        avgPnl: null,
        commonSize: null,
        commonFirm: null,
      },
    );
  });

  test('a funded breach belongs to funded, from the funded phase start', () => {
    const f = challenge('fb', {
      firm: C,
      phase: 'funded',
      status: 'breached',
      phases: [
        { step: 'step-1', accountId: 'f50e', startDate: '2026-09-01' },
        { step: 'funded', accountId: 'f50f', startDate: '2026-10-01' },
      ],
      breachReason: 'risk-management',
      breachedOn: '2026-10-11',
    });
    const funded = [
      trade('f50f', -30_000, '2026-10-04'),
      trade('f50f', 10_000, '2026-10-09'),
      trade('f50e', 500_000, '2026-09-20'),
    ];
    const r = breachInsights(
      [...CHALLENGES, f],
      ACCOUNTS,
      [...TRADES, ...funded],
      ctx,
      'funded',
    );
    expect(r.reasons).toEqual([
      { reason: 'risk-management', count: 1, share: 1 },
    ]);
    expect(r.avgDays).toBe(10);
    expect(r.avgPnl).toBe(-20_000);
    expect(r.commonSize).toBe(5_000_000);
    expect(r.commonFirm).toBe(C);
    // And it is not an evaluation breach.
    const ev = breachInsights(
      [...CHALLENGES, f],
      ACCOUNTS,
      TRADES,
      ctx,
      'evaluation',
    );
    expect(ev.reasons).toHaveLength(2);
  });

  test('a two-step breach reads the step that was live on the day', () => {
    const two = challenge('two', {
      steps: 2,
      firm: A,
      status: 'breached',
      phases: [
        { step: 'step-1', accountId: 'f100', startDate: '2026-10-01' },
        { step: 'step-2', accountId: 'x100', startDate: '2026-10-20' },
        { step: 'funded' },
      ],
      breachReason: 'time-pressure',
      breachedOn: '2026-10-25',
    });
    const t2 = [
      trade('x100', -40_000, '2026-10-22'),
      trade('x100', 5_000, '2026-10-30'),
    ];
    const r = breachInsights(
      [two],
      ACCOUNTS,
      [...TRADES, ...t2],
      ctx,
      'evaluation',
    );
    expect(r.avgDays).toBe(5);
    expect(r.avgPnl).toBe(-40_000);
    expect(r.commonSize).toBe(10_000_000); // the first phase account's
    // Breached while step 1 was live.
    const early = { ...two, breachedOn: '2026-10-10' };
    const e = breachInsights([early], ACCOUNTS, TRADES, ctx, 'evaluation');
    expect(e.avgDays).toBe(9);
    expect(e.avgPnl).toBe(-1_000_000);
  });

  test('a breach before 6C reads as other and has no figures it cannot know', () => {
    const old = challenge('old', {
      firm: C,
      status: 'breached',
      failureReason: 'Blew it',
    });
    const r = breachInsights([old], ACCOUNTS, TRADES, ctx, 'evaluation');
    expect(r.reasons).toEqual([{ reason: 'other', count: 1, share: 1 }]);
    expect(r.avgDays).toBeNull();
    expect(r.avgPnl).toBeNull();
    expect(r.commonSize).toBeNull();
    expect(r.commonFirm).toBe(C);
  });

  test('a breach with no date is left out of the averages, not of the counts', () => {
    const undated = { ...X50, id: 'u', breachedOn: undefined };
    const r = breachInsights(
      [F50S, undated],
      ACCOUNTS,
      TRADES,
      ctx,
      'evaluation',
    );
    expect(r.reasons).toHaveLength(2);
    expect(r.avgDays).toBe(15);
    expect(r.avgPnl).toBe(-251_240);
  });

  test('reasons rank by count, then by the most recent breach; shares add to one', () => {
    const mk = (id: string, reason: BreachReason | undefined, on: string) =>
      challenge(id, {
        status: 'breached',
        breachReason: reason,
        breachedOn: on,
      });
    const r = breachInsights(
      [
        mk('a', 'overtrading', '2026-01-10'),
        mk('b', 'time-pressure', '2026-03-01'),
        mk('c', 'overtrading', '2026-01-20'),
        mk('d', 'risk-management', '2026-05-01'),
        mk('e', undefined, '2026-02-01'),
        mk('f', 'time-pressure', '2026-03-02'),
      ],
      [],
      [],
      ctx,
      'evaluation',
    );
    // Two each for overtrading and time pressure (the latter broke last), then the singles by date.
    expect(r.reasons.map((x) => [x.reason, x.count])).toEqual([
      ['time-pressure', 2],
      ['overtrading', 2],
      ['risk-management', 1],
      ['other', 1],
    ]);
    expect(r.reasons.reduce((n, x) => n + x.share, 0)).toBeCloseTo(1, 9);
    expect(r.reasons[0]!.share).toBeCloseTo(2 / 6, 9);
  });

  test('the most common size and firm win by count, ties by the latest breach', () => {
    const big = (id: string, firm: string, on: string) =>
      challenge(id, {
        firm,
        status: 'breached',
        breachedOn: on,
        phases: [
          { step: 'step-1', accountId: 'f100', startDate: '2026-01-01' },
        ],
      });
    const small = (id: string, firm: string, on: string) =>
      challenge(id, {
        firm,
        status: 'breached',
        breachedOn: on,
        phases: [{ step: 'step-1', accountId: 'x50', startDate: '2026-01-01' }],
      });
    const r = breachInsights(
      [
        big('a', A, '2026-02-01'),
        big('b', A, '2026-02-02'),
        small('c', B, '2026-03-01'),
        small('d', B, '2026-03-02'),
        small('e', C, '2026-01-15'),
      ],
      ACCOUNTS,
      [],
      ctx,
      'evaluation',
    );
    expect(r.commonSize).toBe(5_000_000); // 3 against 2
    expect(r.commonFirm).toBe(B); // A and B tie at 2; B broke last
  });

  test('an active or passed challenge is not a breach', () => {
    const r = breachInsights([F100, F50], ACCOUNTS, TRADES, ctx, 'evaluation');
    expect(r.reasons).toEqual([]);
    expect(r.commonFirm).toBeNull();
  });

  test('a phase account in another currency counts nothing of its own trades', () => {
    const eur = account('eur', 5_000_000, { currency: 'EUR' });
    const c = challenge('e', {
      status: 'breached',
      breachedOn: '2026-10-10',
      phases: [{ step: 'step-1', accountId: 'eur', startDate: '2026-10-01' }],
    });
    const usd = makeTrade({
      accountId: 'eur',
      net: -50_000,
      openedAt: '2026-10-05T14:00:00Z',
      closedAt: '2026-10-05T15:00:00Z',
    });
    const r = breachInsights([c], [eur], [usd], ctx, 'evaluation');
    expect(r.avgPnl).toBe(0);
    expect(r.avgDays).toBe(9);
  });
});

describe('filterChallenges', () => {
  const ids = (cs: Challenge[]) => cs.map((c) => c.id);

  test('no filter keeps everything, in order', () => {
    expect(ids(filterChallenges(CHALLENGES, ACCOUNTS, {}))).toEqual(
      ids(CHALLENGES),
    );
    expect(
      ids(
        filterChallenges(CHALLENGES, ACCOUNTS, {
          firm: [],
          size: [],
          type: [],
          strategy: [],
        }),
      ),
    ).toEqual(ids(CHALLENGES));
  });

  test('firm, phase and status', () => {
    expect(ids(filterChallenges(CHALLENGES, ACCOUNTS, { firm: [B] }))).toEqual([
      'c-x100',
      'c-x50',
    ]);
    expect(
      ids(filterChallenges(CHALLENGES, ACCOUNTS, { firm: [A, B] })),
    ).toHaveLength(5);
    expect(
      ids(filterChallenges(CHALLENGES, ACCOUNTS, { phase: 'funded' })),
    ).toEqual(['c-f50']);
    expect(
      ids(filterChallenges(CHALLENGES, ACCOUNTS, { phase: 'evaluation' })),
    ).toEqual(['c-f100', 'c-x100', 'c-f50s', 'c-x50']);
    expect(
      ids(filterChallenges(CHALLENGES, ACCOUNTS, { status: 'breached' })),
    ).toEqual(['c-f50s', 'c-x50']);
  });

  test("status active is every challenge not breached, Keel's passed one too", () => {
    const passed = challenge('p', { status: 'passed' });
    expect(
      ids(
        filterChallenges([...CHALLENGES, passed], ACCOUNTS, {
          status: 'active',
        }),
      ),
    ).toEqual(['c-f100', 'c-x100', 'c-f50', 'p']);
  });

  test('size, type and strategy', () => {
    expect(
      ids(filterChallenges(CHALLENGES, ACCOUNTS, { size: [10_000_000] })),
    ).toEqual(['c-f100', 'c-x100']);
    expect(
      ids(filterChallenges(CHALLENGES, ACCOUNTS, { type: ['2-step'] })),
    ).toEqual(['c-f100', 'c-x100']);
    expect(
      ids(filterChallenges(CHALLENGES, ACCOUNTS, { type: ['s2f'] })),
    ).toEqual([]);
    expect(
      ids(filterChallenges(CHALLENGES, ACCOUNTS, { strategy: ['s-fade'] })),
    ).toEqual(['c-f50s']);
    expect(
      ids(filterChallenges(CHALLENGES, ACCOUNTS, { strategy: ['s-orb'] })),
    ).toEqual(['c-f50', 'c-f50s']);
    const unlinked = challenge('u', {});
    expect(
      ids(filterChallenges([unlinked], ACCOUNTS, { size: [5_000_000] })),
    ).toEqual([]);
  });

  test('filters combine: all of them must hold', () => {
    expect(
      ids(
        filterChallenges(CHALLENGES, ACCOUNTS, { firm: [A], status: 'active' }),
      ),
    ).toEqual(['c-f100', 'c-f50']);
    expect(
      ids(
        filterChallenges(CHALLENGES, ACCOUNTS, {
          firm: [B],
          size: [10_000_000],
          phase: 'evaluation',
        }),
      ),
    ).toEqual(['c-x100']);
  });

  test('the range tests a challenge by its first start, bounds included', () => {
    const range = (from?: string, to?: string) =>
      ids(filterChallenges(CHALLENGES, ACCOUNTS, { range: { from, to } }));
    expect(range('2026-10-01', '2026-10-31')).toEqual(['c-f100', 'c-x50']);
    expect(range('2026-11-01')).toEqual(['c-x100']);
    expect(range(undefined, '2026-09-14')).toEqual(['c-f50', 'c-f50s']);
    expect(range()).toHaveLength(5);
  });

  test('a challenge with no start date is outside any range, and inside none', () => {
    const undated = challenge('u', { phases: [{ step: 'step-1' }] });
    expect(
      filterChallenges([undated], ACCOUNTS, { range: { from: '2026-01-01' } }),
    ).toEqual([]);
    expect(
      filterChallenges([undated], ACCOUNTS, { range: { to: '2026-12-31' } }),
    ).toEqual([]);
    expect(filterChallenges([undated], ACCOUNTS, {})).toEqual([undated]);
  });
});

describe('filterItems', () => {
  const ids = (items: PropTxn[]) => items.map((i) => i.id).sort();

  test('no filter keeps every item', () => {
    expect(filterItems(ITEMS, CHALLENGES, ACCOUNTS, {})).toHaveLength(
      ITEMS.length,
    );
  });

  test('the range tests an item by its date; an undated one is out of any range', () => {
    const nov = filterItems(ITEMS, CHALLENGES, ACCOUNTS, {
      range: { from: '2026-11-01', to: '2026-11-30' },
    });
    expect(ids(nov)).toEqual(['t2', 't3', 't4', 't5']);
    const undated = txn(
      'u',
      '',
      'Undated',
      A,
      undefined,
      'reset-fee',
      -100,
      'reviewed',
    );
    expect(
      filterItems([undated], [], [], { range: { to: '2026-12-31' } }),
    ).toEqual([]);
    expect(filterItems([undated], [], [], {})).toEqual([undated]);
  });

  test("a firm filter reads the item's own firm, unlinked rows included", () => {
    expect(
      ids(filterItems(ITEMS, CHALLENGES, ACCOUNTS, { firm: [C] })),
    ).toEqual(['t3']);
  });

  test('a challenge filter reads the challenge the row is linked to; unlinked rows drop out', () => {
    const breached = filterItems(ITEMS, CHALLENGES, ACCOUNTS, {
      status: 'breached',
    });
    expect(ids(breached)).toEqual(['fee-c-f50s-evaluation-fee', 't8']);
    const funded = filterItems(ITEMS, CHALLENGES, ACCOUNTS, {
      phase: 'funded',
    });
    expect(ids(funded)).toEqual([
      'fee-c-f50-activation-fee',
      'fee-c-f50-evaluation-fee',
      't2',
      't5',
    ]);
    const twoStep = filterItems(ITEMS, CHALLENGES, ACCOUNTS, {
      type: ['2-step'],
    });
    expect(ids(twoStep)).toEqual(['t4', 't6', 't7', 't9']);
  });

  test('a row linked to a challenge not in the list drops out of a challenge filter', () => {
    expect(filterItems([T9], [], ACCOUNTS, { phase: 'evaluation' })).toEqual(
      [],
    );
  });

  test('the filters combine with the range', () => {
    const r = filterItems(ITEMS, CHALLENGES, ACCOUNTS, {
      firm: [A],
      status: 'active',
      range: { from: '2026-10-01', to: '2026-10-31' },
    });
    expect(ids(r)).toEqual(['t6', 't7', 't9']);
  });
});

describe('finance performance', () => {
  test('finance budget: 200 challenges and 2,000 transactions in under 50 ms', () => {
    const accounts: Account[] = [];
    const challenges: Challenge[] = [];
    const trades: Trade[] = [];
    const firms = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
    const reasons: BreachReason[] = [
      'max-drawdown',
      'overtrading',
      'time-pressure',
      'risk-management',
      'other',
    ];
    for (let i = 0; i < 200; i++) {
      const size = [2_500_000, 5_000_000, 10_000_000, 15_000_000][i % 4]!;
      accounts.push(account(`a${i}`, size));
      accounts.push(account(`b${i}`, size));
      const day = String((i % 27) + 1).padStart(2, '0');
      const month = String((i % 9) + 1).padStart(2, '0');
      const breached = i % 3 === 0;
      challenges.push(
        challenge(`c${i}`, {
          firm: firms[i % firms.length]!,
          steps: i % 2 === 0 ? 1 : 2,
          phase: i % 5 === 0 ? 'funded' : 'evaluation',
          status: breached ? 'breached' : i % 7 === 0 ? 'passed' : 'active',
          phases: [
            {
              step: 'step-1',
              accountId: `a${i}`,
              startDate: `2026-${month}-${day}`,
            },
            {
              step: 'funded',
              accountId: `b${i}`,
              startDate: `2026-${month}-28`,
            },
          ],
          evaluationFee: 16_500,
          activationFee: i % 2 === 0 ? 8_500 : undefined,
          strategyIds: [`s${i % 6}`],
          ...(breached && {
            breachReason: reasons[i % reasons.length]!,
            breachedOn: `2026-${month}-28`,
          }),
        }),
      );
      for (let k = 0; k < 5; k++)
        trades.push(
          trade(
            `a${i}`,
            k % 2 === 0 ? 12_000 : -9_000,
            `2026-${month}-${String(((i + k) % 27) + 1).padStart(2, '0')}`,
          ),
        );
    }
    const cats: PropTxnCategory[] = [
      'payout',
      'evaluation-fee',
      'activation-fee',
      'reset-fee',
      'affiliate-income',
      'uncategorized',
    ];
    const txns: PropTxn[] = [];
    for (let i = 0; i < 2000; i++) {
      const amount = (i % 6 === 0 ? 1 : -1) * (1_000 + (i % 97) * 100);
      txns.push(
        txn(
          `t${i}`,
          `2026-${String((i % 9) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
          'Row',
          firms[i % firms.length]!,
          i % 5 === 0 ? undefined : `c${i % 200}`,
          cats[i % cats.length]!,
          amount,
          i % 11 === 0 ? 'ignored' : 'reviewed',
        ),
      );
    }
    const run = () => {
      const f = {
        status: 'active' as const,
        range: { from: '2026-01-01', to: '2026-12-31' },
      };
      const cs = filterChallenges(challenges, accounts, f);
      const items = filterItems(spendItems(cs, txns), challenges, accounts, f);
      totals(items);
      roiSeries(items, '1y', '2026-11-25');
      for (const by of ['firm', 'type', 'size', 'fee'] as const)
        breakdown(items, challenges, accounts, by);
      for (const by of ['firm', 'type', 'size', 'strategy'] as const)
        passRates(challenges, accounts, by);
      breachInsights(challenges, accounts, trades, ctx, 'evaluation');
      breachInsights(challenges, accounts, trades, ctx, 'funded');
      return items;
    };
    expect(run().length).toBeGreaterThan(0); // the warm-up
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      run();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[2]!).toBeLessThan(50);
  });
});

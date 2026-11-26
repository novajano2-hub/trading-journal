import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { defaultMetricContext } from '../metrics/context';
import type {
  Account,
  CashFlow,
  Challenge,
  ChallengeStep,
  Trade,
} from '../types';
import { checkChallenge } from './challenge';
import {
  accountTrades,
  phaseBalance,
  phaseStates,
  phaseStats,
  phaseTradesOf,
} from './phase';

const NY = 'America/New_York';
const CTX = defaultMetricContext(NY);

const account = (over: Partial<Account> = {}): Account => ({
  id: 'a1',
  workspaceId: 'w',
  name: 'Funded 50K',
  broker: 'Firm',
  type: 'prop-funded',
  currency: 'USD',
  startingBalance: 5_000_000,
  status: 'active',
  ...over,
});

const at = (iso: string, net: number, over: Partial<Trade> = {}): Trade =>
  makeTrade({
    accountId: 'a1',
    net,
    openedAt: new Date(Date.parse(iso) - 600_000).toISOString(),
    closedAt: iso,
    ...over,
  });

// November 2026 is standard time: New York is UTC-5.
const T1 = at('2026-11-02T14:40:00Z', 10_000, { serial: 1 }); // Mon 09:40
const T2 = at('2026-11-02T14:55:00Z', -4_000, { serial: 2 }); // Mon 09:55
const T3 = at('2026-11-02T16:10:00Z', 25_000, { serial: 3 }); // Mon 11:10
const T4 = at('2026-11-03T15:00:00Z', -7_500, { serial: 4 }); // Tue 10:00
const T5 = at('2026-11-04T04:30:00Z', 2_000, { serial: 5 }); // Tue 23:30
const TRADES = [T5, T3, T1, T4, T2];
const DEPOSIT: CashFlow = {
  id: 'f1',
  workspaceId: 'w',
  accountId: 'a1',
  date: '2026-11-03',
  amount: 100_000,
};

const input = (over: Partial<Parameters<typeof phaseBalance>[1]> = {}) => ({
  account: account(),
  flows: [] as CashFlow[],
  trades: TRADES,
  timeZone: NY,
  ...over,
});

describe('the phase trades', () => {
  test('are the account trades in its currency, from the phase start day', () => {
    const other = at('2026-11-02T15:00:00Z', 500, { accountId: 'a2' });
    const eur = at('2026-11-02T15:00:00Z', 500, { pnlCurrency: 'EUR' });
    const all = accountTrades(account(), [...TRADES, other, eur]);
    expect(all).toHaveLength(5);
    expect(phaseTradesOf(undefined, all, NY)).toHaveLength(5);
    // The start is a local day: 23:30 on the 3rd in New York is the 3rd.
    expect(
      phaseTradesOf('2026-11-03', all, NY)
        .map((t) => t.serial)
        .sort(),
    ).toEqual([4, 5]);
    expect(phaseTradesOf('2026-11-04', all, NY)).toEqual([]);
  });
});

describe('the balance, three ways (C65)', () => {
  test('Day: the balance at each trading day close', () => {
    const points = phaseBalance('day', input());
    expect(points.map((p) => [p.date, p.balance])).toEqual([
      ['2026-11-02', 5_031_000],
      ['2026-11-03', 5_025_500],
    ]);
  });

  test('Hour: the balance at the end of each hour with an exit, in the profile zone', () => {
    const points = phaseBalance('hour', input());
    expect(points.map((p) => [p.date, p.hour, p.balance])).toEqual([
      ['2026-11-02', 9, 5_006_000], // two trades in one hour make one point
      ['2026-11-02', 11, 5_031_000],
      ['2026-11-03', 10, 5_023_500],
      ['2026-11-03', 23, 5_025_500], // 04:30 UTC is still the 3rd in New York
    ]);
  });

  test('Trade: the balance after each closed trade, in the order they closed', () => {
    const open = at('2026-11-02T20:00:00Z', 0, {
      status: 'open',
      serial: 6,
    });
    delete (open as { closedAt?: string }).closedAt;
    const points = phaseBalance('trade', input({ trades: [...TRADES, open] }));
    expect(points.map((p) => p.balance)).toEqual([
      5_010_000, 5_006_000, 5_031_000, 5_023_500, 5_025_500,
    ]);
    expect(points.map((p) => p.tradeId)).toEqual(
      [T1, T2, T3, T4, T5].map((t) => t.id),
    );
    expect(points[0]!.at).toBe('2026-11-02T14:40:00Z');
  });

  test('the point counts: 2 days, 4 hours, 5 trades', () => {
    expect(
      (['day', 'hour', 'trade'] as const).map(
        (m) => phaseBalance(m, input()).length,
      ),
    ).toEqual([2, 4, 5]);
  });

  test('a deposit or withdrawal moves the balance from its date; Day also marks a date with nothing else', () => {
    const lone: CashFlow = { ...DEPOSIT, id: 'f2', date: '2026-11-05' };
    const day = phaseBalance('day', input({ flows: [DEPOSIT, lone] }));
    expect(day.map((p) => [p.date, p.balance])).toEqual([
      ['2026-11-02', 5_031_000],
      ['2026-11-03', 5_125_500],
      ['2026-11-05', 5_225_500],
    ]);
    // Hours and trades are points of trading: the 2nd stays as it was, the 3rd carries the deposit.
    expect(
      phaseBalance('hour', input({ flows: [DEPOSIT, lone] })).map(
        (p) => p.balance,
      ),
    ).toEqual([5_006_000, 5_031_000, 5_123_500, 5_125_500]);
    expect(
      phaseBalance('trade', input({ flows: [DEPOSIT, lone] })).map(
        (p) => p.balance,
      ),
    ).toEqual([5_010_000, 5_006_000, 5_031_000, 5_123_500, 5_125_500]);
  });

  test('from the phase start: what the account held before it is in the first point', () => {
    const from = { startDate: '2026-11-03' };
    expect(
      phaseBalance('day', input(from)).map((p) => [p.date, p.balance]),
    ).toEqual([['2026-11-03', 5_025_500]]);
    expect(phaseBalance('hour', input(from)).map((p) => p.balance)).toEqual([
      5_023_500, 5_025_500,
    ]);
    expect(phaseBalance('trade', input(from)).map((p) => p.balance)).toEqual([
      5_023_500, 5_025_500,
    ]);
  });

  test('no trades: no points', () => {
    for (const mode of ['day', 'hour', 'trade'] as const)
      expect(phaseBalance(mode, input({ trades: [] }))).toEqual([]);
  });

  test('all three end where the account stands', () => {
    const ends = (['day', 'hour', 'trade'] as const).map((m) => {
      const p = phaseBalance(m, input({ flows: [DEPOSIT] }));
      return p[p.length - 1]!.balance;
    });
    expect(ends).toEqual([5_125_500, 5_125_500, 5_125_500]);
  });
});

describe('the five stats', () => {
  test('win rate, average win and loss, best day and worst day, on net', () => {
    expect(phaseStats(TRADES, CTX)).toEqual({
      trades: 5,
      winRate: 0.6,
      avgWin: 12_333, // (10,000 + 25,000 + 2,000) / 3
      avgLoss: -5_750, // (-4,000 - 7,500) / 2
      bestDay: 31_000,
      worstDay: -5_500,
    });
  });

  test('read net whatever the profile basis is, and a unit does not narrow them', () => {
    const gross = at('2026-11-02T15:00:00Z', 1_000, {
      fees: 500,
      gross: 1_500,
    });
    const stats = phaseStats([gross], {
      ...CTX,
      pnlBasis: 'gross',
      unit: 'r',
    });
    expect(stats.bestDay).toBe(1_000);
    expect(stats.avgWin).toBe(1_000);
  });

  test('with no trades there is nothing to say', () => {
    expect(phaseStats([], CTX)).toEqual({
      trades: 0,
      winRate: null,
      avgWin: null,
      avgLoss: null,
      bestDay: null,
      worstDay: null,
    });
  });
});

describe('the state each phase tab carries', () => {
  const RULES = {
    firm: 'Firm',
    phase: 'evaluation' as const,
    profitTarget: 10_000,
    dailyLossLimit: 500_000,
    maxDrawdown: 1_000_000,
    drawdownType: 'static' as const,
    minTradingDays: 1,
  };
  const accounts: Account[] = [
    account({ id: 'e1', propRules: RULES }),
    account({ id: 'e2', propRules: RULES }),
    account({ id: 'fn', propRules: { ...RULES, phase: 'funded' } }),
  ];
  const winning = (id: string) =>
    at('2026-11-02T15:00:00Z', 20_000, { accountId: id });
  const challenge = (over: Partial<Challenge>): Challenge => ({
    id: 'c',
    workspaceId: 'w',
    name: 'C',
    firm: 'Firm',
    steps: 2,
    phases: [
      { step: 'step-1', accountId: 'e1' },
      { step: 'step-2', accountId: 'e2' },
      { step: 'funded' },
    ],
    phase: 'evaluation',
    status: 'active',
    ...over,
  });
  const statesOf = (c: Challenge, trades: Trade[], current: ChallengeStep) =>
    phaseStates(
      c,
      checkChallenge(c, accounts, trades, CTX, '2026-11-20'),
      current,
    );

  test('an evaluation in progress: the step is active, the rest have not started', () => {
    expect(statesOf(challenge({}), [], 'step-1')).toEqual({
      'step-1': 'active',
      'step-2': 'not-started',
      funded: 'not-started',
    });
  });

  test('a step on target has passed; the next waits', () => {
    expect(statesOf(challenge({}), [winning('e1')], 'step-2')).toEqual({
      'step-1': 'passed',
      'step-2': 'active',
      funded: 'not-started',
    });
    // The last step on target, no funded account yet: it stays the current one and has passed.
    const one = challenge({
      steps: 1,
      phases: [{ step: 'step-1', accountId: 'e1' }, { step: 'funded' }],
    });
    expect(statesOf(one, [winning('e1')], 'step-1')).toEqual({
      'step-1': 'passed',
      funded: 'not-started',
    });
  });

  test('funded: the evaluation steps passed and the funded phase active', () => {
    const funded = challenge({
      phase: 'funded',
      phases: [
        { step: 'step-1', accountId: 'e1' },
        { step: 'step-2', accountId: 'e2' },
        { step: 'funded', accountId: 'fn' },
      ],
    });
    expect(statesOf(funded, [], 'funded')).toEqual({
      'step-1': 'passed',
      'step-2': 'passed',
      funded: 'active',
    });
  });

  test('breached: the phase it broke in is breached, the ones before passed, the ones after not started', () => {
    const inStep2 = challenge({
      status: 'breached',
      breachReason: 'other',
      breachedOn: '2026-11-10',
    });
    expect(statesOf(inStep2, [winning('e1')], 'step-2')).toEqual({
      'step-1': 'passed',
      'step-2': 'breached',
      funded: 'not-started',
    });
    const inFunded = challenge({
      phase: 'funded',
      status: 'breached',
      phases: [
        { step: 'step-1', accountId: 'e1' },
        { step: 'step-2', accountId: 'e2' },
        { step: 'funded', accountId: 'fn' },
      ],
    });
    expect(statesOf(inFunded, [], 'funded')).toEqual({
      'step-1': 'passed',
      'step-2': 'passed',
      funded: 'breached',
    });
  });

  test('a challenge the trader marked passed shows its current evaluation step as passed', () => {
    expect(
      statesOf(challenge({ status: 'passed' }), [], 'step-1')['step-1'],
    ).toBe('passed');
  });
});

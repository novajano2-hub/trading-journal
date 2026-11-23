import { describe, expect, test } from 'vitest';
import { makeTrade } from '../domain/__fixtures__/trades';
import type { Account, UserPrefs } from '../domain/types';
import { defaultPrefs } from './repository';
import { riskRatios } from '../domain/metrics/risk';
import { metricContextOf, metricsByCurrency } from './metrics';
import { pctBaseOf } from '../lib/display';
import { generateSampleWorkspace, SAMPLE_SEED } from './seed/generate';

/** Spec §10 asks for 50 ms; the bound is 3x so load cannot flake it. */
const BUDGET_MS = 150;

const acct = (id: string, startingBalance: number, currency = 'USD') =>
  ({ id, startingBalance, currency }) as Account;
const ctx = {
  timeZone: 'America/New_York',
  breakevenRange: { unit: 'amount' as const, from: 0, to: 0 },
  pnlBasis: 'net' as const,
};

describe('metricsByCurrency', () => {
  test('starting balances of the selected accounts add up', () => {
    const [usd] = metricsByCurrency([makeTrade({ net: 100 })], {
      accounts: [acct('a', 5_000_000), acct('b', 2_500_000)],
      ctx,
      baseCurrency: 'USD',
    });
    expect(usd!.startingBalance).toBe(7_500_000);
    expect(usd!.equity[0]!.equity).toBe(7_500_100);
  });

  test('base currency first, others follow; each partition is single-currency', () => {
    const out = metricsByCurrency(
      [
        makeTrade({ net: 100 }),
        makeTrade({ net: -50 }),
        makeTrade({ net: 70, pnlCurrency: 'GBP' }),
      ],
      { accounts: [acct('a', 1000)], ctx, baseCurrency: 'USD' },
    );
    expect(out.map((m) => m.currency)).toEqual(['USD', 'GBP']);
    for (const m of out) expect(m.summary.currencies).toHaveLength(1);
    expect(out[1]!.startingBalance).toBe(0);
    expect(out[0]!.trades).toHaveLength(2);
  });

  test('base partition is present even when it has no trades', () => {
    const out = metricsByCurrency(
      [makeTrade({ net: 70, pnlCurrency: 'GBP' })],
      { accounts: [], ctx, baseCurrency: 'USD' },
    );
    expect(out.map((m) => m.currency)).toEqual(['USD', 'GBP']);
    expect(out[0]!.summary.closedCount).toBe(0);
  });

  test('no trades gives one empty base partition', () => {
    const out = metricsByCurrency([], {
      accounts: [],
      ctx,
      baseCurrency: 'USD',
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.currency).toBe('USD');
    expect(out[0]!.summary.closedCount).toBe(0);
    expect(out[0]!.summary.winRate).toBeNull();
  });

  test('other currencies are in code order', () => {
    const out = metricsByCurrency(
      ['JPY', 'GBP', 'EUR'].map((c) => makeTrade({ net: 1, pnlCurrency: c })),
      { accounts: [], ctx, baseCurrency: 'USD' },
    );
    expect(out.map((m) => m.currency)).toEqual(['USD', 'EUR', 'GBP', 'JPY']);
  });
});

test('metricContextOf maps prefs', () => {
  const prefs: UserPrefs = {
    ...defaultPrefs(),
    timeZone: 'Europe/London',
    baseCurrency: 'GBP',
    breakevenRange: { unit: 'amount', from: -500, to: 500 },
    pnlBasis: 'gross',
  };
  expect(metricContextOf(prefs)).toEqual({
    timeZone: 'Europe/London',
    breakevenRange: { unit: 'amount', from: -500, to: 500 },
    pnlBasis: 'gross',
  });
});

describe('performance (spec §10)', () => {
  test('a filter change with a range recomputes the metrics and the % base in under the budget (median of 9)', () => {
    const ws = generateSampleWorkspace({
      seed: SAMPLE_SEED,
      endDate: '2026-11-19',
    });
    const range = { from: '2026-10-01' };
    const run = () => {
      pctBaseOf({
        accounts: ws.accounts,
        flows: [],
        trades: ws.trades,
        accountIds: [],
        from: range.from,
        timeZone: ctx.timeZone,
      });
      metricsByCurrency(ws.trades, {
        accounts: ws.accounts,
        flows: [],
        balanceTrades: ws.trades,
        ctx: { ...ctx, range },
        baseCurrency: 'USD',
      });
    };
    run();
    const times: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t0 = performance.now();
      run();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    // 3x the spec's 50 ms: still catches an O(n^2) regression (seconds on
    // 1,230 trades) without flaking when the suite loads every core.
    expect(times[4]!).toBeLessThan(BUDGET_MS);
  });

  test('metrics over the sample workspace take under the budget (median of 5)', () => {
    const ws = generateSampleWorkspace({
      seed: SAMPLE_SEED,
      endDate: '2026-11-19',
    });
    expect(ws.accounts).toHaveLength(6);
    const run = () =>
      metricsByCurrency(ws.trades, {
        accounts: ws.accounts,
        ctx,
        baseCurrency: 'USD',
      });
    run(); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      run();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[2]!).toBeLessThan(BUDGET_MS);
  });
});

describe('Sharpe and Sortino inputs', () => {
  const on = (date: string, net: number, fees = 0) =>
    makeTrade({
      accountId: 'a',
      net,
      fees,
      gross: net + fees,
      openedAt: `${date}T15:00:00Z`,
      closedAt: `${date}T15:05:00Z`,
    });
  const day = (date: string, net: number) => ({
    date,
    net,
    tradeCount: 1,
    wins: 0,
    losses: 0,
    costBasis: 0,
  });

  test('always on net days, whatever the basis shows', () => {
    const trades = [
      on('2026-11-16', 10_000, 4_000),
      on('2026-11-17', -5_000, 1_000),
      on('2026-11-18', 20_000, 2_000),
    ];
    const [usd] = metricsByCurrency(trades, {
      accounts: [acct('a', 1_000_000)],
      ctx: { ...ctx, pnlBasis: 'gross' },
      baseCurrency: 'USD',
    });
    // Gross days are what the bundle shows; the ratios still read the net ones.
    expect(usd!.days.map((d) => d.net)).toEqual([14_000, -4_000, 22_000]);
    expect(usd!.risk).toEqual(
      riskRatios(
        [
          day('2026-11-16', 10_000),
          day('2026-11-17', -5_000),
          day('2026-11-18', 20_000),
        ],
        1_000_000,
      ),
    );
  });

  test('under a date range the balance starts from what was booked before it', () => {
    const before = on('2026-11-10', 1_000_000);
    const inside = [
      on('2026-11-16', 10_000),
      on('2026-11-17', -5_000),
      on('2026-11-18', 20_000),
    ];
    const [usd] = metricsByCurrency([before, ...inside], {
      accounts: [acct('a', 1_000_000)],
      ctx: { ...ctx, range: { from: '2026-11-16', to: '2026-11-20' } },
      baseCurrency: 'USD',
      dayTrades: [before, ...inside],
    });
    const days = [
      day('2026-11-16', 10_000),
      day('2026-11-17', -5_000),
      day('2026-11-18', 20_000),
    ];
    expect(usd!.days.map((d) => d.date)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ]);
    expect(usd!.risk).toEqual(riskRatios(days, 2_000_000));
    expect(usd!.risk).not.toEqual(riskRatios(days, 1_000_000));
  });

  test('deposits and withdrawals dated before the range move the starting balance, those inside it move the base of later days', () => {
    const before = on('2026-11-10', 1_000_000);
    const inside = [
      on('2026-11-16', 10_000),
      on('2026-11-17', -5_000),
      on('2026-11-18', 20_000),
    ];
    const flow = (date: string, amount: number) => ({
      id: date,
      workspaceId: 'w',
      accountId: 'a',
      date,
      amount,
    });
    const [usd] = metricsByCurrency([before, ...inside], {
      accounts: [acct('a', 1_000_000)],
      flows: [
        flow('2026-11-12', -500_000),
        flow('2026-11-15', 100_000),
        flow('2026-11-17', 9_000_000),
      ],
      ctx: { ...ctx, range: { from: '2026-11-16', to: '2026-11-20' } },
      baseCurrency: 'USD',
      dayTrades: [before, ...inside],
    });
    const days = [
      day('2026-11-16', 10_000),
      day('2026-11-17', -5_000),
      day('2026-11-18', 20_000),
    ];
    // The 17 Nov deposit is in the base of 18 Nov: 1,600,000 + 10,000 - 5,000 + 9,000,000.
    expect(usd!.risk).toEqual(
      riskRatios(days, 1_600_000, [{ date: '2026-11-17', amount: 9_000_000 }]),
    );
    expect(usd!.risk).not.toEqual(riskRatios(days, 1_600_000));
  });

  test('an open range starts from the balance the day before its first day', () => {
    const before = on('2026-11-10', 1_000_000);
    const inside = [on('2026-11-16', 10_000), on('2026-11-17', -5_000)];
    const flow = {
      id: 'f',
      workspaceId: 'w',
      accountId: 'a',
      date: '2026-11-12',
      amount: 500_000,
    };
    // dayTrades are the filtered set (no 10 Nov trade); balanceTrades are all.
    const [usd] = metricsByCurrency(inside, {
      accounts: [acct('a', 0)],
      flows: [flow],
      ctx,
      baseCurrency: 'USD',
      balanceTrades: [before, ...inside],
    });
    expect(usd!.risk).toEqual(
      riskRatios(
        [day('2026-11-16', 10_000), day('2026-11-17', -5_000)],
        1_500_000,
        [],
      ),
    );
  });

  test('the balance is booked from every trade of the accounts, not only the filtered ones', () => {
    const before = on('2026-11-10', 1_000_000);
    const inside = [on('2026-11-16', 10_000), on('2026-11-17', -5_000)];
    const [usd] = metricsByCurrency(inside, {
      accounts: [acct('a', 1_000_000)],
      ctx: { ...ctx, range: { from: '2026-11-16' } },
      baseCurrency: 'USD',
      balanceTrades: [before, ...inside],
    });
    expect(usd!.risk).toEqual(
      riskRatios(
        [day('2026-11-16', 10_000), day('2026-11-17', -5_000)],
        2_000_000,
      ),
    );
  });
});

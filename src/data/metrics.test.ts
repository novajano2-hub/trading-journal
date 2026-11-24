import { describe, expect, test } from 'vitest';
import { makeTrade } from '../domain/__fixtures__/trades';
import type { Account, UserPrefs } from '../domain/types';
import { defaultPrefs } from './repository';
import { riskRatios } from '../domain/metrics/risk';
import { metricContextOf, metricsByCurrency } from './metrics';
import { meanFigure, pctBaseOf, sumFigures, tradeFigure } from '../lib/display';
import { classify } from '../domain/metrics/context';
import { isClosed } from '../domain/trade-status';
import type { DisplayUnit, Trade } from '../domain/types';
import { applyFilters, EMPTY_FILTERS, narrowToUnit } from './filters';
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

  test('the headline drawdown is the daily curve: a fall inside one day is none, and the % is over the balance at the peak day', () => {
    const t = (net: number, serial: number, closedAt: string) =>
      makeTrade({ net, serial, closedAt });
    const trades = [
      t(500, 1, '2026-03-02T15:00:00Z'),
      t(-400, 2, '2026-03-02T16:00:00Z'),
      t(-300, 3, '2026-03-03T15:00:00Z'),
    ];
    const [usd] = metricsByCurrency(trades, {
      accounts: [acct('a', 10_000)],
      ctx,
      baseCurrency: 'USD',
    });
    // Days: +100, then -300: peak 10,100, trough 9,800.
    expect(usd!.drawdown.amount).toBe(300);
    expect(usd!.drawdown).toMatchObject({
      peakDay: '2026-03-02',
      troughDay: '2026-03-03',
    });
    expect(usd!.drawdown.pct).toBeCloseTo(300 / 10_100, 6);
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

test('a unit that narrows the set rides in the context; the others do not', () => {
  const of = (displayUnit: DisplayUnit) =>
    metricContextOf({ ...defaultPrefs(), displayUnit }).unit;
  expect(of('ticks')).toBe('ticks');
  expect(of('pips')).toBe('pips');
  expect(of('points')).toBe('points');
  expect(of('r')).toBe('r');
  for (const u of ['dollar', 'percent', 'privacy'] as const)
    expect(
      'unit' in metricContextOf({ ...defaultPrefs(), displayUnit: u }),
    ).toBe(false);
});

/**
 * The sample as TradeZella imported it (it ends on 20 Nov 2026), read in the
 * trader's New York days. The figures TradeZella showed on it are the pins
 * (Part 2 rulings).
 */
describe('the sample under a narrowing unit, as TradeZella read it', () => {
  const ws = generateSampleWorkspace({
    seed: SAMPLE_SEED,
    endDate: '2026-11-20',
  });
  const env = {
    timeZone: 'America/New_York',
    today: '2026-11-21',
    accounts: ws.accounts,
  };
  const picked = (accountIds: string[], unit: DisplayUnit, range = {}) =>
    narrowToUnit(
      applyFilters(ws.trades, { ...EMPTY_FILTERS, accountIds, range }, env),
      unit,
    );
  const metricsOf = (trades: Trade[], unit: DisplayUnit) =>
    metricsByCurrency(trades, {
      accounts: ws.accounts,
      ctx: metricContextOf({
        ...defaultPrefs(),
        timeZone: 'America/New_York',
        displayUnit: unit,
      }),
      baseCurrency: 'USD',
    })[0]!;
  const uctx = { ...ctx, unit: 'ticks' as const };

  test('Futures live in Ticks: 574 trades, 50.52% won, profit factor 1.3689, +8,495 ticks', () => {
    const trades = picked(['sample-futures'], 'ticks');
    expect(trades).toHaveLength(574);
    const m = metricsOf(trades, 'ticks');
    expect(m.summary.closedCount + m.summary.openCount).toBe(574);
    expect(m.summary.winRate).toBeCloseTo(0.5052, 4);
    expect(m.summary.profitFactor).toBeCloseTo(1.3689, 4);
    expect(m.summary.profitFactor!.toFixed(2)).toBe('1.37');
    const closed = trades.filter(isClosed);
    const figs = closed.map((t) => tradeFigure(t, uctx));
    // Q3: each trade's ticks count every contract it closed.
    expect(sumFigures(figs, null).ticks).toBe(8495);
    const of = (o: 'win' | 'loss') =>
      meanFigure(
        closed
          .filter((t) => classify(t, uctx).outcome === o)
          .map((t) => tradeFigure(t, uctx)),
        null,
      ).ticks!;
    expect(of('win')).toBeCloseTo(109.09, 2);
    expect(of('loss')).toBeCloseTo(-81.38, 2);
  });

  test('Futures live: the average drawdown is -$580.81, over the days under a peak, beside a max of -$2,168.55', () => {
    const m = metricsOf(picked(['sample-futures'], 'dollar'), 'dollar');
    expect(m.daySummary.greenDays + m.daySummary.redDays).toBe(119);
    expect(m.drawdown.amount).toBe(216855);
    expect(m.avgDrawdown.amount).toBe(58081);
    // Over every one of the 119 trading days it would be -$414.86: not the pin.
    expect(m.avgDrawdown.days).toBe(85);
    expect(m.avgDrawdown.pct).not.toBeNull();
    expect(m.avgDrawdown.pct!).toBeGreaterThan(0);
    expect(m.avgDrawdown.pct!).toBeLessThan(m.drawdown.pct!);
  });

  test('the average drawdown has no % under a unit, as the max has none', () => {
    const m = metricsOf(picked(['sample-futures'], 'ticks'), 'ticks');
    expect(m.avgDrawdown.pct).toBeNull();
    expect(m.avgDrawdown.amount).not.toBeNull();
  });

  test('Futures live: the commissions and fees of the fills add up to the fees of the summary', () => {
    const m = metricsOf(picked(['sample-futures'], 'dollar'), 'dollar');
    expect(m.costs.commissions + m.costs.fees).toBe(m.summary.fees);
    expect(m.costs.commissions).toBeGreaterThan(0);
  });

  test('Futures live: months, hold times and daily volume come with the bundle', () => {
    const m = metricsOf(picked(['sample-futures'], 'dollar'), 'dollar');
    expect(m.months.months).toBeGreaterThan(1);
    expect(m.months.best!.net).toBeGreaterThanOrEqual(m.months.lowest!.net);
    expect(m.holds.all).toBeGreaterThan(0);
    expect(m.avgDailyVolume).toBeCloseTo(1169 / 119, 2);
  });

  test('every account in Ticks keeps only the futures trades, in Points too', () => {
    for (const unit of ['ticks', 'points'] as const) {
      const trades = picked([], unit);
      expect(trades).toHaveLength(863);
      expect(trades.every((t) => t.instrument.assetClass === 'future')).toBe(
        true,
      );
    }
  });

  test('in Pips only the forex trades count: 48.97% won, profit factor 1.30, 31 green days of 56', () => {
    const trades = picked([], 'pips');
    expect(trades).toHaveLength(146);
    expect(trades.every((t) => t.instrument.assetClass === 'forex')).toBe(true);
    const m = metricsOf(trades, 'pips');
    expect(m.summary.winRate).toBeCloseTo(0.4897, 4);
    expect(m.summary.profitFactor!.toFixed(2)).toBe('1.30');
    expect(m.daySummary).toMatchObject({ greenDays: 31, redDays: 25 });
    expect(m.daySummary.greenPct).toBeCloseTo(0.5536, 4);
  });

  test('in R the trades without a stop leave the count', () => {
    const all = picked([], 'dollar');
    const trades = picked([], 'r');
    expect(all).toHaveLength(1519);
    expect(trades).toHaveLength(1300);
    expect(
      trades.every((t) => t.initialRisk !== undefined && t.initialRisk > 0),
    ).toBe(true);
    expect(metricsOf(trades, 'r').summary.noRiskCount).toBe(0);
  });

  test("Futures live's daily win rate is its winning-day share: 70 green days of 119, 58.82%", () => {
    const m = metricsOf(picked(['sample-futures'], 'dollar'), 'dollar');
    expect(m.days).toHaveLength(119);
    expect(m.daySummary).toMatchObject({
      greenDays: 70,
      redDays: 49,
      flatDays: 0,
    });
    expect(m.daySummary.greenPct).toBeCloseTo(0.5882, 4);
  });

  test('volume counts each trade once: Futures live 1,169, 9.82 a trading day', () => {
    const m = metricsOf(picked(['sample-futures'], 'dollar'), 'dollar');
    expect(m.volume).toBe(1169);
    expect(m.avgDailyVolume).toBeCloseTo(1169 / 119, 10);
    expect(m.avgDailyVolume!.toFixed(2)).toBe('9.82');
  });

  test('2 Nov 2026: four forex trades of 1.8, 1.5, 1.6 and 1.9 lots, volume 6.8', () => {
    const day = { from: '2026-11-02', to: '2026-11-02' };
    const trades = picked(['sample-forex-prop'], 'dollar', day);
    expect(trades).toHaveLength(4);
    expect(metricsOf(trades, 'dollar').volume).toBe(6.8);
  });

  test('balance figures have no value once the unit narrows the set', () => {
    const futures = picked(['sample-futures'], 'ticks');
    expect(metricsOf(futures, 'dollar').drawdown.pct).not.toBeNull();
    expect(metricsOf(futures, 'ticks').drawdown.pct).toBeNull();
    expect(metricsOf(futures, 'ticks').drawdown.amount).toBe(
      metricsOf(futures, 'dollar').drawdown.amount,
    );
    // Sharpe and Sortino are daily returns on the balance: none in a unit.
    const dollar = metricsOf(futures, 'dollar').risk;
    expect(dollar.sharpe).not.toBeNull();
    expect(dollar.sortino).not.toBeNull();
    for (const unit of ['r', 'ticks', 'pips', 'points'] as const)
      expect(metricsOf(futures, unit).risk).toEqual({
        sharpe: null,
        sortino: null,
      });
  });

  test('points are ticks times the tick size on every Futures live trade', () => {
    const closed = picked(['sample-futures'], 'points').filter(isClosed);
    for (const t of closed) {
      const f = tradeFigure(t, uctx);
      expect(f.points).toBeCloseTo(f.ticks! * t.instrument.tickSize, 6);
    }
    // Some of them hold more than one contract, so this is not per contract.
    expect(closed.some((t) => t.maxPosition > 1)).toBe(true);
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

import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { outcomeOf } from '../outcome';
import { defaultMetricContext } from './context';
import {
  dailyPnl,
  dayDurations,
  dayStreaks,
  daySummary,
  loggedDays,
  monthSummary,
  type DayStat,
} from './days';
import { buildTrades } from '../trade-builder';
import { resolveInstrument } from '../instruments';
import type { Execution, JournalEntry } from '../types';

const ctx = defaultMetricContext('America/New_York');

describe('days', () => {
  test('daily P&L buckets by local close date across DST', () => {
    const t = [
      makeTrade({ net: 5000, closedAt: '2026-03-06T20:30:00Z' }),
      makeTrade({ net: -1000, closedAt: '2026-03-07T02:00:00Z' }),
      makeTrade({ net: -2000, closedAt: '2026-03-09T13:45:00Z' }),
      makeTrade({ net: 0, closedAt: '2026-03-10T03:30:00Z' }),
    ];
    const days = dailyPnl(t, ctx);
    expect(days).toEqual([
      {
        date: '2026-03-06',
        net: 4000,
        tradeCount: 2,
        wins: 1,
        losses: 1,
        costBasis: 45_000_000,
      },
      {
        date: '2026-03-09',
        net: -2000,
        tradeCount: 2,
        wins: 0,
        losses: 1,
        costBasis: 45_000_000,
      },
    ]);
    expect(daySummary(days, ctx)).toMatchObject({
      greenDays: 1,
      redDays: 1,
      flatDays: 0,
      greenPct: 0.5,
      best: { date: '2026-03-06' },
      worst: { date: '2026-03-09' },
      // 4000 on the green day, -2000 on the red; four trades over two days.
      avgGreenDay: 4000,
      avgRedDay: -2000,
      tradesPerDay: 2,
    });
    expect(dayStreaks(days, ctx)).toMatchObject({ maxWin: 1, maxLoss: 1 });
  });
  test('empty summary; flat days neither extend nor break', () => {
    expect(daySummary([], ctx)).toEqual({
      greenDays: 0,
      redDays: 0,
      flatDays: 0,
      greenPct: null,
      best: null,
      worst: null,
      avgGreenDay: null,
      avgRedDay: null,
      tradesPerDay: null,
      avgGreenValue: null,
      avgRedValue: null,
      avgDailyPnl: null,
      avgWinLoss: null,
      largestGreenDay: null,
      largestRedDay: null,
    });
    const d = (date: string, net: number) => ({
      date,
      net,
      tradeCount: 1,
      wins: 0,
      losses: 0,
      costBasis: 0,
    });
    expect(
      dayStreaks([d('1', 1), d('2', 0), d('3', 1), d('4', -1)], ctx),
    ).toEqual({
      maxWin: 2,
      maxLoss: 1,
      current: { kind: 'loss', length: 1 },
    });
  });

  test('outcomeOf classifies against an amount range', () => {
    const r = { unit: 'amount', from: -100, to: 100 } as const;
    expect(outcomeOf(101, r)).toBe('win');
    expect(outcomeOf(100, r)).toBe('breakeven');
    expect(outcomeOf(-100, r)).toBe('breakeven');
    expect(outcomeOf(-101, r)).toBe('loss');
  });

  test('days inside the breakeven range are flat', () => {
    const c = {
      ...ctx,
      breakevenRange: { unit: 'amount', from: -1000, to: 1000 } as const,
    };
    const d = (date: string, net: number): DayStat => ({
      date,
      net,
      tradeCount: 1,
      wins: 0,
      losses: 0,
      costBasis: 0,
    });
    const days = [d('1', 500), d('2', 4000), d('3', -2000)];
    expect(daySummary(days, c)).toMatchObject({
      greenDays: 1,
      redDays: 1,
      flatDays: 1,
      greenPct: 1 / 3,
    });
    expect(
      dayStreaks([d('1', 4000), d('2', 500), d('3', 4000)], c),
    ).toMatchObject({ maxWin: 2 });
  });

  test('percent range on days uses the day cost basis; wins and losses use the range too', () => {
    const c = {
      ...ctx,
      breakevenRange: { unit: 'percent', from: -0.001, to: 0.001 } as const,
    };
    const day = (net: number): DayStat => ({
      date: 'x',
      net,
      tradeCount: 1,
      wins: 0,
      losses: 0,
      costBasis: 22_500_000,
    });
    expect(daySummary([day(20000), day(30000), day(-30000)], c)).toMatchObject({
      greenDays: 1,
      redDays: 1,
      flatDays: 1,
    });
    const t = [
      makeTrade({ net: 20000, closedAt: '2026-03-06T15:00:00Z' }),
      makeTrade({ net: 30000, closedAt: '2026-03-06T16:00:00Z' }),
    ];
    expect(dailyPnl(t, c)[0]).toMatchObject({
      wins: 1,
      losses: 0,
      costBasis: 45_000_000,
      net: 50000,
    });
  });

  test('gross basis sums gross into daily P&L', () => {
    const t = [makeTrade({ net: -500, gross: 1000, fees: 1500 })];
    expect(dailyPnl(t, { ...ctx, pnlBasis: 'gross' })[0]).toMatchObject({
      net: 1000,
      wins: 1,
    });
  });
});

function fill(
  id: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  time: string,
  fees = 0,
): Execution {
  return {
    id,
    accountId: 'a1',
    symbol: 'ESZ5',
    side,
    qty,
    price,
    time,
    fees,
    commission: 0,
  };
}
const build = (execs: Execution[]) =>
  buildTrades(execs, {
    workspaceId: 'w',
    startSerial: 1,
    resolve: () => resolveInstrument('ESZ5'),
    accountCurrency: () => 'USD',
  }).trades;

describe('days booked by exit', () => {
  test('a trade held over two days books each exit on its own local date', () => {
    const t = build([
      fill('e1', 'buy', 2, 5000, '2026-11-16T15:00:00Z', 300),
      fill('x1', 'sell', 1, 5010, '2026-11-16T20:00:00Z', 150),
      fill('x2', 'sell', 1, 5020, '2026-11-17T15:00:00Z', 150),
    ]);
    const days = dailyPnl(t, ctx);
    expect(days.map((d) => [d.date, d.net])).toEqual([
      ['2026-11-16', 49700],
      ['2026-11-17', 99700],
    ]);
  });
  test('an open trade books its partial exit; with no exit it adds no day', () => {
    const partial = build([
      fill('e1', 'buy', 2, 5000, '2026-11-16T15:00:00Z', 300),
      fill('x1', 'sell', 1, 5010, '2026-11-16T20:00:00Z', 150),
    ]);
    expect(dailyPnl(partial, ctx).map((d) => [d.date, d.net])).toEqual([
      ['2026-11-16', 49700],
    ]);
    const none = build([
      fill('e1', 'buy', 2, 5000, '2026-11-16T15:00:00Z', 300),
    ]);
    expect(dailyPnl(none, ctx)).toEqual([]);
  });
  test('gross basis books gross', () => {
    const t = build([
      fill('e1', 'buy', 1, 5000, '2026-11-16T15:00:00Z', 100),
      fill('x1', 'sell', 1, 5010, '2026-11-16T20:00:00Z', 100),
    ]);
    expect(dailyPnl(t, { ...ctx, pnlBasis: 'gross' })[0]?.net).toBe(50000);
  });
  test('longest and average day: first entry to last exit', () => {
    const t = build([
      fill('e1', 'buy', 1, 5000, '2026-11-16T14:30:00Z'),
      fill('x1', 'sell', 1, 5001, '2026-11-16T15:00:00Z'),
      fill('e2', 'buy', 1, 5000, '2026-11-16T18:00:00Z'),
      fill('x2', 'sell', 1, 5001, '2026-11-16T20:30:00Z'),
      fill('e3', 'buy', 1, 5000, '2026-11-17T14:30:00Z'),
      fill('x3', 'sell', 1, 5001, '2026-11-17T15:30:00Z'),
    ]);
    expect(dayDurations(t, ctx)).toEqual({ longest: 360, average: 210 });
    expect(dayDurations([], ctx)).toEqual({ longest: null, average: null });
  });
  test('the daily win rate is the share of winning days, with the green, red and flat counts', () => {
    const t = build([
      // Mon: two wins and a loss, green
      fill('a1', 'buy', 1, 5000, '2026-11-16T15:00:00Z'),
      fill('a2', 'sell', 1, 5010, '2026-11-16T15:10:00Z'),
      fill('b1', 'buy', 1, 5000, '2026-11-16T16:00:00Z'),
      fill('b2', 'sell', 1, 5010, '2026-11-16T16:10:00Z'),
      fill('c1', 'buy', 1, 5000, '2026-11-16T17:00:00Z'),
      fill('c2', 'sell', 1, 4990, '2026-11-16T17:10:00Z'),
      // Tue: one win, green
      fill('d1', 'buy', 1, 5000, '2026-11-17T15:00:00Z'),
      fill('d2', 'sell', 1, 5010, '2026-11-17T15:10:00Z'),
      // Wed: one loss, red
      fill('e1', 'buy', 1, 5000, '2026-11-18T15:00:00Z'),
      fill('e2', 'sell', 1, 4990, '2026-11-18T15:10:00Z'),
      // Thu: flat
      fill('f1', 'buy', 1, 5000, '2026-11-19T15:00:00Z'),
      fill('f2', 'sell', 1, 5000, '2026-11-19T15:10:00Z'),
    ]);
    const s = daySummary(dailyPnl(t, ctx), ctx);
    expect(s).toMatchObject({ greenDays: 2, redDays: 1, flatDays: 1 });
    // Two winning days of four: not the mean of each day's trade win rate (5/9).
    expect(s.greenPct).toBe(0.5);
    expect(daySummary([], ctx).greenPct).toBeNull();
  });
  test('a range clips day figures to the exits dated inside it', () => {
    // Opened 18 Nov, exits on the 19th and the 20th, the last lot still open.
    const t = build([
      fill('e1', 'buy', 3, 5000, '2026-11-18T15:00:00Z', 300),
      fill('x1', 'sell', 1, 5010, '2026-11-19T15:00:00Z', 100),
      fill('x2', 'sell', 1, 5020, '2026-11-20T15:00:00Z', 100),
    ]);
    const all = dailyPnl(t, ctx);
    expect(all.map((d) => d.date)).toEqual(['2026-11-19', '2026-11-20']);
    const clipped = dailyPnl(t, {
      ...ctx,
      range: { from: '2026-11-20', to: '2026-11-20' },
    });
    expect(clipped).toEqual([all[1]]);
    expect(clipped[0]?.tradeCount).toBe(1);
    // An open end keeps everything on that side.
    expect(
      dailyPnl(t, { ...ctx, range: { to: '2026-11-19' } }).map((d) => d.date),
    ).toEqual(['2026-11-19']);
    expect(
      // Only the 20th's exit counts: one day, no entry fill left in it.
      dayDurations(t, {
        ...ctx,
        range: { from: '2026-11-20', to: '2026-11-20' },
      }),
    ).toEqual({ longest: 0, average: 0 });
  });
});

const stat = (date: string, net: number): DayStat => ({
  date,
  net,
  tradeCount: 1,
  wins: 0,
  losses: 0,
  costBasis: 0,
});

describe('the day figures of the Overview', () => {
  const days = [
    stat('2026-10-30', 300),
    stat('2026-11-02', 900),
    stat('2026-11-03', -200),
    stat('2026-11-04', -600),
    stat('2026-11-05', 0),
  ];
  test('average daily P&L is over every trading day, flat ones too', () => {
    // 400 over five days.
    expect(daySummary(days, ctx).avgDailyPnl).toBe(80);
  });
  test('average daily win/loss is the average green day over the size of the average red day', () => {
    // Green: (300 + 900) / 2 = 600. Red: (-200 - 600) / 2 = -400.
    expect(daySummary(days, ctx).avgWinLoss).toBe(1.5);
  });
  test('it has no value without a green or without a red day', () => {
    expect(daySummary([stat('2026-11-02', 5)], ctx).avgWinLoss).toBeNull();
    expect(daySummary([stat('2026-11-02', -5)], ctx).avgWinLoss).toBeNull();
  });
  test('the largest green and red days are the day with the most won and the most lost', () => {
    const s = daySummary(days, ctx);
    expect(s.largestGreenDay?.date).toBe('2026-11-02');
    expect(s.largestRedDay?.date).toBe('2026-11-04');
  });
  test('a range of only red days has no largest green day', () => {
    const s = daySummary([stat('2026-11-03', -200)], ctx);
    expect(s.largestGreenDay).toBeNull();
    expect(s.largestRedDay?.date).toBe('2026-11-03');
  });
});

describe('monthSummary', () => {
  const days = [
    stat('2026-09-14', 500),
    stat('2026-09-15', 100),
    stat('2026-10-01', -900),
    stat('2026-11-02', 2500),
    stat('2026-11-03', -100),
  ];
  test('names the best and lowest month and averages over the months traded', () => {
    expect(monthSummary(days)).toEqual({
      best: { month: '2026-11', net: 2400 },
      lowest: { month: '2026-10', net: -900 },
      // 2100 over three months.
      average: 700,
      months: 3,
    });
  });
  test('a single month is both the best and the lowest', () => {
    expect(monthSummary([stat('2026-11-02', 50)])).toMatchObject({
      best: { month: '2026-11', net: 50 },
      lowest: { month: '2026-11', net: 50 },
      average: 50,
    });
  });
  test('no days, no months', () => {
    expect(monthSummary([])).toEqual({
      best: null,
      lowest: null,
      average: null,
      months: 0,
    });
  });
});

describe('loggedDays', () => {
  const entry = (
    over: Partial<JournalEntry> & { date?: string },
  ): JournalEntry => ({
    id: Math.random().toString(),
    workspaceId: 'w',
    kind: 'daily-review',
    title: '',
    body: null,
    linkedTradeIds: [],
    tags: [],
    updatedAt: '2026-11-01T00:00:00Z',
    ...over,
  });
  test('counts the days in range that have a daily note, trash left out', () => {
    const entries = [
      entry({ date: '2026-11-02' }),
      entry({ date: '2026-11-03', deletedAt: '2026-11-04T00:00:00Z' }),
      entry({ date: '2026-11-04', kind: 'pre-market' }),
      entry({ date: '2026-11-05' }),
      entry({ date: '2026-10-30' }),
      entry({}),
    ];
    expect(loggedDays(entries, { from: '2026-11-01', to: '2026-11-30' })).toBe(
      2,
    );
    expect(loggedDays(entries, undefined)).toBe(3);
  });
  test('two notes on one day are one logged day', () => {
    expect(
      loggedDays(
        [entry({ date: '2026-11-02' }), entry({ date: '2026-11-02' })],
        undefined,
      ),
    ).toBe(1);
  });
});

describe('the day and month figures under a unit', () => {
  const ticks = { ...ctx, unit: 'ticks' as const };
  // ES: 0.25 a tick, so +2 points is 8 ticks a contract.
  const es = (net: number, exit: number, day: string, qty = 1) =>
    makeTrade({
      net,
      avgEntry: 4500,
      avgExit: exit,
      maxPosition: qty,
      closedAt: `${day}T16:00:00Z`,
    });
  // Mon: +8 ticks for +$100 and -4 for -$10 (net +$90, +4 ticks); Tue -8 for +$5 (lose the sign in money).
  const trades = [
    es(10000, 4502, '2026-10-30'),
    es(-1000, 4499, '2026-10-30'),
    es(-20000, 4496, '2026-11-02', 2),
    es(30000, 4503, '2026-11-03'),
  ];
  test('a day carries its trades ticks, a trade shared by exited size', () => {
    const days = dailyPnl(trades, ticks);
    expect(days.map((d) => [d.date, d.unit])).toEqual([
      ['2026-10-30', 4],
      ['2026-11-02', -32],
      ['2026-11-03', 12],
    ]);
  });
  test('in money a day has no unit value', () => {
    expect(dailyPnl(trades, ctx)[0]).not.toHaveProperty('unit');
  });
  test('the day averages and the largest days read the unit', () => {
    const s = daySummary(dailyPnl(trades, ticks), ticks);
    expect(s.avgDailyPnl).toBeCloseTo((4 - 32 + 12) / 3);
    // Green days 4 and 12 average 8, over the red day of 32.
    expect(s.avgWinLoss).toBeCloseTo(8 / 32);
    expect(s.largestGreenDay?.date).toBe('2026-11-03');
    expect(s.largestRedDay?.date).toBe('2026-11-02');
    expect(s.largestGreenDay?.unit).toBe(12);
  });
  test('the months read the unit', () => {
    expect(monthSummary(dailyPnl(trades, ticks), ticks)).toEqual({
      best: { month: '2026-10', net: 4 },
      lowest: { month: '2026-11', net: -20 },
      average: -8,
      months: 2,
    });
  });
});

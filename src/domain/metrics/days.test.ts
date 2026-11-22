import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { outcomeOf } from '../outcome';
import { defaultMetricContext } from './context';
import {
  avgDailyWinRate,
  dailyPnl,
  dayDurations,
  dayStreaks,
  daySummary,
  type DayStat,
} from './days';
import { buildTrades } from '../trade-builder';
import { resolveInstrument } from '../instruments';
import type { Execution } from '../types';

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
  test('average daily win rate is the mean of each day win rate', () => {
    const t = build([
      // Mon: two wins and a loss
      fill('a1', 'buy', 1, 5000, '2026-11-16T15:00:00Z'),
      fill('a2', 'sell', 1, 5010, '2026-11-16T15:10:00Z'),
      fill('b1', 'buy', 1, 5000, '2026-11-16T16:00:00Z'),
      fill('b2', 'sell', 1, 5010, '2026-11-16T16:10:00Z'),
      fill('c1', 'buy', 1, 5000, '2026-11-16T17:00:00Z'),
      fill('c2', 'sell', 1, 4990, '2026-11-16T17:10:00Z'),
      // Tue: one win
      fill('d1', 'buy', 1, 5000, '2026-11-17T15:00:00Z'),
      fill('d2', 'sell', 1, 5010, '2026-11-17T15:10:00Z'),
    ]);
    expect(avgDailyWinRate(t, ctx)).toBeCloseTo(0.8333, 4);
    expect(avgDailyWinRate([], ctx)).toBeNull();
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

import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import type { Execution, Trade } from '../types';
import { defaultMetricContext } from './context';
import { dailyPnl } from './days';
import { riskRatios } from './risk';
import {
  SERIES_GROUPS,
  SERIES_META,
  SERIES_METRICS,
  seriesUnit,
  timeSeries,
  type SeriesMetric,
} from './series';

const ctx = defaultMetricContext('America/New_York');
const values = (
  trades: readonly Trade[],
  metric: SeriesMetric,
  bucket: 'day' | 'week' | 'month' = 'day',
  mode: 'period' | 'running' = 'period',
  c = ctx,
) => timeSeries(trades, c, metric, bucket, { mode }).map((p) => p.value);

function fill(
  side: 'buy' | 'sell',
  price: number,
  time: string,
  id: string,
): Execution {
  return {
    id,
    accountId: 'a1',
    symbol: 'ESZ5',
    side,
    qty: 1,
    price,
    time,
    fees: 0,
    commission: 0,
  };
}

let serial = 0;
/** A one-contract ES trade: `points` won (or lost) between the two fills. */
function trade(
  day: string,
  from: string,
  to: string,
  points: number,
  direction: 'long' | 'short' = 'long',
): Trade {
  serial += 1;
  const open = `${day}T${from}:00Z`;
  const close = `${day}T${to}:00Z`;
  const entry = 4500;
  const exit = direction === 'long' ? entry + points : entry - points;
  const [first, second]: ['buy' | 'sell', 'buy' | 'sell'] =
    direction === 'long' ? ['buy', 'sell'] : ['sell', 'buy'];
  return makeTrade({
    id: `c${serial}`,
    serial,
    direction,
    openedAt: open,
    closedAt: close,
    avgEntry: entry,
    avgExit: exit,
    net: points * 5000,
    executions: [
      fill(first, entry, open, `${serial}a`),
      fill(second, exit, close, `${serial}b`),
    ],
  });
}

// New York days (EST). Net per day: 5000, 0, 20000, -15000, -5000.
const A = trade('2026-11-02', '15:00', '15:30', 2); // 30 min, win
const B = trade('2026-11-02', '16:00', '17:00', -1); // 60 min, loss
const C = trade('2026-11-03', '15:00', '15:10', 1); // 10 min, win
const D = trade('2026-11-03', '16:00', '16:20', -1, 'short'); // 20 min, loss
const E = trade('2026-11-12', '15:00', '15:45', 4); // 45 min, win
const F = trade('2026-11-13', '15:00', '15:30', -3); // 30 min, loss
const G = trade('2026-11-16', '15:00', '15:15', -1); // 15 min, loss
const all = [A, B, C, D, E, F, G];
const DAYS = [
  '2026-11-02',
  '2026-11-03',
  '2026-11-12',
  '2026-11-13',
  '2026-11-16',
];

describe('the catalogue', () => {
  test('five groups hold every metric once, and each has a label', () => {
    expect(SERIES_GROUPS).toEqual([
      'Profitability',
      'Risk',
      'Time',
      'Activity',
      'Consistency',
    ]);
    expect(new Set(SERIES_METRICS).size).toBe(SERIES_METRICS.length);
    for (const m of SERIES_METRICS) {
      expect(SERIES_GROUPS, m).toContain(SERIES_META[m].group);
      expect(SERIES_META[m].label.length, m).toBeGreaterThan(0);
    }
    const inGroup = (g: string) =>
      SERIES_METRICS.filter((m) => SERIES_META[m].group === g);
    expect(inGroup('Profitability')).toHaveLength(11);
    expect(inGroup('Risk')).toHaveLength(4);
    expect(inGroup('Time')).toHaveLength(4);
    expect(inGroup('Activity')).toHaveLength(9);
    expect(inGroup('Consistency')).toHaveLength(10);
  });
});

describe('per period and running', () => {
  test('the keys are the days with anything in them', () => {
    expect(
      timeSeries(all, ctx, 'avg-hold-time', 'day').map((p) => p.key),
    ).toEqual(DAYS);
  });

  test('average hold time: each day against everything so far', () => {
    expect(values(all, 'avg-hold-time')).toEqual([45, 15, 45, 30, 15]);
    expect(values(all, 'avg-hold-time', 'day', 'running')).toEqual([
      45, 30, 33, 32.5, 30,
    ]);
  });

  test('longest trade', () => {
    expect(values(all, 'longest-trade')).toEqual([60, 20, 45, 30, 15]);
    expect(values(all, 'longest-trade', 'day', 'running')).toEqual([
      60, 60, 60, 60, 60,
    ]);
  });

  test('long and short counts', () => {
    expect(values(all, 'long-trades')).toEqual([2, 1, 1, 1, 1]);
    expect(values(all, 'long-trades', 'day', 'running')).toEqual([
      2, 3, 4, 5, 6,
    ]);
    expect(values(all, 'short-trades', 'day', 'running')).toEqual([
      0, 1, 1, 1, 1,
    ]);
  });

  test('wins, losses and breakevens', () => {
    expect(values(all, 'wins')).toEqual([1, 1, 1, 0, 0]);
    expect(values(all, 'losses', 'day', 'running')).toEqual([1, 2, 2, 3, 4]);
    expect(values(all, 'breakevens')).toEqual([0, 0, 0, 0, 0]);
  });

  test('win rate, and the long win rate counts only longs', () => {
    expect(values(all, 'win-rate')).toEqual([0.5, 0.5, 1, 0, 0]);
    expect(values(all, 'win-rate', 'day', 'running')).toEqual([
      0.5,
      0.5,
      0.6,
      0.5,
      3 / 7,
    ]);
    expect(values(all, 'long-win-rate', 'day', 'running')).toEqual([
      0.5,
      2 / 3,
      3 / 4,
      3 / 5,
      3 / 6,
    ]);
    expect(values(all, 'short-win-rate', 'day')).toEqual([
      null,
      0,
      null,
      null,
      null,
    ]);
  });

  test('average daily net is the mean of the days, by week or running', () => {
    expect(values(all, 'avg-daily-net', 'week')).toEqual([2500, 2500, -5000]);
    expect(values(all, 'avg-daily-net', 'week', 'running')).toEqual([
      2500, 2500, 1000,
    ]);
  });

  test('the share of green days', () => {
    // Week 1: one green, one flat. Week 2: one green, one red.
    expect(values(all, 'green-days', 'week')).toEqual([0.5, 0.5, 0]);
    expect(values(all, 'green-days', 'week', 'running')).toEqual([
      0.5,
      0.5,
      2 / 5,
    ]);
  });

  test('day length: the longest and the average', () => {
    expect(values(all, 'avg-day-length')).toEqual([120, 80, 45, 30, 15]);
    const running = values(all, 'avg-day-length', 'day', 'running');
    expect(running[1]).toBe(100);
    expect(running[2]).toBeCloseTo(245 / 3, 6);
    expect(values(all, 'longest-day', 'day', 'running')).toEqual([
      120, 120, 120, 120, 120,
    ]);
  });

  test('volume counts each trade once, and the average divides by days', () => {
    expect(values(all, 'volume', 'week')).toEqual([4, 2, 1]);
    expect(values(all, 'volume', 'week', 'running')).toEqual([4, 6, 7]);
    expect(values(all, 'avg-daily-volume', 'week')).toEqual([2, 1, 1]);
    expect(values(all, 'avg-daily-volume', 'week', 'running')).toEqual([
      2,
      6 / 4,
      7 / 5,
    ]);
  });

  test('max drawdown by day is the deepest fall, below zero', () => {
    // The peak is carried from the range start: week 3 opens 20,000 under it.
    expect(values(all, 'max-drawdown', 'week')).toEqual([0, -15000, -20000]);
    expect(values(all, 'max-drawdown', 'week', 'running')).toEqual([
      0, -15000, -20000,
    ]);
  });

  test('a period that opens in a drawdown reads it from the peak before it', () => {
    // Equity by day: 5000, 5000, 25000, 10000, 5000, peak 25000 from 11-12.
    expect(values(all, 'max-drawdown', 'day')).toEqual([
      0, 0, 0, -15000, -20000,
    ]);
    expect(values(all, 'avg-drawdown', 'week')).toEqual([null, -15000, -20000]);
    expect(values(all, 'avg-drawdown', 'month')).toEqual([-17500]);
  });

  test('volume counts the open trades the Overview counts', () => {
    const open = makeTrade({
      net: 0,
      status: 'open',
      maxPosition: 3,
      openedAt: '2026-11-16T18:00:00Z',
    });
    expect(values([...all, open], 'volume', 'day', 'running')).toEqual([
      2, 4, 5, 6, 10,
    ]);
    expect(values([...all, open], 'volume', 'day')).toEqual([2, 2, 1, 1, 4]);
    expect(
      values([...all, open], 'avg-daily-volume', 'day', 'running'),
    ).toEqual([2, 2, 5 / 3, 6 / 4, 10 / 5]);
    // An open trade on a day with no exit adds a bucket for volume only.
    const later = makeTrade({
      net: 0,
      status: 'open',
      maxPosition: 1,
      openedAt: '2026-11-18T15:00:00Z',
    });
    expect(timeSeries([...all, later], ctx, 'volume', 'day').at(-1)).toEqual({
      key: '2026-11-18',
      value: 1,
    });
    expect(
      timeSeries([...all, later], ctx, 'win-rate', 'day').map((p) => p.key),
    ).toEqual(DAYS);
  });

  test('average drawdown is the mean of the days under a peak', () => {
    expect(values(all, 'avg-drawdown', 'week', 'running')).toEqual([
      null,
      -15000,
      -17500,
    ]);
  });

  test('streaks run inside a period, or across all of it', () => {
    // Trades in close order: W L W L W L L.
    expect(values(all, 'win-streak', 'week', 'running')).toEqual([1, 1, 1]);
    expect(values(all, 'loss-streak', 'week', 'running')).toEqual([1, 1, 2]);
    expect(values(all, 'loss-streak', 'week')).toEqual([1, 1, 1]);
    // Days: green, flat, green, red, red.
    expect(values(all, 'red-day-streak', 'day', 'running')).toEqual([
      0, 0, 0, 1, 2,
    ]);
    expect(values(all, 'green-day-streak', 'day', 'running')).toEqual([
      1, 1, 2, 2, 2,
    ]);
  });

  test('net runs as a total, and Cumulative P&L is always running', () => {
    expect(values(all, 'net', 'day')).toEqual([5000, 0, 20000, -15000, -5000]);
    expect(values(all, 'net', 'day', 'running')).toEqual([
      5000, 5000, 25000, 10000, 5000,
    ]);
    expect(values(all, 'cumulative-net', 'day', 'period')).toEqual([
      5000, 5000, 25000, 10000, 5000,
    ]);
    expect(SERIES_META['cumulative-net'].running).toBe(true);
  });

  test('profit factor and averages read the trades so far when running', () => {
    expect(values(all, 'avg-win', 'day', 'running')[2]).toBe(
      Math.round((10000 + 5000 + 20000) / 3),
    );
    expect(values(all, 'largest-loss', 'day', 'running')).toEqual([
      -5000, -5000, -5000, -15000, -15000,
    ]);
    expect(values(all, 'largest-win', 'day', 'running')).toEqual([
      10000, 10000, 20000, 20000, 20000,
    ]);
  });

  test('fees add up when running', () => {
    const f1 = makeTrade({
      net: 9000,
      fees: 1000,
      closedAt: '2026-11-02T16:00:00Z',
    });
    const f2 = makeTrade({
      net: 8000,
      fees: 500,
      closedAt: '2026-11-03T16:00:00Z',
    });
    expect(values([f1, f2], 'fees', 'day', 'running')).toEqual([1000, 1500]);
  });

  test('open trades are counted on the day they opened', () => {
    const open = makeTrade({
      net: 0,
      status: 'open',
      openedAt: '2026-11-17T15:00:00Z',
    });
    const series = timeSeries([...all, open], ctx, 'open-trades', 'day');
    expect(series.at(-1)).toEqual({ key: '2026-11-17', value: 1 });
    expect(series.slice(0, -1).every((p) => p.value === 0)).toBe(true);
    // Another metric does not gain the open trade's day.
    expect(
      timeSeries([...all, open], ctx, 'trades', 'day').map((p) => p.key),
    ).toEqual(DAYS);
  });

  test('Sharpe and Sortino read the balance: the same days as riskRatios', () => {
    const start = 1_000_000;
    const days = dailyPnl(all, ctx);
    const sharpe = timeSeries(all, ctx, 'sharpe', 'week', {
      mode: 'running',
      balance: { start, flows: [] },
    });
    expect(sharpe[2]!.value).toBe(riskRatios(days, start).sharpe);
    // A week on its own starts from the balance the earlier days left.
    const week2 = timeSeries(all, ctx, 'sortino', 'week', {
      balance: { start, flows: [] },
    })[1]!.value;
    expect(week2).toBe(
      riskRatios(
        days.filter((d) => d.date >= '2026-11-09' && d.date <= '2026-11-15'),
        start + 5000,
      ).sortino,
    );
    // Without a balance there is nothing to read them on.
    expect(values(all, 'sharpe', 'week', 'running')).toEqual([
      null,
      null,
      null,
    ]);
  });

  test('the date range clips the running total at its start', () => {
    const clipped = { ...ctx, range: { from: '2026-11-12' } };
    expect(values(all, 'long-trades', 'day', 'running', clipped)).toEqual([
      1, 2, 3,
    ]);
  });
});

describe('under a narrowing unit', () => {
  const ticks = { ...ctx, unit: 'ticks' as const };

  test('sums and averages read the unit; costs and drawdown stay money', () => {
    // Day 1: A +8 ticks, B -4 ticks.
    expect(values(all, 'net', 'day', 'period', ticks).slice(0, 2)).toEqual([
      4, 0,
    ]);
    expect(values(all, 'avg-win', 'day', 'running', ticks)[0]).toBe(8);
    expect(values(all, 'avg-loss', 'day', 'running', ticks)[0]).toBe(-4);
    expect(values(all, 'largest-win', 'day', 'running', ticks)[2]).toBe(16);
    expect(values(all, 'expectancy', 'day', 'period', ticks)[0]).toBe(2);
    expect(values(all, 'max-drawdown', 'week', 'running', ticks)[2]).toBe(
      -20000,
    );
    expect(seriesUnit('net', ticks)).toBe('tradeunit');
    expect(seriesUnit('avg-win', ticks)).toBe('tradeunit');
    expect(seriesUnit('max-drawdown', ticks)).toBe('money');
    expect(seriesUnit('fees', ticks)).toBe('money');
    expect(seriesUnit('net', ctx)).toBe('money');
    expect(seriesUnit('win-rate', ticks)).toBe('pct');
  });

  test('balance-based figures are empty', () => {
    const series = timeSeries(all, ticks, 'sharpe', 'week', {
      mode: 'running',
      balance: { start: 1_000_000, flows: [] },
    });
    expect(series.map((p) => p.value)).toEqual([null, null, null]);
  });
});

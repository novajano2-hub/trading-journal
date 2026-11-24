import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import type { Execution, Trade } from '../types';
import { defaultMetricContext } from './context';
import { dailyPnl, daySummary } from './days';
import { riskRatios } from './risk';
import { averageTradePnl } from './summary';
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
    expect(inGroup('Profitability')).toHaveLength(13);
    expect(inGroup('Risk')).toHaveLength(7);
    expect(inGroup('Time')).toHaveLength(4);
    expect(inGroup('Activity')).toHaveLength(19);
    expect(inGroup('Consistency')).toHaveLength(11);
  });

  /**
   * TradeZella's 55 picker entries (inventory-2, S33) against Keel's ids, each
   * in the group TradeZella files it under. Only the two averages of the price
   * path inside a trade (MAE and MFE) are not here: they need market data
   * (backlog 14).
   */
  const TRADEZELLA: Record<string, [SeriesMetric, string]> = {
    // Profitability
    'Avg daily net P&L': ['avg-daily-net', 'Profitability'],
    'Avg daily win/loss': ['avg-daily-win-loss', 'Profitability'],
    'Avg loss': ['avg-loss', 'Profitability'],
    'Avg net trade P&L': ['avg-trade', 'Profitability'],
    'Avg trade win/loss': ['win-loss-ratio', 'Profitability'],
    'Avg win': ['avg-win', 'Profitability'],
    'Daily net P&L': ['net', 'Profitability'],
    'Largest losing trade': ['largest-loss', 'Profitability'],
    'Largest profitable trade': ['largest-win', 'Profitability'],
    'Net P&L': ['cumulative-net', 'Profitability'],
    'Profit factor': ['profit-factor', 'Profitability'],
    'Trade expectancy': ['expectancy', 'Profitability'],
    // Risk & Drawdown
    'Avg daily net drawdown': ['avg-drawdown', 'Risk'],
    'Avg planned R-multiple': ['avg-planned-r', 'Risk'],
    'Avg realized R-multiple': ['avg-realized-r', 'Risk'],
    'Breakeven days': ['flat-day-count', 'Risk'],
    'Breakeven trades': ['breakevens', 'Risk'],
    'Losing days': ['red-day-count', 'Risk'],
    'Max daily net drawdown': ['max-drawdown', 'Risk'],
    // Time Analysis
    'Average trading days duration': ['avg-day-length', 'Time'],
    'Avg hold time': ['avg-hold-time', 'Time'],
    'Longest trade duration': ['longest-trade', 'Time'],
    'Max trading days duration': ['longest-day', 'Time'],
    // Trading Activity & Volume
    'Avg daily volume': ['avg-daily-volume', 'Activity'],
    'Daily net drawdown': ['daily-drawdown', 'Activity'],
    'Logged days': ['logged-days', 'Activity'],
    'Longs # of breakeven trades': ['long-breakevens', 'Activity'],
    'Longs # of losing trades': ['long-losses', 'Activity'],
    'Longs # of open trades': ['long-open', 'Activity'],
    'Longs # of trades': ['long-trades', 'Activity'],
    'Longs # of winning trades': ['long-wins', 'Activity'],
    'Loss # of trades': ['losses', 'Activity'],
    'Net account balance': ['net-balance', 'Activity'],
    'Open trades': ['open-trades', 'Activity'],
    'Shorts # of breakeven trades': ['short-breakevens', 'Activity'],
    'Shorts # of losing trades': ['short-losses', 'Activity'],
    'Shorts # of open trades': ['short-open', 'Activity'],
    'Shorts # of trades': ['short-trades', 'Activity'],
    'Shorts # of winning trades': ['short-wins', 'Activity'],
    'Trade count': ['trades', 'Activity'],
    Volume: ['volume', 'Activity'],
    'Win # of trades': ['wins', 'Activity'],
    // Streaks & Consistency
    'Avg daily win %': ['green-days', 'Consistency'],
    'Longs win %': ['long-win-rate', 'Consistency'],
    'Max consecutive losing days': ['red-day-streak', 'Consistency'],
    'Max consecutive losses': ['loss-streak', 'Consistency'],
    'Max consecutive winning days': ['green-day-streak', 'Consistency'],
    'Max consecutive wins': ['win-streak', 'Consistency'],
    'Sharpe ratio': ['sharpe', 'Consistency'],
    'Shorts win %': ['short-win-rate', 'Consistency'],
    'Sortino ratio': ['sortino', 'Consistency'],
    'Win %': ['win-rate', 'Consistency'],
    'Winning days': ['green-day-count', 'Consistency'],
  };

  test('the catalogue holds every TradeZella metric but the two that need market data', () => {
    // 55 entries, less Avg max trade profit and Avg max trade loss.
    expect(Object.keys(TRADEZELLA)).toHaveLength(53);
    const ids = Object.values(TRADEZELLA).map(([id]) => id);
    expect(new Set(ids).size).toBe(53);
    for (const [name, [id, group]] of Object.entries(TRADEZELLA)) {
      expect(SERIES_METRICS, name).toContain(id);
      // Every metric sits in the group TradeZella files it under.
      expect(SERIES_META[id].group, name).toBe(group);
    }
    // Keel keeps one of its own: the fees.
    expect(SERIES_METRICS.filter((m) => !ids.includes(m)).sort()).toEqual([
      'fees',
    ]);
  });

  test('balance and drawdown stay in money under a unit, and the sums and averages follow it', () => {
    const t = { ...ctx, unit: 'ticks' as const };
    // Balances and drawdowns stay in money; a balance reads without a sign.
    expect(seriesUnit('net-balance', t)).toBe('balance');
    expect(seriesUnit('daily-drawdown', t)).toBe('money');
    expect(seriesUnit('avg-trade', t)).toBe('tradeunit');
    expect(seriesUnit('avg-trade', ctx)).toBe('money');
    expect(seriesUnit('green-day-count', t)).toBe('count');
    expect(seriesUnit('logged-days', t)).toBe('count');
  });
});

describe('the new metrics', () => {
  test('average trade P&L is the mean of every closed trade, breakevens included', () => {
    expect(values(all, 'avg-trade')).toEqual([2500, 0, 20000, -15000, -5000]);
    expect(values(all, 'avg-trade', 'day', 'running')).toEqual([
      2500, 1250, 5000, 1667, 714,
    ]);
    const flat = makeTrade({
      net: 0,
      closedAt: '2026-11-02T18:00:00Z',
      serial: 99,
    });
    expect(values([...all, flat], 'avg-trade')[0]).toBe(1667);
    // The Overview's number: the basis P&L over the closed trades.
    expect(values(all, 'avg-trade', 'month')[0]).toBe(Math.round(5000 / 7));
  });

  test('average trade P&L rounds half to even, as the one shared function does', () => {
    // 1 and 4 cents: 2.5 rounds to 2 (half-even), where Math.round says 3.
    const cents = [
      makeTrade({ net: 1, closedAt: '2026-11-02T18:00:00Z', serial: 90 }),
      makeTrade({ net: 4, closedAt: '2026-11-02T19:00:00Z', serial: 91 }),
    ];
    expect(values(cents, 'avg-trade')[0]).toBe(averageTradePnl(5, 2));
    expect(averageTradePnl(5, 2)).toBe(2);
    expect(averageTradePnl(7, 2)).toBe(4);
    expect(averageTradePnl(0, 0)).toBeNull();
  });

  test('in a unit it is the mean of the trades own ticks', () => {
    const ticks = { ...ctx, unit: 'ticks' as const };
    // Day 1: A +8 ticks, B -4 ticks.
    expect(values(all, 'avg-trade', 'day', 'period', ticks)[0]).toBe(2);
  });

  test('winning, losing and breakeven days are counts of the days', () => {
    expect(values(all, 'green-day-count')).toEqual([1, 0, 1, 0, 0]);
    expect(values(all, 'red-day-count')).toEqual([0, 0, 0, 1, 1]);
    expect(values(all, 'flat-day-count')).toEqual([0, 1, 0, 0, 0]);
    expect(values(all, 'green-day-count', 'week')).toEqual([1, 1, 0]);
    expect(values(all, 'red-day-count', 'week', 'running')).toEqual([0, 1, 2]);
    expect(values(all, 'flat-day-count', 'week', 'running')).toEqual([1, 1, 1]);
    // They are the Overview's counts.
    const s = daySummary(dailyPnl(all, ctx), ctx);
    expect(values(all, 'green-day-count', 'month')[0]).toBe(s.greenDays);
    expect(values(all, 'red-day-count', 'month')[0]).toBe(s.redDays);
    expect(values(all, 'flat-day-count', 'month')[0]).toBe(s.flatDays);
  });

  test('the daily drawdown is where the period closes, against the peak so far', () => {
    expect(values(all, 'daily-drawdown')).toEqual([0, 0, 0, -15000, -20000]);
    expect(values(all, 'daily-drawdown', 'week')).toEqual([0, -15000, -20000]);
    expect(values(all, 'daily-drawdown', 'month')).toEqual([-20000]);
    expect(SERIES_META['daily-drawdown'].running).toBe(true);
  });

  test('long and short trades by outcome and open', () => {
    expect(values(all, 'long-wins')).toEqual([1, 1, 1, 0, 0]);
    expect(values(all, 'long-losses')).toEqual([1, 0, 0, 1, 1]);
    expect(values(all, 'short-losses')).toEqual([0, 1, 0, 0, 0]);
    expect(values(all, 'short-wins')).toEqual([0, 0, 0, 0, 0]);
    expect(values(all, 'long-wins', 'day', 'running')).toEqual([1, 2, 3, 3, 3]);
    expect(values(all, 'long-breakevens')).toEqual([0, 0, 0, 0, 0]);
    const flat = makeTrade({
      net: 0,
      direction: 'short',
      closedAt: '2026-11-02T18:00:00Z',
      serial: 98,
    });
    expect(values([...all, flat], 'short-breakevens')[0]).toBe(1);
    expect(values([...all, flat], 'long-breakevens')[0]).toBe(0);
    // Each long and short count adds to the trades.
    for (const key of ['wins', 'losses', 'breakevens'] as const) {
      const long = values(all, `long-${key}` as SeriesMetric);
      const short = values(all, `short-${key}` as SeriesMetric);
      const total = values(all, key);
      expect(long.map((v, i) => v! + short[i]!)).toEqual(total);
    }
  });

  test('open trades split by side, on the day they opened', () => {
    const open = (direction: 'long' | 'short', id: string) =>
      makeTrade({
        id,
        net: 0,
        status: 'open',
        direction,
        openedAt: '2026-11-17T15:00:00Z',
      });
    const set = [
      ...all,
      open('long', 'o1'),
      open('short', 'o2'),
      open('short', 'o3'),
    ];
    expect(timeSeries(set, ctx, 'long-open', 'day').at(-1)).toEqual({
      key: '2026-11-17',
      value: 1,
    });
    expect(timeSeries(set, ctx, 'short-open', 'day').at(-1)).toEqual({
      key: '2026-11-17',
      value: 2,
    });
    expect(timeSeries(set, ctx, 'open-trades', 'day').at(-1)!.value).toBe(3);
  });

  test('the net account balance is the opening balance, the flows and the net so far', () => {
    const balance = { start: 1_000_000, flows: [] };
    const at = (opts: Parameters<typeof timeSeries>[4], c = ctx) =>
      timeSeries(all, c, 'net-balance', 'day', opts).map((p) => p.value);
    expect(at({ balance })).toEqual([
      1_005_000, 1_005_000, 1_025_000, 1_010_000, 1_005_000,
    ]);
    expect(
      at({
        balance: {
          start: 1_000_000,
          flows: [{ date: '2026-11-03', amount: 100_000 }],
        },
      }),
    ).toEqual([1_005_000, 1_105_000, 1_125_000, 1_110_000, 1_105_000]);
    // The close of a week, and always the running value.
    expect(
      timeSeries(all, ctx, 'net-balance', 'week', { balance }).map(
        (p) => p.value,
      ),
    ).toEqual([1_005_000, 1_010_000, 1_005_000]);
    expect(SERIES_META['net-balance'].running).toBe(true);
    // A deposit after the last trade gets its own point, so the line ends on the balance.
    const trailing = timeSeries(all, ctx, 'net-balance', 'day', {
      balance: {
        start: 1_000_000,
        flows: [{ date: '2026-11-30', amount: 100_000 }],
      },
    });
    expect(trailing.at(-1)).toEqual({ key: '2026-11-30', value: 1_105_000 });
    // A flow outside the date range is not a point.
    const clipped = timeSeries(
      all,
      { ...ctx, range: { from: '2026-11-01', to: '2026-11-20' } },
      'net-balance',
      'day',
      {
        balance: {
          start: 1_000_000,
          flows: [{ date: '2026-11-30', amount: 100_000 }],
        },
      },
    );
    expect(clipped.at(-1)!.key).toBe('2026-11-16');
    // No balance to read it on, or a unit: no value.
    expect(at({})).toEqual([null, null, null, null, null]);
    expect(at({ balance }, { ...ctx, unit: 'ticks' })).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  test('logged days count the days with a daily note, per period or running', () => {
    const loggedDates = ['2026-11-02', '2026-11-10', '2026-11-12'];
    const series = (
      mode: 'period' | 'running',
      bucket: 'day' | 'week' = 'day',
    ) => timeSeries(all, ctx, 'logged-days', bucket, { mode, loggedDates });
    // A day with a note and no trade has its own period.
    expect(series('period').map((p) => [p.key, p.value])).toEqual([
      ['2026-11-02', 1],
      ['2026-11-03', 0],
      ['2026-11-10', 1],
      ['2026-11-12', 1],
      ['2026-11-13', 0],
      ['2026-11-16', 0],
    ]);
    expect(series('running').map((p) => p.value)).toEqual([1, 1, 2, 3, 3, 3]);
    expect(series('period', 'week').map((p) => p.value)).toEqual([1, 2, 0]);
    // The date range clips them, and with no journal there is nothing to count.
    expect(
      timeSeries(
        all,
        { ...ctx, range: { from: '2026-11-11' } },
        'logged-days',
        'day',
        {
          loggedDates,
        },
      ).map((p) => p.value),
    ).toEqual([1, 0, 0]);
    expect(
      timeSeries(all, ctx, 'logged-days', 'day').every((p) => p.value === null),
    ).toBe(true);
  });
});

describe('average daily win/loss', () => {
  test('is the Overview figure: the average green day over the average red day', () => {
    // Greens 5000 and 20000 average 12500; reds -15000 and -5000 average -10000.
    expect(values(all, 'avg-daily-win-loss', 'month')).toEqual([1.25]);
    expect(SERIES_META['avg-daily-win-loss']).toMatchObject({
      group: 'Profitability',
      unit: 'moneyratio',
    });
  });

  test('is empty until a period has both a green and a red day, and reads on running', () => {
    // A day alone has one colour; the flat day has none.
    expect(values(all, 'avg-daily-win-loss')).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    const running = values(all, 'avg-daily-win-loss', 'day', 'running');
    expect(running.slice(0, 3)).toEqual([null, null, null]);
    expect(running[3]).toBeCloseTo(12500 / 15000);
    expect(running[4]).toBeCloseTo(1.25);
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

  test('volume shares a trade held over two days among its exit days, as the Calendar does (I3)', () => {
    const held = makeTrade({
      id: 'held',
      net: 0,
      maxPosition: 2,
      openedAt: '2026-11-17T15:00:00Z',
      closedAt: '2026-11-18T15:00:00Z',
      executions: [
        { ...fill('buy', 4500, '2026-11-17T15:00:00Z', 'h1'), qty: 2 },
        fill('sell', 4501, '2026-11-17T16:00:00Z', 'h2'),
        fill('sell', 4499, '2026-11-18T15:00:00Z', 'h3'),
      ],
    });
    const series = timeSeries([held], ctx, 'volume', 'day');
    expect(series).toEqual([
      { key: '2026-11-17', value: 1 },
      { key: '2026-11-18', value: 1 },
    ]);
    // One trading day each: the average is the same split.
    expect(values([held], 'avg-daily-volume')).toEqual([1, 1]);
    // A partly exited open trade: its exit day gets what it closed, its open day the rest.
    const open = makeTrade({
      id: 'open',
      net: 0,
      status: 'open',
      maxPosition: 3,
      openedAt: '2026-11-17T15:00:00Z',
      executions: [
        { ...fill('buy', 4500, '2026-11-17T15:00:00Z', 'o1'), qty: 3 },
        fill('sell', 4501, '2026-11-18T16:00:00Z', 'o2'),
      ],
    });
    expect(timeSeries([open], ctx, 'volume', 'day')).toEqual([
      { key: '2026-11-17', value: 2 },
      { key: '2026-11-18', value: 1 },
    ]);
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

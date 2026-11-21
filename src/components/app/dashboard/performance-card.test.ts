import { expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { defaultMetricContext } from '@/domain/metrics/context';
import { dailyPnl } from '@/domain/metrics/days';
import { equityCurve } from '@/domain/metrics/equity';
import { summarize } from '@/domain/metrics/summary';
import type { Trade } from '@/domain/types';
import { equityLine, kpiTrends, trendWindow } from './performance-card';

const ctx = defaultMetricContext('America/New_York');

/** `n` closed trades, one a minute from 15:00 UTC on 2 Mar, `perDay` to a day. */
function trades(n: number, net: (i: number) => number, perDay = n): Trade[] {
  return Array.from({ length: n }, (_, i) => {
    const at = new Date(
      Date.UTC(2026, 2, 2 + Math.floor(i / perDay), 15, i % perDay),
    );
    return makeTrade({
      net: net(i),
      serial: i + 1,
      openedAt: at.toISOString(),
      closedAt: new Date(at.getTime() + 30_000).toISOString(),
    });
  });
}

test('the trend window is 20 closed trades, or an eighth of the range when that is more', () => {
  expect(trendWindow(0)).toBe(20);
  expect(trendWindow(160)).toBe(20);
  expect(trendWindow(161)).toBe(21);
  expect(trendWindow(2000)).toBe(250);
});

test('no trend until a range holds more closed trades than one window', () => {
  const wins = (n: number) =>
    kpiTrends(
      trades(n, () => 100),
      ctx,
    );
  for (const n of [0, 5, 19, 20]) expect(wins(n).winRate).toEqual([]);
  expect(wins(21).window).toBe(20);
  expect(wins(21).winRate).toEqual([1, 1]);
});

test('each point is the metric over the trailing window, from the first full one to the last trade', () => {
  // Wins for the first 100 trades, then losses: a whole-range figure would stay near 50%.
  const all = trades(200, (i) => (i < 100 ? 100 : -100));
  const t = kpiTrends(all, ctx);
  expect(t.window).toBe(25);
  expect(t.winRate).toHaveLength(24);
  expect(t.winRate[0]).toBe(1);
  expect(t.winRate.at(-1)).toBe(0);
  // The last point is the last window, not the range's figure beside it.
  expect(summarize(all, ctx).winRate).toBe(0.5);
  expect(t.expectancy.at(-1)).toBe(summarize(all.slice(-25), ctx).expectancy);
  // No losses in the early windows: profit factor skips them.
  expect(t.profitFactor.length).toBeLessThan(24);
});

test('the equity line is the start, then each trading day’s close, ending on the last balance', () => {
  const all = trades(30, (i) => (i % 3 === 0 ? -250 : 175), 10);
  const curve = equityCurve(all, 5_000_000, ctx);
  const equity = [5_000_000, ...curve.map((p) => p.equity)];
  const line = equityLine(equity, dailyPnl(all, ctx));
  expect(line.daily).toBe(true);
  expect(line.points).toEqual([5_000_000, equity[10], equity[20], equity[30]]);
  expect(line.points.at(-1)).toBe(equity.at(-1));
});

test('a range of one trading day keeps a point per closed trade', () => {
  const all = trades(5, () => 100);
  const equity = [1_000, ...equityCurve(all, 1_000, ctx).map((p) => p.equity)];
  expect(equityLine(equity, dailyPnl(all, ctx))).toEqual({
    points: equity,
    daily: false,
  });
});

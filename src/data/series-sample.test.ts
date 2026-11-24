import { describe, expect, test } from 'vitest';
import { timeSeries, type SeriesMetric } from '../domain/metrics/series';
import { defaultPrefs } from './repository';
import { applyFilters, EMPTY_FILTERS, narrowToUnit } from './filters';
import { metricContextOf, metricsByCurrency } from './metrics';
import { generateSampleWorkspace, SAMPLE_SEED } from './seed/generate';

/** The catalogue's series on the sample TradeZella imported (Futures live), against the figures the metrics bundle gives. */
const ws = generateSampleWorkspace({
  seed: SAMPLE_SEED,
  endDate: '2026-11-20',
});
const env = {
  timeZone: 'America/New_York',
  today: '2026-11-21',
  accounts: ws.accounts,
};
const trades = narrowToUnit(
  applyFilters(
    ws.trades,
    { ...EMPTY_FILTERS, accountIds: ['sample-futures'] },
    env,
  ),
  'dollar',
);
const ctx = metricContextOf({
  ...defaultPrefs(),
  timeZone: 'America/New_York',
  displayUnit: 'dollar',
});
const m = metricsByCurrency(trades, {
  accounts: ws.accounts,
  ctx,
  baseCurrency: 'USD',
})[0]!;
const last = (
  metric: SeriesMetric,
  bucket: 'day' | 'week' | 'month' = 'week',
) =>
  timeSeries(trades, ctx, metric, bucket, {
    mode: 'running',
    balance: { start: m.riskStart, flows: m.riskFlows },
  }).at(-1)!.value;

describe('the last running value is the figure of the whole range', () => {
  test('profitability', () => {
    expect(last('net')).toBe(m.summary.netPnl);
    expect(last('avg-win')).toBe(m.summary.avgWin);
    expect(last('avg-loss')).toBe(m.summary.avgLoss);
    expect(last('expectancy')).toBe(m.summary.expectancy);
    expect(last('profit-factor')).toBe(m.summary.profitFactor);
    expect(last('largest-win')).toBe(m.summary.largestWin);
    expect(last('avg-daily-net')).toBe(m.daySummary.avgDailyPnl);
    expect(last('fees')).toBe(m.summary.fees);
  });

  test('risk: average drawdown is the pin, -$580.81, and the max is -$2,168.55', () => {
    expect(last('avg-drawdown')).toBe(-58081);
    expect(last('max-drawdown')).toBe(-216855);
  });

  test('activity and time', () => {
    expect(last('volume')).toBe(1169 - openVolume());
    expect(last('trades')).toBe(m.summary.closedCount);
    expect(last('avg-hold-time')).toBeCloseTo(m.holds.all!, 8);
    expect(last('longest-day')).toBe(m.dayDurations.longest);
    expect(last('avg-day-length')).toBeCloseTo(m.dayDurations.average!, 8);
  });

  test('consistency: the daily win rate is 58.82% and the ratios match the bundle', () => {
    expect(last('green-days')).toBeCloseTo(70 / 119, 10);
    expect(last('win-rate')).toBe(m.summary.winRate);
    expect(last('win-streak')).toBe(m.tradeStreaks.maxWin);
    expect(last('red-day-streak')).toBe(m.dayStreaks.maxLoss);
    expect(last('sharpe')).toBe(m.risk.sharpe);
    expect(last('sortino')).toBe(m.risk.sortino);
  });
});

/** The bundle's volume counts the two open trades too; the series counts closed trades. */
function openVolume(): number {
  return trades
    .filter((t) => t.status !== 'closed')
    .reduce((n, t) => n + t.maxPosition, 0);
}

test('three running metrics over a year of days stay inside the budget', () => {
  const t0 = performance.now();
  for (const metric of ['win-rate', 'avg-win', 'long-win-rate'] as const)
    timeSeries(trades, ctx, metric, 'day', { mode: 'running' });
  expect(performance.now() - t0).toBeLessThan(450);
});

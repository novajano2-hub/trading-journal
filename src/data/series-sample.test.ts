import { describe, expect, test } from 'vitest';
import type { MetricContext } from '../domain/metrics/context';
import {
  bucketSpan,
  timeSeries,
  type SeriesMetric,
} from '../domain/metrics/series';
import { tradeStreaks } from '../domain/metrics/streaks';
import { classify } from '../domain/metrics/context';
import {
  expectancyIn,
  holdTimes,
  largestInUnit,
  longestHold,
  summarize,
} from '../domain/metrics/summary';
import { unitOf } from '../domain/metrics/units';
import { localDate } from '../domain/time';
import { isClosed } from '../domain/trade-status';
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
    // As the Overview counts it: every trade matched, the two open ones too.
    expect(last('volume')).toBe(1169);
    expect(last('volume')).toBe(m.volume);
    expect(last('avg-daily-volume')).toBeCloseTo(m.avgDailyVolume!, 10);
    expect(last('avg-daily-volume')!.toFixed(2)).toBe('9.82');
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

describe('running values equal a summary of everything so far', () => {
  const closed = trades.filter(isClosed);
  const weeks = timeSeries(trades, ctx, 'trades', 'week').map((p) => p.key);
  const upTo = (key: string, c: MetricContext) =>
    closed.filter(
      (t) => localDate(t.closedAt, c.timeZone) <= bucketSpan(key, 'week').to,
    );
  const unitCtx = { ...ctx, unit: 'ticks' as const };
  test.each([
    ['dollar', ctx, trades],
    ['ticks', unitCtx, narrowToUnit(trades, 'ticks')],
  ] as const)('in %s, at every week', (_name, c, set) => {
    const inUnit = c.unit !== undefined;
    for (const key of weeks) {
      const sum = summarize(upTo(key, c), c);
      const at = (metric: SeriesMetric) =>
        timeSeries(set, c, metric, 'week', { mode: 'running' }).find(
          (p) => p.key === key,
        )?.value;
      expect(at('win-rate')).toBe(sum.winRate);
      expect(at('profit-factor')).toBe(sum.profitFactor);
      expect(at('win-loss-ratio')).toBe(sum.winLossRatio);
      expect(at('wins')).toBe(sum.wins);
      expect(at('losses')).toBe(sum.losses);
      expect(at('breakevens')).toBe(sum.breakevens);
      expect(at('avg-realized-r')).toBe(sum.avgRealizedR);
      expect(at('avg-planned-r')).toBe(sum.avgPlannedR);
      expect(at('trades')).toBe(sum.closedCount);
      expect(at('avg-hold-time')).toBeCloseTo(
        holdTimes(upTo(key, c), c).all!,
        8,
      );
      expect(at('longest-trade')).toBe(longestHold(upTo(key, c)));
      expect(at('win-streak')).toBe(tradeStreaks(upTo(key, c), c).maxWin);
      expect(at('loss-streak')).toBe(tradeStreaks(upTo(key, c), c).maxLoss);
      if (!inUnit) {
        expect(at('avg-win')).toBe(sum.avgWin);
        expect(at('avg-loss')).toBe(sum.avgLoss);
        expect(at('expectancy')).toBe(sum.expectancy);
        expect(at('largest-win')).toBe(sum.largestWin);
        expect(at('largest-loss')).toBe(sum.largestLoss);
      } else {
        // In the unit, the same figures from the trades' own values: the
        // expectancy is the one every page reads, over the decided trades.
        const so = upTo(key, c);
        const of = (o: 'win' | 'loss') =>
          so.flatMap((t) =>
            classify(t, c).outcome === o
              ? (unitOf(t, 'ticks', c.pnlBasis) ?? [])
              : [],
          );
        const mean = (xs: number[]) =>
          xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
        const close = (v: number | null | undefined, want: number | null) =>
          want === null ? expect(v).toBeNull() : expect(v).toBeCloseTo(want, 9);
        close(at('expectancy'), expectancyIn(so, c, 'ticks'));
        close(at('avg-win'), mean(of('win')));
        close(at('avg-loss'), mean(of('loss')));
        const best = largestInUnit(so, c, 'win');
        const worst = largestInUnit(so, c, 'loss');
        close(
          at('largest-win'),
          best ? unitOf(best, 'ticks', c.pnlBasis) : null,
        );
        close(
          at('largest-loss'),
          worst ? unitOf(worst, 'ticks', c.pnlBasis) : null,
        );
      }
    }
  });
});

describe('Futures live in Ticks, as TradeZella read it', () => {
  const tctx = metricContextOf({
    ...defaultPrefs(),
    timeZone: 'America/New_York',
    displayUnit: 'ticks',
  });
  const set = narrowToUnit(trades, 'ticks');
  const lastIn = (metric: SeriesMetric) =>
    timeSeries(set, tctx, metric, 'week', { mode: 'running' }).at(-1)!.value;
  test('574 trades, +8,495 ticks, average win 109.09, average loss -81.38', () => {
    // 572 closed and 2 open.
    expect(lastIn('trades')).toBe(572);
    expect(lastIn('open-trades')).toBe(2);
    expect(lastIn('net')).toBeCloseTo(8495, 6);
    expect(lastIn('avg-win')).toBeCloseTo(109.09, 2);
    expect(lastIn('avg-loss')).toBeCloseTo(-81.38, 2);
    expect(lastIn('profit-factor')).toBeCloseTo(1.3689, 4);
    expect(lastIn('sharpe')).toBeNull();
  });
});

test('three heavy running metrics by day recompute inside the budget (median of 5 warm runs)', () => {
  // The full sample, one currency, the date range as the report holds it.
  const all = ws.trades.filter((t) => t.pnlCurrency === 'USD');
  const c = { ...ctx, range: { to: '2026-11-20' } };
  const balance = { start: m.riskStart, flows: m.riskFlows };
  const run = () => {
    for (const metric of ['sharpe', 'avg-drawdown', 'win-streak'] as const)
      timeSeries(all, c, metric, 'day', { mode: 'running', balance });
  };
  run(); // warm-up
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    run();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  // The 50 ms budget with a 3x margin, so a loaded machine running the whole
  // gate does not fail it (the deterministic-gate ruling, as metrics.test.ts).
  expect(times[2]!).toBeLessThan(150);
});

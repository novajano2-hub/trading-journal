import { localDate } from '../time';
import { closedInOrder } from '../trade-status';
import type { Trade } from '../types';
import { inRange, type MetricContext } from './context';
import { dailyPnl } from './days';
import { sizedRealizations } from './realized';
import { summarize } from './summary';

export type SeriesMetric =
  | 'net'
  | 'cumulative-net'
  | 'win-rate'
  | 'profit-factor'
  | 'expectancy'
  | 'avg-win'
  | 'avg-loss'
  | 'trades'
  | 'fees';

export type Bucket = 'day' | 'week' | 'month';

/** How a metric's values read: cents, a 0..1 share, a plain ratio or a count. */
export type SeriesUnit = 'money' | 'pct' | 'ratio' | 'count';

export const SERIES_METRICS: readonly SeriesMetric[] = [
  'net',
  'cumulative-net',
  'win-rate',
  'profit-factor',
  'expectancy',
  'avg-win',
  'avg-loss',
  'trades',
  'fees',
];

export const SERIES_META: Record<
  SeriesMetric,
  { label: string; unit: SeriesUnit; kind: 'bar' | 'line' }
> = {
  net: { label: 'Net P&L', unit: 'money', kind: 'bar' },
  'cumulative-net': { label: 'Cumulative P&L', unit: 'money', kind: 'line' },
  'win-rate': { label: 'Win rate', unit: 'pct', kind: 'line' },
  'profit-factor': { label: 'Profit factor', unit: 'ratio', kind: 'line' },
  expectancy: { label: 'Expectancy', unit: 'money', kind: 'bar' },
  'avg-win': { label: 'Average win', unit: 'money', kind: 'bar' },
  'avg-loss': { label: 'Average loss', unit: 'money', kind: 'bar' },
  trades: { label: 'Trades', unit: 'count', kind: 'bar' },
  fees: { label: 'Fees', unit: 'money', kind: 'bar' },
};

export interface SeriesPoint {
  key: string;
  value: number | null;
}

/** The bucket a local date falls in: itself, the Monday of its week, or its month. */
export function bucketKey(date: string, bucket: Bucket): string {
  if (bucket === 'day') return date;
  if (bucket === 'month') return date.slice(0, 7);
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/**
 * One metric over time, a point per bucket that has anything in it, ascending.
 *
 * Money booked by exit (net, cumulative net, fees) goes on the local date of each
 * exit fill, as the calendar books it; the trade-level metrics (win rate, profit
 * factor, expectancy, averages, trade count) go on the local date a trade closed.
 * Pass the trades with every filter but the date, and the date range in
 * `ctx.range`: both kinds then count only what is dated inside it. A bucket with
 * exits but no trade closed in it has no win rate (null); trades and fees are 0.
 * The input must be a single-currency set.
 */
export function timeSeries(
  trades: readonly Trade[],
  ctx: MetricContext,
  metric: SeriesMetric,
  bucket: Bucket,
): SeriesPoint[] {
  const booked = new Map<string, number>();
  const fees = new Map<string, number>();
  for (const d of dailyPnl(trades, ctx)) {
    const key = bucketKey(d.date, bucket);
    booked.set(key, (booked.get(key) ?? 0) + d.net);
  }
  if (metric === 'fees')
    for (const t of trades)
      for (const r of sizedRealizations(t)) {
        const date = localDate(r.time, ctx.timeZone);
        if (!inRange(date, ctx.range)) continue;
        const key = bucketKey(date, bucket);
        fees.set(key, (fees.get(key) ?? 0) + r.fees);
      }
  const closed = new Map<string, Trade[]>();
  for (const t of closedInOrder(trades)) {
    const date = localDate(t.closedAt, ctx.timeZone);
    if (!inRange(date, ctx.range)) continue;
    const key = bucketKey(date, bucket);
    const list = closed.get(key);
    if (list) list.push(t);
    else closed.set(key, [t]);
  }

  const keys = [
    ...new Set([...booked.keys(), ...fees.keys(), ...closed.keys()]),
  ].sort();
  let running = 0;
  return keys.map((key): SeriesPoint => {
    const group = closed.get(key);
    const summary = group ? summarize(group, ctx) : undefined;
    switch (metric) {
      case 'net':
        return { key, value: booked.get(key) ?? 0 };
      case 'cumulative-net':
        running += booked.get(key) ?? 0;
        return { key, value: running };
      case 'fees':
        return { key, value: fees.get(key) ?? 0 };
      case 'trades':
        return { key, value: group?.length ?? 0 };
      case 'win-rate':
        return { key, value: summary?.winRate ?? null };
      case 'profit-factor':
        return { key, value: summary?.profitFactor ?? null };
      case 'expectancy':
        return { key, value: summary?.expectancy ?? null };
      case 'avg-win':
        return { key, value: summary?.avgWin ?? null };
      case 'avg-loss':
        return { key, value: summary?.avgLoss ?? null };
    }
  });
}

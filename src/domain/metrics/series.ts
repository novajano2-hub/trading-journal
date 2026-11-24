import { localDate } from '../time';
import { closedInOrder, isClosed } from '../trade-status';
import type { Cents, Trade } from '../types';
import { classify, inRange, type MetricContext } from './context';
import {
  dailyPnl,
  dayLengths,
  daySummary,
  dayStreaks,
  dayValue,
  type DayStat,
} from './days';
import { avgDrawdown, maxDrawdown } from './equity';
import { sizedRealizations } from './realized';
import { riskRatios } from './risk';
import { tradeStreaks } from './streaks';
import {
  holdTimes,
  largestInUnit,
  longestHold,
  summarize,
  volumeOf,
  type Summary,
} from './summary';
import { unitOf } from './units';

export type SeriesMetric =
  // Profitability
  | 'net'
  | 'cumulative-net'
  | 'avg-daily-net'
  | 'avg-win'
  | 'avg-loss'
  | 'win-loss-ratio'
  | 'expectancy'
  | 'largest-win'
  | 'largest-loss'
  | 'profit-factor'
  | 'fees'
  // Risk
  | 'avg-planned-r'
  | 'avg-realized-r'
  | 'max-drawdown'
  | 'avg-drawdown'
  // Time
  | 'avg-hold-time'
  | 'longest-trade'
  | 'avg-day-length'
  | 'longest-day'
  // Activity
  | 'trades'
  | 'wins'
  | 'losses'
  | 'breakevens'
  | 'open-trades'
  | 'long-trades'
  | 'short-trades'
  | 'volume'
  | 'avg-daily-volume'
  // Consistency
  | 'win-rate'
  | 'long-win-rate'
  | 'short-win-rate'
  | 'green-days'
  | 'win-streak'
  | 'loss-streak'
  | 'green-day-streak'
  | 'red-day-streak'
  | 'sharpe'
  | 'sortino';

export type Bucket = 'day' | 'week' | 'month';

/** A metric per bucket on its own, or the cumulative metric over everything from the range start to the bucket's end. */
export type SeriesMode = 'period' | 'running';

/**
 * How a metric's values read: cents (`money`), a number in the display unit
 * (`tradeunit`: ticks, pips, points or R, when one narrows the trades), a 0..1
 * share, a plain ratio, a multiple of risk, a count, a quantity or minutes.
 */
export type SeriesUnit =
  | 'money'
  | 'tradeunit'
  | 'pct'
  | 'ratio'
  | 'multiple'
  | 'count'
  | 'qty'
  | 'minutes';

export const SERIES_GROUPS = [
  'Profitability',
  'Risk',
  'Time',
  'Activity',
  'Consistency',
] as const;
export type SeriesGroup = (typeof SERIES_GROUPS)[number];

export interface SeriesMeta {
  label: string;
  unit: SeriesUnit;
  kind: 'bar' | 'line';
  group: SeriesGroup;
  /** Money that reads in the display unit when one narrows the trades (sums and averages; costs and drawdown stay money). */
  inUnit?: true;
  /** Always a running value: the metric is a total from the range start. */
  running?: true;
}

const meta = (
  group: SeriesGroup,
  label: string,
  unit: SeriesUnit,
  kind: 'bar' | 'line',
  extra: { inUnit?: true; running?: true } = {},
): SeriesMeta => ({ group, label, unit, kind, ...extra });

export const SERIES_META: Record<SeriesMetric, SeriesMeta> = {
  net: meta('Profitability', 'Net P&L', 'money', 'bar', { inUnit: true }),
  'cumulative-net': meta('Profitability', 'Cumulative P&L', 'money', 'line', {
    inUnit: true,
    running: true,
  }),
  'avg-daily-net': meta('Profitability', 'Average daily P&L', 'money', 'bar', {
    inUnit: true,
  }),
  'avg-win': meta('Profitability', 'Average win', 'money', 'bar', {
    inUnit: true,
  }),
  'avg-loss': meta('Profitability', 'Average loss', 'money', 'bar', {
    inUnit: true,
  }),
  'win-loss-ratio': meta(
    'Profitability',
    'Average win to loss',
    'ratio',
    'line',
  ),
  expectancy: meta('Profitability', 'Expectancy', 'money', 'bar', {
    inUnit: true,
  }),
  'largest-win': meta('Profitability', 'Largest win', 'money', 'bar', {
    inUnit: true,
  }),
  'largest-loss': meta('Profitability', 'Largest loss', 'money', 'bar', {
    inUnit: true,
  }),
  'profit-factor': meta('Profitability', 'Profit factor', 'ratio', 'line'),
  fees: meta('Profitability', 'Fees', 'money', 'bar'),
  'avg-planned-r': meta('Risk', 'Average planned R', 'multiple', 'line'),
  'avg-realized-r': meta('Risk', 'Average realized R', 'multiple', 'line'),
  'max-drawdown': meta('Risk', 'Max drawdown', 'money', 'bar'),
  'avg-drawdown': meta('Risk', 'Average drawdown', 'money', 'bar'),
  'avg-hold-time': meta('Time', 'Average hold time', 'minutes', 'line'),
  'longest-trade': meta('Time', 'Longest trade', 'minutes', 'bar'),
  'avg-day-length': meta('Time', 'Average day length', 'minutes', 'line'),
  'longest-day': meta('Time', 'Longest day', 'minutes', 'bar'),
  trades: meta('Activity', 'Trades', 'count', 'bar'),
  wins: meta('Activity', 'Winning trades', 'count', 'bar'),
  losses: meta('Activity', 'Losing trades', 'count', 'bar'),
  breakevens: meta('Activity', 'Breakeven trades', 'count', 'bar'),
  'open-trades': meta('Activity', 'Open trades', 'count', 'bar'),
  'long-trades': meta('Activity', 'Long trades', 'count', 'bar'),
  'short-trades': meta('Activity', 'Short trades', 'count', 'bar'),
  volume: meta('Activity', 'Volume', 'qty', 'bar'),
  'avg-daily-volume': meta('Activity', 'Average daily volume', 'qty', 'line'),
  'win-rate': meta('Consistency', 'Win rate', 'pct', 'line'),
  'long-win-rate': meta('Consistency', 'Long win rate', 'pct', 'line'),
  'short-win-rate': meta('Consistency', 'Short win rate', 'pct', 'line'),
  'green-days': meta('Consistency', 'Daily win rate', 'pct', 'line'),
  'win-streak': meta('Consistency', 'Longest win streak', 'count', 'bar'),
  'loss-streak': meta('Consistency', 'Longest loss streak', 'count', 'bar'),
  'green-day-streak': meta(
    'Consistency',
    'Longest green day streak',
    'count',
    'bar',
  ),
  'red-day-streak': meta(
    'Consistency',
    'Longest red day streak',
    'count',
    'bar',
  ),
  sharpe: meta('Consistency', 'Sharpe ratio', 'ratio', 'line'),
  sortino: meta('Consistency', 'Sortino ratio', 'ratio', 'line'),
};

/** Every metric, grouped in the order of `SERIES_GROUPS`. */
export const SERIES_METRICS: readonly SeriesMetric[] = (
  Object.keys(SERIES_META) as SeriesMetric[]
).sort(
  (a, b) =>
    SERIES_GROUPS.indexOf(SERIES_META[a].group) -
    SERIES_GROUPS.indexOf(SERIES_META[b].group),
);

/** The unit a metric's values read in under `ctx`: the display unit's own numbers where a unit narrows the trades. */
export function seriesUnit(
  metric: SeriesMetric,
  ctx: Pick<MetricContext, 'unit'>,
): SeriesUnit {
  const m = SERIES_META[metric];
  return m.inUnit && ctx.unit ? 'tradeunit' : m.unit;
}

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

/** The first and the last local date a bucket holds. */
export function bucketSpan(
  key: string,
  bucket: Bucket,
): { from: string; to: string } {
  if (bucket === 'day') return { from: key, to: key };
  if (bucket === 'month') {
    const [y, m] = key.split('-').map(Number) as [number, number];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}` };
  }
  const end = new Date(`${key}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return { from: key, to: end.toISOString().slice(0, 10) };
}

export interface SeriesOptions {
  /** `period` (the default) or the running value from the range start. */
  mode?: SeriesMode;
  /**
   * The balance Sharpe and Sortino read their daily returns on: the balance the
   * day before the range starts, and the deposits and withdrawals after it.
   * Without it they have no value.
   */
  balance?: { start: Cents; flows: readonly { date: string; amount: Cents }[] };
}

const mean = (xs: readonly number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/** The money figures of a set of closed trades read in `ctx.unit`: the unit values of the wins and the losses. */
function unitFigures(
  closed: readonly Trade[],
  ctx: MetricContext,
): {
  avgWin: number | null;
  avgLoss: number | null;
  expectancy: number | null;
} {
  const wins: number[] = [];
  const losses: number[] = [];
  for (const t of closed) {
    const v = ctx.unit ? unitOf(t, ctx.unit, ctx.pnlBasis) : null;
    if (v === null) continue;
    const { outcome } = classify(t, ctx);
    if (outcome === 'win') wins.push(v);
    else if (outcome === 'loss') losses.push(v);
  }
  const decisive = wins.length + losses.length;
  const avgWin = mean(wins);
  const avgLoss = mean(losses);
  return {
    avgWin,
    avgLoss,
    expectancy:
      decisive === 0
        ? null
        : (wins.length / decisive) * (avgWin ?? 0) +
          (losses.length / decisive) * (avgLoss ?? 0),
  };
}

/**
 * One metric over time, a point per bucket that has anything in it, ascending.
 *
 * Money booked by exit (net, cumulative net, fees, and everything on days)
 * goes on the local date of each exit fill, as the calendar books it; the
 * trade-level metrics (win rate, profit factor, expectancy, averages, counts,
 * hold times) go on the local date a trade closed. Pass the trades with every
 * filter but the date, and the date range in `ctx.range`: both kinds then
 * count only what is dated inside it. A bucket with exits but no trade closed
 * in it has no win rate (null); trades and fees are 0. The input must be a
 * single-currency set.
 *
 * In `running` mode each bucket holds the metric over everything from the
 * range start to the bucket's end (the win rate of all trades so far), not
 * only that bucket's own. Under a narrowing `ctx.unit` the sums and averages
 * are numbers in that unit; fees and drawdown stay in cents, and Sharpe and
 * Sortino, which read the balance, have no value.
 */
export function timeSeries(
  trades: readonly Trade[],
  ctx: MetricContext,
  metric: SeriesMetric,
  bucket: Bucket,
  opts: SeriesOptions = {},
): SeriesPoint[] {
  const info = SERIES_META[metric];
  const running = info.running === true || opts.mode === 'running';
  const keyOf = (date: string) => bucketKey(date, bucket);

  const days = dailyPnl(trades, ctx);
  const fees = new Map<string, number>();
  if (metric === 'fees')
    for (const t of trades)
      for (const r of sizedRealizations(t)) {
        const date = localDate(r.time, ctx.timeZone);
        if (!inRange(date, ctx.range)) continue;
        const key = keyOf(date);
        fees.set(key, (fees.get(key) ?? 0) + r.fees);
      }
  const closed: { date: string; key: string; trade: Trade }[] = [];
  for (const t of closedInOrder(trades)) {
    const date = localDate(t.closedAt, ctx.timeZone);
    if (inRange(date, ctx.range))
      closed.push({ date, key: keyOf(date), trade: t });
  }
  // An open trade is dated by its open, and only its own metric shows it.
  const opened = new Map<string, number>();
  if (metric === 'open-trades')
    for (const t of trades) {
      if (isClosed(t)) continue;
      const date = localDate(t.openedAt, ctx.timeZone);
      if (!inRange(date, ctx.range)) continue;
      const key = keyOf(date);
      opened.set(key, (opened.get(key) ?? 0) + 1);
    }

  const keys = [
    ...new Set([
      ...days.map((d) => keyOf(d.date)),
      ...fees.keys(),
      ...closed.map((c) => c.key),
      ...opened.keys(),
    ]),
  ].sort();

  // What each metric reads, by bucket or from the start to the bucket's end.
  const needsLengths = metric === 'avg-day-length' || metric === 'longest-day';
  const lengths = needsLengths ? dayLengths(trades, ctx) : [];
  const needsNet = metric === 'sharpe' || metric === 'sortino';
  const netDays = !needsNet
    ? []
    : ctx.pnlBasis === 'net'
      ? days
      : dailyPnl(trades, { ...ctx, pnlBasis: 'net' });

  const within = <T extends { date: string }>(
    list: readonly T[],
    span: { from: string; to: string },
  ): T[] =>
    list.filter(
      (x) => x.date <= span.to && (running ? true : x.date >= span.from),
    );

  let feeTotal = 0;
  let openTotal = 0;
  return keys.map((key): SeriesPoint => {
    const span = bucketSpan(key, bucket);
    const scopeDays: DayStat[] = within(days, span);
    const group = within(closed, span).map((c) => c.trade);
    const summary = (): Summary => summarize(group, ctx);
    const inUnit = ctx.unit !== undefined && info.inUnit === true;
    const unitSet = () => unitFigures(group, ctx);
    const rate = (side: 'long' | 'short') =>
      summarize(
        group.filter((t) => t.direction === side),
        ctx,
      ).winRate;
    const negative = (n: number | null) =>
      n === null ? null : n === 0 ? 0 : -n;
    const value = (): number | null => {
      switch (metric) {
        case 'net':
        case 'cumulative-net':
          return scopeDays.reduce((n, d) => n + dayValue(d, ctx), 0);
        case 'avg-daily-net':
          return daySummary(scopeDays, ctx).avgDailyPnl;
        case 'avg-win':
          return inUnit ? unitSet().avgWin : summary().avgWin;
        case 'avg-loss':
          return inUnit ? unitSet().avgLoss : summary().avgLoss;
        case 'win-loss-ratio':
          return summary().winLossRatio;
        case 'expectancy':
          return inUnit ? unitSet().expectancy : summary().expectancy;
        case 'largest-win':
        case 'largest-loss': {
          const side = metric === 'largest-win' ? 'win' : 'loss';
          if (!ctx.unit)
            return side === 'win'
              ? summary().largestWin
              : summary().largestLoss;
          const t = largestInUnit(group, ctx, side);
          return t ? unitOf(t, ctx.unit, ctx.pnlBasis) : null;
        }
        case 'profit-factor':
          return summary().profitFactor;
        case 'fees':
          if (!running) return fees.get(key) ?? 0;
          feeTotal += fees.get(key) ?? 0;
          return feeTotal;
        case 'avg-planned-r':
          return summary().avgPlannedR;
        case 'avg-realized-r':
          return summary().avgRealizedR;
        case 'max-drawdown':
          return scopeDays.length === 0
            ? null
            : negative(maxDrawdown(scopeDays, 0).amount);
        case 'avg-drawdown':
          return negative(avgDrawdown(scopeDays, 0).amount);
        case 'avg-hold-time':
          return holdTimes(group, ctx).all;
        case 'longest-trade':
          return longestHold(group);
        case 'avg-day-length':
          return mean(within(lengths, span).map((l) => l.minutes));
        case 'longest-day': {
          const m = within(lengths, span).map((l) => l.minutes);
          return m.length === 0 ? null : Math.max(...m);
        }
        case 'trades':
          return group.length;
        case 'wins':
          return summary().wins;
        case 'losses':
          return summary().losses;
        case 'breakevens':
          return summary().breakevens;
        case 'open-trades':
          if (!running) return opened.get(key) ?? 0;
          openTotal += opened.get(key) ?? 0;
          return openTotal;
        case 'long-trades':
          return group.filter((t) => t.direction === 'long').length;
        case 'short-trades':
          return group.filter((t) => t.direction === 'short').length;
        case 'volume':
          return volumeOf(group);
        case 'avg-daily-volume':
          return scopeDays.length === 0
            ? null
            : volumeOf(group) / scopeDays.length;
        case 'win-rate':
          return summary().winRate;
        case 'long-win-rate':
          return rate('long');
        case 'short-win-rate':
          return rate('short');
        case 'green-days':
          return daySummary(scopeDays, ctx).greenPct;
        case 'win-streak':
          return tradeStreaks(group, ctx).maxWin;
        case 'loss-streak':
          return tradeStreaks(group, ctx).maxLoss;
        case 'green-day-streak':
          return dayStreaks(scopeDays, ctx).maxWin;
        case 'red-day-streak':
          return dayStreaks(scopeDays, ctx).maxLoss;
        case 'sharpe':
        case 'sortino': {
          if (ctx.unit || !opts.balance) return null;
          const own = within(netDays, span);
          // A period starts from the balance the earlier days left.
          const start =
            opts.balance.start +
            (running
              ? 0
              : netDays
                  .filter((d) => d.date < span.from)
                  .reduce((n, d) => n + d.net, 0));
          const r = riskRatios(own, start, opts.balance.flows);
          return metric === 'sharpe' ? r.sharpe : r.sortino;
        }
      }
    };
    const v = value();
    // A bucket with nothing closed in it has no average, rate or ratio; counts stay 0.
    return { key, value: v };
  });
}

import { roundHalfEven } from '../money';
import { localDate } from '../time';
import { closedInOrder, isClosed } from '../trade-status';
import type { Cents, Trade, WeekStart } from '../types';
import { classify, inRange, type MetricContext } from './context';
import {
  dailyPnl,
  dayLengths,
  daySummary,
  dayStreaks,
  dayValue,
  dayVolumes,
  type DayStat,
} from './days';
import { drawdownSeries } from './equity';
import { sizedRealizations } from './realized';
import { riskRatios } from './risk';
import { expectancyOf, plannedR, rOf } from './summary';
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
  'green-days': meta('Consistency', 'Day win rate', 'pct', 'line'),
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

/** The bucket a local date falls in: itself, the first day of its week (Sunday unless `weekStart` says Monday), or its month. */
export function bucketKey(
  date: string,
  bucket: Bucket,
  weekStart: WeekStart = 'sunday',
): string {
  if (bucket === 'day') return date;
  if (bucket === 'month') return date.slice(0, 7);
  const d = new Date(`${date}T00:00:00Z`);
  const back = weekStart === 'monday' ? (d.getUTCDay() + 6) % 7 : d.getUTCDay();
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
const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/** What one closed trade adds to every trade-level figure, read once. */
interface Fact {
  date: string;
  key: string;
  trade: Trade;
  outcome: 'win' | 'loss' | 'breakeven';
  value: Cents;
  /** The trade in `ctx.unit`, when there is one and the trade has it. */
  unit: number | null;
  realizedR: number | undefined;
  plannedR: number | undefined;
  held: number;
}

/** The sums a running figure is read from, carried from bucket to bucket. */
interface Acc {
  n: number;
  wins: number;
  losses: number;
  winSum: number;
  lossSum: number;
  winU: { n: number; sum: number; best: number | null };
  lossU: { n: number; sum: number; worst: number | null };
  best: number | null;
  worst: number | null;
  rSum: number;
  rN: number;
  pSum: number;
  pN: number;
  holdSum: number;
  holdMax: number | null;
  long: Side;
  short: Side;
  streak: {
    kind: 'win' | 'loss' | null;
    length: number;
    maxWin: number;
    maxLoss: number;
  };
}
interface Side {
  n: number;
  wins: number;
  losses: number;
}

const emptyAcc = (): Acc => ({
  n: 0,
  wins: 0,
  losses: 0,
  winSum: 0,
  lossSum: 0,
  winU: { n: 0, sum: 0, best: null },
  lossU: { n: 0, sum: 0, worst: null },
  best: null,
  worst: null,
  rSum: 0,
  rN: 0,
  pSum: 0,
  pN: 0,
  holdSum: 0,
  holdMax: null,
  long: { n: 0, wins: 0, losses: 0 },
  short: { n: 0, wins: 0, losses: 0 },
  streak: { kind: null, length: 0, maxWin: 0, maxLoss: 0 },
});

function add(acc: Acc, f: Fact): void {
  acc.n += 1;
  const side = f.trade.direction === 'long' ? acc.long : acc.short;
  side.n += 1;
  if (f.outcome === 'win') {
    acc.wins += 1;
    side.wins += 1;
    acc.winSum += f.value;
    acc.best = acc.best === null ? f.value : Math.max(acc.best, f.value);
    if (f.unit !== null) {
      acc.winU.n += 1;
      acc.winU.sum += f.unit;
      acc.winU.best =
        acc.winU.best === null ? f.unit : Math.max(acc.winU.best, f.unit);
    }
  } else if (f.outcome === 'loss') {
    acc.losses += 1;
    side.losses += 1;
    acc.lossSum += f.value;
    acc.worst = acc.worst === null ? f.value : Math.min(acc.worst, f.value);
    if (f.unit !== null) {
      acc.lossU.n += 1;
      acc.lossU.sum += f.unit;
      acc.lossU.worst =
        acc.lossU.worst === null ? f.unit : Math.min(acc.lossU.worst, f.unit);
    }
  }
  if (f.realizedR !== undefined) {
    acc.rSum += f.realizedR;
    acc.rN += 1;
  }
  if (f.plannedR !== undefined) {
    acc.pSum += f.plannedR;
    acc.pN += 1;
  }
  acc.holdSum += f.held;
  acc.holdMax = acc.holdMax === null ? f.held : Math.max(acc.holdMax, f.held);
  // A breakeven neither extends nor breaks a streak.
  if (f.outcome !== 'breakeven') {
    const s = acc.streak;
    s.length = f.outcome === s.kind ? s.length + 1 : 1;
    s.kind = f.outcome;
    if (f.outcome === 'win') s.maxWin = Math.max(s.maxWin, s.length);
    else s.maxLoss = Math.max(s.maxLoss, s.length);
  }
}

/**
 * The trade-level figures of the sums, as `summarize` reads them (the parity
 * test holds them to it at every bucket): money in cents, or the unit's own
 * numbers for the metrics that read it under `ctx.unit`.
 */
function accValue(
  metric: SeriesMetric,
  a: Acc,
  unit: boolean,
): number | null | undefined {
  const decisive = a.wins + a.losses;
  const avgWin = ratio(a.winSum, a.wins);
  const avgLoss = ratio(a.lossSum, a.losses);
  const uWin = ratio(a.winU.sum, a.winU.n);
  const uLoss = ratio(a.lossU.sum, a.lossU.n);
  switch (metric) {
    case 'avg-win':
      return unit ? uWin : avgWin === null ? null : roundHalfEven(avgWin);
    case 'avg-loss':
      return unit ? uLoss : avgLoss === null ? null : roundHalfEven(avgLoss);
    case 'win-loss-ratio':
      return unit
        ? uWin === null || uLoss === null || uLoss >= 0
          ? null
          : uWin / -uLoss
        : avgWin === null || avgLoss === null || avgLoss === 0
          ? null
          : avgWin / Math.abs(avgLoss);
    case 'profit-factor':
      return unit
        ? a.lossU.n === 0 || a.lossU.sum >= 0
          ? null
          : a.winU.sum / -a.lossU.sum
        : a.losses === 0
          ? null
          : ratio(a.winSum, Math.abs(a.lossSum));
    case 'expectancy': {
      if (unit) return expectancyOf(a.winU, a.lossU);
      const e = expectancyOf(
        { n: a.wins, sum: a.winSum },
        { n: a.losses, sum: a.lossSum },
      );
      return e === null ? null : roundHalfEven(e);
    }
    case 'largest-win':
      return unit ? a.winU.best : a.best;
    case 'largest-loss':
      return unit ? a.lossU.worst : a.worst;
    case 'avg-planned-r':
      return ratio(a.pSum, a.pN);
    case 'avg-realized-r':
      return ratio(a.rSum, a.rN);
    case 'avg-hold-time':
      return ratio(a.holdSum, a.n);
    case 'longest-trade':
      return a.holdMax;
    case 'trades':
      return a.n;
    case 'wins':
      return a.wins;
    case 'losses':
      return a.losses;
    case 'breakevens':
      return a.n - a.wins - a.losses;
    case 'long-trades':
      return a.long.n;
    case 'short-trades':
      return a.short.n;
    case 'win-rate':
      return ratio(a.wins, decisive);
    case 'long-win-rate':
      return ratio(a.long.wins, a.long.wins + a.long.losses);
    case 'short-win-rate':
      return ratio(a.short.wins, a.short.wins + a.short.losses);
    case 'win-streak':
      return a.streak.maxWin;
    case 'loss-streak':
      return a.streak.maxLoss;
    default:
      return undefined;
  }
}

/** What a series needs of a trade set under one context, read once and shared by the metrics that plot it. */
interface Base {
  days: DayStat[];
  /** The days' distance under their running peak, from the range start. */
  under: number[];
  facts: Fact[];
  lengths?: { date: string; minutes: number }[];
  netDays?: DayStat[];
  /** Volume by date, as `dayVolumes` shares it. */
  volume?: { date: string; value: number }[];
}

const cache = new WeakMap<readonly Trade[], WeakMap<MetricContext, Base>>();

function baseOf(trades: readonly Trade[], ctx: MetricContext): Base {
  let byCtx = cache.get(trades);
  if (!byCtx) cache.set(trades, (byCtx = new WeakMap()));
  const hit = byCtx.get(ctx);
  if (hit) return hit;
  const days = dailyPnl(trades, ctx);
  const facts: Fact[] = [];
  for (const t of closedInOrder(trades)) {
    const date = localDate(t.closedAt, ctx.timeZone);
    if (!inRange(date, ctx.range)) continue;
    const c = classify(t, ctx);
    facts.push({
      date,
      key: date,
      trade: t,
      outcome: c.outcome,
      value: c.value,
      unit: ctx.unit ? unitOf(t, ctx.unit, ctx.pnlBasis) : null,
      realizedR: rOf(t, ctx.pnlBasis),
      plannedR: plannedR(t),
      held: (Date.parse(t.closedAt) - Date.parse(t.openedAt)) / 60000,
    });
  }
  const base: Base = {
    days,
    under: drawdownSeries(days).map((d) => d.value),
    facts,
  };
  byCtx.set(ctx, base);
  return base;
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
 * in it has no win rate (null); trades and fees are 0. Volume is shared
 * among the days by `dayVolumes`, as the Calendar's is: what the exits
 * closed on each exit day, and what an open trade still holds on the day it
 * opened, so the running volume is the Overview's. The input must be a
 * single-currency set.
 *
 * In `running` mode each bucket holds the metric over everything from the
 * range start to the bucket's end (the win rate of all trades so far), read
 * in one pass in time order with the sums carried from bucket to bucket. The
 * drawdowns carry their peak from the range start in both modes. Under a
 * narrowing `ctx.unit` the sums and averages are numbers in that unit; fees
 * and drawdown stay in cents, and Sharpe and Sortino, which read the balance,
 * have no value.
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
  const keyOf = (date: string) => bucketKey(date, bucket, ctx.weekStart);
  const base = baseOf(trades, ctx);
  const { days, facts } = base;
  for (const f of facts) f.key = keyOf(f.date);

  const fees = new Map<string, number>();
  if (metric === 'fees')
    for (const t of trades)
      for (const r of sizedRealizations(t)) {
        const date = localDate(r.time, ctx.timeZone);
        if (!inRange(date, ctx.range)) continue;
        const key = keyOf(date);
        fees.set(key, (fees.get(key) ?? 0) + r.fees);
      }
  // Open trades are dated by their open, and only their own metric shows them.
  const opened: { date: string; key: string; trade: Trade }[] = [];
  if (metric === 'open-trades')
    for (const t of trades) {
      if (isClosed(t)) continue;
      const date = localDate(t.openedAt, ctx.timeZone);
      if (inRange(date, ctx.range))
        opened.push({ date, key: keyOf(date), trade: t });
    }
  opened.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Volume is shared among the days as on every page: what the exits closed,
  // and what an open trade still holds on the day it opened.
  const wantsVolume = metric === 'volume' || metric === 'avg-daily-volume';
  if (wantsVolume && !base.volume) base.volume = dayVolumes(trades, ctx);
  const volumeItems = wantsVolume ? (base.volume ?? []) : [];

  const keys = [
    ...new Set([
      ...days.map((d) => keyOf(d.date)),
      ...fees.keys(),
      ...facts.map((f) => f.key),
      ...opened.map((o) => o.key),
      ...volumeItems.map((v) => keyOf(v.date)),
    ]),
  ].sort();

  const needsLengths = metric === 'avg-day-length' || metric === 'longest-day';
  if (needsLengths && !base.lengths) base.lengths = dayLengths(trades, ctx);
  const needsNet = metric === 'sharpe' || metric === 'sortino';
  if (needsNet && !base.netDays)
    base.netDays =
      ctx.pnlBasis === 'net'
        ? days
        : dailyPnl(trades, { ...ctx, pnlBasis: 'net' });
  const lengths = base.lengths ?? [];
  const netDays = base.netDays ?? [];

  // Each list is in date order: a bucket's slice is two moving indices.
  const cursor = (list: readonly { date: string }[]) => {
    let lo = 0;
    let hi = 0;
    return (span: { from: string; to: string }) => {
      while (hi < list.length && list[hi]!.date <= span.to) hi += 1;
      if (!running) while (lo < hi && list[lo]!.date < span.from) lo += 1;
      return [lo, hi] as const;
    };
  };
  const dayAt = cursor(days);
  const netAt = cursor(netDays);
  const lenAt = cursor(lengths);
  const factAt = cursor(facts);
  const volAt = cursor(volumeItems);
  const openAt = cursor(opened);

  const acc = emptyAcc();
  let added = 0;
  const negative = (n: number | null) => (n === null ? null : n === 0 ? 0 : -n);
  let feeTotal = 0;
  return keys.map((key): SeriesPoint => {
    const span = bucketSpan(key, bucket);
    const [d0, d1] = dayAt(span);
    const [f0, f1] = factAt(span);
    const scopeDays = days.slice(d0, d1);
    // The sums: carried when running, rebuilt over the bucket otherwise.
    let sums = acc;
    if (running) {
      for (; added < f1; added += 1) add(acc, facts[added]!);
    } else {
      sums = emptyAcc();
      for (let i = f0; i < f1; i += 1) add(sums, facts[i]!);
    }
    const sumOf = (
      list: readonly { value: number }[],
      [a, b]: readonly [number, number],
    ) => {
      let n = 0;
      for (let i = a; i < b; i += 1) n += list[i]!.value;
      return clean(n);
    };
    const value = (): number | null => {
      const fromSums = accValue(metric, sums, ctx.unit !== undefined);
      if (fromSums !== undefined) return fromSums;
      switch (metric) {
        case 'net':
        case 'cumulative-net':
          return scopeDays.reduce((n, d) => n + dayValue(d, ctx), 0);
        case 'avg-daily-net':
          return daySummary(scopeDays, ctx).avgDailyPnl;
        case 'fees':
          if (!running) return fees.get(key) ?? 0;
          feeTotal += fees.get(key) ?? 0;
          return feeTotal;
        case 'max-drawdown':
          return scopeDays.length === 0
            ? null
            : negative(-Math.min(0, ...base.under.slice(d0, d1)));
        case 'avg-drawdown': {
          const depths = base.under.slice(d0, d1).filter((v) => v < 0);
          const m = mean(depths);
          return m === null ? null : roundHalfEven(m);
        }
        case 'avg-day-length':
          return mean(lengths.slice(...lenAt(span)).map((l) => l.minutes));
        case 'longest-day': {
          const m = lengths.slice(...lenAt(span)).map((l) => l.minutes);
          return m.length === 0 ? null : Math.max(...m);
        }
        case 'open-trades': {
          const [a, b] = openAt(span);
          return b - a;
        }
        case 'volume':
          return sumOf(volumeItems, volAt(span));
        case 'avg-daily-volume':
          return scopeDays.length === 0
            ? null
            : sumOf(volumeItems, volAt(span)) / scopeDays.length;
        case 'green-days':
          return daySummary(scopeDays, ctx).greenPct;
        case 'green-day-streak':
          return dayStreaks(scopeDays, ctx).maxWin;
        case 'red-day-streak':
          return dayStreaks(scopeDays, ctx).maxLoss;
        case 'sharpe':
        case 'sortino': {
          if (ctx.unit || !opts.balance) return null;
          const [n0, n1] = netAt(span);
          const start =
            opts.balance.start +
            (running ? 0 : netDays.slice(0, n0).reduce((n, d) => n + d.net, 0));
          const r = riskRatios(
            netDays.slice(n0, n1),
            start,
            opts.balance.flows,
          );
          return metric === 'sharpe' ? r.sharpe : r.sortino;
        }
        default:
          return null;
      }
    };
    return { key, value: value() };
  });
}

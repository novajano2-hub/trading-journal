import { ASSET_CLASS_LABELS } from '../asset-class';
import { localDate, localParts } from '../time';
import { isClosed, type ClosedTrade } from '../trade-status';
import { roundHalfEven } from '../money';
import type { AssetClass, Cents, Trade } from '../types';
import { classify, type MetricContext, type PnlBasis } from './context';
import { priceBuckets, priceKeyOf } from './price-ranges';
import { rOf, summarize, volumeOf, type Summary } from './summary';

/** R multiples at or past this clamp into the tails of the R reports. */
export const R_CLAMP = 5;

export type BreakdownKey =
  | 'weekday'
  | 'hour'
  | 'time-of-day'
  | 'session'
  | 'duration'
  | 'side'
  | 'symbol'
  | 'strategy'
  | 'tag'
  | 'size'
  | 'r'
  | 'month'
  | 'dte'
  | 'instrument'
  | 'account'
  | 'entry-price'
  | 'exit-price'
  | 'exit-hour'
  | 'symbol-top'
  | 'symbol-bottom';

/** How many symbols the top and bottom views keep. */
export const SYMBOL_LIMIT = 10;
/** The breakdowns that file trades by symbol: a cross-analysis offers only one of them. */
export const SYMBOL_KEYS: readonly BreakdownKey[] = [
  'symbol',
  'symbol-top',
  'symbol-bottom',
];
export interface BreakdownOptions {
  strategyNames?: Record<string, string>;
  tagNames?: Record<string, string>;
  /** Each tag's category name: the tag breakdown groups its rows by them. */
  tagCategoryNames?: Record<string, string>;
  /** Account names by id: the account breakdown labels its rows with them. */
  accountNames?: Record<string, string>;
  /** Which instant the time reports (weekday, hour, time-of-day, session) bucket by. Default 'entry'. */
  timeBasis?: 'entry' | 'exit';
  /** Time-of-day bucket width in minutes. Default 30. */
  bucketMinutes?: 5 | 15 | 30 | 60;
}
export interface BreakdownRow {
  key: string;
  label: string;
  /** The tag breakdown's category name, when `tagCategoryNames` names one. */
  group?: string;
  /** The closed trades filed under the row, for the display units. */
  tradeIds: string[];
  summary: Summary;
  /** The quantity of the closed trades, each counted once. */
  volume: number;
  /** The distinct days (in the user's time zone) the closed trades closed on. */
  tradingDays: number;
}
export interface RBin {
  /** The first R in the bin; -Infinity for the low tail. */
  from: number;
  /** The first R past it; Infinity for the high tail. */
  to: number;
  count: number;
  label: string;
}

type Bucket = readonly [key: string, label: string];

const NONE = '__none__';
const WEEKDAYS: Bucket[] = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
];
const HOURS: Bucket[] = Array.from({ length: 24 }, (_, h) => [
  String(h),
  `${String(h).padStart(2, '0')}:00`,
]);
const SESSIONS: Bucket[] = [
  ['asia', 'Asia'],
  ['london', 'London'],
  ['new-york', 'New York'],
  ['after-hours', 'After hours'],
];
const DURATIONS: Bucket[] = [
  ['lt-1m', '<1m'],
  ['1-5m', '1-5m'],
  ['5-15m', '5-15m'],
  ['15-60m', '15-60m'],
  ['1-4h', '1-4h'],
  ['4h-1d', '4h-1d'],
  ['gt-1d', '>1d'],
];
const SIDES: Bucket[] = [
  ['long', 'Long'],
  ['short', 'Short'],
];

const MIN = 60_000;
const HOUR = 60 * MIN;

/** A bucket's span: `from` is in it, `to` is not (the next bucket starts there); the last has no `to`. */
type Edge = readonly [key: string, from: number, to?: number];

/** Duration buckets in minutes. The one source of the keys and of the report links' ranges. */
const DURATION_EDGES: readonly Edge[] = [
  ['lt-1m', -Infinity, 1],
  ['1-5m', 1, 5],
  ['5-15m', 5, 15],
  ['15-60m', 15, 60],
  ['1-4h', 60, 240],
  ['4h-1d', 240, 1440],
  ['gt-1d', 1440],
];

function edgeKey(edges: readonly Edge[], v: number): string {
  return (edges.find(([, , to]) => to === undefined || v < to) ?? edges[0]!)[0];
}

function durationKey(ms: number): string {
  return edgeKey(DURATION_EDGES, ms / MIN);
}

function sessionKey(openedAt: string): string {
  const p = localParts(openedAt, 'America/New_York');
  const mins = p.hour * 60 + p.minute;
  if (mins >= 18 * 60 || mins < 3 * 60) return 'asia';
  if (mins < 9 * 60 + 30) return 'london';
  if (mins < 16 * 60) return 'new-york';
  return 'after-hours';
}

const hhmm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** Buckets covering the whole local day in order; key and label are the bucket start 'HH:MM'. */
function timeBuckets(width: number): Bucket[] {
  return Array.from({ length: 1440 / width }, (_, i) => [
    hhmm(i * width),
    hhmm(i * width),
  ]);
}

function timeKey(p: { hour: number; minute: number }, width: number): string {
  const mins = p.hour * 60 + p.minute;
  return hhmm(mins - (mins % width));
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const MONTHS: Bucket[] = [
  ['01', 'Jan'],
  ['02', 'Feb'],
  ['03', 'Mar'],
  ['04', 'Apr'],
  ['05', 'May'],
  ['06', 'Jun'],
  ['07', 'Jul'],
  ['08', 'Aug'],
  ['09', 'Sep'],
  ['10', 'Oct'],
  ['11', 'Nov'],
  ['12', 'Dec'],
];

/** The largest position a trade held, in buckets that read for shares and contracts alike. */
const SIZES: Bucket[] = [
  ['lt-1', '<1'],
  ['1', '1'],
  ['2-3', '2-3'],
  ['4-5', '4-5'],
  ['6-10', '6-10'],
  ['11-25', '11-25'],
  ['26-100', '26-100'],
  ['gt-100', '101+'],
];

/** Size buckets: `to` is out, except the 26-100 bucket, whose 100 is in (see `sizeKey`). */
const SIZE_EDGES: readonly Edge[] = [
  ['lt-1', -Infinity, 1],
  ['1', 1, 2],
  ['2-3', 2, 4],
  ['4-5', 4, 6],
  ['6-10', 6, 11],
  ['11-25', 11, 26],
  ['26-100', 26],
  ['gt-100', 100],
];

function sizeKey(size: number): string {
  if (size > 100) return 'gt-100';
  return edgeKey(SIZE_EDGES.slice(0, 7), size);
}

const DTES: Bucket[] = [
  ['0', '0'],
  ['1', '1'],
  ['2-7', '2-7'],
  ['8-30', '8-30'],
  ['31+', '31+'],
];

const DAY = 24 * HOUR;

/** Whole days from the local date the trade opened to its expiry; null when it has none. */
export function daysToExpiry(t: Trade, timeZone: string): number | null {
  const { expiry } = t.instrument;
  if (t.instrument.assetClass !== 'option' || !expiry) return null;
  const opened = localParts(t.openedAt, timeZone).date;
  return Math.round((Date.parse(expiry) - Date.parse(opened)) / DAY);
}

function dteKey(days: number): string {
  if (days <= 0) return '0';
  if (days === 1) return '1';
  if (days <= 7) return '2-7';
  if (days <= 30) return '8-30';
  return '31+';
}

const rLabel = (r: number) =>
  `${r < 0 ? '\u2212' : r > 0 ? '+' : ''}${Math.abs(r)}R`;

/** One-R buckets from -5R to +5R, the ends open: `le-5` and `ge5`, then the trades with no stop. */
const R_BUCKETS: Bucket[] = [
  [`le-${R_CLAMP}`, `\u2212${R_CLAMP}R or less`],
  ...Array.from({ length: 2 * R_CLAMP }, (_, i): Bucket => {
    const lo = i - R_CLAMP;
    return [String(lo), `${rLabel(lo)} to ${rLabel(lo + 1)}`];
  }),
  [`ge${R_CLAMP}`, `+${R_CLAMP}R or more`],
  [NONE, 'No stop'],
];

function rKey(r: number | undefined): string {
  if (r === undefined) return NONE;
  if (r <= -R_CLAMP) return `le-${R_CLAMP}`;
  if (r >= R_CLAMP) return `ge${R_CLAMP}`;
  return String(Math.floor(r + 1e-9));
}

/** The values a bucket holds, as a filter would say them. */
export interface BucketRange {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  maxExclusive?: boolean;
}

/**
 * The span of values a duration (minutes), size or R bucket holds, read from the
 * same edges the buckets are cut by, so a link and its bucket cannot disagree.
 * Null for a key that holds no span (R's "No stop").
 */
export function bucketRange(
  by: 'duration' | 'size' | 'r',
  key: string,
): BucketRange | null {
  if (by === 'r') {
    if (key === `le-${R_CLAMP}`) return { max: -R_CLAMP };
    // rKey files -5 under le-5 and 5 under ge5, so those are the tails' alone.
    if (key === `ge${R_CLAMP}`) return { min: R_CLAMP };
    if (!/^-?\d+$/.test(key)) return null;
    const k = Number(key);
    return {
      min: k,
      max: k + 1,
      maxExclusive: true,
      ...(k === -R_CLAMP && { minExclusive: true }),
    };
  }
  const edges = by === 'duration' ? DURATION_EDGES : SIZE_EDGES;
  const edge = edges.find(([k]) => k === key);
  if (!edge) return null;
  const [, from, to] = edge;
  // The 26-100 bucket holds 100 itself, and 101+ starts after it.
  if (by === 'size' && key === '26-100') return { min: 26, max: 100 };
  if (by === 'size' && key === 'gt-100')
    return { min: 100, minExclusive: true };
  return {
    ...(from !== -Infinity && { min: from }),
    ...(to !== undefined && { max: to, maxExclusive: true }),
  };
}

const basisPnl = (s: Summary) => (s.basis === 'gross' ? s.grossPnl : s.netPnl);

/** How a dimension reads a trade: the keys it files under, and the rows it always shows. */
interface Spec {
  /** Every row there is, in order; absent for the dimensions that follow the trades. */
  fixed?: Bucket[];
  keysOf(t: ClosedTrade): string[];
  labelOf(key: string): string;
  groupOf?(key: string): string | undefined;
}

function specOf(
  by: BreakdownKey,
  ctx: MetricContext & BreakdownOptions,
  closed: readonly ClosedTrade[],
): Spec {
  const instant = (t: ClosedTrade) =>
    ctx.timeBasis === 'exit' ? t.closedAt : t.openedAt;
  const local = (t: ClosedTrade) => localParts(instant(t), ctx.timeZone);
  const width = ctx.bucketMinutes ?? 30;
  const one = (f: (t: ClosedTrade) => string) => (t: ClosedTrade) => [f(t)];
  const fixed = (buckets: Bucket[], f: (t: ClosedTrade) => string): Spec => ({
    fixed: buckets,
    keysOf: one(f),
    labelOf: (k) => buckets.find(([key]) => key === k)?.[1] ?? k,
  });
  switch (by) {
    case 'weekday':
      return fixed(WEEKDAYS, (t) => WEEKDAY_KEYS[local(t).weekday]!);
    case 'hour':
      return fixed(HOURS, (t) => String(local(t).hour));
    case 'time-of-day':
      return fixed(timeBuckets(width), (t) => timeKey(local(t), width));
    case 'session':
      return fixed(SESSIONS, (t) => sessionKey(instant(t)));
    case 'duration':
      return fixed(DURATIONS, (t) =>
        durationKey(Date.parse(t.closedAt) - Date.parse(t.openedAt)),
      );
    case 'side':
      return fixed(SIDES, (t) => t.direction);
    case 'month':
      return fixed(MONTHS, (t) => local(t).date.slice(5, 7));
    case 'size':
      return fixed(SIZES, (t) => sizeKey(t.maxPosition));
    case 'r':
      return fixed(R_BUCKETS, (t) => rKey(rOf(t, ctx.pnlBasis)));
    case 'dte':
      return {
        fixed: DTES,
        // Only options with an expiry have days to it; the rest file under no key.
        keysOf: (t) => {
          const days = daysToExpiry(t, ctx.timeZone);
          return days === null ? [] : [dteKey(days)];
        },
        labelOf: (k) => DTES.find(([key]) => key === k)?.[1] ?? k,
      };
    case 'symbol':
    case 'symbol-top':
    case 'symbol-bottom':
      return {
        keysOf: one((t) => t.instrument.root),
        labelOf: (k) => k,
      };
    case 'instrument':
      return {
        keysOf: one((t) => t.instrument.assetClass),
        labelOf: (k) => ASSET_CLASS_LABELS[k as AssetClass] ?? k,
      };
    case 'account':
      return {
        keysOf: one((t) => t.accountId),
        labelOf: (k) => ctx.accountNames?.[k] ?? k,
      };
    case 'exit-hour':
      return fixed(HOURS, (t) =>
        String(localParts(t.closedAt, ctx.timeZone).hour),
      );
    case 'entry-price':
    case 'exit-price': {
      // The ranges are cut to the prices in the set, so they come from the trades.
      const price = (t: ClosedTrade) =>
        by === 'entry-price' ? t.avgEntry : t.avgExit;
      const buckets = priceBuckets(closed.flatMap((t) => price(t) ?? []));
      return {
        fixed: buckets.map((b): Bucket => [b.key, b.label]),
        keysOf: (t) => {
          const p = price(t);
          const key = p === undefined ? undefined : priceKeyOf(p, buckets);
          return key === undefined ? [] : [key];
        },
        labelOf: (k) => buckets.find((b) => b.key === k)?.label ?? k,
      };
    }
    case 'strategy':
      return {
        // A trade counts under each of its strategies.
        keysOf: (t) =>
          t.strategyIds.length === 0 ? [NONE] : [...new Set(t.strategyIds)],
        labelOf: (k) =>
          k === NONE ? 'No strategy' : (ctx.strategyNames?.[k] ?? k),
      };
    case 'tag':
      return {
        keysOf: (t) =>
          t.tagIds.length === 0 ? [NONE] : [...new Set(t.tagIds)],
        labelOf: (k) => (k === NONE ? 'Untagged' : (ctx.tagNames?.[k] ?? k)),
        ...(ctx.tagCategoryNames && {
          groupOf: (k: string) => ctx.tagCategoryNames?.[k],
        }),
      };
  }
}

/** The closed trades filed under each key. */
function grouped(
  closed: ClosedTrade[],
  spec: Spec,
): Map<string, ClosedTrade[]> {
  const groups = new Map<string, ClosedTrade[]>(
    (spec.fixed ?? []).map(([k]) => [k, []]),
  );
  for (const t of closed)
    for (const k of spec.keysOf(t)) {
      const g = groups.get(k);
      if (g) g.push(t);
      else groups.set(k, [t]);
    }
  return groups;
}

export function breakdown(
  trades: readonly Trade[],
  by: BreakdownKey,
  ctx: MetricContext & BreakdownOptions,
): BreakdownRow[] {
  const closed = trades.filter(isClosed);
  const spec = specOf(by, ctx, closed);
  const groups = grouped(closed, spec);
  const rowOf = (key: string, label: string, ts: ClosedTrade[]) => ({
    key,
    label,
    tradeIds: ts.map((t) => t.id),
    summary: summarize(ts, ctx),
    volume: volumeOf(ts),
    tradingDays: new Set(ts.map((t) => localDate(t.closedAt, ctx.timeZone)))
      .size,
  });
  if (spec.fixed)
    return spec.fixed.map(([key, label]) =>
      rowOf(key, label, groups.get(key)!),
    );
  const rows = [...groups].map(([key, ts]): BreakdownRow => {
    const group = key === NONE ? undefined : spec.groupOf?.(key);
    return {
      ...rowOf(key, spec.labelOf(key), ts),
      ...(group !== undefined && { group }),
    };
  });
  // Array.prototype.sort is stable, so ties keep first-appearance order.
  const sorted = rows.sort((a, b) => {
    if (a.key === NONE) return b.key === NONE ? 0 : 1;
    if (b.key === NONE) return -1;
    if (spec.groupOf && a.group !== b.group)
      return (a.group ?? '').localeCompare(b.group ?? '');
    return basisPnl(b.summary) - basisPnl(a.summary);
  });
  // The best ten by net, or the worst ten with the worst first.
  if (by === 'symbol-top') return sorted.slice(0, SYMBOL_LIMIT);
  if (by === 'symbol-bottom') return sorted.slice(-SYMBOL_LIMIT).reverse();
  return sorted;
}

/** The decided trades (wins plus losses) a bucket needs to be the best win rate. */
export const MIN_DECIDED = 5;

/** What a breakdown singles out besides its best and worst by net. */
export interface Highlights {
  /** The bucket with the most closed trades. */
  mostActive: BreakdownRow | null;
  /** The bucket with the highest win rate among those with `MIN_DECIDED` decided trades; the busier one when they tie. */
  bestWinRate: BreakdownRow | null;
}

/**
 * The most active bucket and the best win-rate bucket of `rows`. A bucket with
 * no decided trade has no win rate and cannot win it; ties on either go to the
 * bucket with more trades, then to the one first in `rows`.
 */
export function highlights(rows: readonly BreakdownRow[]): Highlights {
  const traded = rows.filter((r) => r.summary.closedCount > 0);
  const busier = (a: BreakdownRow, b: BreakdownRow) =>
    b.summary.closedCount > a.summary.closedCount ? b : a;
  const mostActive = traded.reduce<BreakdownRow | null>(
    (best, r) => (best === null ? r : busier(best, r)),
    null,
  );
  const bestWinRate = traded.reduce<BreakdownRow | null>((best, r) => {
    const rate = r.summary.winRate;
    // A rate over a handful of trades is noise: it needs enough decided ones.
    if (rate === null || r.summary.wins + r.summary.losses < MIN_DECIDED)
      return best;
    if (best === null) return r;
    const top = best.summary.winRate!;
    if (rate > top) return r;
    return rate === top ? busier(best, r) : best;
  }, null);
  return { mostActive, bestWinRate };
}

export type CrossMetric = 'net' | 'trades' | 'win-rate' | 'profit-factor';

/** The most columns a cross-analysis shows: the busiest fill 11 and the rest fold into 'Other'. */
export const MAX_CROSS_COLUMNS = 12;
export const OTHER = 'Other';

/** A row or column of the cross-analysis: `key` is unique, `label` is what it reads. */
export interface CrossAxis {
  key: string;
  label: string;
}

/**
 * Two breakdowns against each other: a row per `rows` entry and a column per
 * `cols` entry, each cell the metric over the trades in both. Entries carry a
 * unique `key` and the label the breakdown shows (two tags may share a label).
 * `counts` holds the trades in each cell, so one call serves the metric and the count. Rows and columns with no trades are left out; past
 * 12 columns the busiest 11 stay in their order and the rest fold into 'Other'.
 * A pair with no trades is null, as is a win rate with no decided trade. A trade
 * with several strategies or tags counts in each of them. `net` follows the
 * P&L basis, as every figure does.
 */
export function breakdown2D(
  trades: readonly Trade[],
  ctx: MetricContext & BreakdownOptions,
  rows: BreakdownKey,
  cols: BreakdownKey,
  metric: CrossMetric,
  opts: BreakdownOptions = {},
): {
  rows: CrossAxis[];
  cols: CrossAxis[];
  cells: (number | null)[][];
  /** Closed trades per cell; null where the pair has none. */
  counts: (number | null)[][];
  /** The closed trades in each cell, for the display units. */
  tradeIds: string[][][];
} {
  const merged = { ...ctx, ...opts };
  const closed = trades.filter(isClosed);
  const rowSpec = specOf(rows, merged, closed);
  const colSpec = specOf(cols, merged, closed);
  const rowGroups = grouped(closed, rowSpec);
  const colGroups = grouped(closed, colSpec);
  const order = (by: BreakdownKey) =>
    breakdown(trades, by, merged).filter((r) => r.summary.closedCount > 0);
  const rowAxis = order(rows).map((r) => ({ key: r.key, label: r.label }));
  let colRows = order(cols);
  const folded = colRows.length > MAX_CROSS_COLUMNS;
  let other = new Set<string>();
  if (folded) {
    const keep = new Set(
      [...colRows]
        .sort((a, b) => b.summary.closedCount - a.summary.closedCount)
        .slice(0, MAX_CROSS_COLUMNS - 1)
        .map((r) => r.key),
    );
    other = new Set(colRows.filter((r) => !keep.has(r.key)).map((r) => r.key));
    colRows = colRows.filter((r) => keep.has(r.key));
  }
  const colSets: { key: string; label: string; ids: Set<ClosedTrade> }[] =
    colRows.map((r) => ({
      key: r.key,
      label: r.label,
      ids: new Set(colGroups.get(r.key)),
    }));
  if (folded)
    colSets.push({
      key: OTHER,
      label: OTHER,
      ids: new Set([...other].flatMap((k) => colGroups.get(k) ?? [])),
    });
  const value = (ts: ClosedTrade[]): number | null => {
    if (ts.length === 0) return null;
    const s = summarize(ts, merged);
    switch (metric) {
      case 'net':
        return basisPnl(s);
      case 'trades':
        return s.closedCount;
      case 'win-rate':
        return s.winRate;
      case 'profit-factor':
        return s.profitFactor;
    }
  };
  const cellTrades = rowAxis.map((r) => {
    const inRow = rowGroups.get(r.key) ?? [];
    return colSets.map((c) => inRow.filter((t) => c.ids.has(t)));
  });
  return {
    rows: rowAxis,
    cols: colSets.map((c) => ({ key: c.key, label: c.label })),
    cells: cellTrades.map((r) => r.map(value)),
    tradeIds: cellTrades.map((r) => r.map((ts) => ts.map((t) => t.id))),
    counts: cellTrades.map((r) =>
      r.map((ts) => (ts.length === 0 ? null : ts.length)),
    ),
  };
}

/**
 * Histogram of R multiples over closed trades; contiguous [from, to) bins
 * including empty ones. Past -5R and +5R the multiples gather into two tails,
 * "\u22125R or less" and "+5R or more", so one outlier can't stretch the chart.
 */
export function rDistribution(
  trades: readonly Trade[],
  binWidth = 0.5,
  basis: PnlBasis = 'net',
): RBin[] {
  const per = R_CLAMP / binWidth;
  const idx = trades
    .filter(isClosed)
    .map((t) => rOf(t, basis))
    .filter((r): r is number => r !== undefined)
    .map((r) =>
      r <= -R_CLAMP
        ? -per - 1
        : r >= R_CLAMP
          ? per
          : Math.floor(r / binWidth + 1e-9),
    );
  if (idx.length === 0) return [];
  const lo = Math.min(...idx);
  const hi = Math.max(...idx);
  const bins: RBin[] = [];
  for (let i = lo; i <= hi; i++) {
    const from = i * binWidth;
    const to = from + binWidth;
    bins.push(
      i === -per - 1
        ? {
            from: -Infinity,
            to: -R_CLAMP,
            count: 0,
            label: `\u2212${R_CLAMP}R or less`,
          }
        : i === per
          ? {
              from: R_CLAMP,
              to: Infinity,
              count: 0,
              label: `+${R_CLAMP}R or more`,
            }
          : { from, to, count: 0, label: `${rLabel(from)} to ${rLabel(to)}` },
    );
  }
  for (const i of idx) bins[i - lo]!.count += 1;
  return bins;
}

/** One side of "wins vs losses": the trades `classify` calls a win, or a loss. */
export interface WinLossSide {
  count: number;
  /** The trades on this side, for the display units. */
  tradeIds: string[];
  /** The sum of their P&L on the basis. */
  net: Cents;
  avgNet: Cents | null;
  /** Minutes held. */
  avgDurationMin: number | null;
  avgR: number | null;
  /** The mean of the largest position each held. */
  avgSize: number | null;
  avgMae: Cents | null;
  avgMfe: Cents | null;
  /** The share that were long, 0..1. */
  longShare: number | null;
}

const mean = (xs: readonly number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * The winners against the losers, outcomes from `classify` so they agree with
 * every other figure; breakeven trades are in neither. A figure a trade lacks
 * (a stop for R, a recorded MAE or MFE) is averaged over the trades that have it.
 */
export function winsVsLosses(
  trades: readonly Trade[],
  ctx: MetricContext,
): Record<'wins' | 'losses', WinLossSide> {
  const closed = trades.filter(isClosed);
  const side = (outcome: 'win' | 'loss'): WinLossSide => {
    const picked = closed
      .map((t) => ({ t, c: classify(t, ctx) }))
      .filter((x) => x.c.outcome === outcome);
    const ts = picked.map((x) => x.t);
    const nets = picked.map((x) => x.c.value);
    const rounded = (n: number | null) =>
      n === null ? null : roundHalfEven(n);
    const present = <T>(xs: (T | undefined)[]) =>
      xs.filter((x): x is T => x !== undefined);
    return {
      count: ts.length,
      tradeIds: ts.map((t) => t.id),
      net: nets.reduce((a, b) => a + b, 0),
      avgNet: rounded(mean(nets)),
      avgDurationMin: mean(
        ts.map((t) => (Date.parse(t.closedAt) - Date.parse(t.openedAt)) / MIN),
      ),
      avgR: mean(present(ts.map((t) => rOf(t, ctx.pnlBasis)))),
      avgSize: mean(ts.map((t) => t.maxPosition)),
      avgMae: rounded(mean(present(ts.map((t) => t.mae)))),
      avgMfe: rounded(mean(present(ts.map((t) => t.mfe)))),
      longShare:
        ts.length === 0
          ? null
          : ts.filter((t) => t.direction === 'long').length / ts.length,
    };
  };
  return { wins: side('win'), losses: side('loss') };
}

import { ASSET_CLASSES } from '../domain/asset-class';
import {
  bucketRange,
  SESSION_KEYS,
  type BreakdownKey,
  type Session,
} from '../domain/metrics/breakdowns';
import { priceSpan } from '../domain/metrics/price-ranges';
import type { AssetClass } from '../domain/types';
import {
  queryString,
  serializeFilters,
  type GlobalFilters,
  type NumRange,
  type TimeWindow,
} from './filters';

/** The key a breakdown gives trades that have no value to file under. */
const NONE = '__none__';
/** The cross-analysis column that folds the quietest columns together. */
const FOLDED = 'Other';

/** What the time reports were set to when the bucket was drawn. */
export interface BucketOptions {
  timeBasis?: 'entry' | 'exit';
  bucketMinutes?: 5 | 15 | 30 | 60;
}

const WEEKDAY_NUMBER: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

/** The overlap of two ranges, or null when they share no value. */
export function intersectRanges(
  a: NumRange | undefined,
  b: NumRange,
): NumRange | null {
  if (a === undefined) return b;
  let min = a.min;
  let minExclusive = a.minExclusive === true;
  if (b.min !== undefined && (min === undefined || b.min >= min)) {
    minExclusive =
      b.min === min
        ? minExclusive || b.minExclusive === true
        : b.minExclusive === true;
    min = b.min;
  }
  let max = a.max;
  let maxExclusive = a.maxExclusive === true;
  if (b.max !== undefined && (max === undefined || b.max <= max)) {
    maxExclusive =
      b.max === max
        ? maxExclusive || b.maxExclusive === true
        : b.maxExclusive === true;
    max = b.max;
  }
  if (min !== undefined && max !== undefined) {
    if (min > max) return null;
    if (min === max && (minExclusive || maxExclusive)) return null;
  }
  return {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(min !== undefined && minExclusive ? { minExclusive: true } : {}),
    ...(max !== undefined && maxExclusive ? { maxExclusive: true } : {}),
  };
}

const minutesOf = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** The windows of `base` cut to [from, to] minutes of the day; null when nothing is left. */
function cutWindows(
  base: readonly TimeWindow[],
  from: number,
  to: number,
): TimeWindow[] | null {
  if (base.length === 0) return [{ from: hhmm(from), to: hhmm(to) }];
  const out: TimeWindow[] = [];
  for (const w of base) {
    const lo = w.from === undefined ? 0 : minutesOf(w.from);
    const hi = w.to === undefined ? 24 * 60 - 1 : minutesOf(w.to);
    // A window that wraps past midnight is two spans of the day.
    const spans: [number, number][] =
      lo <= hi
        ? [[lo, hi]]
        : [
            [lo, 24 * 60 - 1],
            [0, hi],
          ];
    for (const [a, b] of spans) {
      const x = Math.max(a, from);
      const y = Math.min(b, to);
      if (x <= y) out.push({ from: hhmm(x), to: hhmm(y) });
    }
  }
  return out.length === 0 ? null : out;
}

/** `base` narrowed to one of its own values; null when the bucket lies outside it. */
function oneOf<T>(base: readonly T[], value: T): T[] | null {
  return base.length === 0 || base.includes(value) ? [value] : null;
}

/**
 * The strategies (or tags) a bucket asks for, on top of what the page already
 * asks for. The page's choice stays in force, so the log holds only trades
 * the bucket counted; where one filter cannot say both, there is no link.
 */
function withId(
  ids: readonly string[],
  match: 'any' | 'all',
  id: string,
): { ids: string[]; match: 'any' | 'all' } | null {
  if (ids.length === 0) return { ids: [id], match };
  if (match === 'all') return { ids: [...new Set([...ids, id])].sort(), match };
  // "Any of" the page's choice: a bucket inside it is just that one.
  if (ids.includes(id)) return { ids: [id], match };
  // One strategy on the page and one in the bucket: the trade has both.
  if (ids.length === 1)
    return { ids: [...ids, id].sort(), match: 'all' as const };
  return null;
}

/**
 * The filters that show the trades one bucket of a breakdown counted: the
 * page's own `base` with the bucket's filter on top. Null when the bucket has
 * no filter that says it (the cross-analysis's "Other" column: see
 * `otherFilters`), or when the page's filters leave the bucket empty or cannot
 * be combined with it.
 *
 * Each filter reads the date its breakdown buckets by: the weekday and month
 * of the entry, or of the exit when the report is set to exit time.
 */
export function bucketFilters(
  base: GlobalFilters,
  by: BreakdownKey,
  key: string,
  opts: BucketOptions = {},
): GlobalFilters | null {
  if (key === FOLDED) return null;
  // The log lists closed trades unless told otherwise; a breakdown counts closed ones.
  if (base.status === 'open') return null;
  const exit = opts.timeBasis === 'exit';
  switch (by) {
    case 'side': {
      if (key !== 'long' && key !== 'short') return null;
      return base.side === undefined || base.side === key
        ? { ...base, side: key }
        : null;
    }
    case 'symbol':
    case 'symbol-top':
    case 'symbol-bottom': {
      const symbols = oneOf(base.symbols, key);
      return symbols ? { ...base, symbols } : null;
    }
    case 'strategy': {
      if (key === NONE) {
        if (base.strategyIds.length > 0 && !base.noStrategy) return null;
        return { ...base, strategyIds: [], noStrategy: true };
      }
      if (base.strategyIds.length === 0 && base.noStrategy) return null;
      const next = withId(base.strategyIds, base.strategyMatch, key);
      return next
        ? {
            ...base,
            strategyIds: next.ids,
            strategyMatch: next.match,
            noStrategy: false,
          }
        : null;
    }
    case 'tag': {
      if (key === NONE) {
        if (base.tagIds.length > 0 && !base.noTags) return null;
        return { ...base, tagIds: [], noTags: true };
      }
      if (base.tagIds.length === 0 && base.noTags) return null;
      const next = withId(base.tagIds, base.tagMatch, key);
      return next
        ? { ...base, tagIds: next.ids, tagMatch: next.match, noTags: false }
        : null;
    }
    case 'weekday': {
      const day = WEEKDAY_NUMBER[key];
      if (day === undefined) return null;
      const field = exit ? 'exitWeekdays' : 'weekdays';
      const days = oneOf(base[field], day);
      return days ? { ...base, [field]: days } : null;
    }
    case 'month': {
      const month = Number(key);
      if (!Number.isInteger(month) || month < 1 || month > 12) return null;
      const field = exit ? 'exitMonths' : 'months';
      const months = oneOf(base[field], month);
      return months ? { ...base, [field]: months } : null;
    }
    case 'hour':
    case 'exit-hour':
    case 'time-of-day': {
      const width = by === 'time-of-day' ? (opts.bucketMinutes ?? 30) : 60;
      const start = by === 'time-of-day' ? minutesOf(key) : Number(key) * 60;
      if (!Number.isFinite(start)) return null;
      // The exit hour is always the exit's, whatever the report's time basis.
      const field = exit || by === 'exit-hour' ? 'exitWindows' : 'entryWindows';
      const windows = cutWindows(base[field], start, start + width - 1);
      return windows ? { ...base, [field]: windows } : null;
    }
    case 'duration': {
      const range = bucketRange('duration', key);
      const next = range && intersectRanges(base.duration, range);
      return next ? { ...base, duration: next } : null;
    }
    case 'size': {
      const range = bucketRange('size', key);
      const next = range && intersectRanges(base.size, range);
      return next ? { ...base, size: next } : null;
    }
    case 'r': {
      if (key === NONE) {
        // Trades with no stop have no R: a page asking for an R range has none of them.
        return base.r === undefined ? { ...base, noInitialRisk: true } : null;
      }
      if (base.noInitialRisk) return null;
      const range = bucketRange('r', key);
      const next = range && intersectRanges(base.r, range);
      return next ? { ...base, r: next } : null;
    }
    case 'instrument': {
      if (!(ASSET_CLASSES as readonly string[]).includes(key)) return null;
      const classes = oneOf(base.assetClasses, key as AssetClass);
      return classes ? { ...base, assetClasses: classes } : null;
    }
    case 'account': {
      const accountIds = oneOf(base.accountIds, key);
      return accountIds ? { ...base, accountIds } : null;
    }
    case 'entry-price':
    case 'exit-price': {
      const span = priceSpan(key);
      if (!span) return null;
      // A range of prices: the lower edge is in, the upper is the next range's.
      const range = { min: span.from, max: span.to, maxExclusive: true };
      const field = by === 'entry-price' ? 'entryPrice' : 'exitPrice';
      const next = intersectRanges(base[field], range);
      return next ? { ...base, [field]: next } : null;
    }
    case 'session': {
      if (!(SESSION_KEYS as readonly string[]).includes(key)) return null;
      const field = exit ? 'exitSessions' : 'sessions';
      const sessions = oneOf<Session>(base[field], key as Session);
      return sessions ? { ...base, [field]: sessions } : null;
    }
    case 'dte': {
      const range = bucketRange('dte', key);
      const next = range && intersectRanges(base.daysToExpiry, range);
      return next ? { ...base, daysToExpiry: next } : null;
    }
  }
}

/** The keys a folded "Other" column holds, and the keys that kept a column of their own. */
export interface Folded {
  kept: readonly string[];
  others: readonly string[];
}

/** Windows that touch or overlap run together as one. */
function mergeWindows(windows: readonly TimeWindow[]): TimeWindow[] {
  const spans = windows
    .map((w) => [minutesOf(w.from!), minutesOf(w.to!)] as const)
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [from, to] of spans) {
    const last = out[out.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out.map(([from, to]) => ({ from: hhmm(from), to: hhmm(to) }));
}

/** The values of `base` that `values` keep; all of `values` when `base` asks for none. Null when nothing is left. */
function within<T>(base: readonly T[], values: readonly T[]): T[] | null {
  const kept =
    base.length === 0 ? [...values] : values.filter((v) => base.includes(v));
  return kept.length === 0 ? null : kept;
}

/**
 * The filters that show what a cross-analysis "Other" column counted: the
 * trades in none of the columns that kept one. Symbols say it as "every
 * symbol except these"; the dimensions that file a trade under one value
 * (weekday, month, hour, account, instrument) as the list of the folded values;
 * strategies and tags as "any of the folded ones". Null for a dimension whose
 * folded buckets are ranges (prices, R, size, duration: no one range says
 * them), or where the page's own filter on the dimension cannot be combined
 * with it.
 */
export function otherFilters(
  base: GlobalFilters,
  by: BreakdownKey,
  folded: Folded,
  opts: BucketOptions = {},
): GlobalFilters | null {
  if (base.status === 'open') return null;
  const exit = opts.timeBasis === 'exit';
  const { kept, others } = folded;
  if (others.length === 0) return null;
  switch (by) {
    case 'symbol':
    case 'symbol-top':
    case 'symbol-bottom': {
      return {
        ...base,
        excludeSymbols: [...new Set([...base.excludeSymbols, ...kept])].sort(),
      };
    }
    case 'strategy': {
      // Where the page asks for strategies too, one filter cannot say both.
      if (base.strategyIds.length > 0 || base.noStrategy) return null;
      const ids = others.filter((k) => k !== NONE);
      return {
        ...base,
        strategyIds: ids.sort(),
        strategyMatch: 'any',
        noStrategy: others.includes(NONE),
      };
    }
    case 'tag': {
      if (base.tagIds.length > 0 || base.noTags) return null;
      const ids = others.filter((k) => k !== NONE);
      return {
        ...base,
        tagIds: ids.sort(),
        tagMatch: 'any',
        noTags: others.includes(NONE),
      };
    }
    case 'weekday': {
      const days = others
        .map((k) => WEEKDAY_NUMBER[k])
        .filter((d) => d !== undefined);
      const field = exit ? 'exitWeekdays' : 'weekdays';
      const next = within(base[field], days);
      return next ? { ...base, [field]: next.sort((a, b) => a - b) } : null;
    }
    case 'month': {
      const months = others.map(Number);
      const field = exit ? 'exitMonths' : 'months';
      const next = within(base[field], months);
      return next ? { ...base, [field]: next.sort((a, b) => a - b) } : null;
    }
    case 'account': {
      const next = within(base.accountIds, others);
      return next ? { ...base, accountIds: next.sort() } : null;
    }
    case 'instrument': {
      const classes = others.filter((k): k is AssetClass =>
        (ASSET_CLASSES as readonly string[]).includes(k),
      );
      const next = within(base.assetClasses, classes);
      return next ? { ...base, assetClasses: next } : null;
    }
    case 'session': {
      const sessions = others.filter((k): k is Session =>
        (SESSION_KEYS as readonly string[]).includes(k),
      );
      const field = exit ? 'exitSessions' : 'sessions';
      const next = within(base[field], sessions);
      return next ? { ...base, [field]: next } : null;
    }
    case 'hour':
    case 'exit-hour':
    case 'time-of-day': {
      const width = by === 'time-of-day' ? (opts.bucketMinutes ?? 30) : 60;
      const field = exit || by === 'exit-hour' ? 'exitWindows' : 'entryWindows';
      const cut: TimeWindow[] = [];
      for (const key of others) {
        const start = by === 'time-of-day' ? minutesOf(key) : Number(key) * 60;
        if (!Number.isFinite(start)) return null;
        cut.push(...(cutWindows(base[field], start, start + width - 1) ?? []));
      }
      return cut.length === 0 ? null : { ...base, [field]: mergeWindows(cut) };
    }
    // Ranges: the folded buckets are not one range.
    default:
      return null;
  }
}

/** The log's address for a set of filters. */
export function tradeLogHref(f: GlobalFilters): string {
  const qs = queryString(serializeFilters(f));
  return qs === '' ? '/app/trades' : `/app/trades?${qs}`;
}

/**
 * The log's address for one strategy's trades, or for the trades with none
 * (`strategyId` null), under the page's filters: the strategy breakdown's own
 * bucket, so the log holds the trades the page counted, with the page's
 * status kept. Undefined when one filter cannot say both (the page asks for
 * other strategies, any of them).
 */
export function strategyLogHref(
  base: GlobalFilters,
  strategyId: string | null,
): string | undefined {
  const f = bucketFilters(
    { ...base, status: undefined },
    'strategy',
    strategyId ?? NONE,
  );
  if (!f) return undefined;
  return tradeLogHref(base.status ? { ...f, status: base.status } : f);
}

/** The log's address for one bucket, or undefined when the bucket is not a link. */
export function bucketHref(
  base: GlobalFilters,
  by: BreakdownKey,
  key: string,
  opts?: BucketOptions,
): string | undefined {
  const f = bucketFilters(base, by, key, opts);
  return f ? tradeLogHref(f) : undefined;
}

/** The log's address for a cell of two breakdowns: both buckets' filters on the page's. */
export function cellHref(
  base: GlobalFilters,
  rows: { by: BreakdownKey; key: string },
  cols: { by: BreakdownKey; key: string; folded?: Folded },
  opts?: BucketOptions,
): string | undefined {
  const first = bucketFilters(base, rows.by, rows.key, opts);
  if (!first) return undefined;
  // The "Other" column is the keys that were folded into it.
  const f =
    cols.key === FOLDED && cols.folded
      ? otherFilters(first, cols.by, cols.folded, opts)
      : bucketFilters(first, cols.by, cols.key, opts);
  return f ? tradeLogHref(f) : undefined;
}

/**
 * The calendar's address for one day: its month and the day open, under the
 * page's filters, so the calendar reads the trades the figure did. With
 * `currency` (a page on one of several currencies) it opens on that one.
 */
export function calendarHref(
  base: GlobalFilters,
  day: string,
  currency?: string,
): string {
  const params = serializeFilters(base);
  params.set('month', day.slice(0, 7));
  params.set('day', day);
  if (currency) params.set('cur', currency);
  return `/app/calendar?${queryString(params)}`;
}

/**
 * Reports > Overview for one month: the page's filters kept, the date range
 * set to the month's first and last day, and with `currency` that currency.
 */
export function monthReportHref(
  base: GlobalFilters,
  month: string,
  currency?: string,
): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const params = serializeFilters({
    ...base,
    range: {
      from: `${month}-01`,
      to: `${month}-${String(last).padStart(2, '0')}`,
    },
  });
  if (currency) params.set('cur', currency);
  return `/app/reports?${queryString(params)}`;
}

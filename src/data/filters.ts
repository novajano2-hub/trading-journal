import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parse,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subMonths,
} from 'date-fns';
import { classify } from '../domain/metrics/context';
import { rOf, unitKeeps } from '../domain/metrics/units';
import { localDate, localParts } from '../domain/time';
import type {
  Account,
  BreakevenRange,
  Direction,
  DisplayUnit,
  PnlBasis,
  Trade,
} from '../domain/types';

export const DATE_PRESETS = [
  'today',
  'this-week',
  'last-week',
  'this-month',
  'last-month',
  'last-30-days',
  'this-quarter',
  'ytd',
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

/** Inclusive local dates (YYYY-MM-DD); `{}` means all time. */
export type DateRange = { preset: DatePreset } | { from?: string; to?: string };

/** A span of the local day, 'HH:MM'. `from` after `to` wraps past midnight; a missing end is open. */
export interface TimeWindow {
  from?: string;
  to?: string;
}
export interface NumRange {
  min?: number;
  max?: number;
  /** The bound itself is out: `size > 100`. Written `>100_` in the address. */
  minExclusive?: boolean;
  /** The bound itself is out: `duration < 5`. Written `_<5` in the address. */
  maxExclusive?: boolean;
}
export type Outcome = 'win' | 'loss' | 'breakeven';
export type Rating = 1 | 2 | 3 | 4 | 5;

export interface GlobalFilters {
  range: DateRange;
  accountIds: string[];
  symbols: string[];
  side?: Direction;
  strategyIds: string[];
  tagIds: string[];
  excludeSymbols: string[];
  excludeStrategyIds: string[];
  /** Matches trades with no strategy; ORs with `strategyIds`. */
  noStrategy: boolean;
  strategyMatch: 'any' | 'all';
  excludeTagIds: string[];
  tagMatch: 'any' | 'all';
  outcomes: Outcome[];
  status?: 'open' | 'closed';
  holding?: 'intraday' | 'multiday';
  reviewed?: boolean;
  ratings: Rating[];
  /** 1 Monday to 7 Sunday, of the day the trade opened. */
  weekdays: number[];
  /** 1 to 12, of the month the trade opened. */
  months: number[];
  /** 1 Monday to 7 Sunday, of the day the trade closed. */
  exitWeekdays: number[];
  /** 1 to 12, of the month the trade closed. */
  exitMonths: number[];
  entryWindows: TimeWindow[];
  exitWindows: TimeWindow[];
  /** Minutes. */
  duration?: NumRange;
  entryPrice?: NumRange;
  exitPrice?: NumRange;
  /** The trade's largest position. */
  size?: NumRange;
  /** Realized R. */
  r?: NumRange;
}

export const EMPTY_FILTERS: GlobalFilters = {
  range: {},
  accountIds: [],
  symbols: [],
  strategyIds: [],
  tagIds: [],
  excludeSymbols: [],
  excludeStrategyIds: [],
  noStrategy: false,
  strategyMatch: 'any',
  excludeTagIds: [],
  tagMatch: 'any',
  outcomes: [],
  ratings: [],
  weekdays: [],
  months: [],
  exitWeekdays: [],
  exitMonths: [],
  entryWindows: [],
  exitWindows: [],
};

export const FILTER_PARAMS = [
  'range',
  'from',
  'to',
  'account',
  'symbol',
  'side',
  'strategy',
  'tag',
  'xsym',
  'xstrat',
  'nostrat',
  'stratmatch',
  'xtag',
  'tagmatch',
  'outcome',
  'status',
  'hold',
  'reviewed',
  'rating',
  'wd',
  'mo',
  'xwd',
  'xmo',
  'entry',
  'exit',
  'dur',
  'ep',
  'xp',
  'size',
  'r',
] as const;

const OUTCOMES: readonly Outcome[] = ['win', 'loss', 'breakeven'];

/** How many of the panel's "More filters" are in use: one per field that is set. */
export function advancedFilterCount(f: GlobalFilters): number {
  const used = [
    f.excludeSymbols.length > 0,
    f.excludeStrategyIds.length > 0,
    f.noStrategy,
    f.excludeTagIds.length > 0,
    f.outcomes.length > 0,
    f.status !== undefined,
    f.holding !== undefined,
    f.reviewed !== undefined,
    f.ratings.length > 0,
    f.weekdays.length > 0,
    f.months.length > 0,
    f.exitWeekdays.length > 0,
    f.exitMonths.length > 0,
    f.entryWindows.length > 0,
    f.exitWindows.length > 0,
    f.duration !== undefined,
    f.entryPrice !== undefined,
    f.exitPrice !== undefined,
    f.size !== undefined,
    f.r !== undefined,
  ];
  return used.filter(Boolean).length;
}

const DATE_FORMAT = 'yyyy-MM-dd';
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(s: string): Date {
  return parse(s, DATE_FORMAT, new Date(0));
}

function fmt(d: Date): string {
  return format(d, DATE_FORMAT);
}

function validDate(s: string | null): string | undefined {
  if (s === null || !DATE_SHAPE.test(s)) return undefined;
  const d = toDate(s);
  return Number.isNaN(d.getTime()) || fmt(d) !== s ? undefined : s;
}

function uniqueValues(
  values: string[],
  map: (v: string) => string = (v) => v,
): string[] {
  return [...new Set(values.map(map).filter((v) => v !== ''))];
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const NUMBER_LO = /^>?-?\d+(\.\d+)?$/;
const NUMBER_HI = /^<?-?\d+(\.\d+)?$/;

/** A list param: comma-separated, and repeated keys from older links add to it. */
function listOf(
  params: Pick<URLSearchParams, 'getAll'>,
  key: string,
): string[] {
  return params
    .getAll(key)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

function intsOf(
  params: Pick<URLSearchParams, 'getAll'>,
  key: string,
  lo: number,
  hi: number,
): number[] {
  const out = listOf(params, key)
    .filter((v) => /^\d+$/.test(v))
    .map(Number)
    .filter((n) => n >= lo && n <= hi);
  return [...new Set(out)].sort((a, b) => a - b);
}

function windowsOf(
  params: Pick<URLSearchParams, 'getAll'>,
  key: string,
): TimeWindow[] {
  const out: TimeWindow[] = [];
  for (const part of listOf(params, key)) {
    const m = /^(\d{2}:\d{2})?-(\d{2}:\d{2})?$/.exec(part);
    if (!m) continue;
    const [, from, to] = m;
    if ((from === undefined && to === undefined) || (from && !TIME.test(from)))
      continue;
    if (to && !TIME.test(to)) continue;
    out.push({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
  }
  return out;
}

function rangeOf(
  params: Pick<URLSearchParams, 'get'>,
  key: string,
): NumRange | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  const [lo, hi, ...rest] = raw.split('_');
  if (lo === undefined || hi === undefined || rest.length > 0) return undefined;
  if ((lo !== '' && !NUMBER_LO.test(lo)) || (hi !== '' && !NUMBER_HI.test(hi)))
    return undefined;
  if (lo === '' && hi === '') return undefined;
  const loOut = lo.startsWith('>');
  const hiOut = hi.startsWith('<');
  let min = lo === '' ? undefined : Number(lo.replace('>', ''));
  let max = hi === '' ? undefined : Number(hi.replace('<', ''));
  let minExclusive = loOut;
  let maxExclusive = hiOut;
  if (min !== undefined && max !== undefined && min > max) {
    [min, max] = [max, min];
    [minExclusive, maxExclusive] = [maxExclusive, minExclusive];
  }
  return {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(min !== undefined && minExclusive ? { minExclusive: true } : {}),
    ...(max !== undefined && maxExclusive ? { maxExclusive: true } : {}),
  };
}

export function parseFilters(
  params: Pick<URLSearchParams, 'get' | 'getAll'>,
): GlobalFilters {
  const rangeParam = params.get('range');
  let range: DateRange = {};
  if (
    rangeParam !== null &&
    (DATE_PRESETS as readonly string[]).includes(rangeParam)
  ) {
    range = { preset: rangeParam as DatePreset };
  } else {
    let from = validDate(params.get('from'));
    let to = validDate(params.get('to'));
    if (from !== undefined && to !== undefined && from > to)
      [from, to] = [to, from];
    range = {
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
    };
  }
  const side = params.get('side');
  const status = params.get('status');
  const hold = params.get('hold');
  const reviewed = params.get('reviewed');
  const outcomeSet = new Set(listOf(params, 'outcome'));
  const ratings = intsOf(params, 'rating', 1, 5) as Rating[];
  const optional = <K extends string, V>(key: K, value: V | undefined) =>
    value === undefined ? {} : ({ [key]: value } as Record<K, V>);
  const duration = rangeOf(params, 'dur');
  const entryPrice = rangeOf(params, 'ep');
  const exitPrice = rangeOf(params, 'xp');
  const size = rangeOf(params, 'size');
  const r = rangeOf(params, 'r');
  return {
    range,
    accountIds: uniqueValues(listOf(params, 'account')),
    symbols: uniqueValues(listOf(params, 'symbol'), (v) => v.toUpperCase()),
    ...(side === 'long' || side === 'short' ? { side } : {}),
    strategyIds: uniqueValues(listOf(params, 'strategy')),
    tagIds: uniqueValues(listOf(params, 'tag')),
    excludeSymbols: uniqueValues(listOf(params, 'xsym'), (v) =>
      v.toUpperCase(),
    ),
    excludeStrategyIds: uniqueValues(listOf(params, 'xstrat')),
    noStrategy: params.get('nostrat') === '1',
    strategyMatch: params.get('stratmatch') === 'all' ? 'all' : 'any',
    excludeTagIds: uniqueValues(listOf(params, 'xtag')),
    tagMatch: params.get('tagmatch') === 'all' ? 'all' : 'any',
    outcomes: OUTCOMES.filter((o) => outcomeSet.has(o)),
    ...(status === 'open' || status === 'closed' ? { status } : {}),
    ...(hold === 'intraday' || hold === 'multiday' ? { holding: hold } : {}),
    ...(reviewed === '1' ? { reviewed: true } : {}),
    ...(reviewed === '0' ? { reviewed: false } : {}),
    ratings,
    weekdays: intsOf(params, 'wd', 1, 7),
    months: intsOf(params, 'mo', 1, 12),
    exitWeekdays: intsOf(params, 'xwd', 1, 7),
    exitMonths: intsOf(params, 'xmo', 1, 12),
    entryWindows: windowsOf(params, 'entry'),
    exitWindows: windowsOf(params, 'exit'),
    ...optional('duration', duration),
    ...optional('entryPrice', entryPrice),
    ...optional('exitPrice', exitPrice),
    ...optional('size', size),
    ...optional('r', r),
  };
}

export function serializeFilters(f: GlobalFilters): URLSearchParams {
  const p = new URLSearchParams();
  if ('preset' in f.range) p.set('range', f.range.preset);
  else {
    if (f.range.from) p.set('from', f.range.from);
    if (f.range.to) p.set('to', f.range.to);
  }
  const list = (key: string, values: readonly (string | number)[]) => {
    if (values.length > 0) p.set(key, values.join(','));
  };
  const sorted = (values: readonly string[]) => [...new Set(values)].sort();
  const span = (r: NumRange | undefined) =>
    r === undefined || (r.min === undefined && r.max === undefined)
      ? undefined
      : `${r.min === undefined ? '' : `${r.minExclusive ? '>' : ''}${r.min}`}_${r.max === undefined ? '' : `${r.maxExclusive ? '<' : ''}${r.max}`}`;
  const windows = (key: string, ws: readonly TimeWindow[]) =>
    list(
      key,
      ws.map((w) => `${w.from ?? ''}-${w.to ?? ''}`),
    );
  const range = (key: string, r: NumRange | undefined) => {
    const v = span(r);
    if (v !== undefined) p.set(key, v);
  };
  list('account', sorted(f.accountIds));
  list('symbol', sorted(f.symbols));
  if (f.side) p.set('side', f.side);
  list('strategy', sorted(f.strategyIds));
  list('tag', sorted(f.tagIds));
  list('xsym', sorted(f.excludeSymbols));
  list('xstrat', sorted(f.excludeStrategyIds));
  if (f.noStrategy) p.set('nostrat', '1');
  if (f.strategyMatch === 'all') p.set('stratmatch', 'all');
  list('xtag', sorted(f.excludeTagIds));
  if (f.tagMatch === 'all') p.set('tagmatch', 'all');
  list(
    'outcome',
    OUTCOMES.filter((o) => f.outcomes.includes(o)),
  );
  if (f.status) p.set('status', f.status);
  if (f.holding) p.set('hold', f.holding);
  if (f.reviewed !== undefined) p.set('reviewed', f.reviewed ? '1' : '0');
  list('rating', [...new Set(f.ratings)].sort());
  list(
    'wd',
    [...new Set(f.weekdays)].sort((a, b) => a - b),
  );
  list(
    'mo',
    [...new Set(f.months)].sort((a, b) => a - b),
  );
  list(
    'xwd',
    [...new Set(f.exitWeekdays)].sort((a, b) => a - b),
  );
  list(
    'xmo',
    [...new Set(f.exitMonths)].sort((a, b) => a - b),
  );
  windows('entry', f.entryWindows);
  windows('exit', f.exitWindows);
  range('dur', f.duration);
  range('ep', f.entryPrice);
  range('xp', f.exitPrice);
  range('size', f.size);
  range('r', f.r);
  return p;
}

/**
 * The query string for `params`, with the commas and colons that filter
 * values use left readable (`account=a,b`, `entry=09:30-11:00`); both are
 * legal in a query and read back the same.
 */
export function queryString(params: URLSearchParams): string {
  return params.toString().replace(/%2C/gi, ',').replace(/%3A/gi, ':');
}

/** Keeps non-filter keys in their original order, then appends the serialized filters. */
export function mergeFilterParams(
  current: URLSearchParams,
  f: GlobalFilters,
): URLSearchParams {
  const out = new URLSearchParams();
  const own = new Set<string>(FILTER_PARAMS);
  current.forEach((value, key) => {
    if (!own.has(key)) out.append(key, value);
  });
  serializeFilters(f).forEach((value, key) => out.append(key, value));
  return out;
}

export function resolveRange(
  range: DateRange,
  today: string,
): { from?: string; to?: string } {
  if (!('preset' in range)) return { ...range };
  const t = toDate(today);
  switch (range.preset) {
    case 'today':
      return { from: today, to: today };
    case 'this-week':
      return { from: fmt(startOfWeek(t, { weekStartsOn: 1 })), to: today };
    case 'last-week': {
      const start = addDays(startOfWeek(t, { weekStartsOn: 1 }), -7);
      return { from: fmt(start), to: fmt(addDays(start, 6)) };
    }
    case 'this-month':
      return { from: fmt(startOfMonth(t)), to: today };
    case 'last-month': {
      const prev = subMonths(t, 1);
      return { from: fmt(startOfMonth(prev)), to: fmt(endOfMonth(prev)) };
    }
    case 'last-30-days':
      return { from: fmt(addDays(t, -29)), to: today };
    case 'this-quarter':
      return { from: fmt(startOfQuarter(t)), to: today };
    case 'ytd':
      return { from: fmt(startOfYear(t)), to: today };
  }
}

/**
 * The stretch of the same length that ends the day before `range` starts, for
 * "this period against the last". An open end runs to today; with no start
 * there is no previous period.
 */
export function previousRange(
  range: DateRange,
  today: string,
): { from: string; to: string } | undefined {
  const { from, to = today } = resolveRange(range, today);
  if (!from || to < from) return undefined;
  const days = differenceInCalendarDays(toDate(to), toDate(from)) + 1;
  const start = toDate(from);
  return { from: fmt(addDays(start, -days)), to: fmt(addDays(start, -1)) };
}

/** With no account filter only active accounts count; an explicit selection may include archived ones. */
export function selectedAccounts(
  accounts: readonly Account[],
  f: GlobalFilters,
): Account[] {
  if (f.accountIds.length === 0)
    return accounts.filter((a) => a.status === 'active');
  const ids = new Set(f.accountIds);
  return accounts.filter((a) => ids.has(a.id));
}

export interface FilterEnv {
  timeZone: string;
  today: string;
  accounts: readonly Account[];
  /** What counts as breakeven for the outcome filter; default is exactly 0. */
  breakevenRange?: BreakevenRange;
  /** The basis the outcome is read on, as `summarize` reads it; default net. */
  pnlBasis?: PnlBasis;
}

const NO_RANGE: BreakevenRange = { unit: 'amount', from: 0, to: 0 };

function within(v: number, r: NumRange | undefined): boolean {
  if (r === undefined) return true;
  if (r.min !== undefined && (r.minExclusive ? v <= r.min : v < r.min))
    return false;
  if (r.max !== undefined && (r.maxExclusive ? v >= r.max : v > r.max))
    return false;
  return true;
}

function minutesOf(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** Whether a local minute of the day lies in any window; a window with `from` after `to` runs past midnight. */
function inWindows(minute: number, windows: readonly TimeWindow[]): boolean {
  return windows.some((w) => {
    const from = w.from === undefined ? 0 : minutesOf(w.from);
    const to = w.to === undefined ? 24 * 60 - 1 : minutesOf(w.to);
    return from <= to
      ? minute >= from && minute <= to
      : minute >= from || minute <= to;
  });
}

export function applyFilters(
  trades: readonly Trade[],
  f: GlobalFilters,
  env: FilterEnv,
): Trade[] {
  const { from, to } = resolveRange(f.range, env.today);
  const accountIds = new Set(
    selectedAccounts(env.accounts, f).map((a) => a.id),
  );
  const symbols = new Set(f.symbols);
  const exSymbols = new Set(f.excludeSymbols);
  const strategies = new Set(f.strategyIds);
  const exStrategies = new Set(f.excludeStrategyIds);
  const tags = new Set(f.tagIds);
  const exTags = new Set(f.excludeTagIds);
  const outcomes = new Set<Outcome>(f.outcomes);
  const ratings = new Set<number>(f.ratings);
  const weekdays = new Set(f.weekdays);
  const months = new Set(f.months);
  const exitWeekdays = new Set(f.exitWeekdays);
  const exitMonths = new Set(f.exitMonths);
  const breakeven = env.breakevenRange ?? NO_RANGE;
  const tz = env.timeZone;

  return trades.filter((t) => {
    if (!accountIds.has(t.accountId)) return false;
    if (from !== undefined || to !== undefined) {
      const day = localDate(t.closedAt ?? t.openedAt, tz);
      if (from !== undefined && day < from) return false;
      if (to !== undefined && day > to) return false;
    }
    const root = t.instrument.root;
    if (symbols.size > 0 && !symbols.has(root)) return false;
    if (exSymbols.has(root)) return false;
    if (f.side !== undefined && t.direction !== f.side) return false;

    if (t.strategyIds.some((id) => exStrategies.has(id))) return false;
    if (strategies.size > 0 || f.noStrategy) {
      const none = f.noStrategy && t.strategyIds.length === 0;
      const picked =
        strategies.size > 0 &&
        (f.strategyMatch === 'all'
          ? [...strategies].every((id) => t.strategyIds.includes(id))
          : t.strategyIds.some((id) => strategies.has(id)));
      if (!none && !picked) return false;
    }
    if (t.tagIds.some((id) => exTags.has(id))) return false;
    if (tags.size > 0) {
      const ok =
        f.tagMatch === 'all'
          ? [...tags].every((id) => t.tagIds.includes(id))
          : t.tagIds.some((id) => tags.has(id));
      if (!ok) return false;
    }

    const closed = t.status === 'closed' && t.closedAt !== undefined;
    if (f.status !== undefined && t.status !== f.status) return false;
    if (outcomes.size > 0) {
      if (!closed) return false;
      const o = classify(t, {
        breakevenRange: breakeven,
        pnlBasis: env.pnlBasis ?? 'net',
      }).outcome;
      if (!outcomes.has(o)) return false;
    }
    if (f.holding !== undefined) {
      if (!closed) return false;
      const same = localDate(t.openedAt, tz) === localDate(t.closedAt!, tz);
      if (f.holding === 'intraday' ? !same : same) return false;
    }
    if (f.reviewed !== undefined && (t.reviewed === true) !== f.reviewed)
      return false;
    if (ratings.size > 0 && (t.rating === undefined || !ratings.has(t.rating)))
      return false;

    if (weekdays.size > 0 || months.size > 0 || f.entryWindows.length > 0) {
      const open = localParts(t.openedAt, tz);
      // localParts counts Sunday as 0; the filter counts it as 7.
      if (weekdays.size > 0 && !weekdays.has(open.weekday || 7)) return false;
      if (months.size > 0 && !months.has(Number(open.date.slice(5, 7))))
        return false;
      if (
        f.entryWindows.length > 0 &&
        !inWindows(open.hour * 60 + open.minute, f.entryWindows)
      )
        return false;
    }
    if (exitWeekdays.size > 0 || exitMonths.size > 0) {
      if (!closed) return false;
      const out = localParts(t.closedAt!, tz);
      if (exitWeekdays.size > 0 && !exitWeekdays.has(out.weekday || 7))
        return false;
      if (exitMonths.size > 0 && !exitMonths.has(Number(out.date.slice(5, 7))))
        return false;
    }
    if (f.exitWindows.length > 0) {
      if (!closed) return false;
      const out = localParts(t.closedAt!, tz);
      if (!inWindows(out.hour * 60 + out.minute, f.exitWindows)) return false;
    }
    if (f.duration !== undefined) {
      if (!closed) return false;
      const minutes =
        (Date.parse(t.closedAt!) - Date.parse(t.openedAt)) / 60000;
      if (!within(minutes, f.duration)) return false;
    }
    if (!within(t.avgEntry, f.entryPrice)) return false;
    if (f.exitPrice !== undefined) {
      if (t.avgExit === undefined || !closed) return false;
      if (!within(t.avgExit, f.exitPrice)) return false;
    }
    if (!within(t.maxPosition, f.size)) return false;
    if (f.r !== undefined) {
      // The same R every report buckets by: on the basis the figures read.
      const r = rOf(t, env.pnlBasis ?? 'net');
      if (!closed || r === undefined || !within(r, f.r)) return false;
    }
    return true;
  });
}

/**
 * The trades a display unit reads: Ticks and Points the futures, Pips the
 * forex, R those with an initial risk; every trade under Dollar, Percentage
 * and Privacy. Applied after the filters, so a page's set narrows to the unit.
 */
export function narrowToUnit(
  trades: readonly Trade[],
  unit: DisplayUnit,
): Trade[] {
  return trades.filter((t) => unitKeeps(unit, t));
}

/** Drops ids that don't exist in the current workspace so a stale or foreign link doesn't blank the view. */
export function sanitizeFilters(
  f: GlobalFilters,
  known: {
    accountIds: ReadonlySet<string>;
    strategyIds: ReadonlySet<string>;
    tagIds: ReadonlySet<string>;
  },
): GlobalFilters {
  return {
    ...f,
    accountIds: f.accountIds.filter((id) => known.accountIds.has(id)),
    strategyIds: f.strategyIds.filter((id) => known.strategyIds.has(id)),
    tagIds: f.tagIds.filter((id) => known.tagIds.has(id)),
    excludeStrategyIds: f.excludeStrategyIds.filter((id) =>
      known.strategyIds.has(id),
    ),
    excludeTagIds: f.excludeTagIds.filter((id) => known.tagIds.has(id)),
  };
}

import {
  addDays,
  endOfMonth,
  format,
  parse,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from 'date-fns';
import { localDate } from '../domain/time';
import type { Account, Direction, Trade } from '../domain/types';

export const DATE_PRESETS = [
  'today',
  'this-week',
  'last-week',
  'this-month',
  'last-month',
  'last-30-days',
  'ytd',
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

/** Inclusive local dates (YYYY-MM-DD); `{}` means all time. */
export type DateRange = { preset: DatePreset } | { from?: string; to?: string };

export interface GlobalFilters {
  range: DateRange;
  accountIds: string[];
  symbols: string[];
  side?: Direction;
  strategyIds: string[];
  tagIds: string[];
}

export const EMPTY_FILTERS: GlobalFilters = {
  range: {},
  accountIds: [],
  symbols: [],
  strategyIds: [],
  tagIds: [],
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
] as const;

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
  return {
    range,
    accountIds: uniqueValues(params.getAll('account')),
    symbols: uniqueValues(params.getAll('symbol'), (v) => v.toUpperCase()),
    ...(side === 'long' || side === 'short' ? { side } : {}),
    strategyIds: uniqueValues(params.getAll('strategy')),
    tagIds: uniqueValues(params.getAll('tag')),
  };
}

export function serializeFilters(f: GlobalFilters): URLSearchParams {
  const p = new URLSearchParams();
  if ('preset' in f.range) p.set('range', f.range.preset);
  else {
    if (f.range.from) p.set('from', f.range.from);
    if (f.range.to) p.set('to', f.range.to);
  }
  const multi = (key: string, values: readonly string[]) => {
    for (const v of [...new Set(values)].sort()) p.append(key, v);
  };
  multi('account', f.accountIds);
  multi('symbol', f.symbols);
  if (f.side) p.set('side', f.side);
  multi('strategy', f.strategyIds);
  multi('tag', f.tagIds);
  return p;
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
    case 'ytd':
      return { from: fmt(startOfYear(t)), to: today };
  }
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
  const strategies = new Set(f.strategyIds);
  const tags = new Set(f.tagIds);
  return trades.filter((t) => {
    if (!accountIds.has(t.accountId)) return false;
    if (from !== undefined || to !== undefined) {
      const day = localDate(t.closedAt ?? t.openedAt, env.timeZone);
      if (from !== undefined && day < from) return false;
      if (to !== undefined && day > to) return false;
    }
    if (symbols.size > 0 && !symbols.has(t.instrument.root)) return false;
    if (f.side !== undefined && t.direction !== f.side) return false;
    if (
      strategies.size > 0 &&
      (t.strategyId === undefined || !strategies.has(t.strategyId))
    )
      return false;
    if (tags.size > 0 && !t.tagIds.some((id) => tags.has(id))) return false;
    return true;
  });
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
  };
}

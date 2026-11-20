import { TZDate } from '@date-fns/tz';
import type { Cents, Trade } from '../types';
import { rOf, summarize, type Summary } from './summary';

export type BreakdownKey = 'weekday' | 'hour' | 'session' | 'duration' | 'side' | 'symbol' | 'strategy' | 'tag';
export interface BreakdownContext {
  timeZone: string;
  breakevenThreshold: Cents;
  strategyNames?: Record<string, string>;
  tagNames?: Record<string, string>;
}
export interface BreakdownRow { key: string; label: string; summary: Summary }
export interface RBin { from: number; to: number; count: number }

type Bucket = readonly [key: string, label: string];

const NONE = '__none__';
const WEEKDAYS: Bucket[] = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
];
const HOURS: Bucket[] = Array.from({ length: 24 }, (_, h) => [String(h), `${String(h).padStart(2, '0')}:00`]);
const SESSIONS: Bucket[] = [
  ['asia', 'Asia'], ['london', 'London'], ['new-york', 'New York'], ['after-hours', 'After hours'],
];
const DURATIONS: Bucket[] = [
  ['lt-1m', '<1m'], ['1-5m', '1–5m'], ['5-15m', '5–15m'], ['15-60m', '15–60m'],
  ['1-4h', '1–4h'], ['4h-1d', '4h–1d'], ['gt-1d', '>1d'],
];
const SIDES: Bucket[] = [['long', 'Long'], ['short', 'Short']];

const MIN = 60_000;
const HOUR = 60 * MIN;

function durationKey(ms: number): string {
  if (ms < MIN) return 'lt-1m';
  if (ms < 5 * MIN) return '1-5m';
  if (ms < 15 * MIN) return '5-15m';
  if (ms < HOUR) return '15-60m';
  if (ms < 4 * HOUR) return '1-4h';
  if (ms < 24 * HOUR) return '4h-1d';
  return 'gt-1d';
}

function sessionKey(openedAt: string): string {
  const d = new TZDate(Date.parse(openedAt), 'America/New_York');
  const mins = d.getHours() * 60 + d.getMinutes();
  if (mins >= 18 * 60 || mins < 3 * 60) return 'asia';
  if (mins < 9 * 60 + 30) return 'london';
  if (mins < 16 * 60) return 'new-york';
  return 'after-hours';
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function fixed(
  closed: Trade[],
  buckets: Bucket[],
  keyOf: (t: Trade) => string,
  ctx: BreakdownContext,
): BreakdownRow[] {
  const groups = new Map<string, Trade[]>(buckets.map(([k]) => [k, []]));
  for (const t of closed) groups.get(keyOf(t))!.push(t);
  return buckets.map(([key, label]) => ({
    key,
    label,
    summary: summarize(groups.get(key)!, { breakevenThreshold: ctx.breakevenThreshold }),
  }));
}

function dynamic(
  closed: Trade[],
  keysOf: (t: Trade) => string[],
  labelOf: (key: string) => string,
  ctx: BreakdownContext,
): BreakdownRow[] {
  const groups = new Map<string, Trade[]>();
  for (const t of closed) {
    for (const k of keysOf(t)) {
      const g = groups.get(k);
      if (g) g.push(t);
      else groups.set(k, [t]);
    }
  }
  const rows = [...groups].map(([key, ts]) => ({
    key,
    label: labelOf(key),
    summary: summarize(ts, { breakevenThreshold: ctx.breakevenThreshold }),
  }));
  // Array.prototype.sort is stable, so ties keep first-appearance order.
  return rows.sort((a, b) => {
    if (a.key === NONE) return b.key === NONE ? 0 : 1;
    if (b.key === NONE) return -1;
    return b.summary.netPnl - a.summary.netPnl;
  });
}

export function breakdown(trades: readonly Trade[], by: BreakdownKey, ctx: BreakdownContext): BreakdownRow[] {
  const closed = trades.filter((t) => t.closedAt !== undefined);
  const local = (t: Trade) => new TZDate(Date.parse(t.openedAt), ctx.timeZone);
  switch (by) {
    case 'weekday':
      return fixed(closed, WEEKDAYS, (t) => WEEKDAY_KEYS[local(t).getDay()]!, ctx);
    case 'hour':
      return fixed(closed, HOURS, (t) => String(local(t).getHours()), ctx);
    case 'session':
      return fixed(closed, SESSIONS, (t) => sessionKey(t.openedAt), ctx);
    case 'duration':
      return fixed(closed, DURATIONS, (t) => durationKey(Date.parse(t.closedAt!) - Date.parse(t.openedAt)), ctx);
    case 'side':
      return fixed(closed, SIDES, (t) => t.direction, ctx);
    case 'symbol':
      return dynamic(closed, (t) => [t.instrument.root], (k) => k, ctx);
    case 'strategy':
      return dynamic(
        closed,
        (t) => [t.strategyId ?? NONE],
        (k) => (k === NONE ? 'No strategy' : (ctx.strategyNames?.[k] ?? k)),
        ctx,
      );
    case 'tag':
      return dynamic(
        closed,
        (t) => (t.tagIds.length === 0 ? [NONE] : [...new Set(t.tagIds)]),
        (k) => (k === NONE ? 'Untagged' : (ctx.tagNames?.[k] ?? k)),
        ctx,
      );
  }
}

/** Histogram of R multiples over closed trades; contiguous [from, to) bins including empty ones. */
export function rDistribution(trades: readonly Trade[], binWidth = 0.5): RBin[] {
  const idx = trades
    .filter((t) => t.closedAt !== undefined)
    .map(rOf)
    .filter((r): r is number => r !== undefined)
    .map((r) => Math.floor(r / binWidth + 1e-9));
  if (idx.length === 0) return [];
  const lo = Math.min(...idx);
  const hi = Math.max(...idx);
  const bins: RBin[] = [];
  for (let i = lo; i <= hi; i++) bins.push({ from: i * binWidth, to: i * binWidth + binWidth, count: 0 });
  for (const i of idx) bins[i - lo]!.count += 1;
  return bins;
}

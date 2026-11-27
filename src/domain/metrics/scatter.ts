import { TZDate } from '@date-fns/tz';
import { closedInOrder } from '../trade-status';
import type { Cents, Trade } from '../types';
import { pnlOf, type MetricContext } from './context';

export interface ScatterPoint {
  tradeId: string;
  /** Minutes of the local day, or log10 of the minutes held. */
  x: number;
  pnl: Cents;
}

/** The hold-time axis labels, left to right (log scale). */
export const DURATION_TICKS = [
  '4m',
  '8m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '7h',
  '14h',
  '1d',
  '2d',
  '4d',
] as const;

const MINUTE = 60_000;

// The hour and minute only: `localParts` also formats the date, three times the work over a few thousand trades.
export const minuteOfDay = (iso: string, timeZone: string) => {
  const d = new TZDate(Date.parse(iso), timeZone);
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * One point per closed trade, in the order the trades closed (C19): the trade's
 * P&L on the chosen basis against the minute of the local day it opened
 * (`entry`) or closed (`exit`) in `ctx.timeZone`, or against log10 of the
 * minutes it was held (`duration`). A trade held under a minute plots at one
 * minute, where the log axis would otherwise run to minus infinity. The set is
 * already the filtered one; the range does not cut it further.
 */
export function scatterPoints(
  trades: readonly Trade[],
  ctx: Pick<MetricContext, 'timeZone' | 'pnlBasis'>,
  axis: 'entry' | 'exit' | 'duration',
): ScatterPoint[] {
  return closedInOrder(trades).map((t) => ({
    tradeId: t.id,
    x:
      axis === 'entry'
        ? minuteOfDay(t.openedAt, ctx.timeZone)
        : axis === 'exit'
          ? minuteOfDay(t.closedAt, ctx.timeZone)
          : Math.log10(
              Math.max(
                1,
                (Date.parse(t.closedAt) - Date.parse(t.openedAt)) / MINUTE,
              ),
            ),
    pnl: pnlOf(t, ctx.pnlBasis),
  }));
}

/** One labelled position on an axis. */
export interface AxisTick {
  at: number;
  text: string;
}

/** An axis the scatter draws: its ends and where it is labelled. */
export interface Axis {
  lo: number;
  hi: number;
  ticks: AxisTick[];
}

/** Minutes of the day as a clock: 570 reads "09:30". */
export const clockText = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** The ticks a time axis may count in, in minutes; each is tried from the finest. */
const TIME_STEPS = [5, 10, 15, 30, 60, 120, 180, 240];

/** The most labels a one-day axis is given before it steps up to a coarser tick. */
const MAX_TIME_TICKS = 8;

/**
 * The time-of-day axis, in minutes of the local day, rescaled to the
 * trades (C19): from the hour the first one fell in to the hour the last
 * one fell in, labelled by the hour. A range of one day reads finer, in the
 * smallest step (5 minutes up to 4 hours) that keeps the labels to eight.
 * The chart may drop alternate labels where the plot is narrow.
 */
export function timeAxis(minutes: readonly number[], oneDay: boolean): Axis {
  const first = minutes.length === 0 ? 9 * 60 : Math.min(...minutes);
  const last = minutes.length === 0 ? 17 * 60 : Math.max(...minutes);
  const make = (step: number): Axis => {
    const lo = Math.max(0, Math.floor(first / step) * step);
    let hi = Math.min(24 * 60, Math.ceil(last / step) * step);
    if (hi <= lo) hi = Math.min(24 * 60, lo + step);
    const ticks: AxisTick[] = [];
    for (let at = lo; at <= hi; at += step)
      ticks.push({ at, text: clockText(at) });
    return { lo, hi, ticks };
  };
  if (!oneDay) return make(60);
  let axis = make(TIME_STEPS[0]!);
  for (const step of TIME_STEPS) {
    axis = make(step);
    if (axis.ticks.length <= MAX_TIME_TICKS) break;
  }
  return axis;
}

/** The rungs of the hold-time axis: the four to 4d ladder, with 1m and 2m below it and 8d above. */
function rungsTo(maxLog: number): { minutes: number; text: string }[] {
  const rungs = [
    { minutes: 1, text: '1m' },
    { minutes: 2, text: '2m' },
    { minutes: 4, text: '4m' },
    { minutes: 8, text: '8m' },
    { minutes: 15, text: '15m' },
    { minutes: 30, text: '30m' },
    { minutes: 60, text: '1h' },
    { minutes: 120, text: '2h' },
    { minutes: 240, text: '4h' },
    { minutes: 420, text: '7h' },
    { minutes: 840, text: '14h' },
    { minutes: 1440, text: '1d' },
    { minutes: 2880, text: '2d' },
    { minutes: 5760, text: '4d' },
  ];
  // A hold past four days keeps doubling: 8d, 16d, 32d.
  while (Math.log10(rungs[rungs.length - 1]!.minutes) < maxLog) {
    const minutes = rungs[rungs.length - 1]!.minutes * 2;
    rungs.push({ minutes, text: `${minutes / 1440}d` });
  }
  return rungs;
}

/**
 * The hold-time axis (log10 of the minutes held), tightened to the range's
 * spread (C19): the rungs of the ladder 4m, 8m, 15m, 30m, 1h, 2h, 4h, 7h, 14h,
 * 1d, 2d, 4d from the last at or under the shortest hold to the first at or
 * over the longest, never fewer than two. A hold under four minutes brings
 * 2m and 1m in, one past four days 8d and on. With no trade the whole ladder.
 */
export function durationAxis(logs: readonly number[]): Axis {
  const rungs = rungsTo(logs.length === 0 ? 0 : Math.max(...logs));
  const eps = 1e-9;
  let low = 0;
  let high = rungs.length - 1;
  if (logs.length === 0) {
    low = rungs.findIndex((r) => r.minutes === 4);
    high = rungs.findIndex((r) => r.minutes === 5760);
  } else {
    const min = Math.min(...logs);
    const max = Math.max(...logs);
    rungs.forEach((r, i) => {
      if (Math.log10(r.minutes) <= min + eps) low = i;
    });
    high = rungs.findIndex((r) => Math.log10(r.minutes) >= max - eps);
    if (high === -1) high = rungs.length - 1;
    if (high <= low) high = Math.min(rungs.length - 1, low + 1);
  }
  const ticks = rungs.slice(low, high + 1).map((r) => ({
    at: Math.log10(r.minutes),
    text: r.text,
  }));
  return { lo: ticks[0]!.at, hi: ticks[ticks.length - 1]!.at, ticks };
}

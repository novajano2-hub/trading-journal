import { format, parseISO, startOfWeek } from 'date-fns';
import type { Cents, WeekStart } from '../types';
import { weekStartsOn } from '../week';
import type { DayStat } from './days';

/*
 * Goals always run on net P&L (TradeZella's "Net Max Loss/Day"): callers pass
 * days built with a net-basis context. Day and week boundaries are the
 * trader's local dates, which `dailyPnl` already buckets by time zone.
 */

export interface DateWindow {
  from: string;
  to: string;
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** The first day of the anchor's week (Sunday unless `weekStart` says Monday), or the range start if later, through the anchor; null when the range starts after today. */
export function goalWeek(
  range: { from?: string; to?: string },
  today: string,
  weekStart: WeekStart = 'sunday',
): DateWindow | null {
  const anchor = range.to !== undefined && range.to < today ? range.to : today;
  const first = iso(
    startOfWeek(parseISO(anchor), {
      weekStartsOn: weekStartsOn(weekStart),
    }),
  );
  const from =
    range.from !== undefined && range.from > first ? range.from : first;
  return from > anchor ? null : { from, to: anchor };
}

export interface WeeklyGoalProgress {
  target: Cents;
  net: Cents;
  window: DateWindow;
  reached: boolean;
  /** net / target, clamped to 0..1. */
  fraction: number;
}

export function weeklyGoalProgress(
  days: readonly DayStat[],
  target: Cents,
  window: DateWindow,
): WeeklyGoalProgress {
  let net = 0;
  for (const d of days)
    if (d.date >= window.from && d.date <= window.to) net += d.net;
  return {
    target,
    net,
    window,
    reached: net >= target,
    fraction: Math.min(1, Math.max(0, net / target)),
  };
}

export interface DailyLossProgress {
  limit: Cents;
  tradingDays: number;
  keptDays: number;
  /** Days that lost more than the limit, ascending. */
  brokenDays: DayStat[];
}

export function dailyLossProgress(
  days: readonly DayStat[],
  limit: Cents,
): DailyLossProgress {
  const brokenDays = days
    .filter((d) => d.net < -limit)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    limit,
    tradingDays: days.length,
    keptDays: days.length - brokenDays.length,
    brokenDays,
  };
}

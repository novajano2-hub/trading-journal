import { outcomeOf } from '../outcome';
import { localDate } from '../time';
import { closedInOrder } from '../trade-status';
import type { Cents, Trade } from '../types';
import { streaksOf, type StreakResult } from './streaks';

export interface DayStat { date: string; net: Cents; tradeCount: number; wins: number; losses: number }

/** Closed trades bucketed by local (timeZone) close date, ascending. Input must be a single-currency set. */
export function dailyPnl(
  trades: readonly Trade[],
  timeZone: string,
  breakevenThreshold: Cents,
): DayStat[] {
  const byDate = new Map<string, DayStat>();
  for (const t of closedInOrder(trades)) {
    const date = localDate(t.closedAt, timeZone);
    let d = byDate.get(date);
    if (!d) byDate.set(date, (d = { date, net: 0, tradeCount: 0, wins: 0, losses: 0 }));
    d.net += t.net;
    d.tradeCount += 1;
    const o = outcomeOf(t.net, breakevenThreshold);
    if (o === 'win') d.wins += 1;
    else if (o === 'loss') d.losses += 1;
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function daySummary(days: readonly DayStat[]): {
  greenDays: number; redDays: number; flatDays: number; greenPct: number | null;
  best: DayStat | null; worst: DayStat | null;
} {
  const greenDays = days.filter((d) => d.net > 0).length;
  const redDays = days.filter((d) => d.net < 0).length;
  let best: DayStat | null = null;
  let worst: DayStat | null = null;
  for (const d of days) {
    if (best === null || d.net > best.net) best = d;
    if (worst === null || d.net < worst.net) worst = d;
  }
  return {
    greenDays,
    redDays,
    flatDays: days.length - greenDays - redDays,
    greenPct: days.length === 0 ? null : greenDays / days.length,
    best,
    worst,
  };
}

/** Green/red day streaks; flat days neither extend nor break. */
export function dayStreaks(days: readonly DayStat[]): StreakResult {
  return streaksOf(days.map((d) => (d.net > 0 ? 'win' : d.net < 0 ? 'loss' : undefined)));
}

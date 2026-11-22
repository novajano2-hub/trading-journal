import { outcomeOf } from '../outcome';
import { localDate } from '../time';
import type { Cents, Trade } from '../types';
import { costBasis, type MetricContext } from './context';
import { sizedRealizations } from './realized';
import { streaksOf, type StreakResult } from './streaks';

/** `net` is the day's P&L on ctx.pnlBasis; `costBasis` is the sum of its trades' cost bases (percent-range ROI denominator). */
export interface DayStat {
  date: string;
  net: Cents;
  tradeCount: number;
  wins: number;
  losses: number;
  costBasis: Cents;
}

/** Classify a day's result against the breakeven range; a flat day is breakeven. */
function dayOutcome(d: DayStat, ctx: MetricContext) {
  return outcomeOf(
    d.net,
    ctx.breakevenRange,
    d.costBasis > 0 ? d.net / d.costBasis : undefined,
  );
}

/**
 * Realized P&L bucketed by the local (timeZone) date of each exit fill, ascending, so a
 * partial exit books on its own day even while the rest of the trade is open. A trade
 * counts once on each day it exits; its cost basis is shared among those days by exited
 * quantity. Input must be a single-currency set.
 */
export function dailyPnl(
  trades: readonly Trade[],
  ctx: MetricContext,
): DayStat[] {
  const byDate = new Map<string, DayStat>();
  const ordered = [...trades].sort((a, b) => a.serial - b.serial);
  for (const t of ordered) {
    const basis = costBasis(t);
    const entryQty = t.executions.reduce(
      (s, e) =>
        (e.side === 'buy') === (t.direction === 'long') ? s + e.qty : s,
      0,
    );
    // One bucket per local date for this trade.
    const parts = new Map<string, { value: Cents; qty: number }>();
    for (const r of sizedRealizations(t)) {
      const date = localDate(r.time, ctx.timeZone);
      const p = parts.get(date) ?? { value: 0, qty: 0 };
      p.value += ctx.pnlBasis === 'gross' ? r.gross : r.net;
      p.qty += r.qty;
      parts.set(date, p);
    }
    for (const [date, p] of parts) {
      let d = byDate.get(date);
      if (!d)
        byDate.set(
          date,
          (d = {
            date,
            net: 0,
            tradeCount: 0,
            wins: 0,
            losses: 0,
            costBasis: 0,
          }),
        );
      const share = entryQty > 0 ? Math.min(1, p.qty / entryQty) : 1;
      const dayBasis = share === 1 ? basis : Math.round(basis * share);
      d.net += p.value;
      d.costBasis += dayBasis;
      d.tradeCount += 1;
      const o = outcomeOf(
        p.value,
        ctx.breakevenRange,
        dayBasis > 0 ? p.value / dayBasis : undefined,
      );
      if (o === 'win') d.wins += 1;
      else if (o === 'loss') d.losses += 1;
    }
  }
  return [...byDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/** Minutes from the first entry fill to the last exit fill on each local day that has an exit; the longest and the mean. */
export function dayDurations(
  trades: readonly Trade[],
  ctx: MetricContext,
): { longest: number | null; average: number | null } {
  const byDate = new Map<
    string,
    { firstEntry: number; firstAny: number; lastExit: number }
  >();
  for (const t of trades) {
    for (const e of t.executions) {
      const at = Date.parse(e.time);
      const date = localDate(e.time, ctx.timeZone);
      const d = byDate.get(date) ?? {
        firstEntry: Infinity,
        firstAny: Infinity,
        lastExit: -Infinity,
      };
      const isEntry = (e.side === 'buy') === (t.direction === 'long');
      d.firstAny = Math.min(d.firstAny, at);
      if (isEntry) d.firstEntry = Math.min(d.firstEntry, at);
      else d.lastExit = Math.max(d.lastExit, at);
      byDate.set(date, d);
    }
  }
  const minutes: number[] = [];
  for (const d of byDate.values()) {
    if (d.lastExit === -Infinity) continue;
    const start = d.firstEntry === Infinity ? d.firstAny : d.firstEntry;
    minutes.push(Math.max(0, (d.lastExit - start) / 60000));
  }
  if (minutes.length === 0) return { longest: null, average: null };
  return {
    longest: Math.max(...minutes),
    average: minutes.reduce((s, m) => s + m, 0) / minutes.length,
  };
}

/** The mean over days of each day's wins / (wins + losses); days with neither are left out. */
export function avgDailyWinRate(
  trades: readonly Trade[],
  ctx: MetricContext,
): number | null {
  return winRateOfDays(dailyPnl(trades, ctx));
}

/** The mean over days of each day's wins / (wins + losses), from day stats already built. */
export function winRateOfDays(days: readonly DayStat[]): number | null {
  const rates = days
    .filter((d) => d.wins + d.losses > 0)
    .map((d) => d.wins / (d.wins + d.losses));
  return rates.length === 0
    ? null
    : rates.reduce((s, r) => s + r, 0) / rates.length;
}

export function daySummary(
  days: readonly DayStat[],
  ctx: MetricContext,
): {
  greenDays: number;
  redDays: number;
  flatDays: number;
  greenPct: number | null;
  best: DayStat | null;
  worst: DayStat | null;
} {
  const greenDays = days.filter((d) => dayOutcome(d, ctx) === 'win').length;
  const redDays = days.filter((d) => dayOutcome(d, ctx) === 'loss').length;
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

/** Green/red day streaks; flat days (inside the breakeven range) neither extend nor break. */
export function dayStreaks(
  days: readonly DayStat[],
  ctx: MetricContext,
): StreakResult {
  return streaksOf(
    days.map((d) => {
      const o = dayOutcome(d, ctx);
      return o === 'breakeven' ? undefined : o;
    }),
  );
}

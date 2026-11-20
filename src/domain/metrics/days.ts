import { outcomeOf } from '../outcome';
import { localDate } from '../time';
import { closedInOrder } from '../trade-status';
import type { Cents, Trade } from '../types';
import { costBasis, pnlOf, type MetricContext } from './context';
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

/** Closed trades bucketed by local (timeZone) close date, ascending. Input must be a single-currency set. */
export function dailyPnl(
  trades: readonly Trade[],
  ctx: MetricContext,
): DayStat[] {
  const byDate = new Map<string, DayStat>();
  for (const t of closedInOrder(trades)) {
    const date = localDate(t.closedAt, ctx.timeZone);
    let d = byDate.get(date);
    if (!d)
      byDate.set(
        date,
        (d = { date, net: 0, tradeCount: 0, wins: 0, losses: 0, costBasis: 0 }),
      );
    const value = pnlOf(t, ctx.pnlBasis);
    const basis = costBasis(t);
    d.net += value;
    d.costBasis += basis;
    d.tradeCount += 1;
    const o = outcomeOf(
      value,
      ctx.breakevenRange,
      basis > 0 ? value / basis : undefined,
    );
    if (o === 'win') d.wins += 1;
    else if (o === 'loss') d.losses += 1;
  }
  return [...byDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
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

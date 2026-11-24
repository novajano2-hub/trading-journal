import { roundHalfEven } from '../money';
import { outcomeOf } from '../outcome';
import { localDate } from '../time';
import type { Cents, JournalEntry, Trade } from '../types';
import { costBasis, inRange, type MetricContext } from './context';
import { exitShare, sizedRealizations } from './realized';
import { profitFactorOf } from './summary';
import { unitOf } from './units';
import { streaksOf, type StreakResult } from './streaks';

/** `net` is the day's P&L on ctx.pnlBasis; `costBasis` is the sum of its trades' cost bases (percent-range ROI denominator). */
export interface DayStat {
  date: string;
  net: Cents;
  tradeCount: number;
  wins: number;
  losses: number;
  costBasis: Cents;
  /**
   * The day's P&L in `ctx.unit` (ticks, pips, points or R), only when the
   * context has one: each trade's unit value shared among its exit days by
   * exited size, as the cost basis is.
   */
  unit?: number;
  /**
   * The day's profit factor, from its trades' parts the way the summary's is:
   * wins and losses classified on the breakeven range, the amounts in `ctx.unit`
   * when the context has one. Null without a loss.
   */
  profitFactor?: number | null;
}

/** The day's value as the figures of the Overview read it: in the unit when the context has one. */
export function dayValue(d: DayStat, ctx: Pick<MetricContext, 'unit'>): number {
  return ctx.unit ? (d.unit ?? 0) : d.net;
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
 * quantity. With `ctx.range` only the exits dated inside it count. Input must be a
 * single-currency set.
 */
export function dailyPnl(
  trades: readonly Trade[],
  ctx: MetricContext,
): DayStat[] {
  const byDate = new Map<string, DayStat>();
  const results = new Map<string, { won: number[]; lost: number[] }>();
  const ordered = [...trades].sort((a, b) => a.serial - b.serial);
  for (const t of ordered) {
    const basis = costBasis(t);
    const entryQty = t.executions.reduce(
      (s, e) =>
        (e.side === 'buy') === (t.direction === 'long') ? s + e.qty : s,
      0,
    );
    // One bucket per local date for this trade.
    const parts = new Map<
      string,
      { value: Cents; qty: number; share: number }
    >();
    const realized = sizedRealizations(t);
    const realizedQty = realized.reduce((n, r) => n + r.qty, 0);
    const tradeUnit = ctx.unit ? unitOf(t, ctx.unit, ctx.pnlBasis) : null;
    for (const r of realized) {
      const date = localDate(r.time, ctx.timeZone);
      if (!inRange(date, ctx.range)) continue;
      const p = parts.get(date) ?? { value: 0, qty: 0, share: 0 };
      p.value += ctx.pnlBasis === 'gross' ? r.gross : r.net;
      p.qty += r.qty;
      p.share += exitShare(r.qty, realizedQty, realized.length);
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
            profitFactor: null,
          }),
        );
      const share = entryQty > 0 ? Math.min(1, p.qty / entryQty) : 1;
      const dayBasis = share === 1 ? basis : Math.round(basis * share);
      d.net += p.value;
      if (ctx.unit) d.unit = (d.unit ?? 0) + (tradeUnit ?? 0) * p.share;
      d.costBasis += dayBasis;
      d.tradeCount += 1;
      const o = outcomeOf(
        p.value,
        ctx.breakevenRange,
        dayBasis > 0 ? p.value / dayBasis : undefined,
      );
      if (o !== 'breakeven') {
        const amount = ctx.unit
          ? tradeUnit === null
            ? null
            : tradeUnit * p.share
          : p.value;
        const r = results.get(date) ?? { won: [], lost: [] };
        if (amount !== null) r[o === 'win' ? 'won' : 'lost'].push(amount);
        results.set(date, r);
        if (o === 'win') d.wins += 1;
        else d.losses += 1;
      }
    }
  }
  for (const [date, r] of results)
    byDate.get(date)!.profitFactor = profitFactorOf(r.won, r.lost);
  return [...byDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/**
 * Minutes from the first entry fill to the last exit fill on each local day
 * that has an exit, ascending by date. Only fills inside `ctx.range` count.
 */
export function dayLengths(
  trades: readonly Trade[],
  ctx: Pick<MetricContext, 'timeZone' | 'range'>,
): { date: string; minutes: number }[] {
  const byDate = new Map<
    string,
    { firstEntry: number; firstAny: number; lastExit: number }
  >();
  for (const t of trades) {
    for (const e of t.executions) {
      const at = Date.parse(e.time);
      const date = localDate(e.time, ctx.timeZone);
      if (!inRange(date, ctx.range)) continue;
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
  const lengths: { date: string; minutes: number }[] = [];
  for (const [date, d] of byDate) {
    if (d.lastExit === -Infinity) continue;
    const start = d.firstEntry === Infinity ? d.firstAny : d.firstEntry;
    lengths.push({ date, minutes: Math.max(0, (d.lastExit - start) / 60000) });
  }
  return lengths.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** The longest and the mean of the day lengths; null with no day that has an exit. */
export function dayDurations(
  trades: readonly Trade[],
  ctx: MetricContext,
): { longest: number | null; average: number | null } {
  const minutes = dayLengths(trades, ctx).map((d) => d.minutes);
  if (minutes.length === 0) return { longest: null, average: null };
  return {
    longest: Math.max(...minutes),
    average: minutes.reduce((s, m) => s + m, 0) / minutes.length,
  };
}

export function daySummary(
  days: readonly DayStat[],
  ctx: MetricContext,
): {
  greenDays: number;
  redDays: number;
  flatDays: number;
  /**
   * The daily win rate: winning (green) days over trading days, flat days
   * counted as trading days (Part 2, R2). Null with no days.
   */
  greenPct: number | null;
  best: DayStat | null;
  worst: DayStat | null;
  /** The mean P&L of the green days, in cents; null with none. */
  avgGreenDay: Cents | null;
  /** The mean P&L of the red days, in cents; null with none. */
  avgRedDay: Cents | null;
  /** Trades exited per trading day; a trade counts on each day it exits. Null with no days. */
  tradesPerDay: number | null;
  /** The mean P&L of every trading day, flat ones included (in `ctx.unit` when it has one); null with none. */
  avgDailyPnl: number | null;
  /** The mean green and red day in the unit under one, in cents otherwise; null with none. */
  avgGreenValue: number | null;
  avgRedValue: number | null;
  /** The average green day over the size of the average red day; null without both. */
  avgWinLoss: number | null;
  /** The green day with the most won (in the unit, under one); null with no green day. */
  largestGreenDay: DayStat | null;
  /** The red day with the most lost; null with no red day. */
  largestRedDay: DayStat | null;
} {
  const green = days.filter((d) => dayOutcome(d, ctx) === 'win');
  const red = days.filter((d) => dayOutcome(d, ctx) === 'loss');
  const greenDays = green.length;
  const redDays = red.length;
  const mean = (list: readonly DayStat[]) =>
    list.length === 0
      ? null
      : roundHalfEven(list.reduce((sum, d) => sum + d.net, 0) / list.length);
  let best: DayStat | null = null;
  let worst: DayStat | null = null;
  for (const d of days) {
    if (best === null || d.net > best.net) best = d;
    if (worst === null || d.net < worst.net) worst = d;
  }
  const avgGreenDay = mean(green);
  const avgRedDay = mean(red);
  // The figures of the Overview read the unit when there is one: the days are
  // still called green and red on their money, as the counts are.
  const val = (d: DayStat) => dayValue(d, ctx);
  const meanVal = (list: readonly DayStat[]) =>
    list.length === 0
      ? null
      : list.reduce((n, d) => n + val(d), 0) / list.length;
  const unitMean = (list: readonly DayStat[]) =>
    ctx.unit ? meanVal(list) : mean(list);
  const greenMean = unitMean(green);
  const redMean = unitMean(red);
  const largestGreenDay = green.reduce<DayStat | null>(
    (a, d) => (a === null || val(d) > val(a) ? d : a),
    null,
  );
  const largestRedDay = red.reduce<DayStat | null>(
    (a, d) => (a === null || val(d) < val(a) ? d : a),
    null,
  );
  return {
    greenDays,
    redDays,
    flatDays: days.length - greenDays - redDays,
    greenPct: days.length === 0 ? null : greenDays / days.length,
    best,
    worst,
    avgGreenDay,
    avgRedDay,
    avgGreenValue: greenMean,
    avgRedValue: redMean,
    avgDailyPnl: unitMean(days),
    avgWinLoss:
      greenMean === null || redMean === null || redMean === 0
        ? null
        : greenMean / Math.abs(redMean),
    largestGreenDay,
    largestRedDay,
    tradesPerDay:
      days.length === 0
        ? null
        : days.reduce((sum, d) => sum + d.tradeCount, 0) / days.length,
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

/**
 * The best and the lowest month by P&L, and the mean over the months that have
 * trading days (a month with no trade is not a month traded). In a unit the
 * months are sums of the unit. Months are the
 * `YYYY-MM` of each day's date; ties go to the earlier month.
 */
export function monthSummary(
  days: readonly DayStat[],
  ctx: Pick<MetricContext, 'unit'> = {},
): {
  best: { month: string; net: number } | null;
  lowest: { month: string; net: number } | null;
  average: number | null;
  months: number;
} {
  const byMonth = new Map<string, number>();
  for (const d of days) {
    const month = d.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + dayValue(d, ctx));
  }
  const list = [...byMonth]
    .map(([month, net]) => ({ month, net }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
  let best: { month: string; net: number } | null = null;
  let lowest: { month: string; net: number } | null = null;
  for (const m of list) {
    if (best === null || m.net > best.net) best = m;
    if (lowest === null || m.net < lowest.net) lowest = m;
  }
  return {
    best,
    lowest,
    average:
      list.length === 0
        ? null
        : ctx.unit
          ? list.reduce((n, m) => n + m.net, 0) / list.length
          : roundHalfEven(list.reduce((n, m) => n + m.net, 0) / list.length),
    months: list.length,
  };
}

/**
 * The days inside `range` with a daily journal entry: one per date however many
 * notes it holds, entries in the trash left out.
 */
export function loggedDays(
  entries: readonly JournalEntry[],
  range: MetricContext['range'],
): number {
  const dates = new Set<string>();
  for (const e of entries) {
    if (e.kind !== 'daily-review' || e.deletedAt !== undefined) continue;
    if (e.date === undefined || !inRange(e.date, range)) continue;
    dates.add(e.date);
  }
  return dates.size;
}

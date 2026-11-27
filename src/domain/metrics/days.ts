import { roundHalfEven } from '../money';
import { outcomeOf } from '../outcome';
import { localDate } from '../time';
import type { Cents, JournalEntry, Trade } from '../types';
import { costBasis, inRange, type MetricContext } from './context';
import { exitShare, sizedRealizations } from './realized';
import { profitFactorOf, tradeVolume } from './summary';
import { exitUnits } from './units';
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
   * context has one: each exit of the day in the unit (`exitUnits`), summed,
   * so the day's R has the sign of its P&L.
   */
  unit?: number;
  /**
   * The day's profit factor, from its trades' parts the way the summary's is:
   * wins and losses classified on the breakeven range, the amounts in `ctx.unit`
   * when the context has one. Null without a loss.
   */
  profitFactor?: number | null;
}

/** Rounds away binary noise: an exit's ticks summed with the next. */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/** The day's value as the figures of the Overview read it: in the unit when the context has one. */
export function dayValue(d: DayStat, ctx: Pick<MetricContext, 'unit'>): number {
  return ctx.unit ? (d.unit ?? 0) : d.net;
}

/** Classify a day's result against the breakeven range; a flat day is breakeven. */
export function dayOutcome(d: DayStat, ctx: MetricContext) {
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
  const { unit } = ctx;
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
    // One bucket per local date for this trade: its exits of that day, with
    // their own value in the unit (null when the trade has none there).
    const parts = new Map<
      string,
      { value: Cents; qty: number; unit: number | null }
    >();
    const realized = unit
      ? exitUnits(t, ctx.pnlBasis)
      : sizedRealizations(t).map((r) => ({ ...r, units: undefined }));
    for (const r of realized) {
      const date = localDate(r.time, ctx.timeZone);
      if (!inRange(date, ctx.range)) continue;
      const p = parts.get(date) ?? { value: 0, qty: 0, unit: null };
      p.value += ctx.pnlBasis === 'gross' ? r.gross : r.net;
      p.qty += r.qty;
      const v = unit ? (r.units?.[unit] ?? null) : null;
      if (v !== null) p.unit = (p.unit ?? 0) + v;
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
      if (unit) d.unit = (d.unit ?? 0) + (p.unit ?? 0);
      d.costBasis += dayBasis;
      d.tradeCount += 1;
      const o = outcomeOf(
        p.value,
        ctx.breakevenRange,
        dayBasis > 0 ? p.value / dayBasis : undefined,
      );
      if (o !== 'breakeven') {
        const amount = unit ? p.unit : p.value;
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
  if (unit) for (const d of byDate.values()) d.unit = clean(d.unit ?? 0);
  return [...byDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/**
 * Each local date's volume, ascending (Part 2 rulings, final review I3): a
 * trade's volume is its quantity counted once (`tradeVolume`). What its exits
 * closed books on each exit's day, by exited size; what is still open books
 * on the day the trade opened. A closed trade so books all of it on its exit
 * days, and a trade booked whole at its close (no fills) on its close. Only
 * dates inside `ctx.range` count. Every page that shows a day's or a
 * period's volume reads it from here.
 */
export function dayVolumes(
  trades: readonly Trade[],
  ctx: Pick<MetricContext, 'timeZone' | 'range'>,
): { date: string; value: number }[] {
  const byDate = new Map<string, number>();
  const book = (date: string, v: number) => {
    if (v > 0 && inRange(date, ctx.range))
      byDate.set(date, (byDate.get(date) ?? 0) + v);
  };
  for (const t of trades) {
    const volume = tradeVolume(t);
    const realized = sizedRealizations(t);
    const exited = realized.reduce((n, r) => n + r.qty, 0);
    // A closed trade's exits close all of it; an open one's, what they say.
    const whole = t.status === 'closed' ? exited : Math.max(exited, volume);
    let booked = 0;
    for (const r of realized) {
      const share =
        t.status === 'closed'
          ? exitShare(r.qty, exited, realized.length)
          : Number.isFinite(whole) && whole > 0
            ? r.qty / whole
            : 0;
      booked += share;
      book(localDate(r.time, ctx.timeZone), volume * share);
    }
    if (t.status !== 'closed' && booked < 1)
      book(localDate(t.openedAt, ctx.timeZone), volume * (1 - booked));
  }
  return [...byDate]
    .map(([date, value]) => ({ date, value: clean(value) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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
   * The day win rate: winning (green) days over trading days, flat days
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
 * The local dates that have a daily journal entry, each once and ascending:
 * entries in the trash left out. What Logged days counts, over any range.
 */
export function loggedDates(entries: readonly JournalEntry[]): string[] {
  const dates = new Set<string>();
  for (const e of entries) {
    if (e.kind !== 'daily-review' || e.deletedAt !== undefined) continue;
    if (e.date !== undefined) dates.add(e.date);
  }
  return [...dates].sort();
}

/**
 * The days inside `range` with a daily journal entry: one per date however many
 * notes it holds, entries in the trash left out.
 */
export function loggedDays(
  entries: readonly JournalEntry[],
  range: MetricContext['range'],
): number {
  return loggedDates(entries).filter((date) => inRange(date, range)).length;
}

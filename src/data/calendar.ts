import { outcomeOf } from '@/domain/outcome';
import { mistakeTags } from '@/domain/metrics/mistakes';
import {
  dailyPnl,
  daySummary,
  dayVolumes,
  type DayStat,
} from '@/domain/metrics/days';
import type { MetricContext } from '@/domain/metrics/context';
import { summarize } from '@/domain/metrics/summary';
import { isClosed } from '@/domain/trade-status';
import { exitUnits } from '@/domain/metrics/units';
import { localDate } from '@/domain/time';
import type {
  Cents,
  JournalEntry,
  Strategy,
  Tag,
  TagCategory,
  Trade,
} from '@/domain/types';
import { tradeRulesSummary } from './dashboard';

/**
 * One day on the calendar, booked on the dates of the trades' exits: a trade
 * adds to each day it exits on, even while the rest of it is open. `net` is
 * the day's P&L on the basis in `ctx` (`gross` and `fees` are always the raw
 * figures); `trades` counts trades with an exit that day.
 */
export interface CalendarDay {
  date: string;
  net: Cents;
  gross: Cents;
  fees: Cents;
  trades: number;
  wins: number;
  losses: number;
  /** The sum of the R of the day's exits (each exit's P&L over its trade's risk); trades without risk are left out. Null when none has risk. */
  r: number | null;
  /**
   * The day's ticks, pips and points: each exit of the day by its own value
   * (`exitUnits`), summed. Null when no trade of the day has the unit (a
   * forex day has no ticks), so the cell reads "None".
   */
  ticks: number | null;
  pips: number | null;
  points: number | null;
  /** The day's volume as `dayVolumes` shares it: what the exits closed, and what an open trade still holds on the day it opened. */
  volume: number;
  /**
   * Won over lost by the summary's own profit factor: wins and losses by the
   * breakeven range, in the display unit when it narrows. Null without a loss.
   */
  profitFactor: number | null;
  /** `flat` is inside the breakeven range; `none` is a day with no exit. */
  tone: 'gain' | 'loss' | 'flat' | 'none';
  hasNote: boolean;
  /** The day is outside the global date range: no figures, not selectable. */
  outside: boolean;
}

/** A day's, a week's or a month's ticks, pips and points; null where nothing has the unit. */
export interface UnitSums {
  ticks: number | null;
  pips: number | null;
  points: number | null;
}

export interface CalendarWeek extends UnitSums {
  /** The Monday the week starts on (it can fall in the month before). */
  start: string;
  /** Monday to Sunday; a date outside the month is null. */
  days: (CalendarDay | null)[];
  net: Cents;
  r: number | null;
  tradingDays: number;
  trades: number;
}

export interface CalendarSummary extends UnitSums {
  /** Closed trades that won and lost, each counted once on the date it closed. */
  wins: number;
  losses: number;
  /** Wins over wins plus losses; null when none is decided. */
  winRate: number | null;
  net: Cents;
  r: number | null;
  trades: number;
  greenDays: number;
  redDays: number;
  flatDays: number;
  tradingDays: number;
  /** Green days over trading days (`daySummary`'s day win rate); null with none. */
  dayWinRate: number | null;
  /** Days of the month the global date range leaves out. */
  outsideDays: number;
  best: CalendarDay | null;
  worst: CalendarDay | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function addDays(date: string, n: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** 0 for Monday to 6 for Sunday. */
const mondayIndex = (date: string) => (utc(date).getUTCDay() + 6) % 7;

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The figures a day without a trade carries. */
const noFigures = () => ({
  ticks: null,
  pips: null,
  points: null,
  volume: 0,
  profitFactor: null,
});

/** The ticks, pips and points of a set of days; null where none of them has the unit. */
function sumUnits(days: readonly UnitSums[]): UnitSums {
  const sum = (u: keyof UnitSums) => {
    const have = days.flatMap((d) => d[u] ?? []);
    return have.length === 0
      ? null
      : Math.round(have.reduce((a, b) => a + b, 0) * 1e6) / 1e6;
  };
  return { ticks: sum('ticks'), pips: sum('pips'), points: sum('points') };
}

const sumR = (values: readonly (number | null)[]): number | null => {
  const have = values.filter((v): v is number => v !== null);
  return have.length === 0 ? null : have.reduce((a, b) => a + b, 0);
};

/** Every day with an exit inside `range`, with the raw figures behind it. */
function bookDays(
  trades: readonly Trade[],
  notes: readonly JournalEntry[],
  ctx: MetricContext,
  range: { from: string; to: string },
): { out: Map<string, CalendarDay>; stats: DayStat[] } {
  const scoped: MetricContext = { ...ctx, range };
  const noted = notedDates(notes);
  const out = new Map<string, CalendarDay>();
  const stats = dailyPnl(trades, scoped);
  for (const s of stats) {
    out.set(s.date, {
      date: s.date,
      net: s.net,
      gross: 0,
      fees: 0,
      trades: s.tradeCount,
      wins: s.wins,
      losses: s.losses,
      r: null,
      ...noFigures(),
      profitFactor: s.profitFactor ?? null,
      tone: toneOf(s.net, s.costBasis, ctx),
      hasNote: noted.has(s.date),
      outside: false,
    });
  }
  // Gross, fees, R and the units come from the same exits the day's net was
  // booked from, each exit in the unit by its own value (`exitUnits`), so a
  // day here reads as it does on every other page.
  for (const t of trades)
    for (const x of exitUnits(t, ctx.pnlBasis)) {
      const day = out.get(localDate(x.time, ctx.timeZone));
      if (!day) continue;
      day.gross += x.gross;
      day.fees += x.fees;
      for (const u of ['r', 'ticks', 'pips', 'points'] as const) {
        const v = x.units[u];
        if (v !== null) day[u] = (day[u] ?? 0) + v;
      }
    }
  // Volume, as every page shares it among the days (`dayVolumes`).
  for (const v of dayVolumes(trades, scoped)) {
    const day = out.get(v.date);
    if (day) day.volume = v.value;
  }
  for (const day of out.values())
    for (const u of ['ticks', 'pips', 'points'] as const)
      if (day[u] !== null) day[u] = Math.round(day[u] * 1e6) / 1e6;
  return { out, stats };
}

function toneOf(
  net: Cents,
  basis: Cents,
  ctx: MetricContext,
): CalendarDay['tone'] {
  const o = outcomeOf(
    net,
    ctx.breakevenRange,
    basis > 0 ? net / basis : undefined,
  );
  return o === 'win' ? 'gain' : o === 'loss' ? 'loss' : 'flat';
}

const emptyDay = (
  date: string,
  notes: ReadonlySet<string>,
  outside = false,
): CalendarDay => ({
  date,
  net: 0,
  gross: 0,
  fees: 0,
  trades: 0,
  wins: 0,
  losses: 0,
  r: null,
  ...noFigures(),
  tone: 'none',
  hasNote: notes.has(date),
  outside,
});

function notedDates(notes: readonly JournalEntry[]): Set<string> {
  return new Set(
    notes
      .filter(
        (n) =>
          n.kind === 'daily-review' &&
          n.date !== undefined &&
          n.deletedAt === undefined,
      )
      .map((n) => n.date!),
  );
}

/**
 * A month as Monday-to-Sunday weeks. Each in-month date is a day (`tone: 'none'`
 * when nothing exited); dates of the neighbouring months are null. `trades` is
 * the whole set: only exits dated inside the month and inside `ctx.range` (the
 * resolved global date range) count. A day outside the range is `outside`: it
 * books nothing and stays out of the week totals and the summary. Input must
 * be a single-currency set.
 */
export function calendarMonth(
  trades: readonly Trade[],
  notes: readonly JournalEntry[],
  month: string,
  ctx: MetricContext,
): { weeks: CalendarWeek[]; summary: CalendarSummary } {
  const count = daysInMonth(month);
  const first = `${month}-01`;
  const last = `${month}-${pad(count)}`;
  const from =
    ctx.range?.from !== undefined && ctx.range.from > first
      ? ctx.range.from
      : first;
  const to =
    ctx.range?.to !== undefined && ctx.range.to < last ? ctx.range.to : last;
  const { out: booked, stats } = bookDays(trades, notes, ctx, { from, to });
  const noted = notedDates(notes);
  const outside = (date: string) => date < from || date > to;
  const weeks: CalendarWeek[] = [];
  for (
    let start = addDays(first, -mondayIndex(first));
    start <= last;
    start = addDays(start, 7)
  ) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      return date < first || date > last
        ? null
        : outside(date)
          ? emptyDay(date, noted, true)
          : (booked.get(date) ?? emptyDay(date, noted));
    });
    const live = days.filter((d): d is CalendarDay => d !== null);
    weeks.push({
      start,
      days,
      net: live.reduce((s, d) => s + d.net, 0),
      r: sumR(live.map((d) => d.r)),
      ...sumUnits(live),
      tradingDays: live.filter((d) => d.trades > 0).length,
      trades: live.reduce((s, d) => s + d.trades, 0),
    });
  }
  const traded = [...booked.values()];
  let best: CalendarDay | null = null;
  let worst: CalendarDay | null = null;
  for (const d of traded) {
    if (best === null || d.net > best.net) best = d;
    if (worst === null || d.net < worst.net) worst = d;
  }
  // The day counts and the day win rate, as every page reads them.
  const days = daySummary(stats, ctx);
  // Trade-level, as Reports counts: a trade is one win or loss, on the date it closed.
  const closed = summarize(
    trades.filter((t) => {
      if (!isClosed(t)) return false;
      const date = localDate(t.closedAt, ctx.timeZone);
      return date >= from && date <= to;
    }),
    ctx,
  );
  return {
    weeks,
    summary: {
      wins: closed.wins,
      losses: closed.losses,
      winRate: closed.winRate,
      net: traded.reduce((s, d) => s + d.net, 0),
      r: sumR(traded.map((d) => d.r)),
      ...sumUnits(traded),
      trades: traded.reduce((s, d) => s + d.trades, 0),
      greenDays: days.greenDays,
      redDays: days.redDays,
      flatDays: days.flatDays,
      tradingDays: traded.length,
      dayWinRate: days.greenPct,
      outsideDays: Array.from({ length: count }, (_, i) =>
        outside(`${month}-${pad(i + 1)}`),
      ).filter(Boolean).length,
      best,
      worst,
    },
  };
}

/** One month of the year view: its net, its R and units summed as the Calendar's month does, and all of its dates. */
export interface CalendarYearMonth extends UnitSums {
  month: string;
  net: Cents;
  r: number | null;
  days: CalendarDay[];
}

/** The twelve months of `year`: each one's net, R and units, and all of its dates (notes are not read). */
export function calendarYear(
  trades: readonly Trade[],
  year: number,
  ctx: MetricContext,
): CalendarYearMonth[] {
  const { out: booked } = bookDays(trades, [], ctx, {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  });
  const none = new Set<string>();
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${pad(i + 1)}`;
    const days = Array.from({ length: daysInMonth(month) }, (_, d) => {
      const date = `${month}-${pad(d + 1)}`;
      return booked.get(date) ?? emptyDay(date, none);
    });
    return {
      month,
      net: days.reduce((s, d) => s + d.net, 0),
      r: sumR(days.map((d) => d.r)),
      ...sumUnits(days),
      days,
    };
  });
}

/** One exit on a day, for the day panel. `value` is on the basis in `ctx`. */
export interface DayExit extends UnitSums {
  trade: Trade;
  time: string;
  value: Cents;
  gross: Cents;
  fees: Cents;
  /** This exit's R, when the trade has risk. */
  r: number | null;
}

/** The exits dated `date`, earliest first, each in the units by its own value (`exitUnits`). */
export function dayExits(
  trades: readonly Trade[],
  date: string,
  ctx: MetricContext,
): DayExit[] {
  const out: DayExit[] = [];
  for (const trade of trades)
    for (const x of exitUnits(trade, ctx.pnlBasis)) {
      if (localDate(x.time, ctx.timeZone) !== date) continue;
      out.push({
        ...x.units,
        trade,
        time: x.time,
        value: ctx.pnlBasis === 'gross' ? x.gross : x.net,
        gross: x.gross,
        fees: x.fees,
      });
    }
  return out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

/** What a day's trades were graded on and what mistakes they carried. */
export interface DayGrading {
  /** Rule checks kept of those graded, over the rules that apply to each trade. */
  rules: { kept: number; checked: number };
  /** Trades with a mistake-role tag, and what they made that day (their exits' values). */
  mistakes: { trades: number; pnl: Cents };
}

/**
 * The grading of the trades that exited on a day. A trade counts once however
 * many times it exited; its rules are those that apply to it, as in the trade
 * log's Rules column.
 */
export function dayGrading(
  exits: readonly DayExit[],
  strategies: readonly Strategy[],
  tags: readonly Tag[],
  categories: readonly TagCategory[],
  ctx: MetricContext,
): DayGrading {
  const mistakeIds = new Set(mistakeTags(tags, categories).map((t) => t.id));
  const seen = new Set<string>();
  const out: DayGrading = {
    rules: { kept: 0, checked: 0 },
    mistakes: { trades: 0, pnl: 0 },
  };
  const wrong = new Set<string>();
  for (const e of exits)
    if (e.trade.tagIds.some((id) => mistakeIds.has(id))) {
      wrong.add(e.trade.id);
      out.mistakes.pnl += e.value;
    }
  out.mistakes.trades = wrong.size;
  for (const { trade } of exits) {
    if (seen.has(trade.id)) continue;
    seen.add(trade.id);
    const r = tradeRulesSummary(trade, strategies, ctx);
    out.rules.kept += r.kept;
    out.rules.checked += r.checked;
  }
  return out;
}

export { addDays, mondayIndex, daysInMonth };

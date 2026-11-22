import { outcomeOf } from '@/domain/outcome';
import { dailyPnl } from '@/domain/metrics/days';
import type { MetricContext } from '@/domain/metrics/context';
import { realizations } from '@/domain/metrics/realized';
import { localDate } from '@/domain/time';
import type { Cents, JournalEntry, Trade } from '@/domain/types';

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
  /** The sum of the day's realized R; trades without risk are left out. Null when none has risk. */
  r: number | null;
  /** `flat` is inside the breakeven range; `none` is a day with no exit. */
  tone: 'gain' | 'loss' | 'flat' | 'none';
  hasNote: boolean;
}

export interface CalendarWeek {
  /** The Monday the week starts on (it can fall in the month before). */
  start: string;
  /** Monday to Sunday; a date outside the month is null. */
  days: (CalendarDay | null)[];
  net: Cents;
  r: number | null;
  tradingDays: number;
  trades: number;
}

export interface CalendarSummary {
  net: Cents;
  r: number | null;
  trades: number;
  greenDays: number;
  redDays: number;
  flatDays: number;
  tradingDays: number;
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
): Map<string, CalendarDay> {
  const scoped: MetricContext = { ...ctx, range };
  const noted = notedDates(notes);
  const out = new Map<string, CalendarDay>();
  for (const s of dailyPnl(trades, scoped)) {
    out.set(s.date, {
      date: s.date,
      net: s.net,
      gross: 0,
      fees: 0,
      trades: s.tradeCount,
      wins: s.wins,
      losses: s.losses,
      r: null,
      tone: toneOf(s.net, s.costBasis, ctx),
      hasNote: noted.has(s.date),
    });
  }
  // Gross, fees and R come from the same exits the day's net was booked from.
  const rs = new Map<string, number>();
  for (const t of trades) {
    const risk =
      t.initialRisk !== undefined && t.initialRisk > 0
        ? t.initialRisk
        : undefined;
    for (const x of realizations(t)) {
      const date = localDate(x.time, ctx.timeZone);
      const day = out.get(date);
      if (!day) continue;
      day.gross += x.gross;
      day.fees += x.fees;
      if (risk !== undefined)
        rs.set(
          date,
          (rs.get(date) ?? 0) +
            (ctx.pnlBasis === 'gross' ? x.gross : x.net) / risk,
        );
    }
  }
  for (const [date, r] of rs) out.get(date)!.r = r;
  return out;
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

const emptyDay = (date: string, notes: ReadonlySet<string>): CalendarDay => ({
  date,
  net: 0,
  gross: 0,
  fees: 0,
  trades: 0,
  wins: 0,
  losses: 0,
  r: null,
  tone: 'none',
  hasNote: notes.has(date),
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
 * the whole set: only exits dated inside the month count, and `ctx.range` is
 * ignored. Input must be a single-currency set.
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
  const booked = bookDays(trades, notes, ctx, { from: first, to: last });
  const noted = notedDates(notes);
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
        : (booked.get(date) ?? emptyDay(date, noted));
    });
    const live = days.filter((d): d is CalendarDay => d !== null);
    weeks.push({
      start,
      days,
      net: live.reduce((s, d) => s + d.net, 0),
      r: sumR(live.map((d) => d.r)),
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
  const tonal = (t: CalendarDay['tone']) =>
    traded.filter((d) => d.tone === t).length;
  return {
    weeks,
    summary: {
      net: traded.reduce((s, d) => s + d.net, 0),
      r: sumR(traded.map((d) => d.r)),
      trades: traded.reduce((s, d) => s + d.trades, 0),
      greenDays: tonal('gain'),
      redDays: tonal('loss'),
      flatDays: tonal('flat'),
      tradingDays: traded.length,
      best,
      worst,
    },
  };
}

/** The twelve months of `year`: each one's net and all of its dates (notes are not read). */
export function calendarYear(
  trades: readonly Trade[],
  year: number,
  ctx: MetricContext,
): { month: string; net: Cents; days: CalendarDay[] }[] {
  const booked = bookDays(trades, [], ctx, {
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
    return { month, net: days.reduce((s, d) => s + d.net, 0), days };
  });
}

/** One exit on a day, for the day panel. `value` is on the basis in `ctx`. */
export interface DayExit {
  trade: Trade;
  time: string;
  value: Cents;
  gross: Cents;
  fees: Cents;
  /** This exit's R, when the trade has risk. */
  r: number | null;
}

/** The exits dated `date`, earliest first. */
export function dayExits(
  trades: readonly Trade[],
  date: string,
  ctx: MetricContext,
): DayExit[] {
  const out: DayExit[] = [];
  for (const trade of trades) {
    const risk =
      trade.initialRisk !== undefined && trade.initialRisk > 0
        ? trade.initialRisk
        : undefined;
    for (const x of realizations(trade)) {
      if (localDate(x.time, ctx.timeZone) !== date) continue;
      const value = ctx.pnlBasis === 'gross' ? x.gross : x.net;
      out.push({
        trade,
        time: x.time,
        value,
        gross: x.gross,
        fees: x.fees,
        r: risk === undefined ? null : value / risk,
      });
    }
  }
  return out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

export { addDays, mondayIndex, daysInMonth };

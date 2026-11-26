import { classify, type MetricContext } from '@/domain/metrics/context';
import { closedInOrder, isClosed } from '@/domain/trade-status';
import { localDate } from '@/domain/time';
import { TZDate } from '@date-fns/tz';
import type { Cents, Trade, WeekStart } from '@/domain/types';
import { weekFirstDay } from '@/domain/week';

/*
 * The trade log by day and by week: pure grouping, no React or storage.
 * Stats count base-currency trades only; other currencies sit apart.
 */

export interface DayStats {
  trades: number /* open included */;
  wins: number;
  losses: number;
  net: Cents | null /* closed only; null when none closed */;
  gross: Cents | null;
  commissions: Cents;
  winRate: number | null;
  profitFactor: number | null /* null without a loss (K39) */;
  volume: number /* both sides */;
}
export interface IntradayPoint {
  tradeId: string;
  time: string;
  net: Cents;
  cumulative: Cents;
}
export interface DayGroup {
  date: string;
  trades: Trade[] /* newest open time first (K38) */;
  stats: DayStats;
  series: IntradayPoint[] /* closed trades by close time */;
  otherCurrency: Trade[] /* K24 */;
  hasNote: boolean;
}
export interface WeekGroup {
  start: string;
  end: string;
  days: (DayGroup | null)[] /* seven, week order */;
  stats: DayStats;
  trades: Trade[];
  /** The week's other-currency trades, listed apart (K24). */
  otherCurrency: Trade[];
  dailyNet: (Cents | null)[];
}
export interface DayLogEnv {
  timeZone: string;
  baseCurrency: string;
  ctx: MetricContext;
  weekStart: WeekStart;
  /** Dates that have a daily note; pass an empty set while a trade-level filter is active. */
  noteDates: ReadonlySet<string>;
}

const DAY_MS = 86_400_000;

/** K37: the close date if closed, else the open date, in the profile zone. */
export function dayOfTrade(t: Trade, timeZone: string): string {
  return localDate(isClosed(t) ? t.closedAt : t.openedAt, timeZone);
}

/** The instant a local date begins (00:00 in the zone), as ISO. */
export function startOfLocalDay(date: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(new TZDate(y, m - 1, d, timeZone).getTime()).toISOString();
}

/**
 * The span a day's chart covers. Keel's call (TradeZella unknown): the first
 * open to the last close of the day's closed trades (the record: "the start,
 * the middle and the end of the day's trading"), except that it never starts
 * before 00:00 of the card's date, so a swing trade opened days earlier does
 * not stretch the axis over days (ruling R19). None without a closed trade.
 */
export function daySpan(
  trades: readonly Trade[],
  date: string,
  timeZone: string,
): { from: string; to: string } | undefined {
  const closed = trades.filter(isClosed);
  if (closed.length === 0) return undefined;
  const first = Math.min(...closed.map((t) => Date.parse(t.openedAt)));
  const last = Math.max(...closed.map((t) => Date.parse(t.closedAt)));
  const midnight = Date.parse(startOfLocalDay(date, timeZone));
  return {
    from: new Date(Math.max(first, midnight)).toISOString(),
    to: new Date(last).toISOString(),
  };
}

const newestOpenFirst = (a: Trade, b: Trade) =>
  Date.parse(b.openedAt) - Date.parse(a.openedAt) || b.serial - a.serial;

/** Every fill on both sides; without fills, Keel's call (TradeZella unknown): maxPosition once if open, twice if closed. */
function volumeOf(t: Trade): number {
  if (t.executions.length === 0) {
    return t.maxPosition * (isClosed(t) ? 2 : 1);
  }
  return t.executions.reduce((n, e) => n + e.qty, 0);
}

function statsOf(trades: readonly Trade[], ctx: MetricContext): DayStats {
  let wins = 0;
  let losses = 0;
  let net = 0;
  let gross = 0;
  let closed = 0;
  let positive = 0;
  let negative = 0;
  let volume = 0;
  for (const t of trades) {
    volume += volumeOf(t);
    if (!isClosed(t)) continue;
    closed += 1;
    net += t.net;
    gross += t.gross;
    if (t.net > 0) positive += t.net;
    else if (t.net < 0) negative += t.net;
    // Keel's call (TradeZella unknown): winners and losers follow the user's P&L basis and
    // breakeven band (R1); the record is silent on the basis.
    const { outcome } = classify(t, ctx);
    if (outcome === 'win') wins += 1;
    else if (outcome === 'loss') losses += 1;
  }
  return {
    trades: trades.length,
    wins,
    losses,
    net: closed > 0 ? net : null,
    gross: closed > 0 ? gross : null,
    commissions: closed > 0 ? gross - net : 0,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
    profitFactor: negative < 0 ? positive / -negative : null,
    volume: Math.round(volume * 1e6) / 1e6,
  };
}

function seriesOf(trades: readonly Trade[]): IntradayPoint[] {
  const closed = closedInOrder(trades);
  let cumulative = 0;
  return closed.map((t) => {
    cumulative += t.net;
    return { tradeId: t.id, time: t.closedAt, net: t.net, cumulative };
  });
}

/** Newest first; days with trades, plus note-only days. */
export function groupDays(
  trades: readonly Trade[],
  env: DayLogEnv,
): DayGroup[] {
  const byDate = new Map<string, { base: Trade[]; other: Trade[] }>();
  const bucket = (date: string) => {
    let b = byDate.get(date);
    if (!b) byDate.set(date, (b = { base: [], other: [] }));
    return b;
  };
  for (const t of trades) {
    const b = bucket(dayOfTrade(t, env.timeZone));
    (t.pnlCurrency === env.baseCurrency ? b.base : b.other).push(t);
  }
  for (const date of env.noteDates) bucket(date);
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, { base, other }]) => {
      const rows = base.sort(newestOpenFirst);
      return {
        date,
        trades: rows,
        stats: statsOf(rows, env.ctx),
        series: seriesOf(rows),
        otherCurrency: other.sort(newestOpenFirst),
        hasNote: env.noteDates.has(date),
      };
    });
}

const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** Weeks with trades only, latest first; gap weeks and an empty current week left out (K41). */
export function groupWeeks(
  days: readonly DayGroup[],
  env: DayLogEnv,
): WeekGroup[] {
  // Following the preference is Keel's call (Plan 5 ruling 73); TradeZella runs Sunday to Saturday.
  const byStart = new Map<string, DayGroup[]>();
  for (const d of days) {
    const start = weekFirstDay(d.date, env.weekStart);
    const list = byStart.get(start);
    if (list) list.push(d);
    else byStart.set(start, [d]);
  }
  const weeks: WeekGroup[] = [];
  for (const [start, group] of byStart) {
    const trades = group.flatMap((d) => d.trades).sort(newestOpenFirst);
    const otherCurrency = group
      .flatMap((d) => d.otherCurrency)
      .sort(newestOpenFirst);
    if (trades.length === 0 && otherCurrency.length === 0) continue;
    const slots = Array.from({ length: 7 }, (_, i): DayGroup | null => {
      const date = addDays(start, i);
      return group.find((d) => d.date === date) ?? null;
    });
    weeks.push({
      start,
      end: addDays(start, 6),
      days: slots,
      stats: statsOf(trades, env.ctx),
      trades,
      otherCurrency,
      dailyNet: slots.map((d) => d?.stats.net ?? null),
    });
  }
  return weeks.sort((a, b) =>
    a.start < b.start ? 1 : a.start > b.start ? -1 : 0,
  );
}

export interface WeekRows {
  trades: Trade[];
  otherCurrency: Trade[];
}

/**
 * R5: the trades a week's table lists, bucketed by week start: given the trades
 * under every filter except the date range, base currency apart from the
 * rest, newest open first. R20: it also applies to a multi-day range, not only
 * one day, as the record's source reads (recording/inventory-2.md:63, "the
 * table ignoring the day filter").
 */
export function weekRows(
  trades: readonly Trade[],
  env: Pick<DayLogEnv, 'timeZone' | 'baseCurrency' | 'weekStart'>,
): Map<string, WeekRows> {
  const out = new Map<string, WeekRows>();
  for (const t of trades) {
    const start = weekFirstDay(dayOfTrade(t, env.timeZone), env.weekStart);
    let bucket = out.get(start);
    if (!bucket) out.set(start, (bucket = { trades: [], otherCurrency: [] }));
    (t.pnlCurrency === env.baseCurrency
      ? bucket.trades
      : bucket.otherCurrency
    ).push(t);
  }
  for (const b of out.values()) {
    b.trades.sort(newestOpenFirst);
    b.otherCurrency.sort(newestOpenFirst);
  }
  return out;
}

import { TZDate } from '@date-fns/tz';
import { formatClock } from '@/lib/time-format';
import { isValidTimeZone } from '@/domain/time';

const CLOCK = String.raw`(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*([AaPp])\.?[Mm]\.?)?`;
/** YYYY-MM-DD HH:MM[:SS], with a space or a T between date and time. */
const ISO = new RegExp(
  String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})(?:T|\s+)${CLOCK}$`,
);
/** MetaTrader YYYY.MM.DD HH:MM[:SS]. */
const DOTTED = new RegExp(
  String.raw`^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:T|\s+)${CLOCK}$`,
);
/** NN/NN/YYYY HH:MM[:SS]; which number is the month depends on the date order. */
const SLASHED = new RegExp(
  String.raw`^(\d{1,2})/(\d{1,2})/(\d{4})\s+${CLOCK}$`,
);
/** YYYY/MM/DD HH:MM[:SS]. */
const SLASHED_YMD = new RegExp(
  String.raw`^(\d{4})/(\d{1,2})/(\d{1,2})\s+${CLOCK}$`,
);
/** ISO date and 24-hour clock followed by Z or a +HH:MM offset. */
const ZONED = new RegExp(
  String.raw`^(\d{4})-(\d{2})-(\d{2})(?:T|\s+)(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?\s*(?:(Z)|([+-])(\d{2}):?(\d{2}))$`,
  'i',
);

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type DateOrder = 'mdy' | 'dmy' | 'ymd';

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * The calendar date and clock exactly as written, or null when the shape is
 * not recognised or the values are not a real date and time. No timezone is
 * applied. Slashed dates read as month first ('mdy'), day first ('dmy') or
 * year first ('ymd'); ISO and dotted year-first dates need no order.
 */
export function parseWallClock(
  raw: string,
  dateOrder: DateOrder = 'mdy',
): WallClock | null {
  const s = raw.trim();
  const ymd =
    ISO.exec(s) ??
    DOTTED.exec(s) ??
    (dateOrder === 'ymd' ? SLASHED_YMD.exec(s) : null);
  const slashed = ymd ? null : SLASHED.exec(s);
  const m = ymd ?? slashed;
  if (!m) return null;

  const [year, month, day] = ymd
    ? [Number(m[1]), Number(m[2]), Number(m[3])]
    : dateOrder !== 'dmy'
      ? [Number(m[3]), Number(m[1]), Number(m[2])]
      : [Number(m[3]), Number(m[2]), Number(m[1])];
  let hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const meridiem = m[7]?.toLowerCase();

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysIn(year, month)) return null;
  if (minute > 59 || second > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (hour > 23) return null;

  return { year, month, day, hour, minute, second };
}

/**
 * A fill time from the visitor's file, printed in the clock format
 * 'DD MMM HH:MM:SS'. The wall clock is kept exactly as written, since the
 * file's timezone is unknown. Anything not recognised is shown as it came.
 */
export function formatFillTime(raw: string): string {
  const c = parseWallClock(raw, 'mdy');
  return c ? formatClock(c) : raw;
}

/** A time written with Z or an offset: validated by hand, never by Date rollover. */
function zonedToUtc(s: string): string | null {
  const m = ZONED.exec(s);
  if (!m) return null;
  const [year, month, day, hour, minute] = [1, 2, 3, 4, 5].map((i) =>
    Number(m[i]),
  ) as [number, number, number, number, number];
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const ms = m[7] === undefined ? 0 : Number(m[7].padEnd(3, '0'));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysIn(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  let offsetMinutes = 0;
  if (!m[8]) {
    const oh = Number(m[10]);
    const om = Number(m[11]);
    if (oh > 23 || om > 59) return null;
    offsetMinutes = (m[9] === '-' ? -1 : 1) * (oh * 60 + om);
  }
  const t =
    Date.UTC(year, month - 1, day, hour, minute, second, ms) -
    offsetMinutes * 60_000;
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * A fill time as a UTC ISO string. A written Z or offset wins; otherwise the
 * wall clock is read in the import's source timezone. Null when the value is
 * not a real date and time or the zone is unknown.
 */
export function fillTimeToUtc(
  raw: string,
  opts: { timeZone: string; dateOrder: DateOrder },
): string | null {
  const s = raw.trim();
  const zoned = zonedToUtc(s);
  if (zoned) return zoned;

  const c = parseWallClock(s, opts.dateOrder);
  if (!c || !isValidTimeZone(opts.timeZone)) return null;
  // A wall time in a DST gap, which never happened there, rolls forward by the
  // gap (02:30 on a New York spring-forward day reads as 03:30 EDT). One in the
  // fall-back hour, which happened twice, reads as the first (daylight) one.
  const tz = new TZDate(
    c.year,
    c.month - 1,
    c.day,
    c.hour,
    c.minute,
    c.second,
    opts.timeZone,
  );
  const t = +tz;
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Year-first when a slashed sample opens with a four-digit year. Otherwise
 * day-first when a slashed sample's first number exceeds 12 and no sample's
 * second number does, and month-first when the samples cannot tell.
 */
export function guessDateOrder(samples: readonly string[]): DateOrder {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const raw of samples) {
    const s = raw.trim();
    if (SLASHED_YMD.test(s)) return 'ymd';
    const m = SLASHED.exec(s);
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver12 = true;
    if (Number(m[2]) > 12) secondOver12 = true;
  }
  return firstOver12 && !secondOver12 ? 'dmy' : 'mdy';
}

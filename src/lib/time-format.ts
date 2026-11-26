/** The one place that decides how clock times and dates print. */

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

const two = (n: number) => String(n).padStart(2, '0');

/** The clock, 'DD MMM HH:MM:SS' in capitals. `month` is 1-12. */
export function formatClock(p: {
  day: number;
  month: number;
  hour: number;
  minute: number;
  second: number;
}): string {
  return `${two(p.day)} ${MONTHS[p.month - 1]} ${two(p.hour)}:${two(p.minute)}:${two(p.second)}`;
}

/** 'YYYY-MM-DD' (already a local trading date) read at noon UTC so the label never shifts. */
export function onTradingDate(
  date: string,
  opts: Intl.DateTimeFormatOptions,
  locale = 'en-GB',
): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
    ...opts,
    timeZone: 'UTC',
  });
}

export const weekdayOf = (date: string, style: 'short' | 'long' = 'long') =>
  onTradingDate(date, { weekday: style }, 'en-US');

/** "Thu 19 Nov", or "Thu 19 Nov 2026" with `year`. */
export const dayLabel = (
  date: string,
  { year = false }: { year?: boolean } = {},
): string =>
  `${weekdayOf(date, 'short')} ${onTradingDate(date, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })}`;

/** An instant as HH:MM:SS, or HH:MM without `seconds`, in the zone. */
export function clock(iso: string, timeZone: string, seconds = true): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** The compact row clock, '20 Nov 10:15', in the given timezone. */
export function shortTime(iso: string, timeZone = 'America/New_York'): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day} ${parts.month} ${parts.hour}:${parts.minute}`;
}

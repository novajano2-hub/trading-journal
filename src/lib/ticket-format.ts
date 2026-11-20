/** The one place that decides how a ticket prints its serial, gaps, clock and dates. */

/** Printed where a ticket has no value. */
export const MISSING = '—';

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

/** 'No. 000006' */
export function serialNumber(serial: number): string {
  return `No. ${String(serial).padStart(6, '0')}`;
}

/** The ticket clock, 'DD MMM HH:MM:SS' in capitals. `month` is 1-12. */
export function formatClock(p: {
  day: number;
  month: number;
  hour: number;
  minute: number;
  second: number;
}): string {
  return `${two(p.day)} ${MONTHS[p.month - 1]} ${two(p.hour)}:${two(p.minute)}:${two(p.second)}`;
}

/** An instant as printed on a ticket, in the given timezone: '20 NOV 10:15:00'. */
export function ticketTime(iso: string, timeZone = 'America/New_York'): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<'day' | 'month' | 'hour' | 'minute' | 'second', number>;
  return formatClock(parts);
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

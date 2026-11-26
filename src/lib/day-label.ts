import { onTradingDate, weekdayOf } from '@/lib/time-format';

/**
 * A trading date in full, "Tue 24 Nov 2026" (the record: weekday, month, day
 * and year); without the year, "Tue 24 Nov" (the phone's header).
 */
export function dayLabel(date: string, year = true): string {
  return `${weekdayOf(date, 'short')} ${onTradingDate(date, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })}`;
}

/** An instant as HH:MM, or HH:MM:SS with `seconds`, in the profile zone. */
export function clockOf(
  iso: string,
  timeZone: string,
  seconds = false,
): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** A tile's date, "Tue 24 Nov". */
export function tileLabel(date: string): string {
  return `${weekdayOf(date, 'short')} ${onTradingDate(date, { day: 'numeric', month: 'short' })}`;
}

/**
 * A week's span without a hyphen: "22 to 28 Nov 2026", "29 Nov to 5 Dec 2026",
 * and, across a year, "29 Dec 2026 to 4 Jan 2027". The year is always there, as
 * the Day header's is.
 */
export function weekLabel(start: string, end: string): string {
  const part = (date: string, o: Intl.DateTimeFormatOptions) =>
    onTradingDate(date, o);
  const [sy, sm] = [
    part(start, { year: 'numeric' }),
    part(start, { month: 'short' }),
  ];
  const [ey, em] = [
    part(end, { year: 'numeric' }),
    part(end, { month: 'short' }),
  ];
  const day = (d: string) => part(d, { day: 'numeric' });
  if (sy !== ey) return `${day(start)} ${sm} ${sy} to ${day(end)} ${em} ${ey}`;
  if (sm !== em) return `${day(start)} ${sm} to ${day(end)} ${em} ${ey}`;
  return `${day(start)} to ${day(end)} ${em} ${ey}`;
}

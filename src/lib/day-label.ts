import { onTradingDate } from '@/lib/time-format';

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

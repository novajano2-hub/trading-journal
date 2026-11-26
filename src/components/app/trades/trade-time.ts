// How the trade page prints a moment, in the zone its account is read in.
import { localDate } from '@/domain/time';
import { clock } from '@/lib/time-format';

function parts(iso: string, timeZone: string, o: Intl.DateTimeFormatOptions) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', ...o })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
}

/** "Mon 9 Nov". */
export function dayLabel(iso: string, timeZone: string): string {
  const p = parts(iso, timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "9 Nov 19:21:08" when the moment is on another day than `from`, else "19:21:08". */
export function clockOnDay(
  iso: string,
  from: string,
  timeZone: string,
): string {
  if (localDate(iso, timeZone) === localDate(from, timeZone))
    return clock(iso, timeZone);
  const p = parts(iso, timeZone, { day: 'numeric', month: 'short' });
  return `${p.day} ${p.month} ${clock(iso, timeZone)}`;
}

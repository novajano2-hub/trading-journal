import { onTradingDate, weekdayOf } from '@/lib/time-format';

/** A trading date in full, "Tue 24 Nov 2026" (the record: weekday, month, day and year). */
export function dayLabel(date: string): string {
  return `${weekdayOf(date, 'short')} ${onTradingDate(date, { day: 'numeric', month: 'short', year: 'numeric' })}`;
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

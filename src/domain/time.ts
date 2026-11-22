import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/** Local calendar date (YYYY-MM-DD) of an instant in the given IANA time zone. */
export function localDate(iso: string, timeZone: string): string {
  let f = dateFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormats.set(timeZone, f);
  }
  return f.format(Date.parse(iso));
}

/** One formatter per zone: building them is the slow part of bucketing thousands of fills. */
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export interface LocalParts {
  date: string;
  weekday: number; // 0 = Sunday
  hour: number;
  minute: number;
}

export function localParts(iso: string, timeZone: string): LocalParts {
  const d = new TZDate(Date.parse(iso), timeZone);
  return {
    date: format(d, 'yyyy-MM-dd'),
    weekday: d.getDay(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

/** True when the runtime knows this IANA time zone. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

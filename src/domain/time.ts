import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/** Local calendar date (YYYY-MM-DD) of an instant in the given IANA time zone. */
export function localDate(iso: string, timeZone: string): string {
  return format(new TZDate(Date.parse(iso), timeZone), 'yyyy-MM-dd');
}

export interface LocalParts {
  date: string;
  weekday: number; // 0 = Sunday
  hour: number;
  minute: number;
}

export function localParts(iso: string, timeZone: string): LocalParts {
  const d = new TZDate(Date.parse(iso), timeZone);
  return { date: format(d, 'yyyy-MM-dd'), weekday: d.getDay(), hour: d.getHours(), minute: d.getMinutes() };
}

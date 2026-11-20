import { TZDate } from '@date-fns/tz';

export const NY = 'America/New_York';
export const DAY_MS = 86_400_000;

export const parseYmd = (s: string): number => {
  const [y = 1970, m = 1, d = 1] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const ymd = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 10);
export const dow = (ms: number): number => new Date(ms).getUTCDay();
export const isWeekday = (ms: number): boolean => dow(ms) >= 1 && dow(ms) <= 5;
export const mondayOf = (date: string): string => {
  const ms = parseYmd(date);
  return ymd(ms - ((dow(ms) + 6) % 7) * DAY_MS);
};

/** A New York wall-clock time as epoch milliseconds. */
export function nyMs(
  date: string,
  hour: number,
  minute: number,
  second = 0,
): number {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return new TZDate(y, m - 1, d, hour, minute, second, NY).getTime();
}
export const nyIso = (date: string, h: number, m: number): string =>
  new Date(nyMs(date, h, m)).toISOString();

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export function dayLabel(date: string, withWeekday = true): string {
  const ms = parseYmd(date);
  const d = new Date(ms);
  const base = `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
  return withWeekday ? `${DAY_NAMES[dow(ms)]} ${base}` : base;
}

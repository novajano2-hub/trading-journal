import type { WeekStart } from './types';

/*
 * The one place that knows which day a week starts on. Sunday unless the
 * preference says Monday; everything week-shaped asks here.
 */

const DAY_MS = 86_400_000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** date-fns' `weekStartsOn`: 0 for Sunday, 1 for Monday. */
export const weekStartsOn = (weekStart: WeekStart | undefined): 0 | 1 =>
  weekStart === 'monday' ? 1 : 0;

/** 0 for the first day of the week to 6 for its last, for a local date. */
export function weekIndexOf(date: string, weekStart?: WeekStart): number {
  const dow = new Date(utc(date)).getUTCDay();
  return (dow - weekStartsOn(weekStart) + 7) % 7;
}

/** The first day of the week the date falls in. */
export function weekFirstDay(date: string, weekStart?: WeekStart): string {
  return new Date(utc(date) - weekIndexOf(date, weekStart) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** A list of the seven days written Sunday first, rotated to start on the week's first day. */
export function rotateFromWeekStart<T>(
  sundayFirst: readonly T[],
  weekStart?: WeekStart,
): T[] {
  const n = weekStartsOn(weekStart);
  return [...sundayFirst.slice(n), ...sundayFirst.slice(0, n)];
}

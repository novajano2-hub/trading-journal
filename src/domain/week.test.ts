import { expect, test } from 'vitest';
import {
  rotateFromWeekStart,
  weekFirstDay,
  weekIndexOf,
  weekStartsOn,
} from './week';

test('the day index counts from the first day of the week', () => {
  // 2026-11-01 is a Sunday.
  expect(weekIndexOf('2026-11-01')).toBe(0);
  expect(weekIndexOf('2026-11-01', 'sunday')).toBe(0);
  expect(weekIndexOf('2026-11-01', 'monday')).toBe(6);
  expect(weekIndexOf('2026-11-02', 'monday')).toBe(0);
  expect(weekIndexOf('2026-11-07', 'sunday')).toBe(6);
  expect(weekStartsOn('sunday')).toBe(0);
  expect(weekStartsOn('monday')).toBe(1);
  expect(weekStartsOn(undefined)).toBe(0);
});

test('a list written Sunday first is rotated to the week start', () => {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  expect(rotateFromWeekStart(days, 'sunday')).toEqual(days);
  expect(rotateFromWeekStart(days, undefined)).toEqual(days);
  expect(rotateFromWeekStart(days, 'monday')).toEqual([
    'mon',
    'tue',
    'wed',
    'thu',
    'fri',
    'sat',
    'sun',
  ]);
});

test("the first day of a date's week", () => {
  expect(weekFirstDay('2026-11-20')).toBe('2026-11-15');
  expect(weekFirstDay('2026-11-15', 'sunday')).toBe('2026-11-15');
  expect(weekFirstDay('2026-11-20', 'monday')).toBe('2026-11-16');
  expect(weekFirstDay('2026-11-22', 'monday')).toBe('2026-11-16');
  expect(weekFirstDay('2026-11-22', 'sunday')).toBe('2026-11-22');
});

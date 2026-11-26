import { expect, test } from 'vitest';
import { dayLabel, weekLabel } from './day-label';

test('a day reads with its year, or without it for a phone header', () => {
  expect(dayLabel('2026-11-24')).toBe('Tue 24 Nov 2026');
  expect(dayLabel('2026-11-24', false)).toBe('Tue 24 Nov');
});

test('a week span has no hyphen and always the year', () => {
  expect(weekLabel('2026-11-22', '2026-11-28')).toBe('22 to 28 Nov 2026');
  expect(weekLabel('2026-11-29', '2026-12-05')).toBe('29 Nov to 5 Dec 2026');
  expect(weekLabel('2026-12-29', '2027-01-04')).toBe(
    '29 Dec 2026 to 4 Jan 2027',
  );
});

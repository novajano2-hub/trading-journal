import { describe, expect, test } from 'vitest';
import { formatFillTime } from '@/domain/import/fill-time';
import {
  clock,
  dayLabel,
  formatClock,
  shortTime,
  weekdayOf,
} from './time-format';

describe('time-format', () => {
  test('one clock: the sample and the visitor print the same string', () => {
    expect(formatFillTime('2026-11-20 10:15:00')).toBe('20 NOV 10:15:00');
    expect(
      formatClock({ day: 5, month: 1, hour: 9, minute: 5, second: 0 }),
    ).toBe('05 JAN 09:05:00');
  });

  test('weekday reads at noon UTC so it never shifts', () => {
    expect(weekdayOf('2026-11-20')).toBe('Friday');
    expect(weekdayOf('2026-11-16', 'short')).toBe('Mon');
  });

  test('a day reads without its year, or with it', () => {
    expect(dayLabel('2026-11-24')).toBe('Tue 24 Nov');
    expect(dayLabel('2026-11-24', { year: true })).toBe('Tue 24 Nov 2026');
  });

  test('one clock: seconds unless asked otherwise, in the given zone', () => {
    expect(clock('2026-11-20T15:15:08Z', 'America/New_York')).toBe('10:15:08');
    expect(clock('2026-11-20T15:15:08Z', 'America/New_York', false)).toBe(
      '10:15',
    );
  });

  test('shortTime prints the compact row clock', () => {
    expect(shortTime('2026-11-20T15:15:00Z')).toBe('20 Nov 10:15');
    expect(shortTime('2026-11-19T14:50:00Z')).toBe('19 Nov 09:50');
  });
});

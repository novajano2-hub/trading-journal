import { describe, expect, test } from 'vitest';
import { formatFillTime } from './fill-time';

describe('formatFillTime', () => {
  test('prints the brief examples in the ticket clock format', () => {
    expect(formatFillTime('2026-11-16 10:48:00')).toBe('16 NOV 10:48:00');
    expect(formatFillTime('11/16/2026 2:05 PM')).toBe('16 NOV 14:05:00');
    expect(formatFillTime('garbage')).toBe('garbage');
  });

  test('reads ISO-style dates with a space or a T, with or without seconds', () => {
    expect(formatFillTime('2026-11-16T09:41:07')).toBe('16 NOV 09:41:07');
    expect(formatFillTime('2026-11-16 09:41')).toBe('16 NOV 09:41:00');
    expect(formatFillTime('2026-01-05T23:59')).toBe('05 JAN 23:59:00');
    expect(formatFillTime('2026-11-16 09:41:07.250')).toBe('16 NOV 09:41:07');
  });

  test('reads US month-first dates with an optional AM/PM', () => {
    expect(formatFillTime('1/5/2026 9:05')).toBe('05 JAN 09:05:00');
    expect(formatFillTime('03/09/2026 17:30:15')).toBe('09 MAR 17:30:15');
    expect(formatFillTime('11/16/2026 12:00:00 AM')).toBe('16 NOV 00:00:00');
    expect(formatFillTime('11/16/2026 12:30 pm')).toBe('16 NOV 12:30:00');
    expect(formatFillTime('11/16/2026 9:05AM')).toBe('16 NOV 09:05:00');
    expect(formatFillTime('2026-11-16 02:05:09 PM')).toBe('16 NOV 14:05:09');
  });

  test('keeps the wall clock as written: no timezone conversion', () => {
    // Midnight stays on its own date even though the CSV's zone is unknown.
    expect(formatFillTime('2026-12-31 23:30:00')).toBe('31 DEC 23:30:00');
    expect(formatFillTime('2026-03-08 02:30:00')).toBe('08 MAR 02:30:00');
  });

  test('trims surrounding space', () => {
    expect(formatFillTime('  2026-11-16 10:48:00 ')).toBe('16 NOV 10:48:00');
  });

  test('shows the raw string when the shape or values are not a real clock', () => {
    for (const raw of [
      '',
      '2026-11-16',
      '10:48:00',
      '16/11/2026 10:48', // day-first: month 16 does not exist
      '2026-13-01 10:00',
      '2026-02-30 10:00',
      '2026-11-16 24:00',
      '2026-11-16 10:60',
      '2026-11-16 10:48:61',
      '11/16/2026 13:05 PM',
      '11/16/2026 0:05 AM',
      '2026-11-16T10:48:00Z',
      '2026-11-16 10:48:00 +05:00',
      '20261116 104800',
    ])
      expect(formatFillTime(raw)).toBe(raw);
  });

  test('leap days follow the calendar', () => {
    expect(formatFillTime('2028-02-29 10:00')).toBe('29 FEB 10:00:00');
    expect(formatFillTime('2026-02-29 10:00')).toBe('2026-02-29 10:00');
  });
});

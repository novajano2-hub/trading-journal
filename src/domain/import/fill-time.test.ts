import { describe, expect, test } from 'vitest';
import {
  detectDateOrder,
  fillTimeToUtc,
  formatFillTime,
  guessDateOrder,
} from './fill-time';

describe('formatFillTime', () => {
  test('prints the brief examples in the clock format', () => {
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

const ny = { timeZone: 'America/New_York', dateOrder: 'mdy' } as const;

describe('fillTimeToUtc', () => {
  test('wall clock in the source timezone, across DST', () => {
    expect(fillTimeToUtc('2026-07-15 09:30:00', ny)).toBe(
      '2026-07-15T13:30:00.000Z',
    );
    expect(fillTimeToUtc('2026-12-15 09:30', ny)).toBe(
      '2026-12-15T14:30:00.000Z',
    );
    expect(fillTimeToUtc('11/16/2026 2:05 PM', ny)).toBe(
      '2026-11-16T19:05:00.000Z',
    );
    expect(
      fillTimeToUtc('2026-11-16 23:30:00', { ...ny, timeZone: 'Asia/Tokyo' }),
    ).toBe('2026-11-16T14:30:00.000Z');
  });
  test('a written Z or offset wins over the source timezone', () => {
    expect(
      fillTimeToUtc('2026-11-16T10:48:00Z', { ...ny, timeZone: 'Asia/Tokyo' }),
    ).toBe('2026-11-16T10:48:00.000Z');
    expect(fillTimeToUtc('2026-11-16T10:48:00+05:00', ny)).toBe(
      '2026-11-16T05:48:00.000Z',
    );
  });
  test('MetaTrader dotted dates and day-first dates', () => {
    const london = { timeZone: 'Europe/London', dateOrder: 'dmy' } as const;
    expect(fillTimeToUtc('2026.11.16 10:48:00', london)).toBe(
      '2026-11-16T10:48:00.000Z',
    );
    expect(fillTimeToUtc('16/11/2026 10:48', london)).toBe(
      '2026-11-16T10:48:00.000Z',
    );
    expect(
      fillTimeToUtc('16/11/2026 10:48', { ...london, dateOrder: 'mdy' }),
    ).toBeNull();
  });
  test('unparseable values and unknown zones give null', () => {
    for (const raw of [
      '',
      'garbage',
      '2026-02-30 10:00',
      '2026-11-16',
      '10:48:00',
    ])
      expect(fillTimeToUtc(raw, ny)).toBeNull();
    expect(
      fillTimeToUtc('2026-11-16 10:00', { ...ny, timeZone: 'Not/AZone' }),
    ).toBeNull();
  });
  test('Z and offset forms validate their own date and clock, with no rollover', () => {
    for (const raw of [
      '2026-02-30T10:00Z',
      '2026-02-30T10:00:00+05:00',
      '2026-13-01T10:00Z',
      '2026-11-16T24:00Z',
      '2026-11-16T10:60Z',
      '2026-11-16T10:00:61Z',
      '2026-11-16T10:00+25:00',
    ])
      expect(fillTimeToUtc(raw, ny)).toBeNull();
    expect(fillTimeToUtc('2028-02-29T10:00Z', ny)).toBe(
      '2028-02-29T10:00:00.000Z',
    );
  });
});

describe('guessDateOrder', () => {
  test('guessDateOrder', () => {
    expect(guessDateOrder(['11/16/2026 10:00', '1/5/2026 9:05'])).toBe('mdy');
    expect(guessDateOrder(['05/11/2026 10:00', '16/11/2026 09:00'])).toBe(
      'dmy',
    );
    expect(guessDateOrder(['2026-11-16 10:00', 'x'])).toBe('mdy');
  });
});

test('year-first slashed dates read as written, and YMD is guessed from them', () => {
  expect(
    fillTimeToUtc('2026/11/19 09:30:00', {
      timeZone: 'UTC',
      dateOrder: 'ymd',
    }),
  ).toBe('2026-11-19T09:30:00.000Z');
  expect(guessDateOrder(['2026/11/19 09:30:00'])).toBe('ymd');
  // ISO dates need no order: the guess leaves them month first, as before.
  expect(guessDateOrder(['2026-11-19 09:30:00'])).toBe('mdy');
  // ISO dates read the same whatever the order says.
  expect(
    fillTimeToUtc('2026-11-19 09:30:00', { timeZone: 'UTC', dateOrder: 'dmy' }),
  ).toBe('2026-11-19T09:30:00.000Z');
});

describe('detectDateOrder', () => {
  test('says an order only when the samples prove one', () => {
    expect(detectDateOrder(['19/11/2026 10:00'])).toBe('dmy');
    expect(detectDateOrder(['11/19/2026 10:00'])).toBe('mdy');
    expect(detectDateOrder(['2026/11/19 10:00'])).toBe('ymd');
    // Both parts of a date at 12 or under: it cannot tell.
    expect(detectDateOrder(['11/05/2026 10:00'])).toBeNull();
    expect(detectDateOrder(['2026-11-19 10:00'])).toBeNull();
    // Contradicting samples prove nothing.
    expect(detectDateOrder(['19/11/2026', '11/19/2026'])).toBeNull();
  });
});

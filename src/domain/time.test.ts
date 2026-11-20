import { describe, expect, test } from 'vitest';
import { localDate, localParts } from './time';

describe('time', () => {
  test('localDate respects the time zone', () => {
    expect(localDate('2026-03-03T02:30:00Z', 'America/New_York')).toBe(
      '2026-03-02',
    );
    expect(localDate('2026-03-03T02:30:00Z', 'Asia/Tokyo')).toBe('2026-03-03');
  });
  test('localParts gives weekday, hour and minute', () => {
    expect(localParts('2026-03-09T13:45:00Z', 'America/New_York')).toEqual({
      date: '2026-03-09',
      weekday: 1,
      hour: 9,
      minute: 45,
    });
  });
});

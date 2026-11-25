import { expect, test } from 'vitest';
import { greeting } from './greeting';

const at = (iso: string) => new Date(iso);

test('the word follows the hour in the profile zone: morning, afternoon, evening', () => {
  const z = 'UTC';
  expect(greeting(at('2026-11-25T00:00:00Z'), z, 'Sam')).toBe(
    'Good morning, Sam',
  );
  expect(greeting(at('2026-11-25T11:59:00Z'), z, 'Sam')).toBe(
    'Good morning, Sam',
  );
  expect(greeting(at('2026-11-25T12:00:00Z'), z, 'Sam')).toBe(
    'Good afternoon, Sam',
  );
  expect(greeting(at('2026-11-25T17:59:00Z'), z, 'Sam')).toBe(
    'Good afternoon, Sam',
  );
  expect(greeting(at('2026-11-25T18:00:00Z'), z, 'Sam')).toBe(
    'Good evening, Sam',
  );
  expect(greeting(at('2026-11-25T23:59:00Z'), z, 'Sam')).toBe(
    'Good evening, Sam',
  );
});

test('the hour is the profile zone, not the browser', () => {
  // 14:00 UTC is 09:00 in New York and 23:00 in Tokyo.
  const now = at('2026-11-25T14:00:00Z');
  expect(greeting(now, 'America/New_York', 'Sam')).toBe('Good morning, Sam');
  expect(greeting(now, 'Asia/Tokyo', 'Sam')).toBe('Good evening, Sam');
});

test('with no first name there is no name and no comma', () => {
  expect(greeting(at('2026-11-25T09:00:00Z'), 'UTC', undefined)).toBe(
    'Good morning',
  );
  expect(greeting(at('2026-11-25T09:00:00Z'), 'UTC', '  ')).toBe(
    'Good morning',
  );
});

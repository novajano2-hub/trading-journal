import { expect, test } from 'vitest';
import {
  ALL_COLUMNS,
  DAY_COLUMNS,
  WEEK_COLUMNS,
  sanitizeColumns,
  sanitizeDayColumns,
} from './trade-columns';

test("the Day columns are TradeZella's and the Week adds the day", () => {
  expect(DAY_COLUMNS).toEqual([
    'open',
    'ticker',
    'side',
    'instrument',
    'net',
    'roi',
    'realizedR',
    'strategies',
    'tags',
  ]);
  expect(WEEK_COLUMNS).toEqual(['day', ...DAY_COLUMNS]);
});

test("the trade log's column list and saves are unchanged by the two new ids", () => {
  expect(ALL_COLUMNS).not.toContain('ticker');
  expect(ALL_COLUMNS).not.toContain('day');
  expect(sanitizeColumns(['open', 'ticker', 'day'])).toEqual(['open']);
  expect(sanitizeDayColumns(['ticker', 'day', 'open'])).toEqual([
    'ticker',
    'open',
  ]);
  expect(sanitizeDayColumns(undefined)).toEqual(DAY_COLUMNS);
});

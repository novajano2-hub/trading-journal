import { expect, test } from 'vitest';
import {
  ALL_COLUMNS,
  COLUMN_LABELS,
  DAY_CHOICES,
  DAY_COLUMNS,
  DEFAULT_COLUMNS,
  WEEK_CHOICES,
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

test("Patterns is a default column of the trade log, after Tags, and the Day and Week tables don't offer it", () => {
  expect(ALL_COLUMNS).toContain('patterns');
  expect(DEFAULT_COLUMNS.slice(DEFAULT_COLUMNS.indexOf('tags'))).toEqual([
    'tags',
    'patterns',
    'rules',
    'rating',
    'reviewed',
  ]);
  expect(DAY_COLUMNS).not.toContain('patterns');
  expect(WEEK_COLUMNS).not.toContain('patterns');
  expect(DAY_CHOICES).not.toContain('patterns');
  expect(WEEK_CHOICES).not.toContain('patterns');
  // A saved Day list that names it is cleaned of it; the log's own list keeps it.
  expect(sanitizeDayColumns(['open', 'patterns'])).toEqual(['open']);
  expect(sanitizeColumns(['open', 'patterns'])).toEqual(['open', 'patterns']);
  expect(COLUMN_LABELS.patterns.label).toBe('Patterns');
});

import { expect, test } from 'vitest';
import {
  rangeCaption,
  rangeChipLabel,
  rangeInWords,
  PRESET_LABELS,
} from './range-label';

test.each([
  [{}, 'all time'],
  [{ from: '2026-03-03' }, 'since 3 Mar'],
  [{ to: '2026-03-03' }, 'to 3 Mar'],
  [{ from: '2026-11-20', to: '2026-11-20' }, '20 Nov'],
  [{ from: '2026-11-01', to: '2026-11-20' }, '1-20 Nov'],
  [{ from: '2026-10-28', to: '2026-11-03' }, '28 Oct-3 Nov'],
  [{ from: '2025-12-30', to: '2026-01-02' }, '30 Dec 2025-2 Jan 2026'],
  [{ from: '2025-11-01', to: '2025-11-20' }, '1-20 Nov 2025'],
  [{ from: '2025-03-03' }, 'since 3 Mar 2025'],
])('caption %o', (r, out) => expect(rangeCaption(r, '2026-11-20')).toBe(out));

test('chip labels', () => {
  expect(
    rangeChipLabel(
      { preset: 'this-month' },
      { from: '2026-11-01', to: '2026-11-20' },
    ),
  ).toBe('This month');
  expect(rangeChipLabel({}, {})).toBe('All time');
  expect(
    rangeChipLabel(
      { from: '2026-11-01', to: '2026-11-20' },
      { from: '2026-11-01', to: '2026-11-20' },
    ),
  ).toBe('1-20 Nov 2026');
  expect(rangeChipLabel({ from: '2026-03-03' }, { from: '2026-03-03' })).toBe(
    'since 3 Mar 2026',
  );
});

test('preset labels', () => {
  expect(Object.values(PRESET_LABELS)).toEqual([
    'Today',
    'This week',
    'Last week',
    'This month',
    'Last month',
    'Last 30 days',
    'This quarter',
    'Year to date',
  ]);
});

// A printed page names its range in full, with the dates the figures cover.
const SPAN = { from: '2026-06-12', to: '2026-11-24' };

test.each([
  // All time says the days the trades fall on.
  [{}, {}, SPAN, 'All time (12 Jun to 24 Nov 2026)'],
  [
    {},
    {},
    { from: '2025-12-12', to: '2026-11-24' },
    'All time (12 Dec 2025 to 24 Nov 2026)',
  ],
  // With no trade to read a span from, the name stands alone.
  [{}, {}, {}, 'All time'],
  // A preset keeps its name and gives the days it resolved to.
  [
    { preset: 'last-30-days' as const },
    { from: '2026-10-26', to: '2026-11-24' },
    SPAN,
    'Last 30 days (26 Oct to 24 Nov 2026)',
  ],
  // A custom range is its dates.
  [
    { from: '2026-11-03', to: '2026-11-05' },
    { from: '2026-11-03', to: '2026-11-05' },
    SPAN,
    '3 Nov to 5 Nov 2026',
  ],
  [
    { from: '2025-12-28', to: '2026-01-05' },
    { from: '2025-12-28', to: '2026-01-05' },
    SPAN,
    '28 Dec 2025 to 5 Jan 2026',
  ],
  [
    { from: '2026-11-03', to: '2026-11-03' },
    { from: '2026-11-03', to: '2026-11-03' },
    SPAN,
    '3 Nov 2026',
  ],
  // An open end reads from the trades.
  [
    { from: '2026-11-01' },
    { from: '2026-11-01' },
    SPAN,
    'Since 1 Nov 2026 (1 Nov to 24 Nov 2026)',
  ],
  [
    { to: '2026-11-05' },
    { to: '2026-11-05' },
    SPAN,
    'Up to 5 Nov 2026 (12 Jun to 5 Nov 2026)',
  ],
])('range in words %o', (range, resolved, span, out) =>
  expect(rangeInWords(range, resolved, span)).toBe(out),
);

import { expect, test } from 'vitest';
import { rangeCaption, rangeChipLabel, PRESET_LABELS } from './range-label';

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

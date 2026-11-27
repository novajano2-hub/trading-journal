import { expect, test } from 'vitest';
import { dateTicks } from './chart-kit';

test('a short run of days is labelled day by day', () => {
  expect(dateTicks(['2026-10-01', '2026-10-02', '2026-10-05'])).toEqual([
    { at: 0, text: '1 Oct' },
    { at: 1, text: '2 Oct' },
    { at: 2, text: '5 Oct' },
  ]);
});

test('a long run is labelled where each month begins, with the year on January', () => {
  const days: string[] = [];
  for (const [m, last] of [
    ['2026-11', 30],
    ['2026-12', 31],
    ['2027-01', 31],
  ] as const)
    for (let d = 1; d <= last; d += 1)
      days.push(`${m}-${String(d).padStart(2, '0')}`);
  expect(dateTicks(days)).toEqual([
    { at: 0, text: 'Nov' },
    { at: 30, text: 'Dec' },
    { at: 61, text: 'Jan 2027' },
  ]);
});

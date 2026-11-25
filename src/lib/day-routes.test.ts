import { expect, test } from 'vitest';
import { dayHref, dayModeOf } from './day-routes';

test('past dates open review; today and future dates open plan (K26)', () => {
  expect(dayHref('2026-11-18', '2026-11-19')).toBe(
    '/app/day/2026-11-18/review',
  );
  expect(dayHref('2026-11-19', '2026-11-19')).toBe('/app/day/2026-11-19/plan');
  expect(dayHref('2026-12-01', '2026-11-19')).toBe('/app/day/2026-12-01/plan');
  expect(dayModeOf('2026-11-18', '2026-11-19')).toBe('review');
  expect(dayModeOf('2026-11-19', '2026-11-19')).toBe('plan');
  expect(dayModeOf('2027-01-01', '2026-11-19')).toBe('plan');
});

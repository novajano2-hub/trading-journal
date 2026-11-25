import { expect, test } from 'vitest';
import { isOnboarded } from './onboarding';

test('a user with no onboarding flag is not onboarded', () => {
  expect(isOnboarded({})).toBe(false);
});

test('the done flag, from a first run or an upgrade, counts', () => {
  expect(
    isOnboarded({
      onboarding: { status: 'done', at: '2026-11-20T15:00:00.000Z' },
    }),
  ).toBe(true);
  expect(
    isOnboarded({
      onboarding: {
        status: 'done',
        at: '2026-11-20T15:00:00.000Z',
        existing: true,
      },
    }),
  ).toBe(true);
});

import { isValidElement, type ReactElement } from 'react';
import { expect, test, vi } from 'vitest';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';
import StrategyPage from './[id]/page';
import StrategiesPage from './page';

vi.mock('next/navigation', () => ({}));

/** The `<Suspense>` a page renders: its fallback is what shows while the filters resolve. */
function fallbackOf(el: unknown): ReactElement {
  expect(isValidElement(el)).toBe(true);
  const { fallback } = (el as ReactElement<{ fallback: unknown }>).props;
  expect(isValidElement(fallback)).toBe(true);
  return fallback as ReactElement;
}

test('both strategy pages show the skeleton, not a blank page, while the filters load (Task 24 M5)', async () => {
  expect(fallbackOf(StrategiesPage()).type).toBe(StrategySkeleton);
  const one = await StrategyPage({ params: Promise.resolve({ id: 'str-1' }) });
  expect(fallbackOf(one).type).toBe(StrategySkeleton);
});

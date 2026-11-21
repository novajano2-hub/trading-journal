// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { NumberTicker, tickerFrame } from './number-ticker';

// The count is driven by hand: `animate` hands its frame callbacks to the test.
const run = vi.hoisted(() => ({
  onUpdate: (() => {}) as (v: number) => void,
  onComplete: () => {},
}));
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useInView: () => true,
  useReducedMotion: () => false,
  animate: (
    _from: number,
    _to: number,
    opts: { onUpdate(v: number): void; onComplete(): void },
  ) => {
    run.onUpdate = opts.onUpdate;
    run.onComplete = opts.onComplete;
    return { stop() {} };
  },
}));

afterEach(cleanup);

/** The counting copy at each frame of a run to `value`, then once it completes. */
function countTo(value: number, frames: number[]): string[] {
  const { container } = render(<NumberTicker value={value} kind="adherence" />);
  const counter = () => container.querySelector('.ticker-count')!.textContent!;
  const seen = [counter()];
  for (const v of frames) {
    act(() => run.onUpdate(v));
    seen.push(counter());
  }
  act(() => run.onComplete());
  seen.push(counter());
  return seen;
}

test('an adherence count keeps whole percentages all the way to 87%', () => {
  const seen = countTo(0.874, [0.1, 0.42, 0.75, 0.86, 0.8695, 0.873]);
  for (const s of seen) expect(s).toMatch(/^\d+%$/);
  expect(seen.at(-1)).toBe('87%');
});

test('a count to 99.5% keeps one decimal throughout and never passes through 100%', () => {
  const seen = countTo(0.995, [0.2, 0.5, 0.9, 0.98, 0.99, 0.9949, 0.995]);
  for (const s of seen) expect(s).toMatch(/^\d+\.\d%$/);
  expect(seen).not.toContain('100.0%');
  expect(seen.at(-1)).toBe('99.5%');
});

test('frames toward 99.96% stop at 99.9%, and toward 0.04% start at 0.1%', () => {
  const near1 = tickerFrame('adherence', 0.9996);
  expect([0.99, 0.9994, 0.9996].map(near1)).toEqual([
    '99.0%',
    '99.9%',
    '99.9%',
  ]);
  const near0 = tickerFrame('adherence', 0.0004);
  expect([0, 0.0002, 0.0004].map(near0)).toEqual(['0.1%', '0.1%', '0.1%']);
});

test('other kinds format each frame as their final value does', () => {
  expect(tickerFrame('pct', 0.5, { digits: 0 })(0.1234)).toBe('12%');
  expect(tickerFrame('money', 1250)(600)).toBe('+$6.00');
});

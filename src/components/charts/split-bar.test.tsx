// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { SplitBar } from './split-bar';

afterEach(cleanup);

const bar = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-split-bar]')!;
const parts = (container: HTMLElement) =>
  [...bar(container).querySelectorAll<HTMLElement>('[data-tone]')].map((s) => [
    s.dataset.tone,
    s.style.flexGrow,
  ]);

test('a thin bar, hidden from assistive tech, with one segment per share in its tone', () => {
  const { container } = render(
    <SplitBar
      segments={[
        { tone: 'gain', value: 597 },
        { tone: 'neutral', value: 12 },
        { tone: 'loss', value: 629 },
      ]}
    />,
  );
  expect(bar(container).getAttribute('aria-hidden')).toBe('true');
  expect(bar(container).className).toContain('h-1.5');
  expect(parts(container)).toEqual([
    ['gain', '597'],
    ['neutral', '12'],
    ['loss', '629'],
  ]);
  const tones = [...bar(container).children].map((s) => s.className);
  expect(tones[0]).toContain('bg-gain-fill');
  expect(tones[1]).toContain('bg-line-2');
  expect(tones[2]).toContain('bg-loss-fill');
});

test('a share of nothing draws no segment, so a lone share fills the bar', () => {
  const { container } = render(
    <SplitBar
      segments={[
        { tone: 'gain', value: 74 },
        { tone: 'neutral', value: 0 },
        { tone: 'loss', value: 0 },
      ]}
    />,
  );
  expect(parts(container)).toEqual([['gain', '74']]);
});

test('no segments, or nothing in them, is the empty track', () => {
  for (const segments of [
    [],
    [
      { tone: 'gain' as const, value: 0 },
      { tone: 'loss' as const, value: 0 },
    ],
  ]) {
    const { container } = render(<SplitBar segments={segments} />);
    expect(bar(container).getAttribute('aria-hidden')).toBe('true');
    expect(parts(container)).toEqual([]);
    expect(bar(container).className).toContain('bg-sunken');
    cleanup();
  }
});

test('a share that is not a finite number, or is negative, is left out', () => {
  const { container } = render(
    <SplitBar
      segments={[
        { tone: 'gain', value: Number.NaN },
        { tone: 'neutral', value: -3 },
        { tone: 'loss', value: 5 },
      ]}
    />,
  );
  expect(parts(container)).toEqual([['loss', '5']]);
});

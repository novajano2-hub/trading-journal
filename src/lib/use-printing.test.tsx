// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { usePrintState } from './use-printing';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const fire = (name: 'beforeprint' | 'afterprint') =>
  act(() => {
    window.dispatchEvent(new Event(name));
  });

test('the page is printing between beforeprint and afterprint', () => {
  const { result } = renderHook(() => usePrintState());
  expect(result.current.printing).toBe(false);
  fire('beforeprint');
  expect(result.current.printing).toBe(true);
  fire('afterprint');
  expect(result.current.printing).toBe(false);
});

test('each print is stamped with its own time; leaving it alone keeps the last', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T10:00:00Z'));
  const { result } = renderHook(() => usePrintState());
  expect(result.current.madeAt).toBe(Date.parse('2026-11-25T10:00:00Z'));
  vi.setSystemTime(new Date('2026-11-25T12:30:00Z'));
  fire('beforeprint');
  expect(result.current.madeAt).toBe(Date.parse('2026-11-25T12:30:00Z'));
  vi.setSystemTime(new Date('2026-11-25T12:45:00Z'));
  fire('afterprint');
  expect(result.current.madeAt).toBe(Date.parse('2026-11-25T12:30:00Z'));
});

test('print media that is emulated (no print event fires) counts as printing', () => {
  let matches = false;
  let notify: () => void = () => {};
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, fn: () => void) => (notify = fn),
    removeEventListener: () => {},
  }));
  const { result } = renderHook(() => usePrintState());
  expect(result.current.printing).toBe(false);
  matches = true;
  act(() => notify());
  expect(result.current.printing).toBe(true);
  matches = false;
  act(() => notify());
  expect(result.current.printing).toBe(false);
});

test('a page that starts out in print media is printing from the first read', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const { result } = renderHook(() => usePrintState());
  expect(result.current.printing).toBe(true);
});

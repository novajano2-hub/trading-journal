// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { useWide } from './use-wide';

afterEach(cleanup);

/** The viewport the media query reads. */
const viewport = (width: number) => {
  window.innerWidth = width;
};

test('it matches Tailwind xl: 80rem, so 1279px is not wide and 1280px is', () => {
  viewport(1279);
  const narrow = renderHook(() => useWide());
  expect(narrow.result.current).toBe(false);
  narrow.unmount();
  viewport(1280);
  const wide = renderHook(() => useWide());
  expect(wide.result.current).toBe(true);
  act(() => viewport(1024));
});

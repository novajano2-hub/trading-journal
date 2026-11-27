// @vitest-environment happy-dom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderApp } from '../../__fixtures__/render-app';
import { LogShell } from './log-shell';

vi.mock('next/navigation', () => import('../../__fixtures__/navigation'));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const root = document.documentElement;

test('the switch row is a pinned row, and its height is on the page so what pins under it, and a focus, clear it (E52)', async () => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(52);
  const { unmount } = renderApp(
    <LogShell view="day" columnsMenu={null}>
      <p>The log</p>
    </LogShell>,
    { url: '/app/trades/day' },
  );
  const row = (
    await screen.findByRole('navigation', { name: 'Trade views' })
  ).closest('[data-pinned]') as HTMLElement | null;
  expect(row).not.toBeNull();
  expect(row!.className).toMatch(/(^|\s)sticky(\s|$)/);
  await waitFor(() =>
    expect(root.style.getPropertyValue('--log-switch')).toBe('52px'),
  );
  // Gone with the view: the next page pins nothing under the bar.
  unmount();
  expect(root.style.getPropertyValue('--log-switch')).toBe('');
});

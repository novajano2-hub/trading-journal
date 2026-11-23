// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { commitNavigation } from '../__fixtures__/navigation';
import { SettingsNav } from './settings-nav';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

afterEach(cleanup);

function at(path: string) {
  window.history.replaceState(null, '', path);
  commitNavigation();
  render(<SettingsNav />);
}

test('lists the five sections, in order, and marks the open one', () => {
  at('/app/settings/accounts');
  const nav = screen.getByRole('navigation', { name: 'Settings' });
  const links = [...nav.querySelectorAll('a')];
  expect(links.map((a) => a.textContent)).toEqual([
    'Profile',
    'Accounts',
    'Trading',
    'Tags',
    'Logs',
  ]);
  expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([
    null,
    'page',
    null,
    null,
    null,
  ]);
  expect(links.map((a) => a.getAttribute('href'))).toEqual([
    '/app/settings/profile',
    '/app/settings/accounts',
    '/app/settings/trading',
    '/app/settings/tags',
    '/app/settings/import-history',
  ]);
});

test('Logs is the import history', () => {
  at('/app/settings/import-history');
  expect(
    screen.getByRole('link', { name: 'Logs' }).getAttribute('aria-current'),
  ).toBe('page');
  expect(
    screen.getByRole('link', { name: 'Profile' }).getAttribute('aria-current'),
  ).toBeNull();
});

test('an edge fade shows while more sections are off-screen, and goes at the end', () => {
  at('/app/settings/accounts');
  const nav = screen.getByRole('navigation', { name: 'Settings' });
  const fade = () =>
    nav.parentElement!.querySelector('[data-edge-fade]') as HTMLElement | null;
  // Layout is not computed here: say the row is 300 wide with 500 of pills.
  for (const [k, v] of [
    ['clientWidth', 300],
    ['scrollWidth', 500],
  ] as const)
    Object.defineProperty(nav, k, { configurable: true, value: v });
  fireEvent.scroll(nav);
  expect(fade()?.getAttribute('data-visible')).toBe('true');
  nav.scrollLeft = 200;
  fireEvent.scroll(nav);
  expect(fade()?.getAttribute('data-visible')).toBe('false');
});

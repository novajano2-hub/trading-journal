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

test('lists the six sections, in order, with Notebook after Tags, and marks the open one', () => {
  at('/app/settings/accounts');
  const nav = screen.getByRole('navigation', { name: 'Settings' });
  const links = [...nav.querySelectorAll('a')];
  expect(links.map((a) => a.textContent)).toEqual([
    'Profile',
    'Accounts',
    'Trading',
    'Tags',
    'Notebook',
    'Logs',
  ]);
  expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([
    null,
    'page',
    null,
    null,
    null,
    null,
  ]);
  expect(links.map((a) => a.getAttribute('href'))).toEqual([
    '/app/settings/profile',
    '/app/settings/accounts',
    '/app/settings/trading',
    '/app/settings/tags',
    '/app/settings/notebook',
    '/app/settings/import-history',
  ]);
});

test('Notebook is the note settings', () => {
  at('/app/settings/notebook');
  expect(
    screen.getByRole('link', { name: 'Notebook' }).getAttribute('aria-current'),
  ).toBe('page');
  expect(
    screen.getByRole('link', { name: 'Tags' }).getAttribute('aria-current'),
  ).toBeNull();
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

test('on a phone the open section is brought to the middle of the pill row', () => {
  // happy-dom has no layout: the row is 300 wide, and the open pill sits 400 along it, 80 wide.
  const rect = (left: number) => ({ left }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      return rect(this.getAttribute('aria-current') === 'page' ? 400 : 0);
    },
  );
  const size = (tag: string, name: 'clientWidth' | 'offsetWidth', px: number) =>
    vi.spyOn(HTMLElement.prototype, name, 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.tagName === tag ? px : name === 'offsetWidth' ? 80 : 0;
    });
  size('NAV', 'clientWidth', 300);
  size('NAV', 'offsetWidth', 300);
  at('/app/settings/notebook');
  const nav = screen.getByRole('navigation', { name: 'Settings' });
  expect(nav.scrollLeft).toBe(400 - (300 - 80) / 2);
  vi.restoreAllMocks();
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

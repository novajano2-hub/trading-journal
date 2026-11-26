// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { commitNavigation } from '../__fixtures__/navigation';
import { SETTINGS_NAV, SettingsNav } from './settings-nav';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

// ---- The Settings menu in groups, and collapsed (#50, C48) ------------------

/** The viewport the menu's `matchMedia` reads: `lg` (1024px) or wider, or below it. */
function viewport(width: number): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: /min-width:\s*(\d+)px/.test(query)
          ? width >= Number(/min-width:\s*(\d+)px/.exec(query)![1])
          : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

/** What the menu is made of, in order: a page's name, or the divider between groups. */
function items(nav: HTMLElement): string[] {
  return [...nav.querySelectorAll('li')].map((li) =>
    li.getAttribute('aria-hidden') === 'true'
      ? '|'
      : (li.textContent ?? '').trim(),
  );
}

function renderNav(collapsed: boolean, path = '/app/settings/accounts') {
  window.history.replaceState(null, '', path);
  commitNavigation();
  render(<SettingsNav collapsed={collapsed} />);
  return screen.getByRole('navigation', { name: 'Settings' });
}

test('the sections sit in groups with a divider between: Profile, then Accounts, Trading, Tags and Logs', () => {
  const nav = renderNav(false);
  expect(items(nav)).toEqual([
    'Profile',
    '|',
    'Accounts',
    'Trading',
    'Tags',
    'Logs',
  ]);
  // A divider is no stop for the keyboard or a screen reader.
  const divider = nav.querySelector('li[aria-hidden="true"]')!;
  expect(divider.querySelector('a, button')).toBeNull();
  expect(divider.textContent).toBe('');
});

test('the groups are data, so a page can be inserted into one', () => {
  expect(SETTINGS_NAV.map((group) => group.map((page) => page.label))).toEqual([
    ['Profile'],
    ['Accounts', 'Trading', 'Tags', 'Logs'],
  ]);
  // Every page has its icon and its address under /app/settings.
  for (const page of SETTINGS_NAV.flat()) {
    expect(page.icon).toBeTruthy();
    expect(page.href.startsWith('/app/settings/')).toBe(true);
  }
});

test('expanded, a page shows its name beside its glyph and has no tooltip', async () => {
  const nav = renderNav(false);
  const link = within(nav).getByRole('link', { name: 'Trading' });
  expect(link.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  const name = [...link.querySelectorAll('span')].find(
    (s) => s.textContent === 'Trading',
  )!;
  expect(name.className).not.toContain('sr-only');
  act(() => link.focus());
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

test('collapsed from lg, every page is an icon with its name for assistive tech, and the dividers stay', () => {
  viewport(1280);
  const nav = renderNav(true);
  expect(items(nav)).toEqual([
    'Profile',
    '|',
    'Accounts',
    'Trading',
    'Tags',
    'Logs',
  ]);
  for (const [label, href] of [
    ['Profile', '/app/settings/profile'],
    ['Accounts', '/app/settings/accounts'],
    ['Trading', '/app/settings/trading'],
    ['Tags', '/app/settings/tags'],
    ['Logs', '/app/settings/import-history'],
  ] as const) {
    const link = within(nav).getByRole('link', { name: label });
    expect(link.getAttribute('href')).toBe(href);
    expect(link.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    const name = [...link.querySelectorAll('span')].find(
      (s) => s.textContent === label,
    )!;
    expect(name.className).toContain('lg:sr-only');
  }
  expect(
    within(nav)
      .getByRole('link', { name: 'Accounts' })
      .getAttribute('aria-current'),
  ).toBe('page');
});

test('collapsed, hovering or tabbing to an icon names the page in a tooltip', async () => {
  viewport(1280);
  const nav = renderNav(true);
  for (const name of ['Accounts', 'Logs']) {
    const link = within(nav).getByRole('link', { name });
    act(() => link.focus());
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toBe(name);
    // The tip repeats the link's name: it must not also be its description.
    expect(link.hasAttribute('aria-describedby')).toBe(false);
    act(() => link.blur());
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  }
});

test('below lg a collapsed sidebar leaves the labelled pill row as it is: names showing, no tooltip', async () => {
  viewport(800);
  const nav = renderNav(true);
  expect(items(nav)).toEqual([
    'Profile',
    '|',
    'Accounts',
    'Trading',
    'Tags',
    'Logs',
  ]);
  const link = within(nav).getByRole('link', { name: 'Accounts' });
  const name = [...link.querySelectorAll('span')].find(
    (s) => s.textContent === 'Accounts',
  )!;
  // The name is a word in the pill, whatever the choice: only from lg does it fold into the icon.
  expect(name.className).toContain('lg:sr-only');
  expect(name.className).not.toMatch(/(^|\s)sr-only/);
  act(() => link.focus());
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

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

test('the sections sit in groups with a divider between: Profile, then Accounts, Trading, Tags, Notebook and Logs', () => {
  const nav = renderNav(false);
  expect(items(nav)).toEqual([
    'Profile',
    '|',
    'Accounts',
    'Trading',
    'Tags',
    'Notebook',
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
    ['Accounts', 'Trading', 'Tags', 'Notebook', 'Logs'],
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
    'Notebook',
    'Logs',
  ]);
  for (const [label, href] of [
    ['Profile', '/app/settings/profile'],
    ['Accounts', '/app/settings/accounts'],
    ['Trading', '/app/settings/trading'],
    ['Tags', '/app/settings/tags'],
    ['Notebook', '/app/settings/notebook'],
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
    'Notebook',
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

/** A viewport that can be resized: `matchMedia` tells its listeners when a query's answer changes. */
function resizableViewport(width: number): (next: number) => void {
  let current = width;
  const watching = new Set<{ query: string; notify: () => void }>();
  const answer = (query: string) =>
    /min-width:\s*(\d+)px/.test(query)
      ? current >= Number(/min-width:\s*(\d+)px/.exec(query)![1])
      : false;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const mine = new Set<{ query: string; notify: () => void }>();
    return {
      get matches() {
        return answer(query);
      },
      media: query,
      addEventListener: (_: string, notify: () => void) => {
        const watcher = { query, notify };
        mine.add(watcher);
        watching.add(watcher);
      },
      removeEventListener: (_: string, notify: () => void) => {
        for (const w of mine) if (w.notify === notify) watching.delete(w);
      },
    } as unknown as MediaQueryList;
  });
  return (next) => {
    const before = new Map(
      [...watching].map((w) => [w, answer(w.query)] as const),
    );
    current = next;
    for (const [w, was] of before) if (answer(w.query) !== was) w.notify();
  };
}

test('crossing lg while a page link has focus keeps the link, so its focus is not lost', async () => {
  const resize = resizableViewport(1280);
  const nav = renderNav(true);
  const link = within(nav).getByRole('link', { name: 'Trading' });
  act(() => link.focus());
  expect(document.activeElement).toBe(link);
  // Below lg the tooltip wrapper used to go, and the link with it.
  act(() => resize(800));
  expect(within(nav).getByRole('link', { name: 'Trading' })).toBe(link);
  expect(link.isConnected).toBe(true);
  expect(document.activeElement).toBe(link);
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.queryByRole('tooltip')).toBeNull();
  // And back: the tip is there again where the name is folded into the icon.
  act(() => resize(1280));
  expect(within(nav).getByRole('link', { name: 'Trading' })).toBe(link);
  expect(document.activeElement).toBe(link);
  act(() => link.blur());
  act(() => link.focus());
  expect((await screen.findByRole('tooltip')).textContent).toBe('Trading');
});

test('a tip that was open when the row went below lg is gone, and does not come back with the width', async () => {
  const resize = resizableViewport(1280);
  const nav = renderNav(true);
  const link = within(nav).getByRole('link', { name: 'Tags' });
  act(() => link.focus());
  expect((await screen.findByRole('tooltip')).textContent).toBe('Tags');
  act(() => resize(800));
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  act(() => link.blur());
  act(() => resize(1280));
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { UserPrefs } from '@/domain/types';
import { commitNavigation } from './__fixtures__/navigation';
import { renderApp } from './__fixtures__/render-app';
import { ModulePlaceholder } from './module-placeholder';
import { APP_NAV } from './nav';
import { Sidebar, SidebarNav } from './sidebar';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

afterEach(cleanup);

/** On a page whose URL carries filters and a param of its own. */
function at(url: string): void {
  window.history.replaceState(null, '', url);
  commitNavigation();
}

test('the active module is marked and filter-scoped links keep the filters', () => {
  render(
    <SidebarNav
      pathname="/app/dashboard"
      params={new URLSearchParams('side=short')}
    />,
  );
  const dashboard = screen.getByRole('link', { name: 'Dashboard' });
  expect(dashboard.getAttribute('aria-current')).toBe('page');
  expect(dashboard.getAttribute('href')).toBe('/app/dashboard?side=short');
  expect(
    screen.getByRole('link', { name: 'Trades' }).hasAttribute('aria-current'),
  ).toBe(false);
});

test('the current, other and not-live modules each have their own look', () => {
  render(
    <SidebarNav pathname="/app/dashboard" params={new URLSearchParams()} />,
  );
  const link = (name: string) => screen.getByRole('link', { name });
  const glyph = (name: string) =>
    link(name).querySelector<SVGElement>('svg[aria-hidden="true"]')!;
  // A white pill with an accent glyph; bare; faded. One weight for all: regular, no duotone layer.
  expect(link('Dashboard').className).toContain('bg-surface-1');
  expect(glyph('Dashboard').getAttribute('data-look')).toBe('current');
  expect(glyph('Dashboard').getAttribute('class')).toContain('text-accent-ink');
  expect(glyph('Dashboard').querySelector('[opacity]')).toBeNull();
  expect(link('Trades').className).not.toMatch(/(^|\s)bg-/);
  expect(glyph('Trades').getAttribute('data-look')).toBe('module');
  expect(glyph('Trades').querySelector('[opacity]')).toBeNull();
  expect(link('Replay').className).not.toMatch(/(^|\s)bg-/);
  expect(glyph('Replay').getAttribute('data-look')).toBe('not-live');
  expect(glyph('Replay').getAttribute('class')).toContain('opacity-70');
});

test('"Not live yet" is its own labelled list of four links', () => {
  render(
    <SidebarNav pathname="/app/dashboard" params={new URLSearchParams()} />,
  );
  const notLive = screen.getByRole('list', { name: 'Not live yet' });
  expect(within(notLive).getAllByRole('link')).toHaveLength(4);
});

test('a placeholder says the module is not built, with no figures', () => {
  const { container } = render(<ModulePlaceholder module="trades" />);
  const text = container.textContent ?? '';
  expect(text).toContain("Trades isn't built yet.");
  expect(text).not.toContain('$');
  expect(text).not.toMatch(/\d/);
});

test('the wordmark goes to the Dashboard with the filters', () => {
  renderApp(<Sidebar />, { url: '/app/trades?side=short&by=pnl' });
  expect(screen.getByRole('link', { name: 'Keel' }).getAttribute('href')).toBe(
    '/app/dashboard?side=short',
  );
});

test("a placeholder's way back keeps the filters", () => {
  at('/app/calendar?range=last-week&symbol=ES');
  render(<ModulePlaceholder module="calendar" />);
  expect(
    screen
      .getByRole('link', { name: 'Back to the Dashboard' })
      .getAttribute('href'),
  ).toBe('/app/dashboard?range=last-week&symbol=ES');
});

test('Progress tracker sits right after Reports in the sidebar', () => {
  render(
    <SidebarNav pathname="/app/progress" params={new URLSearchParams()} />,
  );
  const names = screen.getAllByRole('link').map((a) => a.textContent);
  expect(names.indexOf('Progress tracker')).toBe(names.indexOf('Reports') + 1);
  expect(
    screen
      .getByRole('link', { name: 'Progress tracker' })
      .getAttribute('aria-current'),
  ).toBe('page');
});

// ---- The collapsible sidebar (#50, C47, C49) -------------------------------

/** A repository whose saved sidebar choice is already `sidebar`. */
async function repoWith(sidebar?: UserPrefs['sidebar']) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  if (sidebar) await repository.prefs.update({ sidebar });
  return repository;
}

const SWITCHER = <button type="button">Workspace</button>;
const collapse = () =>
  screen.findByRole('button', { name: 'Collapse the sidebar' });
const expand = () =>
  screen.findByRole('button', { name: 'Expand the sidebar' });

test('the expanded sidebar has a collapse button in its head', async () => {
  renderApp(<Sidebar switcher={SWITCHER} />, { url: '/app/trades' });
  const button = await collapse();
  expect(button.getAttribute('aria-expanded')).toBe('true');
  // The wordmark and the button share the head, the wordmark first.
  expect(
    screen.getByRole('link', { name: 'Keel' }).compareDocumentPosition(button) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByText('Not live yet')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Add trade' })).toBeNull();
});

test('collapsing writes the pref and shows the rail; expanding writes it back', async () => {
  const { repo } = renderApp(<Sidebar railSwitcher={SWITCHER} />, {
    url: '/app/trades',
  });
  fireEvent.click(await collapse());
  const button = await expand();
  expect(button.getAttribute('aria-expanded')).toBe('false');
  // The rail at once: no group heading, the add-trade "+" and the modules as icons.
  expect(screen.queryByText('Not live yet')).toBeNull();
  await waitFor(async () =>
    expect((await repo.prefs.get()).sidebar).toBe('collapsed'),
  );
  fireEvent.click(button);
  await collapse();
  expect(screen.getByText('Not live yet')).toBeTruthy();
  await waitFor(async () =>
    expect((await repo.prefs.get()).sidebar).toBe('expanded'),
  );
});

test('the rail has the add-trade "+" first, every module as an icon with its name, and the quiet group after a rule', async () => {
  renderApp(<Sidebar railSwitcher={SWITCHER} />, {
    url: '/app/trades',
    repository: await repoWith('collapsed'),
  });
  await expand();
  const add = screen.getByRole('link', { name: 'Add trade' });
  expect(add.getAttribute('href')).toBe('/app/trades/new');
  // Reading order: wordmark, the toggle, add trade, the workspace, then the modules.
  const order = screen
    .getAllByRole('link')
    .map((a) => a.getAttribute('aria-label'))
    .slice(0, 3);
  expect(order).toEqual(['Keel', 'Add trade', 'Home']);
  const tools = screen.getAllByRole('button').map((b) => b.textContent);
  expect(tools).toEqual(['', 'Workspace']);
  // Each module is a glyph named by its label; nothing else is spoken twice.
  for (const item of APP_NAV) {
    const link = screen.getByRole('link', { name: item.label });
    expect(link.textContent).toBe('');
    expect(link.getAttribute('href')).toContain(item.href);
  }
  expect(
    screen.getByRole('link', { name: 'Trades' }).getAttribute('aria-current'),
  ).toBe('page');
  // "Not live yet": a rule before the group, its four glyphs faint.
  const group = screen.getByRole('list', { name: 'Not live yet' });
  expect(group.previousElementSibling?.getAttribute('aria-hidden')).toBe(
    'true',
  );
  expect(within(group).getAllByRole('link')).toHaveLength(4);
  const glyph = within(group)
    .getByRole('link', { name: 'Replay' })
    .querySelector('svg')!;
  expect(glyph.getAttribute('data-look')).toBe('not-live');
  expect(glyph.getAttribute('class')).toContain('opacity-70');
  // Settings sits at the foot.
  expect(screen.getAllByRole('link').at(-1)?.getAttribute('aria-label')).toBe(
    'Settings',
  );
});

test('hovering or tabbing to a rail icon names it in a tooltip', async () => {
  renderApp(<Sidebar railSwitcher={SWITCHER} />, {
    url: '/app/trades',
    repository: await repoWith('collapsed'),
  });
  await expand();
  for (const name of ['Reports', 'Add trade', 'Expand the sidebar']) {
    const target =
      name === 'Expand the sidebar'
        ? screen.getByRole('button', { name })
        : screen.getByRole('link', { name });
    act(() => target.focus());
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toBe(name);
    act(() => target.blur());
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  }
});

// A pinned row is one the page's scroll padding must not apply to while focus
// is in it (globals.css, E52): the sidebar and the rail are `sticky top-0` in
// the page's own scroller, so their head controls sit inside the padded band
// and a focus there would send the page scrolling for good.
test.each([
  ['the expanded sidebar', 'expanded', '/app/trades'],
  ['the collapsed rail', 'collapsed', '/app/trades'],
  ['the day page rail', 'expanded', '/app/day/2026-11-20/plan'],
] as const)('%s is a pinned row', async (_name, choice, url) => {
  renderApp(<Sidebar switcher={SWITCHER} railSwitcher={SWITCHER} />, {
    url,
    repository: await repoWith(choice),
  });
  if (choice === 'collapsed') await expand();
  const sidebars = screen.getAllByRole('complementary', { name: 'Sidebar' });
  expect(sidebars).toHaveLength(1);
  expect(sidebars[0]?.hasAttribute('data-pinned')).toBe(true);
});

test('the choice shows once the prefs load: expanded until then, collapsed after', async () => {
  renderApp(<Sidebar railSwitcher={SWITCHER} switcher={SWITCHER} />, {
    url: '/app/trades',
    repository: await repoWith('collapsed'),
  });
  // The first paint cannot know the choice.
  expect(screen.getByText('Not live yet')).toBeTruthy();
  await expand();
  expect(screen.queryByText('Not live yet')).toBeNull();
});

test('focus follows the toggle to its new place, so the keyboard keeps its spot', async () => {
  renderApp(<Sidebar railSwitcher={SWITCHER} />, { url: '/app/trades' });
  const button = await collapse();
  act(() => button.focus());
  fireEvent.click(button);
  const next = await expand();
  await waitFor(() => expect(document.activeElement).toBe(next));
  fireEvent.click(next);
  const back = await collapse();
  await waitFor(() => expect(document.activeElement).toBe(back));
});

test('a refused write puts the sidebar back as it was saved', async () => {
  const repository = await repoWith('expanded');
  let refuse: (error: Error) => void = () => {};
  vi.spyOn(repository.prefs, 'update').mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        refuse = reject;
      }),
  );
  renderApp(<Sidebar railSwitcher={SWITCHER} />, {
    url: '/app/trades',
    repository,
  });
  fireEvent.click(await collapse());
  // The click shows at once, while the write is still out; the refusal takes it back.
  await expand();
  await act(async () => refuse(new Error('refused')));
  await collapse();
  expect((await repository.prefs.get()).sidebar).toBe('expanded');
});

test('a pointer click leaves focus where it falls, with no tooltip pinned beside the rail', async () => {
  renderApp(<Sidebar railSwitcher={SWITCHER} />, { url: '/app/trades' });
  fireEvent.click(await collapse(), { detail: 1 });
  const next = await expand();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  expect(document.activeElement).not.toBe(next);
  expect(screen.queryByRole('tooltip')).toBeNull();
});

test.each([undefined, 'expanded', 'collapsed'] as const)(
  'a day page keeps the slim rail and shows no toggle (choice: %s)',
  async (choice) => {
    renderApp(<Sidebar railSwitcher={SWITCHER} switcher={SWITCHER} />, {
      url: '/app/day/2026-11-20/plan',
      repository: await repoWith(choice),
    });
    expect(
      (await screen.findByRole('link', { name: 'Add trade' })).getAttribute(
        'href',
      ),
    ).toBe('/app/trades/new');
    // Let the prefs land; the page is the same either way.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.queryByRole('button', { name: /the sidebar$/ })).toBeNull();
    expect(screen.queryByText('Not live yet')).toBeNull();
  },
);

test('the column is for desktop: the rail, its toggle and the full sidebar all start at lg', async () => {
  const { container, unmount } = renderApp(<Sidebar switcher={SWITCHER} />, {
    url: '/app/trades',
  });
  await collapse();
  expect(container.firstElementChild?.className).toMatch(
    /(^|\s)hidden(\s|$).*(^|\s)lg:flex(\s|$)/,
  );
  unmount();
  const rail = renderApp(<Sidebar railSwitcher={SWITCHER} />, {
    url: '/app/trades',
    repository: await repoWith('collapsed'),
  });
  await expand();
  expect(rail.container.firstElementChild?.className).toMatch(
    /(^|\s)hidden(\s|$).*(^|\s)lg:flex(\s|$)/,
  );
});

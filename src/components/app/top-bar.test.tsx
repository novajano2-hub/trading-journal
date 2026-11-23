// @vitest-environment happy-dom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { commitNavigation } from './__fixtures__/navigation';
import { renderApp } from './__fixtures__/render-app';
import { TopBar } from './top-bar';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Lays the bar out by hand (happy-dom has no layout): the title's words start
 * at 240px and run `titleWidth`, the controls start at 900px, and the chips
 * are `chipsWidth` wide.
 */
function layOut({
  titleWidth,
  chipsWidth,
}: {
  titleWidth: number;
  chipsWidth: number;
}): void {
  const rect = (left: number, width: number) =>
    ({
      left,
      width,
      right: left + width,
      top: 0,
      bottom: 0,
      height: 0,
    }) as DOMRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.parentElement?.tagName === 'H1') return rect(240, titleWidth);
      if (this.querySelector('[data-testid="search"]')?.parentElement === this)
        return rect(900, 36);
      if (this.querySelector('[data-testid="chips"]')?.parentElement === this)
        return rect(0, chipsWidth);
      return rect(0, 0);
    },
  );
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.parentElement?.tagName === 'H1' ? titleWidth : 0;
    },
  );
}

function renderBar(path = '/app/dashboard'): HTMLElement {
  window.history.replaceState(null, '', path);
  commitNavigation();
  render(
    <TopBar
      filters={<div data-testid="chips" />}
      search={<button data-testid="search">Search</button>}
    />,
  );
  return screen.getByRole('banner');
}

test('the chips show only on the routes the filters drive', () => {
  layOut({ titleWidth: 115, chipsWidth: 100 });
  for (const path of ['/app/import', '/app/settings/import-history']) {
    const bar = renderBar(path);
    expect(screen.queryByTestId('chips'), path).toBeNull();
    expect(bar.dataset.chips, path).toBeUndefined();
    cleanup();
  }
  renderBar('/app/trades');
  expect(screen.getByTestId('chips')).toBeTruthy();
});

test('Compare shows no chips, and says the groups own their filters', () => {
  layOut({ titleWidth: 115, chipsWidth: 100 });
  const bar = renderBar('/app/reports/compare');
  expect(screen.queryByTestId('chips')).toBeNull();
  expect(bar.dataset.chips).toBeUndefined();
  // From sm it joins the bar's row; on a phone it follows the toolbar row, never between the title and the toolbar.
  const [wide, phone] = within(bar).getAllByText(
    'Each group has its own filters',
  );
  expect(wide!.className).toContain('max-sm:hidden');
  expect(phone!.className).toContain('sm:hidden');
  expect(
    phone!.previousElementSibling!.contains(screen.getByLabelText('Import')),
  ).toBe(true);
  cleanup();
  renderBar('/app/reports/symbols');
  expect(screen.queryAllByText('Each group has its own filters')).toHaveLength(
    0,
  );
});

// Room beside the title: 900 - 240 - 115 - 12 (title margin) - 2 * 8 (gaps) = 517.
test('chips that fit beside the title sit there', () => {
  layOut({ titleWidth: 115, chipsWidth: 516 });
  expect(renderBar().dataset.chips).toBe('inline');
});

test('chips that need more than the room take their own row', () => {
  layOut({ titleWidth: 115, chipsWidth: 517 });
  expect(renderBar().dataset.chips).toBe('wrapped');
});

test('below sm the chips always have their own row, under the pinned first row', () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  );
  layOut({ titleWidth: 115, chipsWidth: 100 });
  const bar = renderBar();
  expect(bar.dataset.chips).toBe('unknown');
  expect(
    screen.getByRole('heading', { level: 1 }).parentElement!.className,
  ).toContain('max-sm:fixed');
});

test('the source reads as the bar does: menu, title, chips, search, label, Display menu, Import, theme; none reordered by CSS', () => {
  layOut({ titleWidth: 115, chipsWidth: 100 });
  render(
    <TopBar
      menu={<button data-testid="menu">Menu</button>}
      filters={<div data-testid="chips" />}
      search={<button data-testid="search">Search</button>}
      label={<span data-testid="label" />}
      basis={<div data-testid="basis" />}
    />,
  );
  const bar = screen.getByRole('banner');
  const order = [
    ...bar.querySelectorAll('[data-testid], h1, a, button:not([data-testid])'),
  ].map((el) =>
    el instanceof HTMLElement && el.dataset.testid
      ? el.dataset.testid
      : el.tagName === 'H1'
        ? 'title'
        : (el.getAttribute('aria-label') ?? el.textContent),
  );
  expect(order).toEqual([
    'menu',
    'title',
    'chips',
    'search',
    'label',
    'basis',
    'Import',
    'Switch to dark theme',
  ]);
  expect(bar.innerHTML).not.toMatch(/\border-/);
});

test('below sm the pinned row holds only the menu and the title', () => {
  render(
    <TopBar
      menu={<button data-testid="menu">Menu</button>}
      filters={<div data-testid="chips" />}
      search={<button data-testid="search">Search</button>}
    />,
  );
  const pinned = screen.getByRole('heading', { level: 1 }).parentElement!;
  expect(pinned.className).toContain('max-sm:fixed');
  expect(pinned.children).toHaveLength(2);
  expect(pinned.firstElementChild).toBe(screen.getByTestId('menu'));
});

test('a trade page titles the bar "Trades" then the trade number, and shows no filter chips', async () => {
  const id = fixtureSample().trades[0]!;
  renderApp(
    <TopBar
      filters={<div data-testid="chips" />}
      search={<button data-testid="search">Search</button>}
    />,
    { url: `/app/trades/${encodeURIComponent(id.id)}?symbol=ES` },
  );
  const title = screen.getByRole('heading', { level: 1 });
  const back = within(title).getByRole('link', { name: 'Trades' });
  expect(back.getAttribute('href')).toBe('/app/trades?symbol=ES');
  await waitFor(() => expect(title.textContent).toContain(String(id.serial)));
  expect(screen.queryByTestId('chips')).toBeNull();
  expect(screen.getByRole('banner').dataset.chips).toBeUndefined();
});

test('the trade log keeps its plain title and its chips', () => {
  renderApp(
    <TopBar
      filters={<div data-testid="chips" />}
      search={<button data-testid="search">Search</button>}
    />,
    { url: '/app/trades' },
  );
  const title = screen.getByRole('heading', { level: 1 });
  expect(title.textContent).toBe('Trades');
  expect(within(title).queryByRole('link')).toBeNull();
  expect(screen.getByTestId('chips')).toBeTruthy();
});

test('a strategy page titles the bar "Strategies" then the strategy name, with no chips', async () => {
  renderApp(
    <TopBar
      filters={<div data-testid="chips" />}
      search={<button data-testid="search">Search</button>}
    />,
    { url: '/app/strategies/str-1' },
  );
  const title = screen.getByRole('heading', { level: 1 });
  const back = within(title).getByRole('link', { name: 'Strategies' });
  expect(back.getAttribute('href')).toBe('/app/strategies');
  await waitFor(() =>
    expect(title.textContent).toContain('Opening range breakout'),
  );
  expect(screen.queryByTestId('chips')).toBeNull();
});

test('the strategy editor reads "Strategies > name > Edit", the name linking back to the strategy', async () => {
  renderApp(<TopBar />, { url: '/app/strategies/str-1/edit' });
  const title = screen.getByRole('heading', { level: 1 });
  const name = await within(title).findByRole('link', {
    name: 'Opening range breakout',
  });
  expect(name.getAttribute('href')).toBe('/app/strategies/str-1');
  expect(within(title).getByRole('link', { name: 'Strategies' })).toBeTruthy();
  expect(title.textContent).toContain('Edit');
});

test('the strategy list and the new-strategy form keep their plain titles', () => {
  renderApp(<TopBar />, { url: '/app/strategies/new' });
  const title = screen.getByRole('heading', { level: 1 });
  expect(title.textContent).toBe('Strategies');
  expect(within(title).queryByRole('link')).toBeNull();
});

// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { renderApp } from './__fixtures__/render-app';
import { TopBar } from './top-bar';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
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
  renderApp(
    <TopBar
      filters={<div data-testid="chips" />}
      search={<button data-testid="search">Search</button>}
    />,
    { url: path },
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

test('the chips show on the prop Dashboard and Accounts, and not on Transactions or a challenge (C37)', () => {
  layOut({ titleWidth: 115, chipsWidth: 100 });
  for (const path of ['/app/prop-firms', '/app/prop-firms/accounts']) {
    renderBar(path);
    expect(screen.getByTestId('chips'), path).toBeTruthy();
    cleanup();
  }
  for (const path of [
    '/app/prop-firms/transactions',
    '/app/prop-firms/accounts/c-1',
  ]) {
    const bar = renderBar(path);
    expect(screen.queryByTestId('chips'), path).toBeNull();
    expect(bar.dataset.chips, path).toBeUndefined();
    cleanup();
  }
});

test('the prop pages carry no Display menu (C72); the trade log keeps it', () => {
  layOut({ titleWidth: 115, chipsWidth: 100 });
  const render = (path: string) =>
    renderApp(
      <TopBar
        search={<button data-testid="search">Search</button>}
        basis={<button>Display</button>}
      />,
      { url: path },
    );
  for (const path of [
    '/app/prop-firms',
    '/app/prop-firms/accounts',
    '/app/prop-firms/transactions',
  ]) {
    render(path);
    expect(screen.queryByRole('button', { name: 'Display' }), path).toBeNull();
    cleanup();
  }
  render('/app/trades');
  expect(screen.getByRole('button', { name: 'Display' })).toBeTruthy();
});

test('Compare shows no chips, and says the groups own their filters', () => {
  layOut({ titleWidth: 115, chipsWidth: 100 });
  const bar = renderBar('/app/reports/compare');
  expect(screen.queryByTestId('chips')).toBeNull();
  expect(bar.dataset.chips).toBeUndefined();
  // From sm it joins the bar's row; on a phone, where the bar is one row, it sits under the bar.
  const [wide, phone] = screen.getAllByText('Each group has its own filters');
  expect(bar.contains(wide!)).toBe(true);
  expect(wide!.className).toContain('max-sm:hidden');
  expect(bar.contains(phone!)).toBe(false);
  expect(phone!.className).toContain('sm:hidden');
  expect(phone!.previousElementSibling).toBe(bar);
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

test('below sm the bar is one 56px row pinned to the top, unmeasured', () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  );
  layOut({ titleWidth: 115, chipsWidth: 100 });
  const bar = renderBar();
  expect(bar.dataset.chips).toBe('unknown');
  expect(bar.className).toMatch(/(^|\s)sticky(\s|$)/);
  expect(bar.className).toContain('max-sm:h-14');
  // Nothing in it is fixed apart: the chips, search and controls share the title's row.
  expect(bar.innerHTML).not.toContain('max-sm:fixed');
  expect(bar.innerHTML).not.toContain('max-sm:pt-');
});

test('the source reads as the bar does: menu, title, badge, chips, search, label, Display menu, Import; none reordered by CSS', () => {
  layOut({ titleWidth: 115, chipsWidth: 100 });
  renderApp(
    <TopBar
      menu={<button data-testid="menu">Menu</button>}
      filters={<div data-testid="chips" />}
      search={<button data-testid="search">Search</button>}
      label={<span data-testid="label" />}
      badge={<span data-testid="badge" />}
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
    'badge',
    'chips',
    'search',
    'label',
    'basis',
    'Plan the day',
    'Dashboard template',
    'Import',
  ]);
  // No theme toggle at any width: Appearance lives in Settings and the menus.
  expect(within(bar).queryByRole('button', { name: /theme/i })).toBeNull();
  expect(bar.innerHTML).not.toMatch(/\border-/);
});

test('below sm the title keeps the menu slot and the sample badge beside it, and Import leaves the bar', () => {
  renderApp(
    <TopBar
      menu={<button data-testid="menu">Menu</button>}
      filters={<div data-testid="chips" />}
      search={<button data-testid="search">Search</button>}
      badge={<span data-testid="badge" />}
    />,
  );
  const group = screen.getByRole('heading', { level: 1 }).parentElement!;
  expect([...group.children].map((el) => el.tagName)).toEqual([
    'BUTTON',
    'H1',
    'SPAN',
  ]);
  expect(group.firstElementChild).toBe(screen.getByTestId('menu'));
  expect(group.lastElementChild).toBe(screen.getByTestId('badge'));
  // A phone reaches Import from More.
  expect(screen.getByRole('link', { name: 'Import' }).className).toContain(
    'max-sm:hidden',
  );
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

test('the Trades crumb returns to the log view last used in this tab', () => {
  window.sessionStorage.setItem('keel.tradeLogView', 'day');
  const id = fixtureSample().trades[0]!;
  renderApp(
    <TopBar
      filters={<div data-testid="chips" />}
      search={<button data-testid="search">Search</button>}
    />,
    { url: `/app/trades/${encodeURIComponent(id.id)}?symbol=ES` },
  );
  const title = screen.getByRole('heading', { level: 1 });
  expect(
    within(title).getByRole('link', { name: 'Trades' }).getAttribute('href'),
  ).toBe('/app/trades/day?symbol=ES');
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

test('a strategy page titles the bar "Strategies" then the strategy name, with the filter chips', async () => {
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
  expect(screen.getByTestId('chips')).toBeTruthy();
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

test('Plan the day sits before Import on the Dashboard and Trades only', () => {
  for (const path of ['/app/dashboard', '/app/trades']) {
    const bar = renderBar(path);
    const plan = within(bar).getByRole('button', { name: 'Plan the day' });
    const imp = within(bar).getByRole('link', { name: 'Import' });
    expect(
      plan.compareDocumentPosition(imp) & Node.DOCUMENT_POSITION_FOLLOWING,
      path,
    ).toBeTruthy();
    cleanup();
  }
  for (const path of ['/app/calendar', '/app/import', '/app/trades/t-1']) {
    const bar = renderBar(path);
    expect(
      within(bar).queryByRole('button', { name: 'Plan the day' }),
      path,
    ).toBeNull();
    cleanup();
  }
});

test('the template button follows Plan the day, before Import, on the Dashboard only', async () => {
  const bar = renderBar('/app/dashboard');
  const plan = within(bar).getByRole('button', { name: 'Plan the day' });
  const template = await within(bar).findByRole('button', {
    name: 'Dashboard template: Main',
  });
  const imp = within(bar).getByRole('link', { name: 'Import' });
  expect(
    plan.compareDocumentPosition(template) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    template.compareDocumentPosition(imp) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  cleanup();
  for (const path of ['/app/trades', '/app/calendar', '/app/trades/day']) {
    const other = renderBar(path);
    expect(
      within(other).queryByRole('button', { name: /^Dashboard template/ }),
      path,
    ).toBeNull();
    cleanup();
  }
});

test('the bar publishes its measured height for what pins under it, and Plan the day shows on the day and week views', () => {
  layOut({ titleWidth: 115, chipsWidth: 100 });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return {
        left: 0,
        width: 0,
        right: 0,
        top: 0,
        bottom: 0,
        height: this.tagName === 'HEADER' ? 104 : 0,
      } as DOMRect;
    },
  );
  renderBar('/app/trades/day');
  expect(document.documentElement.style.getPropertyValue('--top-bar')).toBe(
    '104px',
  );
  expect(screen.getByRole('button', { name: 'Plan the day' })).toBeTruthy();
  cleanup();
  expect(document.documentElement.style.getPropertyValue('--top-bar')).toBe('');
});

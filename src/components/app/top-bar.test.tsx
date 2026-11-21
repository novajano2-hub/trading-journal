// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
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

function renderBar(): HTMLElement {
  render(
    <TopBar
      filters={<div data-testid="chips" />}
      search={<button data-testid="search">Search</button>}
    />,
  );
  return screen.getByRole('banner');
}

// Room beside the title: 900 - 240 - 115 - 12 (title margin) - 2 * 10 (gaps) = 513.
test('chips that fit beside the title sit there', () => {
  layOut({ titleWidth: 115, chipsWidth: 512 });
  expect(renderBar().dataset.chips).toBe('inline');
});

test('chips that need more than the room take their own row', () => {
  layOut({ titleWidth: 115, chipsWidth: 513 });
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

test('the source reads as the bar does: menu, title, chips, search, label, Gross/Net, Import, theme; none reordered by CSS', () => {
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

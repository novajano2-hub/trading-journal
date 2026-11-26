// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { viewport } from '../app/__fixtures__/viewport';
import { ExpandingSearch } from './expanding-search';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const results = [
  { id: 'a', label: 'Reports', detail: 'Module' },
  { id: 'b', label: 'Replay', detail: 'Module' },
];

function setup(over: Partial<Parameters<typeof ExpandingSearch>[0]> = {}) {
  const onSelect = vi.fn();
  const onQueryChange = vi.fn();
  render(
    <ExpandingSearch
      label="Search"
      placeholder="Search Keel"
      shortcutHint="⌘K"
      query="re"
      onQueryChange={onQueryChange}
      results={results}
      onSelect={onSelect}
      {...over}
    />,
  );
  const box = screen.getByRole('combobox', { name: 'Search' });
  fireEvent.focus(box);
  return { box, onSelect, onQueryChange };
}

test('a combobox that is expanded while there are results', () => {
  const { box } = setup();
  expect(box.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getAllByRole('option')).toHaveLength(2);
});

test('collapsed without results', () => {
  const { box } = setup({ results: [] });
  expect(box.getAttribute('aria-expanded')).toBe('false');
});

test('arrows move the active option and Enter selects it', () => {
  const { box, onSelect } = setup();
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  const first = screen.getAllByRole('option')[0]!;
  expect(box.getAttribute('aria-activedescendant')).toBe(first.id);
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  fireEvent.keyDown(box, { key: 'ArrowUp' });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(onSelect).toHaveBeenCalledWith('a');
});

test('Escape clears the query and tells the owner to hand focus back', () => {
  const onClose = vi.fn();
  const { box, onQueryChange } = setup({ onClose });
  fireEvent.keyDown(box, { key: 'Escape' });
  expect(onQueryChange).toHaveBeenCalledWith('');
  expect(onClose).toHaveBeenCalledOnce();
});

test('the shortcut hint shows while expanded and empty', () => {
  setup({ query: '', results: [] });
  expect(screen.getByText('⌘K')).toBeTruthy();
});

// ---- The phone's room: from the left gutter to where it rests -----------------

/** The field's resting box (34px, or the phone's 44px glyph) ends where the controls after it begin. */
function restsAt(right: number): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const rest =
        this.classList.contains('relative') &&
        this.className.includes('size-[34px]');
      return {
        left: rest ? right - 44 : 0,
        right: rest ? right : 0,
        width: rest ? 44 : 0,
        height: 0,
        top: 0,
        bottom: 0,
      } as DOMRect;
    },
  );
}

const field = () =>
  screen
    .getByRole('combobox', { name: 'Search' })
    .closest('[data-open]') as HTMLElement;

test('on a phone the open field reaches the left gutter from wherever it rests', () => {
  viewport({ phone: true });
  restsAt(262);
  setup();
  // 262 - the 20px gutter: nothing is cut off the screen's edge, however many controls follow it.
  expect(field().style.getPropertyValue('--search-room')).toBe('242px');
  fireEvent.blur(screen.getByRole('combobox', { name: 'Search' }));
  restsAt(300);
  fireEvent.focus(screen.getByRole('combobox', { name: 'Search' }));
  expect(field().style.getPropertyValue('--search-room')).toBe('280px');
  expect(field().className).toContain(
    'max-sm:data-[open=true]:w-[var(--search-room,',
  );
});

test('from sm the field keeps its own widths', () => {
  viewport();
  restsAt(262);
  setup();
  expect(field().style.getPropertyValue('--search-room')).toBe('');
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ExpandingSearch } from './expanding-search';

afterEach(cleanup);

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

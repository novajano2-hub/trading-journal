// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { EMPTY_FILTERS } from '@/data/filters';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { DataProvider } from '@/data/query/provider';
import { FilterBar, FilterBarView } from './filter-bar';
import type { FilterOptions } from './filter-model';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

const NO_OPTIONS: FilterOptions = { symbols: [], strategies: [], tags: [] };

beforeEach(() => window.history.replaceState(null, '', '/app/dashboard'));
afterEach(cleanup);

test('five chips, each opening a dialog, and no "Clear filters" with nothing set', () => {
  render(
    <FilterBarView
      filters={EMPTY_FILTERS}
      options={NO_OPTIONS}
      today="2026-11-20"
      onChange={() => {}}
    />,
  );
  for (const name of ['All time', 'Symbol', 'Side', 'Strategy', 'Tags']) {
    expect(
      screen.getByRole('button', { name }).getAttribute('aria-haspopup'),
    ).toBe('dialog');
  }
  expect(screen.getAllByRole('button')).toHaveLength(5);
  expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
});

test('an active side reads on its chip, and "Clear filters" resets every filter', () => {
  const onChange = vi.fn();
  render(
    <FilterBarView
      filters={{ ...EMPTY_FILTERS, side: 'short' }}
      options={NO_OPTIONS}
      today="2026-11-20"
      onChange={onChange}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Short' }).getAttribute('aria-haspopup'),
  ).toBe('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
});

function renderBar(url: string) {
  window.history.replaceState(null, '', url);
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  render(
    <DataProvider repository={repository} queryClient={queryClient}>
      <FilterBar />
    </DataProvider>,
  );
}

/** The chip once the workspace has loaded: until then the chips are inert. */
async function liveChip(name: string): Promise<HTMLElement> {
  await waitFor(() =>
    expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(
      false,
    ),
  );
  return screen.getByRole('button', { name });
}

test('a chip opens, a value applies and the URL updates; Escape hands focus back', async () => {
  renderBar('/app/dashboard?by=hour');
  fireEvent.click(await liveChip('Side'));
  const dialog = await screen.findByRole('dialog', { name: 'Side' });
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Short' }));

  expect(window.location.search).toBe('?by=hour&side=short');
  const chip = await screen.findByRole('button', { name: 'Short' });
  expect(chip.getAttribute('aria-expanded')).toBe('true');

  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: 'Escape',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(chip);
});

test('symbols are the workspace roots, and checking one filters by it', async () => {
  renderBar('/app/dashboard');
  fireEvent.click(await liveChip('Symbol'));
  const dialog = await screen.findByRole('dialog', { name: 'Symbol' });
  expect(
    within(dialog)
      .getAllByRole('checkbox')
      .map((c) => c.closest('label')!.textContent),
  ).toEqual(['ES', 'NQ']);
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'NQ' }));
  expect(window.location.search).toBe('?symbol=NQ');
  expect(await screen.findByRole('button', { name: 'NQ' })).toBeTruthy();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear' }));
  expect(window.location.search).toBe('');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('a custom date range applies from the date pair', async () => {
  renderBar('/app/dashboard');
  fireEvent.click(await liveChip('All time'));
  const dialog = await screen.findByRole('dialog', { name: 'Date' });
  fireEvent.change(within(dialog).getByLabelText('From'), {
    target: { value: '2026-11-15' },
  });
  fireEvent.change(within(dialog).getByLabelText('To'), {
    target: { value: '2026-11-01' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));

  expect(window.location.search).toBe('?from=2026-11-01&to=2026-11-15');
  expect(
    await screen.findByRole('button', { name: '1-15 Nov 2026' }),
  ).toBeTruthy();
});

test('a stale link never shows its unknown ids as chips', async () => {
  renderBar('/app/dashboard?side=long&strategy=gone&tag=ghost&tag=tag-fomo');
  await liveChip('Long');
  expect(screen.getByRole('button', { name: 'Strategy' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'FOMO' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '2 tags' })).toBeNull();
  await waitFor(() =>
    expect(window.location.search).toBe('?side=long&tag=tag-fomo'),
  );
});

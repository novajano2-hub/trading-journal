// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
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
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { EMPTY_FILTERS } from '@/data/filters';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { DataProvider } from '@/data/query/provider';
import { commitNavigation, deferNavigation } from './__fixtures__/navigation';
import { FilterBar, FilterBarView } from './filter-bar';
import type { FilterOptions } from './filter-model';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

const NO_OPTIONS: FilterOptions = {
  symbols: [],
  strategies: [],
  tags: [],
  categories: [],
};

beforeEach(() => {
  window.history.replaceState(null, '', '/app/dashboard');
  commitNavigation();
});
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

test('with no trades the chips keep their tab stops but open nothing', () => {
  render(
    <FilterBarView
      filters={{ ...EMPTY_FILTERS, side: 'short' }}
      options={NO_OPTIONS}
      today="2026-11-20"
      onChange={() => {}}
      noTrades
    />,
  );
  for (const name of ['All time', 'Symbol', 'Short', 'Strategy', 'Tags']) {
    const chip = screen.getByRole('button', { name });
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    expect(chip.hasAttribute('disabled')).toBe(false);
    expect(chip.hasAttribute('aria-haspopup')).toBe(false);
    expect(chip.tabIndex).toBe(0);
  }
  const side = screen.getByRole('button', { name: 'Short' });
  expect(side.getAttribute('aria-describedby')!.split(' ')).toHaveLength(2);
  expect(screen.getByText('No trades to filter yet.')).toBeTruthy();
  fireEvent.click(side);
  expect(screen.queryByRole('dialog')).toBeNull();
  // The way out stays live.
  expect(
    screen
      .getByRole('button', { name: 'Clear filters' })
      .hasAttribute('aria-disabled'),
  ).toBe(false);
});

function freshRepository() {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}

function renderBar(url: string, repository = freshRepository()) {
  window.history.replaceState(null, '', url);
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

test('tags group under their categories, by name', async () => {
  renderBar('/app/dashboard');
  fireEvent.click(await liveChip('Tags'));
  const dialog = await screen.findByRole('dialog', { name: 'Tags' });
  const groups = within(dialog).getAllByRole('group');
  expect(groups.map((g) => g.querySelector('legend')!.textContent)).toEqual([
    'Mistakes',
    'Setups',
  ]);
  expect(
    within(groups[0]!).getByRole('checkbox', { name: 'FOMO' }),
  ).toBeTruthy();
  expect(
    within(groups[1]!).getByRole('checkbox', { name: 'Breakout' }),
  ).toBeTruthy();
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

test('an empty workspace disables the chips; a filter that matches nothing leaves them live', async () => {
  const empty = freshRepository();
  await empty.workspaces.setActive('mine');
  renderBar('/app/dashboard', empty);
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: 'Side' })
        .getAttribute('aria-disabled'),
    ).toBe('true'),
  );
  cleanup();

  renderBar('/app/dashboard?symbol=ZZ');
  const chip = await liveChip('ZZ');
  expect(chip.hasAttribute('aria-disabled')).toBe(false);
  fireEvent.click(chip);
  expect(await screen.findByRole('dialog', { name: 'Symbol' })).toBeTruthy();
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

/** Chooses Short while the router lags, as Next's transition makes it. */
async function writeShortUnheard(): Promise<void> {
  fireEvent.click(await liveChip('Long'));
  const dialog = await screen.findByRole('dialog', { name: 'Side' });
  deferNavigation();
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Short' }));
  // The write shows at once, before the router has it.
  expect(screen.getByRole('button', { name: 'Short' })).toBeTruthy();
}

test("back to another page before a write lands shows that page's filters", async () => {
  renderBar('/app/reports?side=long');
  await writeShortUnheard();
  window.history.pushState(null, '', '/app/trades?side=long');
  act(() => commitNavigation());
  expect(screen.getByRole('button', { name: 'Long' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Short' })).toBeNull();
});

test('back to the same page and filters before a write lands shows the URL', async () => {
  renderBar('/app/dashboard?by=hour&side=long');
  await writeShortUnheard();
  window.history.pushState(null, '', '/app/dashboard?side=long');
  act(() => commitNavigation());
  expect(screen.getByRole('button', { name: 'Long' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Short' })).toBeNull();
});

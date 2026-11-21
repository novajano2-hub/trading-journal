// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { DataProvider } from '@/data/query/provider';
import { commitNavigation } from './__fixtures__/navigation';
import { AppSearch } from './app-search';

const push = vi.fn();
vi.mock('next/navigation', async () => ({
  ...(await import('./__fixtures__/navigation')),
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockClear();
  Object.defineProperty(navigator, 'platform', {
    value: 'MacIntel',
    configurable: true,
  });
});
afterEach(cleanup);

function renderSearch(url: string) {
  window.history.replaceState(null, '', url);
  commitNavigation();
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
      <button type="button">Other</button>
      <textarea aria-label="Notes" />
      <AppSearch />
    </DataProvider>,
  );
  return screen.getByRole('combobox', { name: 'Search' });
}

/** Types a query and waits for the first option to name `label`. */
async function find(box: HTMLElement, text: string, label: string) {
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: text } });
  await waitFor(() =>
    expect(screen.getAllByRole('option')[0]?.textContent).toContain(label),
  );
}

const cmdK = (target: Element | Window = window) =>
  fireEvent.keyDown(target, { key: 'k', metaKey: true });

test('a module result navigates, carrying the filters of a filter-scoped page', async () => {
  const box = renderSearch('/app/trades?side=long');
  await find(box, 'cal', 'Calendar');
  fireEvent.click(screen.getAllByRole('option')[0]!);
  expect(push).toHaveBeenCalledWith('/app/calendar?side=long');
});

test('a strategy result sets the filters on a filter-scoped page, and only adds', async () => {
  const box = renderSearch('/app/trades?strategy=str-1');
  await find(box, 'opening', 'Opening range breakout');
  fireEvent.click(screen.getAllByRole('option')[0]!);
  expect(push).not.toHaveBeenCalled();
  expect(window.location.search).toBe('?strategy=str-1');
});

test('a tag result sets the filters in place', async () => {
  const box = renderSearch('/app/trades');
  await find(box, 'fomo', 'FOMO');
  fireEvent.click(screen.getAllByRole('option')[0]!);
  await waitFor(() => expect(window.location.search).toBe('?tag=tag-fomo'));
});

test('off a filter-scoped page a result opens the dashboard with the filter', async () => {
  const box = renderSearch('/app/import');
  await find(box, 'fomo', 'FOMO');
  fireEvent.click(screen.getAllByRole('option')[0]!);
  expect(push).toHaveBeenCalledWith('/app/dashboard?tag=tag-fomo');
});

test('the shortcut focuses the field, but not while typing elsewhere', () => {
  const box = renderSearch('/app/trades');
  const notes = screen.getByLabelText('Notes');
  notes.focus();
  cmdK(notes);
  expect(document.activeElement).toBe(notes);
  screen.getByRole('button', { name: 'Other' }).focus();
  cmdK();
  expect(document.activeElement).toBe(box);
});

test('Escape returns focus to where the shortcut came from', () => {
  const box = renderSearch('/app/trades');
  const other = screen.getByRole('button', { name: 'Other' });
  other.focus();
  cmdK();
  fireEvent.keyDown(box, { key: 'Escape' });
  expect(document.activeElement).toBe(other);
});

test('focus that did not come from the shortcut is not sent back to a stale element', () => {
  const box = renderSearch('/app/trades');
  const other = screen.getByRole('button', { name: 'Other' });
  other.focus();
  cmdK();
  // The field loses focus some other way, then is opened by hand.
  box.blur();
  box.focus();
  fireEvent.keyDown(box, { key: 'Escape' });
  expect(document.activeElement).not.toBe(other);
  expect(document.activeElement).not.toBe(box);
});

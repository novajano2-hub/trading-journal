// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { parseCsv } from '@/domain/import/csv';
import { guessMapping } from '@/domain/import/mapping';
import { EMPTY_FILTERS } from '../filters';
import { fixtureSample } from '../__fixtures__/sample';
import { createLocalRepository } from '../local/local-repository';
import type { Repository } from '../repository';
import { USER_WORKSPACE } from '../workspaces';
import {
  useGlobalFilters,
  useImportPlan,
  useMetrics,
  useTradeSet,
  type ImportInput,
} from './derived';
import { DataProvider } from './provider';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => '/app/dashboard',
}));

beforeEach(() => window.history.replaceState(null, '', '/app/dashboard'));
afterEach(cleanup);

function setup() {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <DataProvider repository={repository} queryClient={queryClient}>
        {children}
      </DataProvider>
    );
  }
  return { repository, Wrapper };
}

test('useGlobalFilters reads the URL and writes filters back, keeping other params', async () => {
  window.history.replaceState(null, '', '/app/dashboard?by=hour&side=long');
  const { Wrapper } = setup();
  const { result } = renderHook(() => useGlobalFilters(), { wrapper: Wrapper });
  expect(result.current.filters.side).toBe('long');
  act(() => result.current.setFilters({ ...EMPTY_FILTERS, symbols: ['ES'] }));
  expect(window.location.search).toBe('?by=hour&symbol=ES');
  act(() => result.current.setFilters(EMPTY_FILTERS));
  expect(window.location.search).toBe('?by=hour');
});

test('useGlobalFilters drops unknown ids and cleans the URL (Review Focus 5)', async () => {
  window.history.replaceState(
    null,
    '',
    '/app/dashboard?by=hour&account=ghost&account=acc-a&tag=gone&symbol=ES',
  );
  const { Wrapper } = setup();
  const { result } = renderHook(() => useGlobalFilters(), { wrapper: Wrapper });
  await waitFor(() =>
    expect(window.location.search).toBe('?by=hour&account=acc-a&symbol=ES'),
  );
  expect(result.current.filters.accountIds).toEqual(['acc-a']);
  expect(result.current.filters.tagIds).toEqual([]);
});

test('useGlobalFilters leaves a clean URL untouched', async () => {
  window.history.replaceState(null, '', '/app/dashboard?account=acc-a');
  const spy = vi.spyOn(window.history, 'replaceState');
  const { Wrapper } = setup();
  const { result } = renderHook(
    () => ({ f: useGlobalFilters(), set: useTradeSet(EMPTY_FILTERS) }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.set.status).toBe('success'));
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

test('a filter on an unknown account still shows data', async () => {
  const { Wrapper } = setup();
  const { result } = renderHook(
    () => useTradeSet({ ...EMPTY_FILTERS, accountIds: ['ghost'] }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.data!.filters.accountIds).toEqual([]);
  expect(result.current.data!.trades.map((t) => t.id).sort()).toEqual([
    'f-1',
    'f-2',
  ]);
});

test('useTradeSet keeps its result while the inputs are unchanged', async () => {
  const { Wrapper } = setup();
  const { result, rerender } = renderHook(
    () => useTradeSet({ ...EMPTY_FILTERS }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.status).toBe('success'));
  const first = result.current.data;
  rerender();
  expect(result.current.data).toBe(first);
});

test('useMetrics partitions by currency', async () => {
  const { Wrapper } = setup();
  const { result } = renderHook(() => useMetrics(EMPTY_FILTERS), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.data![0]!.currency).toBe('USD');
  expect(result.current.data![0]!.summary.closedCount).toBe(2);
});

test('a failing query makes the derived result an error', async () => {
  const { repository } = setup();
  const broken: Repository = {
    ...repository,
    tags: {
      ...repository.tags,
      list: () => Promise.reject(new Error('tags down')),
    },
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { result } = renderHook(() => useTradeSet(EMPTY_FILTERS), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <DataProvider repository={broken} queryClient={queryClient}>
        {children}
      </DataProvider>
    ),
  });
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.error?.message).toBe('tags down');
});

test('useImportPlan plans the landing file and keeps its id per input', async () => {
  const { repository, Wrapper } = setup();
  const account = await repository.accounts.create(USER_WORKSPACE.id, {
    name: 'Mine',
    broker: 'x',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  const parsed = parseCsv(
    readFileSync('e2e/fixtures/sample-fills.csv', 'utf8'),
  );
  const input: ImportInput = {
    parsed,
    mapping: guessMapping(parsed, { sourceTimeZone: 'America/New_York' }),
    accountId: account.id,
    fileName: 'sample-fills.csv',
  };
  const { result, rerender } = renderHook(
    ({ i }: { i: ImportInput | null }) => useImportPlan(i),
    { wrapper: Wrapper, initialProps: { i: input as ImportInput | null } },
  );
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.data!.trades).toHaveLength(8);
  const id = result.current.data!.importId;
  rerender({ i: input });
  expect(result.current.data!.importId).toBe(id);
  rerender({ i: null });
  expect(result.current.status).toBe('pending');
});

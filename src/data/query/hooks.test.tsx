// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ImportJob } from '@/domain/types';
import type { ImportPlan } from '@/domain/import/plan';
import { StalePlanError, type Repository } from '../repository';
import { fixtureSample } from '../__fixtures__/sample';
import { createLocalRepository } from '../local/local-repository';
import { USER_WORKSPACE } from '../workspaces';
import {
  useActiveWorkspace,
  useCommitImport,
  useSetActiveWorkspace,
  useTrade,
  useTrades,
  useUpdateTrade,
} from './hooks';
import { DataProvider } from './provider';

afterEach(cleanup);

function wrapper() {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <DataProvider repository={repository} queryClient={queryClient}>
        {children}
      </DataProvider>
    );
  };
}

test('useTrades loads the active workspace', async () => {
  const { result } = renderHook(() => useTrades(), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.data).toHaveLength(3));
});

test('an update shows up in the list', async () => {
  const { result } = renderHook(
    () => ({ trades: useTrades(), update: useUpdateTrade() }),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.trades.data).toHaveLength(3));
  await act(async () => {
    await result.current.update.mutateAsync({
      id: 'f-1',
      patch: { tagIds: ['tag-setup'] },
    });
  });
  await waitFor(() =>
    expect(
      result.current.trades.data!.find((t) => t.id === 'f-1')!.tagIds,
    ).toEqual(['tag-setup']),
  );
});

test('switching to My workspace swaps the data', async () => {
  const { result } = renderHook(
    () => ({
      active: useActiveWorkspace(),
      trades: useTrades(),
      set: useSetActiveWorkspace(),
    }),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.trades.data).toHaveLength(3));
  await act(async () => {
    await result.current.set.mutateAsync('mine');
  });
  await waitFor(() =>
    expect(result.current.active.data).toEqual(USER_WORKSPACE),
  );
  await waitFor(() => expect(result.current.trades.data).toEqual([]));
});

test('a missing trade reads as null', async () => {
  const { result } = renderHook(() => useTrade('nope'), {
    wrapper: wrapper(),
  });
  await waitFor(() => expect(result.current.data).toBeNull());
});

function commitWrapper(over: {
  commit: () => Promise<ImportJob>;
  setActive?: () => Promise<void>;
}) {
  const real = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const repository: Repository = {
    ...real,
    imports: { ...real.imports, commit: over.commit },
    workspaces: {
      ...real.workspaces,
      setActive: over.setActive ?? real.workspaces.setActive,
    },
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const spy = vi.spyOn(queryClient, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <DataProvider repository={repository} queryClient={queryClient}>
      {children}
    </DataProvider>
  );
  return { Wrapper, spy };
}
const plan = {} as ImportPlan;
const job = { id: 'job-1' } as ImportJob;
const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);

test('a commit switches to My workspace and invalidates trades and imports', async () => {
  const setActive = vi.fn(async () => {});
  const { Wrapper, spy } = commitWrapper({
    commit: async () => job,
    setActive,
  });
  const { result } = renderHook(() => useCommitImport(), { wrapper: Wrapper });
  await act(async () => {
    await result.current.mutateAsync(plan);
  });
  expect(setActive).toHaveBeenCalledWith('mine');
  const ks = invalidatedKeys(spy);
  expect(ks).toContainEqual(['keel', 'ws', 'mine', 'trades']);
  expect(ks).toContainEqual(['keel', 'ws', 'mine', 'imports']);
  expect(ks).toContainEqual(['keel', 'active-workspace']);
});

test('a stale plan reaches the caller unwrapped and invalidates nothing', async () => {
  const error = new StalePlanError('imports-changed');
  const { Wrapper, spy } = commitWrapper({
    commit: async () => {
      throw error;
    },
  });
  const { result } = renderHook(() => useCommitImport(), { wrapper: Wrapper });
  let caught: unknown;
  await act(async () => {
    caught = await result.current.mutateAsync(plan).catch((e: unknown) => e);
  });
  expect(caught).toBe(error);
  expect(spy).not.toHaveBeenCalled();
});

test('a failed switch after a landed commit still invalidates, then rejects', async () => {
  const boom = new Error('switch failed');
  const { Wrapper, spy } = commitWrapper({
    commit: async () => job,
    setActive: async () => {
      throw boom;
    },
  });
  const { result } = renderHook(() => useCommitImport(), { wrapper: Wrapper });
  let caught: unknown;
  await act(async () => {
    caught = await result.current.mutateAsync(plan).catch((e: unknown) => e);
  });
  expect(caught).toBe(boom);
  const ks = invalidatedKeys(spy);
  expect(ks).toContainEqual(['keel', 'ws', 'mine', 'trades']);
  expect(ks).toContainEqual(['keel', 'ws', 'mine', 'imports']);
});

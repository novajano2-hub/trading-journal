// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { ReactNode } from 'react';
import { afterEach, expect, test } from 'vitest';
import { fixtureSample } from '../__fixtures__/sample';
import { createLocalRepository } from '../local/local-repository';
import { USER_WORKSPACE } from '../workspaces';
import {
  useActiveWorkspace,
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

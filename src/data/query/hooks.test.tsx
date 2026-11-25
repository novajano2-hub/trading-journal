// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useState, type ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ImportJob } from '@/domain/types';
import type { ImportPlan } from '@/domain/import/plan';
import { StalePlanError, type Repository } from '../repository';
import { fixtureSample } from '../__fixtures__/sample';
import { createLocalRepository } from '../local/local-repository';
import { USER_WORKSPACE } from '../workspaces';
import {
  useActiveWorkspace,
  useAddFile,
  useCommitImport,
  useCreateTagCategory,
  useDailyNote,
  useEnsureTradeNote,
  useFile,
  useFiles,
  useHistory,
  useJournal,
  useRemoveAccount,
  useRemoveFile,
  useRemoveTagCategory,
  useSetActiveWorkspace,
  useTagCategories,
  useTags,
  useTemplates,
  useTrade,
  useTrades,
  useUpdateTrade,
  useUpdateTrades,
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

test('categories and templates load, and category writes refresh tags and trades', async () => {
  const { result } = renderHook(
    () => ({
      categories: useTagCategories(),
      templates: useTemplates(),
      tags: useTags(),
      trades: useTrades(),
      create: useCreateTagCategory(),
      remove: useRemoveTagCategory(),
    }),
    { wrapper: wrapper() },
  );
  await waitFor(() =>
    expect(result.current.categories.data?.map((c) => c.name)).toEqual([
      'Custom tags',
      'Mistakes',
      'Setups',
    ]),
  );
  await waitFor(() => expect(result.current.templates.data).toHaveLength(6));
  await waitFor(() => expect(result.current.trades.data).toHaveLength(3));
  await act(async () => {
    await result.current.create.mutateAsync({
      name: 'Sessions',
      color: '#0F766E',
    });
  });
  await waitFor(() =>
    expect(result.current.categories.data?.map((c) => c.name)).toContain(
      'Sessions',
    ),
  );
  await act(async () => {
    await expect(result.current.remove.mutateAsync('mistakes')).rejects.toThrow(
      'built-in category',
    );
    await result.current.remove.mutateAsync('setups');
  });
  await waitFor(() =>
    expect(result.current.tags.data?.map((t) => t.id)).toEqual(['tag-fomo']),
  );
  expect(result.current.categories.data?.map((c) => c.id)).not.toContain(
    'setups',
  );
});

test('a bulk update, a trade note and a daily note refresh what they change', async () => {
  const { result } = renderHook(
    () => ({
      trades: useTrades(),
      journal: useJournal(),
      updateMany: useUpdateTrades(),
      ensureNote: useEnsureTradeNote(),
      daily: useDailyNote(),
    }),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.journal.data).toHaveLength(1));
  await act(async () => {
    await result.current.updateMany.mutateAsync({
      ids: ['f-1', 'f-2'],
      patch: { reviewed: true },
    });
  });
  await waitFor(() =>
    expect(result.current.trades.data?.map((t) => t.reviewed)).toEqual([
      true,
      true,
      undefined,
    ]),
  );
  let noteId = '';
  await act(async () => {
    noteId = (await result.current.ensureNote.mutateAsync('f-2')).id;
    await result.current.daily.mutateAsync('2026-11-19');
  });
  await waitFor(() => expect(result.current.journal.data).toHaveLength(3));
  expect(result.current.trades.data?.find((t) => t.id === 'f-2')?.noteId).toBe(
    noteId,
  );
});

test('file hooks list an owner’s files; adding and removing refresh them', async () => {
  const { result } = renderHook(
    () => {
      const [id, setId] = useState<string | undefined>(undefined);
      return {
        setId,
        files: useFiles('trade:f-1'),
        elsewhere: useFiles('trade:f-2'),
        one: useFile(id),
        add: useAddFile(),
        remove: useRemoveFile(),
      };
    },
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.files.data).toEqual([]));
  // A file read waits while it has no id.
  expect(result.current.one.data).toBeUndefined();
  let added = '';
  await act(async () => {
    const stored = await result.current.add.mutateAsync({
      owner: 'trade:f-1',
      file: {
        bytes: new ArrayBuffer(4),
        type: 'application/pdf',
        name: 'plan.pdf',
      },
      images: false,
    });
    added = stored.id;
  });
  await waitFor(() =>
    expect(result.current.files.data?.map((f) => f.id)).toEqual([added]),
  );
  expect(result.current.elsewhere.data).toEqual([]);
  // A refused file is an error from the write, and the list stays as it was.
  await act(async () => {
    await expect(
      result.current.add.mutateAsync({
        owner: 'trade:f-1',
        file: { bytes: new ArrayBuffer(4), type: 'application/pdf', name: 'x' },
        images: true,
      }),
    ).rejects.toMatchObject({ name: 'FileRejected', reason: 'type' });
  });
  expect(result.current.files.data).toHaveLength(1);

  act(() => result.current.setId(added));
  await waitFor(() => expect(result.current.one.data?.name).toBe('plan.pdf'));
  await act(async () => {
    await result.current.remove.mutateAsync({ id: added });
  });
  await waitFor(() => expect(result.current.files.data).toEqual([]));
  await waitFor(() => expect(result.current.one.data).toBeNull());
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

test('a trade write shows up in the edit history', async () => {
  const { result } = renderHook(
    () => ({
      history: useHistory(),
      update: useUpdateTrade(),
      updateMany: useUpdateTrades(),
    }),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.history.data).toEqual([]));
  await act(async () => {
    await result.current.update.mutateAsync({
      id: 'f-2',
      patch: { rating: 4 },
    });
  });
  await waitFor(() =>
    expect(
      result.current.history.data?.map((r) => [
        r.entityId,
        r.field,
        r.newValue,
      ]),
    ).toEqual([['f-2', 'rating', 4]]),
  );
  await act(async () => {
    await result.current.updateMany.mutateAsync({
      ids: ['f-1', 'f-2'],
      patch: { reviewed: true },
    });
  });
  await waitFor(() => expect(result.current.history.data).toHaveLength(3));
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

test('reading the journal refreshes the trades when the purge unlinked a note', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const sample = fixtureSample();
      // In Trash for far longer than 30 days.
      sample.journal[0]!.deletedAt = '2026-01-01T00:00:00.000Z';
      return sample;
    },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <DataProvider repository={repository} queryClient={queryClient}>
      {children}
    </DataProvider>
  );
  const trades = renderHook(() => useTrades(), { wrapper: Wrapper });
  const noteOf = () => trades.result.current.data?.find((t) => t.id === 'f-1');
  await waitFor(() => expect(noteOf()).toBeDefined());
  // Trades loaded first, still holding the id of a note about to be purged.
  expect(noteOf()?.noteId).toBe('j-1');
  const journal = renderHook(() => useJournal(), { wrapper: Wrapper });
  await waitFor(() => expect(journal.result.current.data).toEqual([]));
  await waitFor(() => expect(noteOf()?.noteId).toBeUndefined());
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

test('a remove that lands but whose cache refresh fails still resolves: it was deleted', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValue(
    new Error('refresh failed'),
  );
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <DataProvider repository={repository} queryClient={queryClient}>
      {children}
    </DataProvider>
  );
  const { result } = renderHook(() => useRemoveAccount(), { wrapper: Wrapper });
  const made = await repository.accounts.create('sample', {
    name: 'Spare',
    broker: '',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  await act(async () => {
    await result.current.mutateAsync(made.id);
  });
  expect(
    (await repository.accounts.list('sample')).map((a) => a.id),
  ).not.toContain(made.id);
});

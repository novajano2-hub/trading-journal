// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useState, type ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { Execution, ImportJob } from '@/domain/types';
import type { ImportPlan } from '@/domain/import/plan';
import { StalePlanError, type Repository } from '../repository';
import { patternSample } from '../__fixtures__/patterns-sample';
import { fixtureSample } from '../__fixtures__/sample';
import type { SampleWorkspace } from '../seed/generate';
import { createLocalRepository } from '../local/local-repository';
import { USER_WORKSPACE } from '../workspaces';
import {
  useActiveWorkspace,
  useAddFile,
  useChangeDashboards,
  useCommitImport,
  useCreateAccount,
  useCreateTagCategory,
  useDailyNote,
  useApplyRule,
  useEnsureTradeNote,
  useFeeRules,
  useFile,
  useFiles,
  useHistory,
  useJournal,
  useKeepVersion,
  useMergeTrades,
  useMoveAccountTrades,
  useMoveTrades,
  useNoteVersions,
  usePatterns,
  usePrefs,
  useRemoveAccount,
  useRemoveFeeRule,
  useReadFile,
  useRemoveFile,
  useRemoveTrades,
  useRemoveTagCategory,
  useRemoveTargetRule,
  useRestoreVersion,
  useSaveFeeRule,
  useSaveJournalEntry,
  useSaveTargetRule,
  useSetActiveWorkspace,
  useSetFillCosts,
  useSplitTrade,
  useTagCategories,
  useTags,
  useTargetRules,
  useTemplates,
  useTrade,
  useTrades,
  useUpdateTrade,
  useUpdateTrades,
} from './hooks';
import { DataProvider } from './provider';

afterEach(cleanup);

function wrapper(sample: () => SampleWorkspace = fixtureSample) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample(),
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

test('useReadFile reads one file with its bytes, and the list keeps none', async () => {
  const { result } = renderHook(
    () => ({
      files: useFiles('note:n-1'),
      add: useAddFile(),
      read: useReadFile(),
    }),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.files.data).toEqual([]));
  let id = '';
  await act(async () => {
    id = (
      await result.current.add.mutateAsync({
        owner: 'note:n-1',
        file: {
          bytes: new Uint8Array([1, 2, 3, 4, 5]).buffer as ArrayBuffer,
          type: 'image/png',
          name: 'shot.png',
        },
        images: true,
      })
    ).id;
  });
  await waitFor(() => expect(result.current.files.data).toHaveLength(1));
  // The listed row is metadata only.
  expect('bytes' in result.current.files.data![0]!).toBe(false);
  // One file's bytes come from the read, which leaves nothing in the cache.
  const stored = await result.current.read(id);
  expect(stored?.name).toBe('shot.png');
  expect([...new Uint8Array(stored!.bytes)]).toEqual([1, 2, 3, 4, 5]);
  expect(await result.current.read('missing')).toBeUndefined();
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

const fillOf = (
  id: string,
  side: 'buy' | 'sell',
  price: number,
  time: string,
): Execution => ({
  id,
  accountId: 'acc-a',
  symbol: 'ESZ5',
  side,
  qty: 1,
  price,
  time,
  fees: 0,
  commission: 0,
});

test('grouping writes refresh the trades, the history and the files', async () => {
  // f-1 and f-2 are ES trades in the active account; give them fills to regroup.
  const sample = () => {
    const s = fixtureSample();
    s.trades.find((t) => t.id === 'f-1')!.executions = [
      fillOf('e1', 'buy', 6000, '2026-11-16T14:45:00.000Z'),
      fillOf('e2', 'sell', 6005, '2026-11-16T15:10:00.000Z'),
    ];
    s.trades.find((t) => t.id === 'f-2')!.executions = [
      fillOf('e3', 'sell', 6010, '2026-11-17T15:00:00.000Z'),
      fillOf('e4', 'buy', 6012.5, '2026-11-17T15:30:00.000Z'),
    ];
    return s;
  };
  const { result } = renderHook(
    () => ({
      trades: useTrades(),
      history: useHistory(),
      files: useFiles('trade:f-1'),
      add: useAddFile(),
      createAccount: useCreateAccount(),
      merge: useMergeTrades(),
      split: useSplitTrade(),
      move: useMoveTrades(),
      moveAccount: useMoveAccountTrades(),
    }),
    { wrapper: wrapper(sample) },
  );
  await waitFor(() => expect(result.current.trades.data).toHaveLength(3));
  const actions = () =>
    (result.current.history.data ?? []).map((r) => r.action).sort();
  await waitFor(() => expect(result.current.history.data).toEqual([]));
  await act(async () => {
    await result.current.add.mutateAsync({
      owner: 'trade:f-2',
      file: { bytes: new ArrayBuffer(4), type: 'application/pdf', name: 'p' },
      images: false,
    });
  });

  // A merge leaves one trade, moves f-2's file to it and logs both trades.
  await act(async () => {
    const kept = await result.current.merge.mutateAsync({
      ids: ['f-2', 'f-1'],
      picked: ['e1', 'e2', 'e3', 'e4'],
    });
    expect(kept.id).toBe('f-1');
  });
  await waitFor(() => expect(result.current.trades.data).toHaveLength(2));
  await waitFor(() => expect(result.current.files.data).toHaveLength(1));
  await waitFor(() => expect(actions()).toEqual(['merged', 'merged']));

  // A split makes two again.
  await act(async () => {
    const { created } = await result.current.split.mutateAsync({
      id: 'f-1',
      moved: ['e3', 'e4'],
    });
    expect(created.executions.map((e) => e.id)).toEqual(['e3', 'e4']);
  });
  await waitFor(() => expect(result.current.trades.data).toHaveLength(3));
  await waitFor(() => expect(actions()).toHaveLength(4));

  // A move, of one trade and of a whole account, to an account made now.
  let other = '';
  await act(async () => {
    other = (
      await result.current.createAccount.mutateAsync({
        name: 'Other',
        broker: 'b',
        type: 'live',
        currency: 'USD',
        startingBalance: 0,
        status: 'active',
      })
    ).id;
  });
  await act(async () => {
    expect(
      await result.current.move.mutateAsync({ ids: ['f-1'], accountId: other }),
    ).toBe(1);
  });
  await waitFor(() =>
    expect(
      result.current.trades.data!.find((t) => t.id === 'f-1')!.accountId,
    ).toBe(other),
  );
  await act(async () => {
    expect(
      await result.current.moveAccount.mutateAsync({
        from: 'acc-a',
        to: other,
      }),
    ).toBe(1);
  });
  await waitFor(() =>
    expect(
      result.current.trades.data!.filter((t) => t.accountId === other),
    ).toHaveLength(2),
  );
  await waitFor(() =>
    expect(actions().filter((a) => a === 'moved')).toHaveLength(2),
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

test('rule writes refresh the rule lists, the trades and the history', async () => {
  // f-1 and f-2 are ES trades in the active account; give them fills to cost.
  const sample = () => {
    const s = fixtureSample();
    s.trades.find((t) => t.id === 'f-1')!.executions = [
      fillOf('e1', 'buy', 6000, '2026-11-16T14:45:00.000Z'),
      fillOf('e2', 'sell', 6005, '2026-11-16T15:10:00.000Z'),
    ];
    s.trades.find((t) => t.id === 'f-2')!.executions = [
      fillOf('e3', 'sell', 6010, '2026-11-17T15:00:00.000Z'),
      fillOf('e4', 'buy', 6012.5, '2026-11-17T15:30:00.000Z'),
    ];
    return s;
  };
  const { result } = renderHook(
    () => ({
      trades: useTrades(),
      history: useHistory(),
      targets: useTargetRules(),
      fees: useFeeRules(),
      saveTarget: useSaveTargetRule(),
      saveFee: useSaveFeeRule(),
      removeTarget: useRemoveTargetRule(),
      removeFee: useRemoveFeeRule(),
      apply: useApplyRule(),
    }),
    { wrapper: wrapper(sample) },
  );
  await waitFor(() => expect(result.current.targets.data).toEqual([]));
  await waitFor(() => expect(result.current.fees.data).toEqual([]));
  await waitFor(() => expect(result.current.history.data).toEqual([]));

  // Saving a rule shows in its list and in the history.
  let targetId = '';
  await act(async () => {
    targetId = (
      await result.current.saveTarget.mutateAsync({
        rule: {
          accountId: 'acc-a',
          assetClass: 'future',
          symbols: [],
          target: { unit: 'movement', levels: [{ value: 10, pct: 100 }] },
          stop: { unit: 'movement', levels: [{ value: 5, pct: 100 }] },
        },
      })
    ).id;
  });
  await waitFor(() => expect(result.current.targets.data).toHaveLength(1));
  await waitFor(() => expect(result.current.history.data).toHaveLength(1));
  let feeId = '';
  await act(async () => {
    feeId = (
      await result.current.saveFee.mutateAsync({
        rule: {
          accountId: 'acc-a',
          assetClass: 'future',
          symbols: [],
          mode: 'per-execution',
          applyOn: 'all',
          commission: 150,
          fee: 20,
        },
      })
    ).id;
  });
  await waitFor(() => expect(result.current.fees.data).toHaveLength(1));

  // Applying a rule rewrites the trades and logs each one.
  await act(async () => {
    expect(
      await result.current.apply.mutateAsync({
        kind: 'target',
        id: targetId,
        override: false,
      }),
    ).toBe(2);
  });
  await waitFor(() =>
    expect(
      result.current.trades.data!.find((t) => t.id === 'f-1')!.stops,
    ).toBeDefined(),
  );
  // The fixture trade carries fees its fills do not; the rule adds its own on top.
  const was = result.current.trades.data!.find((t) => t.id === 'f-1')!.fees;
  await act(async () => {
    expect(
      await result.current.apply.mutateAsync({
        kind: 'fee',
        id: feeId,
        override: false,
      }),
    ).toBe(2);
  });
  await waitFor(() =>
    expect(result.current.trades.data!.find((t) => t.id === 'f-1')!.fees).toBe(
      was + 340,
    ),
  );
  const rows = () =>
    (result.current.history.data ?? []).filter((r) => r.source === 'rule');
  // Two trades, targets and stops for each, then fees for each.
  await waitFor(() => expect(rows()).toHaveLength(6));

  // An edit (a save with the id) and a removal show in the lists, and leave the trades.
  await act(async () => {
    await result.current.saveTarget.mutateAsync({
      id: targetId,
      rule: {
        accountId: 'acc-a',
        assetClass: 'future',
        symbols: ['ES'],
        target: { unit: 'movement', levels: [{ value: 10, pct: 100 }] },
      },
    });
  });
  await waitFor(() =>
    expect(result.current.targets.data![0]).toMatchObject({
      symbols: ['ES'],
    }),
  );
  // A save without a stop clears it from the rule.
  expect(result.current.targets.data![0]).not.toHaveProperty('stop');
  await act(async () => {
    await result.current.removeTarget.mutateAsync(targetId);
    await result.current.removeFee.mutateAsync(feeId);
  });
  await waitFor(() => expect(result.current.targets.data).toEqual([]));
  await waitFor(() => expect(result.current.fees.data).toEqual([]));
  expect(result.current.trades.data!.find((t) => t.id === 'f-1')!.fees).toBe(
    was + 340,
  );
});

test("a fill's costs refresh the trade and the history, and resolve to the trade", async () => {
  const sample = () => {
    const s = fixtureSample();
    s.trades.find((t) => t.id === 'f-1')!.executions = [
      fillOf('e1', 'buy', 6000, '2026-11-16T14:45:00.000Z'),
      fillOf('e2', 'sell', 6005, '2026-11-16T15:10:00.000Z'),
    ];
    return s;
  };
  const { result } = renderHook(
    () => ({
      trade: useTrade('f-1'),
      history: useHistory(),
      setCosts: useSetFillCosts(),
    }),
    { wrapper: wrapper(sample) },
  );
  await waitFor(() => expect(result.current.trade.data).toBeTruthy());
  await waitFor(() => expect(result.current.history.data).toEqual([]));
  const was = result.current.trade.data!;
  let saved: unknown;
  await act(async () => {
    saved = await result.current.setCosts.mutateAsync({
      tradeId: 'f-1',
      executionId: 'e2',
      costs: { commission: 350, fees: 120 },
    });
  });
  expect(saved).toMatchObject({ id: 'f-1', fees: was.fees + 470 });
  await waitFor(() =>
    expect(result.current.trade.data!.fees).toBe(was.fees + 470),
  );
  expect(result.current.trade.data!.net).toBe(was.net - 470);
  await waitFor(() =>
    expect(
      result.current.history.data?.map((r) => [
        r.entityId,
        r.field,
        r.source,
        r.oldValue,
        r.newValue,
      ]),
    ).toEqual([['f-1', 'fees', 'you', was.fees, was.fees + 470]]),
  );
});

test('usePatterns reads every trade of the workspace, archived accounts too, and follows the trades', async () => {
  const { result } = renderHook(
    () => ({
      patterns: usePatterns(),
      again: usePatterns(),
      remove: useRemoveTrades(),
    }),
    { wrapper: wrapper(patternSample) },
  );
  expect(result.current.patterns.status).toBe('pending');
  await waitFor(() => expect(result.current.patterns.data).toBeDefined());
  const hits = result.current.patterns.data!.byTrade.get('p-1');
  expect(hits?.map((h) => h.id)).toEqual(['added-to-position']);
  expect(hits?.[0]?.figures).toMatchObject({ entries: 2 });
  // The archived account's trade counts too, and a plain trade has none.
  expect(
    result.current.patterns.data!.byTrade.get('p-old')?.map((h) => h.id),
  ).toEqual(['added-to-position']);
  expect(result.current.patterns.data!.byTrade.has('p-plain')).toBe(false);
  expect(result.current.patterns.isSuccess).toBe(true);
  // One computation per change of the inputs, shared by every reader.
  expect(result.current.again.data).toBe(result.current.patterns.data);

  const before = result.current.patterns.data;
  await act(async () => {
    await result.current.remove.mutateAsync(['p-1']);
  });
  await waitFor(() =>
    expect(result.current.patterns.data?.byTrade.has('p-1')).toBe(false),
  );
  expect(result.current.patterns.data).not.toBe(before);
});

test('usePatterns(false) computes nothing and waits', async () => {
  const { result } = renderHook(
    () => ({ off: usePatterns(false), trades: useTrades() }),
    { wrapper: wrapper(patternSample) },
  );
  await waitFor(() => expect(result.current.trades.data).toHaveLength(3));
  expect(result.current.off.data).toBeUndefined();
  expect(result.current.off.status).toBe('pending');
});

test('kept versions list, restore and refresh the note and its list', async () => {
  const doc = (t: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
  });
  const { result } = renderHook(
    () => {
      const [id, setId] = useState<string | undefined>(undefined);
      return {
        setId,
        save: useSaveJournalEntry(),
        journal: useJournal(),
        versions: useNoteVersions(id),
        keep: useKeepVersion(),
        restore: useRestoreVersion(),
      };
    },
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.journal.isSuccess).toBe(true));
  // With no note id the list is idle, and nothing is read.
  expect(result.current.versions.fetchStatus).toBe('idle');

  let noteId = '';
  await act(async () => {
    noteId = (
      await result.current.save.mutateAsync({
        kind: 'note',
        title: 'T',
        body: doc('one'),
        linkedTradeIds: [],
        tags: [],
      })
    ).id;
  });
  act(() => result.current.setId(noteId));
  await waitFor(() => expect(result.current.versions.data).toEqual([]));

  // Keeping refreshes the list.
  await act(async () => {
    await result.current.keep.mutateAsync({
      noteId,
      body: doc('one'),
      kind: 'auto',
    });
  });
  await waitFor(() => expect(result.current.versions.data).toHaveLength(1));
  const version = result.current.versions.data![0]!;
  expect(version).toMatchObject({ noteId, kind: 'auto', body: doc('one') });

  // The note moves on, then a restore brings the version back: the journal
  // and the list both refresh, and a "before restore" version is there.
  await act(async () => {
    await result.current.save.mutateAsync({
      ...result.current.journal.data!.find((e) => e.id === noteId)!,
      body: doc('two'),
    });
  });
  await act(async () => {
    const restored = await result.current.restore.mutateAsync({
      noteId,
      versionId: version.id,
    });
    expect(restored.body).toEqual(doc('one'));
  });
  await waitFor(() =>
    expect(
      result.current.journal.data!.find((e) => e.id === noteId)!.body,
    ).toEqual(doc('one')),
  );
  await waitFor(() =>
    expect(result.current.versions.data!.map((v) => v.kind)).toEqual([
      'before-restore',
      'auto',
    ]),
  );
});

test('useChangeDashboards hands the updater the prefs as stored now, and writes what it returns', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <DataProvider repository={repository} queryClient={queryClient}>
      {children}
    </DataProvider>
  );
  const { result } = renderHook(
    () => ({ prefs: usePrefs(), change: useChangeDashboards() }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.prefs.data).toBeDefined());
  expect(result.current.prefs.data!.dashboards).toBeUndefined();

  // Another tab saved a template; this tab's cache has not heard of it yet.
  const other = { id: 'other', name: 'Other', upper: [], lower: [] };
  await repository.prefs.update({
    dashboards: { inUse: 'other', templates: [other] },
  });
  const seen = vi.fn();
  await act(async () => {
    await result.current.change.mutateAsync((current) => {
      seen(current.dashboards);
      return {
        inUse: 'other',
        templates: [...current.dashboards!.templates, { ...other, id: 'b' }],
      };
    });
  });
  expect(seen).toHaveBeenCalledWith({ inUse: 'other', templates: [other] });
  expect((await repository.prefs.get()).dashboards?.templates).toHaveLength(2);
  // The cache follows the write.
  await waitFor(() =>
    expect(result.current.prefs.data!.dashboards?.templates).toHaveLength(2),
  );
});

test('useChangeDashboards writes nothing when the updater throws, and rejects with its error', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <DataProvider
      repository={repository}
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false, staleTime: Infinity } },
        })
      }
    >
      {children}
    </DataProvider>
  );
  const { result } = renderHook(() => useChangeDashboards(), {
    wrapper: Wrapper,
  });
  class Refused extends Error {}
  let caught: unknown;
  await act(async () => {
    await result.current
      .mutateAsync(() => {
        throw new Refused();
      })
      .catch((e: unknown) => (caught = e));
  });
  expect(caught).toBeInstanceOf(Refused);
  expect((await repository.prefs.get()).dashboards).toBeUndefined();
});

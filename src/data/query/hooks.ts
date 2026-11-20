'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ImportContext, ImportPlan } from '@/domain/import/plan';
import type {
  Account,
  ImportJob,
  JournalEntry,
  Strategy,
  Tag,
  Trade,
  UserPrefs,
  Workspace,
} from '@/domain/types';
import type {
  AccountPatch,
  JournalDraft,
  NewAccount,
  NewStrategy,
  NewTag,
  Repository,
  StrategyPatch,
  TagPatch,
  UndoResult,
} from '../repository';
import type { TradePatch } from '../trade-patch';
import { USER_WORKSPACE } from '../workspaces';
import { keys, type WriteKind } from './keys';
import { activeWorkspaceQuery, useInvalidate, useRepository } from './provider';

// Reads

export function useWorkspaces(): UseQueryResult<Workspace[]> {
  const repo = useRepository();
  return useQuery({
    queryKey: keys.workspaces(),
    queryFn: () => repo.workspaces.list(),
  });
}

export function useActiveWorkspace(): UseQueryResult<Workspace> {
  const repo = useRepository();
  return useQuery(activeWorkspaceQuery(repo));
}

export function usePrefs(): UseQueryResult<UserPrefs> {
  const repo = useRepository();
  return useQuery({
    queryKey: keys.prefs(),
    queryFn: () => repo.prefs.get(),
  });
}

/** A query in the active workspace: idle until the workspace is known. */
function useWorkspaceQuery<T>(
  key: (ws: string) => readonly unknown[],
  read: (repo: Repository, ws: string) => Promise<T>,
  extra: { enabled?: boolean } = {},
): UseQueryResult<T> {
  const repo = useRepository();
  const ws = useActiveWorkspace().data?.id;
  return useQuery({
    queryKey: key(ws ?? ''),
    queryFn: () => read(repo, ws!),
    enabled: ws !== undefined && (extra.enabled ?? true),
  });
}

export function useAccounts(): UseQueryResult<Account[]> {
  return useWorkspaceQuery(keys.accounts, (r, ws) => r.accounts.list(ws));
}

export function useTrades(): UseQueryResult<Trade[]> {
  return useWorkspaceQuery(keys.trades, (r, ws) => r.trades.list(ws));
}

export function useTrade(id: string): UseQueryResult<Trade | null> {
  return useWorkspaceQuery(
    (ws) => keys.trade(ws, id),
    async (r, ws) => (await r.trades.get(ws, id)) ?? null,
  );
}

export function useStrategies(): UseQueryResult<Strategy[]> {
  return useWorkspaceQuery(keys.strategies, (r, ws) => r.strategies.list(ws));
}

export function useStrategy(id: string): UseQueryResult<Strategy | null> {
  return useWorkspaceQuery(
    (ws) => keys.strategy(ws, id),
    async (r, ws) => (await r.strategies.get(ws, id)) ?? null,
  );
}

export function useTags(): UseQueryResult<Tag[]> {
  return useWorkspaceQuery(keys.tags, (r, ws) => r.tags.list(ws));
}

export function useJournal(): UseQueryResult<JournalEntry[]> {
  return useWorkspaceQuery(keys.journal, (r, ws) => r.journal.list(ws));
}

export function useJournalEntry(
  id: string,
): UseQueryResult<JournalEntry | null> {
  return useWorkspaceQuery(
    (ws) => keys.journalEntry(ws, id),
    async (r, ws) => (await r.journal.get(ws, id)) ?? null,
  );
}

export function useJournalForTrade(
  tradeId: string,
): UseQueryResult<JournalEntry[]> {
  return useWorkspaceQuery(
    (ws) => keys.journalForTrade(ws, tradeId),
    (r, ws) => r.journal.listForTrade(ws, tradeId),
  );
}

/** Imports always live in My workspace, whichever workspace is showing. */
export function useImportHistory(): UseQueryResult<ImportJob[]> {
  const repo = useRepository();
  return useQuery({
    queryKey: keys.imports(USER_WORKSPACE.id),
    queryFn: () => repo.imports.list(USER_WORKSPACE.id),
  });
}

export function useImportContext(
  accountId: string | undefined,
): UseQueryResult<ImportContext> {
  const repo = useRepository();
  return useQuery({
    queryKey: keys.importContext(USER_WORKSPACE.id, accountId ?? ''),
    queryFn: () => repo.imports.context(USER_WORKSPACE.id, accountId!),
    enabled: accountId !== undefined,
    staleTime: 0,
  });
}

// Writes

/**
 * A write in the active workspace. The workspace is captured when the write is
 * called, and on success the keys it makes stale are invalidated, here and in
 * other tabs.
 */
function useWorkspaceWrite<TData, TVars>(
  kind: WriteKind,
  write: (repo: Repository, ws: string, vars: TVars) => Promise<TData>,
): UseMutationResult<TData, Error, TVars> {
  const repo = useRepository();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation<TData, Error, TVars>({
    mutationFn: async (vars) => {
      const ws = (await qc.ensureQueryData(activeWorkspaceQuery(repo))).id;
      const result = await write(repo, ws, vars);
      await invalidate(kind, ws);
      return result;
    },
  });
}

/** A write on user-level data or on a fixed workspace. */
function useFixedWrite<TData, TVars>(
  kind: WriteKind,
  ws: string,
  write: (repo: Repository, vars: TVars) => Promise<TData>,
): UseMutationResult<TData, Error, TVars> {
  const repo = useRepository();
  const invalidate = useInvalidate();
  return useMutation<TData, Error, TVars>({
    mutationFn: async (vars) => {
      const result = await write(repo, vars);
      await invalidate(kind, ws);
      return result;
    },
  });
}

export function useSetActiveWorkspace(): UseMutationResult<
  void,
  Error,
  string
> {
  return useFixedWrite('workspaces.setActive', '', (r, id: string) =>
    r.workspaces.setActive(id),
  );
}

export function useResetSampleWorkspace(): UseMutationResult<
  void,
  Error,
  void
> {
  return useFixedWrite('workspaces.resetSample', 'sample', (r) =>
    r.workspaces.resetSample(),
  );
}

export function useClearUserWorkspace(): UseMutationResult<void, Error, void> {
  return useFixedWrite('workspaces.clearUser', 'mine', (r) =>
    r.workspaces.clearUser(),
  );
}

export function useUpdatePrefs(): UseMutationResult<
  UserPrefs,
  Error,
  Partial<UserPrefs>
> {
  return useFixedWrite('prefs.update', '', (r, patch: Partial<UserPrefs>) =>
    r.prefs.update(patch),
  );
}

export function useCreateAccount(): UseMutationResult<
  Account,
  Error,
  NewAccount
> {
  return useWorkspaceWrite('accounts.create', (r, ws, v: NewAccount) =>
    r.accounts.create(ws, v),
  );
}

export function useUpdateAccount(): UseMutationResult<
  Account,
  Error,
  { id: string; patch: AccountPatch }
> {
  return useWorkspaceWrite(
    'accounts.update',
    (r, ws, v: { id: string; patch: AccountPatch }) =>
      r.accounts.update(ws, v.id, v.patch),
  );
}

export function useRemoveAccount(): UseMutationResult<void, Error, string> {
  return useWorkspaceWrite('accounts.remove', (r, ws, id: string) =>
    r.accounts.remove(ws, id),
  );
}

export function useUpdateTrade(): UseMutationResult<
  Trade,
  Error,
  { id: string; patch: TradePatch }
> {
  return useWorkspaceWrite(
    'trades.update',
    (r, ws, v: { id: string; patch: TradePatch }) =>
      r.trades.update(ws, v.id, v.patch),
  );
}

export function useRemoveTrades(): UseMutationResult<
  void,
  Error,
  readonly string[]
> {
  return useWorkspaceWrite('trades.remove', (r, ws, ids: readonly string[]) =>
    r.trades.remove(ws, ids),
  );
}

export function useCreateStrategy(): UseMutationResult<
  Strategy,
  Error,
  NewStrategy
> {
  return useWorkspaceWrite('strategies.create', (r, ws, v: NewStrategy) =>
    r.strategies.create(ws, v),
  );
}

export function useUpdateStrategy(): UseMutationResult<
  Strategy,
  Error,
  { id: string; patch: StrategyPatch }
> {
  return useWorkspaceWrite(
    'strategies.update',
    (r, ws, v: { id: string; patch: StrategyPatch }) =>
      r.strategies.update(ws, v.id, v.patch),
  );
}

export function useRemoveStrategy(): UseMutationResult<void, Error, string> {
  return useWorkspaceWrite('strategies.remove', (r, ws, id: string) =>
    r.strategies.remove(ws, id),
  );
}

export function useCreateTag(): UseMutationResult<Tag, Error, NewTag> {
  return useWorkspaceWrite('tags.create', (r, ws, v: NewTag) =>
    r.tags.create(ws, v),
  );
}

export function useUpdateTag(): UseMutationResult<
  Tag,
  Error,
  { id: string; patch: TagPatch }
> {
  return useWorkspaceWrite(
    'tags.update',
    (r, ws, v: { id: string; patch: TagPatch }) =>
      r.tags.update(ws, v.id, v.patch),
  );
}

export function useRemoveTag(): UseMutationResult<void, Error, string> {
  return useWorkspaceWrite('tags.remove', (r, ws, id: string) =>
    r.tags.remove(ws, id),
  );
}

export function useSaveJournalEntry(): UseMutationResult<
  JournalEntry,
  Error,
  JournalDraft
> {
  return useWorkspaceWrite('journal.save', (r, ws, v: JournalDraft) =>
    r.journal.save(ws, v),
  );
}

export function useRemoveJournalEntry(): UseMutationResult<
  void,
  Error,
  string
> {
  return useWorkspaceWrite('journal.remove', (r, ws, id: string) =>
    r.journal.remove(ws, id),
  );
}

/** Imports land in My workspace, which then becomes the active one. */
export function useCommitImport(): UseMutationResult<
  ImportJob,
  Error,
  ImportPlan
> {
  const repo = useRepository();
  const invalidate = useInvalidate();
  return useMutation<ImportJob, Error, ImportPlan>({
    mutationFn: async (plan) => {
      const job = await repo.imports.commit(USER_WORKSPACE.id, plan);
      await repo.workspaces.setActive(USER_WORKSPACE.id);
      await invalidate('imports.commit', USER_WORKSPACE.id);
      await invalidate('workspaces.setActive', USER_WORKSPACE.id);
      return job;
    },
  });
}

export function useUndoImport(): UseMutationResult<UndoResult, Error, string> {
  const repo = useRepository();
  const invalidate = useInvalidate();
  return useMutation<UndoResult, Error, string>({
    mutationFn: async (jobId) => {
      const result = await repo.imports.undo(USER_WORKSPACE.id, jobId);
      await invalidate('imports.undo', USER_WORKSPACE.id);
      return result;
    },
  });
}

'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ImportContext, ImportPlan } from '@/domain/import/plan';
import { useHydrated } from '@/lib/use-hydrated';
import type {
  Account,
  BreachReason,
  CashFlow,
  Cents,
  Challenge,
  CostMethod,
  DayRecord,
  DayShot,
  FrozenDay,
  ImportJob,
  JournalEntry,
  NoteFolder,
  NoteTemplate,
  PropTxn,
  Strategy,
  Tag,
  TagCategory,
  Tracker,
  TrackerVersion,
  Trade,
  UserPrefs,
  Workspace,
} from '@/domain/types';
import type {
  AccountPatch,
  CashFlowPatch,
  JournalDraft,
  ManualTradeInput,
  NewAccount,
  NewCashFlow,
  NewChallenge,
  NewPropTxn,
  ChallengePatch,
  PropTxnPatch,
  FirstRunInput,
  NewStrategy,
  NewTag,
  Repository,
  StrategyPatch,
  TagPatch,
  TemplateDraft,
  UndoResult,
} from '../repository';
import type { TradePatch } from '../trade-patch';
import { USER_WORKSPACE } from '../workspaces';
import { keys, type WriteKind } from './keys';
import { activeWorkspaceQuery, useInvalidate, useRepository } from './provider';

// Reads

/**
 * Every read answers "nothing loaded yet" while the page hydrates, as the
 * server's did. A part of the page can hydrate after the data is already in
 * the cache; if it showed that data in its first frame it would not match the
 * server's HTML (React keeps the server's attributes, so a chip would stay
 * disabled, or regenerates the tree). `useHydrated` is false while hydrating
 * and true from the next render, so the data appears one frame later.
 */
function useFirstFrame<T>(result: UseQueryResult<T>): UseQueryResult<T> {
  const hydrated = useHydrated();
  if (hydrated) return result;
  return {
    ...result,
    data: undefined,
    error: null,
    status: 'pending',
    isPending: true,
    isLoading: false,
    isSuccess: false,
    isError: false,
    isFetched: false,
    isFetchedAfterMount: false,
    isFetching: false,
    isRefetching: false,
    isStale: false,
    isPlaceholderData: false,
    isLoadingError: false,
    isRefetchError: false,
    failureCount: 0,
    failureReason: null,
    fetchStatus: 'idle',
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
  } as UseQueryResult<T>;
}

export function useWorkspaces(): UseQueryResult<Workspace[]> {
  const repo = useRepository();
  return useFirstFrame(
    useQuery({
      queryKey: keys.workspaces(),
      queryFn: () => repo.workspaces.list(),
    }),
  );
}

export function useActiveWorkspace(): UseQueryResult<Workspace> {
  const repo = useRepository();
  return useFirstFrame(useQuery(activeWorkspaceQuery(repo)));
}

export function usePrefs(): UseQueryResult<UserPrefs> {
  const repo = useRepository();
  return useFirstFrame(
    useQuery({
      queryKey: keys.prefs(),
      queryFn: () => repo.prefs.get(),
    }),
  );
}

/** The prefs the user has set, apart from the defaults they lie over. */
export function useSavedPrefs(): UseQueryResult<Partial<UserPrefs>> {
  const repo = useRepository();
  return useFirstFrame(
    useQuery({
      queryKey: keys.prefsSaved(),
      queryFn: () => repo.prefs.saved(),
    }),
  );
}

/** A query in the active workspace: idle until the workspace is known. */
function useWorkspaceQuery<T>(
  key: (ws: string) => readonly unknown[],
  read: (repo: Repository, ws: string) => Promise<T>,
  enabled = true,
): UseQueryResult<T> {
  const repo = useRepository();
  const ws = useActiveWorkspace().data?.id;
  return useFirstFrame(
    useQuery({
      queryKey: key(ws ?? ''),
      queryFn: () => read(repo, ws!),
      enabled: enabled && ws !== undefined,
    }),
  );
}

export function useAccounts(): UseQueryResult<Account[]> {
  return useWorkspaceQuery(keys.accounts, (r, ws) => r.accounts.list(ws));
}

/** The accounts of My workspace, whichever workspace is active: imports land only there. */
export function useUserAccounts(): UseQueryResult<Account[]> {
  const repo = useRepository();
  return useFirstFrame(
    useQuery({
      queryKey: keys.accounts(USER_WORKSPACE.id),
      queryFn: () => repo.accounts.list(USER_WORKSPACE.id),
    }),
  );
}

export function useCashFlows(): UseQueryResult<CashFlow[]> {
  return useWorkspaceQuery(keys.cashFlows, (r, ws) => r.cashFlows.list(ws));
}

export function useChallenges(): UseQueryResult<Challenge[]> {
  return useWorkspaceQuery(keys.challenges, (r, ws) => r.challenges.list(ws));
}

export function useTracker(): UseQueryResult<Tracker> {
  return useWorkspaceQuery(keys.tracker, (r, ws) => r.tracker.get(ws));
}

export function useDays(): UseQueryResult<DayRecord[]> {
  return useWorkspaceQuery(keys.days, (r, ws) => r.days.list(ws));
}

/** The day's screenshots, in upload order. */
export function useDayShots(date: string): UseQueryResult<DayShot[]> {
  return useWorkspaceQuery(
    (ws) => keys.dayShots(ws, date),
    (r, ws) => r.dayShots.list(ws, date),
  );
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

export function useTagCategories(): UseQueryResult<TagCategory[]> {
  return useWorkspaceQuery(keys.tagCategories, (r, ws) =>
    r.tagCategories.list(ws),
  );
}

export function useTemplates(): UseQueryResult<NoteTemplate[]> {
  return useWorkspaceQuery(keys.templates, (r, ws) => r.templates.list(ws));
}

/**
 * The journal, Trash included. Reading it purges what has waited in Trash for
 * 30 days, which unlinks the trade notes among them: when a cached trade still
 * points at a note that is gone, the trades are read again.
 */
export function useJournal(
  opts: { enabled?: boolean } = {},
): UseQueryResult<JournalEntry[]> {
  const queryClient = useQueryClient();
  return useWorkspaceQuery(
    keys.journal,
    async (r, ws) => {
      const entries = await r.journal.list(ws);
      const ids = new Set(entries.map((e) => e.id));
      const cached = queryClient.getQueryData<Trade[]>(keys.trades(ws));
      if (cached?.some((t) => t.noteId !== undefined && !ids.has(t.noteId))) {
        void queryClient.invalidateQueries({ queryKey: keys.trades(ws) });
        void queryClient.invalidateQueries({ queryKey: keys.imports(ws) });
      }
      return entries;
    },
    opts.enabled ?? true,
  );
}

export function useFolders(): UseQueryResult<NoteFolder[]> {
  return useWorkspaceQuery(keys.folders, (r, ws) => r.folders.list(ws));
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
  return useFirstFrame(
    useQuery({
      queryKey: keys.imports(USER_WORKSPACE.id),
      queryFn: () => repo.imports.list(USER_WORKSPACE.id),
    }),
  );
}

export function useImportContext(
  accountId: string | undefined,
): UseQueryResult<ImportContext> {
  const repo = useRepository();
  return useFirstFrame(
    useQuery({
      queryKey: keys.importContext(USER_WORKSPACE.id, accountId ?? ''),
      queryFn: () => repo.imports.context(USER_WORKSPACE.id, accountId!),
      enabled: accountId !== undefined,
      staleTime: 0,
    }),
  );
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
      // The write has landed. A refresh that fails after it must not read as a
      // failed write; the data refetches on its own next read.
      try {
        await invalidate(kind, ws);
      } catch {
        /* the write stands */
      }
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

/**
 * Rewrites the `dashboards` pref from what is stored now: `change` gets the
 * prefs read afresh at the write, so a template saved in another tab is not
 * overwritten by a list this tab has not refetched. `change` may throw to
 * refuse (nothing is written, and the write rejects with its error).
 */
export function useChangeDashboards(): UseMutationResult<
  UserPrefs,
  Error,
  (current: UserPrefs) => NonNullable<UserPrefs['dashboards']>
> {
  return useFixedWrite(
    'prefs.update',
    '',
    async (
      r,
      change: (current: UserPrefs) => NonNullable<UserPrefs['dashboards']>,
    ) => r.prefs.update({ dashboards: change(await r.prefs.get()) }),
  );
}

/** Forgets the saved value of each key, so it follows its default again. */
export function useUnsetPrefs(): UseMutationResult<
  UserPrefs,
  Error,
  readonly (keyof UserPrefs)[]
> {
  return useFixedWrite(
    'prefs.update',
    '',
    (r, keys: readonly (keyof UserPrefs)[]) => r.prefs.unset(keys),
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

/** An account in My workspace, where imports land, whichever workspace is active. */
export function useCreateUserAccount(): UseMutationResult<
  Account,
  Error,
  NewAccount
> {
  return useFixedWrite(
    'accounts.create',
    USER_WORKSPACE.id,
    (r, v: NewAccount) => r.accounts.create(USER_WORKSPACE.id, v),
  );
}

export function useUpdateUserAccount(): UseMutationResult<
  Account,
  Error,
  { id: string; patch: AccountPatch }
> {
  return useFixedWrite(
    'accounts.update',
    USER_WORKSPACE.id,
    (r, v: { id: string; patch: AccountPatch }) =>
      r.accounts.update(USER_WORKSPACE.id, v.id, v.patch),
  );
}

export function useRemoveAccount(): UseMutationResult<void, Error, string> {
  return useWorkspaceWrite('accounts.remove', (r, ws, id: string) =>
    r.accounts.remove(ws, id),
  );
}

/** Resolves to the number of trades removed. */
export function useClearAccountTrades(): UseMutationResult<
  number,
  Error,
  string
> {
  return useWorkspaceWrite('accounts.clearTrades', (r, ws, id: string) =>
    r.accounts.clearTrades(ws, id),
  );
}

export function useCreateCashFlow(): UseMutationResult<
  CashFlow,
  Error,
  NewCashFlow
> {
  return useWorkspaceWrite('cashFlows.create', (r, ws, v: NewCashFlow) =>
    r.cashFlows.create(ws, v),
  );
}

export function useUpdateCashFlow(): UseMutationResult<
  CashFlow,
  Error,
  { id: string; patch: CashFlowPatch }
> {
  return useWorkspaceWrite(
    'cashFlows.update',
    (r, ws, v: { id: string; patch: CashFlowPatch }) =>
      r.cashFlows.update(ws, v.id, v.patch),
  );
}

export function useRemoveCashFlow(): UseMutationResult<void, Error, string> {
  return useWorkspaceWrite('cashFlows.remove', (r, ws, id: string) =>
    r.cashFlows.remove(ws, id),
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

export function useUpdateTrades(): UseMutationResult<
  Trade[],
  Error,
  { ids: readonly string[]; patch: TradePatch | ((t: Trade) => TradePatch) }
> {
  return useWorkspaceWrite(
    'trades.updateMany',
    (
      r,
      ws,
      v: {
        ids: readonly string[];
        patch: TradePatch | ((t: Trade) => TradePatch);
      },
    ) => r.trades.updateMany(ws, v.ids, v.patch),
  );
}

export function useCreateManualTrade(): UseMutationResult<
  Trade,
  Error,
  ManualTradeInput
> {
  return useWorkspaceWrite(
    'trades.createManual',
    (r, ws, v: ManualTradeInput) => r.trades.createManual(ws, v),
  );
}

export function useReplaceManualTrade(): UseMutationResult<
  Trade,
  Error,
  { id: string; input: ManualTradeInput }
> {
  return useWorkspaceWrite(
    'trades.replaceManual',
    (r, ws, v: { id: string; input: ManualTradeInput }) =>
      r.trades.replaceManual(ws, v.id, v.input),
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

export function useCreateTagCategory(): UseMutationResult<
  TagCategory,
  Error,
  { name: string; color: string }
> {
  return useWorkspaceWrite(
    'tagCategories.create',
    (r, ws, v: { name: string; color: string }) =>
      r.tagCategories.create(ws, v),
  );
}

export function useUpdateTagCategory(): UseMutationResult<
  TagCategory,
  Error,
  { id: string; patch: { name?: string; color?: string } }
> {
  return useWorkspaceWrite(
    'tagCategories.update',
    (r, ws, v: { id: string; patch: { name?: string; color?: string } }) =>
      r.tagCategories.update(ws, v.id, v.patch),
  );
}

export function useRemoveTagCategory(): UseMutationResult<void, Error, string> {
  return useWorkspaceWrite('tagCategories.remove', (r, ws, id: string) =>
    r.tagCategories.remove(ws, id),
  );
}

export function useSaveTemplate(): UseMutationResult<
  NoteTemplate,
  Error,
  TemplateDraft
> {
  return useWorkspaceWrite('templates.save', (r, ws, v: TemplateDraft) =>
    r.templates.save(ws, v),
  );
}

export function useRemoveTemplate(): UseMutationResult<void, Error, string> {
  return useWorkspaceWrite('templates.remove', (r, ws, id: string) =>
    r.templates.remove(ws, id),
  );
}

export function useSetDefaultTemplate(): UseMutationResult<
  void,
  Error,
  string
> {
  return useWorkspaceWrite('templates.setDefault', (r, ws, id: string) =>
    r.templates.setDefault(ws, id),
  );
}

export function useCreateFolder(): UseMutationResult<
  NoteFolder,
  Error,
  string
> {
  return useWorkspaceWrite('folders.create', (r, ws, name: string) =>
    r.folders.create(ws, name),
  );
}

export function useRenameFolder(): UseMutationResult<
  NoteFolder,
  Error,
  { id: string; name: string }
> {
  return useWorkspaceWrite(
    'folders.rename',
    (r, ws, v: { id: string; name: string }) =>
      r.folders.rename(ws, v.id, v.name),
  );
}

/** Its notes move to no folder. */
export function useRemoveFolder(): UseMutationResult<void, Error, string> {
  return useWorkspaceWrite('folders.remove', (r, ws, id: string) =>
    r.folders.remove(ws, id),
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

export function useTrashJournalEntry(): UseMutationResult<void, Error, string> {
  return useWorkspaceWrite('journal.trash', (r, ws, id: string) =>
    r.journal.trash(ws, id),
  );
}

export function useRestoreJournalEntry(): UseMutationResult<
  void,
  Error,
  string
> {
  return useWorkspaceWrite('journal.restore', (r, ws, id: string) =>
    r.journal.restore(ws, id),
  );
}

/** Takes the trade id; resolves to its note, created and linked on first use. */
export function useEnsureTradeNote(): UseMutationResult<
  JournalEntry,
  Error,
  string
> {
  return useWorkspaceWrite(
    'journal.ensureTradeNote',
    (r, ws, tradeId: string) => r.journal.ensureTradeNote(ws, tradeId),
  );
}

/** Takes a YYYY-MM-DD date; resolves to that day's note, created from the default daily template when missing. */
export function useDailyNote(): UseMutationResult<JournalEntry, Error, string> {
  return useWorkspaceWrite('journal.dailyNote', (r, ws, date: string) =>
    r.journal.dailyNote(ws, date),
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
      // The commit has landed: refresh the caches even if switching fails.
      try {
        await repo.workspaces.setActive(USER_WORKSPACE.id);
      } finally {
        await invalidate('imports.commit', USER_WORKSPACE.id);
        await invalidate('workspaces.setActive', USER_WORKSPACE.id);
      }
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

export function useCreateChallenge(): UseMutationResult<
  Challenge,
  Error,
  NewChallenge
> {
  return useWorkspaceWrite('challenges.create', (r, ws, v: NewChallenge) =>
    r.challenges.create(ws, v),
  );
}

export function useUpdateChallenge(): UseMutationResult<
  Challenge,
  Error,
  { id: string; patch: ChallengePatch }
> {
  return useWorkspaceWrite(
    'challenges.update',
    (r, ws, v: { id: string; patch: ChallengePatch }) =>
      r.challenges.update(ws, v.id, v.patch),
  );
}

export function useRemoveChallenge(): UseMutationResult<void, Error, string> {
  return useWorkspaceWrite('challenges.remove', (r, ws, id: string) =>
    r.challenges.remove(ws, id),
  );
}

// The daily routine. A variable is the repo method's arguments after `ws`.

type Rating = 1 | 2 | 3 | 4 | 5 | undefined;

export function useSaveTracker(): UseMutationResult<
  Tracker,
  Error,
  { rules: Omit<TrackerVersion, 'from'> }
> {
  return useWorkspaceWrite(
    'tracker.save',
    (r, ws, v: { rules: Omit<TrackerVersion, 'from'> }) =>
      r.tracker.save(ws, v.rules),
  );
}

export function useResetTracker(): UseMutationResult<Tracker, Error, void> {
  return useWorkspaceWrite('tracker.reset', (r, ws) => r.tracker.reset(ws));
}

export function useStartSession(): UseMutationResult<
  DayRecord,
  Error,
  { date: string }
> {
  return useWorkspaceWrite('days.write', (r, ws, v: { date: string }) =>
    r.days.startSession(ws, v.date),
  );
}

export function useEndSession(): UseMutationResult<
  DayRecord,
  Error,
  { date: string }
> {
  return useWorkspaceWrite('days.write', (r, ws, v: { date: string }) =>
    r.days.endSession(ws, v.date),
  );
}

export function useSetTick(): UseMutationResult<
  DayRecord,
  Error,
  { date: string; ruleId: string; ticked: boolean }
> {
  return useWorkspaceWrite(
    'days.write',
    (r, ws, v: { date: string; ruleId: string; ticked: boolean }) =>
      r.days.setTick(ws, v.date, v.ruleId, v.ticked),
  );
}

export function useSetRating(): UseMutationResult<
  DayRecord,
  Error,
  { date: string; rating: Rating }
> {
  return useWorkspaceWrite(
    'days.write',
    (r, ws, v: { date: string; rating: Rating }) =>
      r.days.setRating(ws, v.date, v.rating),
  );
}

export function useSetMood(): UseMutationResult<
  DayRecord,
  Error,
  { date: string; mood: DayRecord['mood'] }
> {
  return useWorkspaceWrite(
    'days.write',
    (r, ws, v: { date: string; mood: DayRecord['mood'] }) =>
      r.days.setMood(ws, v.date, v.mood),
  );
}

export function useFinishDay(): UseMutationResult<
  DayRecord,
  Error,
  { date: string; frozen: FrozenDay }
> {
  return useWorkspaceWrite(
    'days.finish',
    (r, ws, v: { date: string; frozen: FrozenDay }) =>
      r.days.finish(ws, v.date, v.frozen),
  );
}

export function useAddDayShot(): UseMutationResult<
  DayShot,
  Error,
  { date: string; file: { bytes: ArrayBuffer; type: string; name: string } }
> {
  return useWorkspaceWrite(
    'dayShots.add',
    (
      r,
      ws,
      v: {
        date: string;
        file: { bytes: ArrayBuffer; type: string; name: string };
      },
    ) => r.dayShots.add(ws, v.date, v.file),
  );
}

export function useRemoveDayShot(): UseMutationResult<
  void,
  Error,
  { id: string }
> {
  return useWorkspaceWrite('dayShots.remove', (r, ws, v: { id: string }) =>
    r.dayShots.remove(ws, v.id),
  );
}

/** The first run's one write (K47, K55): prefs, My account, and My workspace active. */
export function useCompleteFirstRun(): UseMutationResult<
  void,
  Error,
  FirstRunInput
> {
  return useFixedWrite('onboarding.complete', '', (r, input: FirstRunInput) =>
    r.onboarding.complete(input),
  );
}

// Plan 6C: the prop money ledger, breaches and the cost method.

export function usePropTxns(): UseQueryResult<PropTxn[]> {
  return useWorkspaceQuery(keys.propTxns, (r, ws) => r.propTxns.list(ws));
}

export function useAddPropTxn(): UseMutationResult<PropTxn, Error, NewPropTxn> {
  return useWorkspaceWrite('propTxns.add', (r, ws, v: NewPropTxn) =>
    r.propTxns.add(ws, v),
  );
}

export function useUpdatePropTxn(): UseMutationResult<
  PropTxn,
  Error,
  { id: string; patch: PropTxnPatch }
> {
  return useWorkspaceWrite(
    'propTxns.update',
    (r, ws, v: { id: string; patch: PropTxnPatch }) =>
      r.propTxns.update(ws, v.id, v.patch),
  );
}

/** For good; the row cannot be undone. */
export function useRemovePropTxn(): UseMutationResult<void, Error, string> {
  return useWorkspaceWrite('propTxns.remove', (r, ws, id: string) =>
    r.propTxns.remove(ws, id),
  );
}

/**
 * Log a payout (C29): a payout row linked to the funded challenge, in its
 * firm, for a positive amount, not yet reviewed. It counts in total earned at
 * once. It writes no withdrawal. The repository's rule: rejects with
 * PayoutRefusedError for a challenge not in its funded phase or breached,
 * RangeError for an amount that is not income, NotFoundError for a challenge
 * that is not there.
 */
export function useLogPayout(): UseMutationResult<
  PropTxn,
  Error,
  { challengeId: string; amount: Cents; date: string; description?: string }
> {
  return useWorkspaceWrite(
    'propTxns.add',
    (
      r,
      ws,
      v: {
        challengeId: string;
        amount: Cents;
        date: string;
        description?: string;
      },
    ) => r.propTxns.logPayout(ws, v),
  );
}

/** A breach is permanent. Rejects with ChallengeBreachedError for a challenge already breached. */
export function useMarkBreached(): UseMutationResult<
  Challenge,
  Error,
  { id: string; reason: BreachReason; note?: string; on: string }
> {
  return useWorkspaceWrite(
    'challenges.markBreached',
    (
      r,
      ws,
      v: { id: string; reason: BreachReason; note?: string; on: string },
    ) =>
      r.challenges.markBreached(ws, v.id, {
        reason: v.reason,
        ...(v.note !== undefined && { note: v.note }),
        on: v.on,
      }),
  );
}

/** Rebuilds the account's trades under the method, in one transaction (C40). */
export function useSetCostMethod(): UseMutationResult<
  Account,
  Error,
  { id: string; method: CostMethod }
> {
  return useWorkspaceWrite(
    'accounts.setCostMethod',
    (r, ws, v: { id: string; method: CostMethod }) =>
      r.accounts.setCostMethod(ws, v.id, v.method),
  );
}

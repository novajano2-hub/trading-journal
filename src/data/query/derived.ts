'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ImportMapping } from '@/domain/import/mapping';
import type { ParsedCsv } from '@/domain/import/csv';
import { planImport, type ImportPlan } from '@/domain/import/plan';
import type { Account, Trade } from '@/domain/types';
import { localDate } from '@/domain/time';
import {
  applyFilters,
  mergeFilterParams,
  parseFilters,
  sanitizeFilters,
  selectedAccounts,
  serializeFilters,
  type GlobalFilters,
} from '../filters';
import {
  metricContextOf,
  metricsByCurrency,
  type CurrencyMetrics,
} from '../metrics';
import {
  useAccounts,
  useImportContext,
  usePrefs,
  useStrategies,
  useTags,
  useTrades,
} from './hooks';

export interface Derived<T> {
  status: 'pending' | 'error' | 'success';
  error: Error | null;
  data: T | undefined;
}

interface QueryState {
  status: 'pending' | 'error' | 'success';
  error: Error | null;
}

/** Any failure wins, then any wait; success only when every query has data. */
function combine(queries: readonly QueryState[]): QueryState {
  const failed = queries.find((q) => q.status === 'error');
  if (failed) return { status: 'error', error: failed.error };
  if (queries.some((q) => q.status === 'pending'))
    return { status: 'pending', error: null };
  return { status: 'success', error: null };
}

function sanitizeAgainst(
  filters: GlobalFilters,
  accounts: readonly Account[],
  strategies: readonly { id: string }[],
  tags: readonly { id: string }[],
): GlobalFilters {
  return sanitizeFilters(filters, {
    accountIds: new Set(accounts.map((a) => a.id)),
    strategyIds: new Set(strategies.map((s) => s.id)),
    tagIds: new Set(tags.map((t) => t.id)),
  });
}

/**
 * The global filters, kept in the URL. Callers sit inside `<Suspense>` (Plan 4):
 * `useSearchParams` makes a prerendered route client-render up to the nearest boundary.
 *
 * Once the workspace's accounts, strategies and tags have loaded, ids that don't exist
 * there (a shared link, another workspace, a deleted entity) are dropped, and the cleaned
 * query string is written back with `history.replaceState`. Next syncs native
 * `replaceState` calls into `useSearchParams`, and replacing keeps the bad link out of
 * the back stack.
 */
export function useGlobalFilters(): {
  filters: GlobalFilters;
  setFilters(next: GlobalFilters): void;
} {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const accounts = useAccounts().data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const search = searchParams.toString();

  const raw = useMemo(
    () => parseFilters(new URLSearchParams(search)),
    [search],
  );
  const filters = useMemo(
    () =>
      accounts && strategies && tags
        ? sanitizeAgainst(raw, accounts, strategies, tags)
        : raw,
    [raw, accounts, strategies, tags],
  );

  const write = useCallback(
    (next: GlobalFilters) => {
      const qs = mergeFilterParams(
        new URLSearchParams(window.location.search),
        next,
      ).toString();
      window.history.replaceState(null, '', pathname + (qs ? '?' + qs : ''));
    },
    [pathname],
  );

  const dirty =
    serializeFilters(raw).toString() !== serializeFilters(filters).toString();
  useEffect(() => {
    if (dirty) write(filters);
  }, [dirty, filters, write]);

  return { filters, setFilters: write };
}

export interface TradeSet {
  /** Sanitised against the workspace. */
  filters: GlobalFilters;
  trades: Trade[];
  /** The selected accounts. */
  accounts: Account[];
}

export function useTradeSet(filters: GlobalFilters): Derived<TradeSet> {
  const trades = useTrades();
  const accounts = useAccounts();
  const strategies = useStrategies();
  const tags = useTags();
  const prefs = usePrefs();
  const state = combine([trades, accounts, strategies, tags, prefs]);

  const filterKey = serializeFilters(filters).toString();
  const timeZone = prefs.data?.timeZone;
  const today =
    timeZone === undefined
      ? undefined
      : localDate(new Date().toISOString(), timeZone);

  const data = useMemo(() => {
    if (
      !trades.data ||
      !accounts.data ||
      !strategies.data ||
      !tags.data ||
      timeZone === undefined ||
      today === undefined
    )
      return undefined;
    const clean = sanitizeAgainst(
      parseFilters(new URLSearchParams(filterKey)),
      accounts.data,
      strategies.data,
      tags.data,
    );
    return {
      filters: clean,
      trades: applyFilters(trades.data, clean, {
        timeZone,
        today,
        accounts: accounts.data,
      }),
      accounts: selectedAccounts(accounts.data, clean),
    };
  }, [
    trades.data,
    accounts.data,
    strategies.data,
    tags.data,
    timeZone,
    today,
    filterKey,
  ]);

  return { ...state, data: state.status === 'success' ? data : undefined };
}

export function useMetrics(filters: GlobalFilters): Derived<CurrencyMetrics[]> {
  const set = useTradeSet(filters);
  const prefs = usePrefs().data;
  const data = useMemo(
    () =>
      set.data && prefs
        ? metricsByCurrency(set.data.trades, {
            accounts: set.data.accounts,
            ctx: metricContextOf(prefs),
            baseCurrency: prefs.baseCurrency,
          })
        : undefined,
    [set.data, prefs],
  );
  return { status: set.status, error: set.error, data };
}

export interface ImportInput {
  parsed: ParsedCsv;
  mapping: ImportMapping;
  accountId: string;
  fileName: string;
}

/** Who a plan is: its id and time, and the input and import revision they were made for. */
interface PlanIdentity {
  input: ImportInput | null;
  revision: number | undefined;
  importId: string;
  now: string;
}

function newPlanIdentity(
  input: ImportInput | null,
  revision: number | undefined,
): PlanIdentity {
  return {
    input,
    revision,
    importId: crypto.randomUUID(),
    now: new Date().toISOString(),
  };
}

/**
 * The plan for a file. Its id and time hold while the `input` object and the
 * workspace's import revision stay the same, so re-renders and refetches keep
 * one plan identity. A new input, or an import committed or undone since,
 * makes a new plan with a new id: a commit never reuses an id in the history.
 * Keep `input` one object while the file and mapping are unchanged (state or a
 * memo): a new object on every render would re-plan without end.
 */
export function useImportPlan(input: ImportInput | null): Derived<ImportPlan> {
  const context = useImportContext(input?.accountId);
  const revision = context.data?.importRevision;
  const [identity, setIdentity] = useState(() =>
    newPlanIdentity(input, revision),
  );
  // Adjusting state while rendering: React re-renders at once with the new identity.
  const current = identity.input === input && identity.revision === revision;
  if (!current) setIdentity(newPlanIdentity(input, revision));
  const data = useMemo(
    () =>
      current && input && context.data
        ? planImport(input.parsed, input.mapping, context.data, {
            importId: identity.importId,
            now: identity.now,
            fileName: input.fileName,
          })
        : undefined,
    [current, input, context.data, identity],
  );
  return {
    status: context.status,
    error: context.error,
    data,
  };
}

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
  queryString,
  resolveRange,
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

/**
 * A value computed from several queries, with one status for all of them:
 * - `error` as soon as any query has failed, even while others still load;
 *   `error` is that failure. A failure always wins.
 * - `pending` while no query has failed and any has no data yet.
 * - `success` once every query has data. `data` is defined only then.
 */
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
 * The global filters, kept in the URL.
 *
 * Every component that calls this needs a `<Suspense>` boundary above it
 * (Plan 4): `useSearchParams` makes a prerendered route client-render up to
 * the nearest boundary.
 *
 * Once the workspace's accounts, strategies and tags have loaded, ids that don't exist
 * there (a shared link, another workspace, a deleted entity) are dropped, and the cleaned
 * query string is written back with `history.replaceState`. Next syncs native
 * `replaceState` calls into `useSearchParams`, and replacing keeps the bad link out of
 * the back stack. Until those lists load, `filters` is the URL as written, so filter
 * chips should read the cleaned set from `useTradeSet(filters).data.filters`.
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

  // Writes go to the address bar's own pathname: the one this render holds
  // can be a page behind a navigation that has landed since (E54).
  const write = useCallback((next: GlobalFilters) => {
    const qs = queryString(
      mergeFilterParams(new URLSearchParams(window.location.search), next),
    );
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (qs ? '?' + qs : ''),
    );
  }, []);

  const dirty =
    serializeFilters(raw).toString() !== serializeFilters(filters).toString();
  useEffect(() => {
    // While the address bar and this render disagree on the page, a navigation
    // is landing: a write now would put the cleaned filters on the wrong page.
    if (dirty && pathname === window.location.pathname) write(filters);
  }, [dirty, filters, write, pathname]);

  return { filters, setFilters: write };
}

export interface TradeSet {
  /** The filters as applied: cleaned of ids the workspace doesn't have. Chips read these. */
  filters: GlobalFilters;
  trades: Trade[];
  /** The selected accounts: the active ones when no account is filtered. */
  accounts: Account[];
}

/**
 * The active workspace's trades that pass `filters` (pass
 * `useGlobalFilters().filters`; that hook's caller needs the `<Suspense>`
 * boundary). Status follows `Derived`: trades, accounts, strategies, tags and
 * prefs must all load, and a failure in any of them wins.
 *
 * - The filters are cleaned before they apply: ids that aren't in the
 *   workspace are dropped, and `data.filters` is that cleaned set.
 * - With no account filter only active accounts count; an archived account
 *   counts only when it is selected.
 * - A date range matches a trade's day: the local date of `closedAt`, or of
 *   `openedAt` while it is open, in the prefs timezone (`today` too). That
 *   picks the trades for the log, win rate and profit factor. Day figures
 *   (calendar, daily bars, day stats, goals) take instead the exits dated
 *   inside the range (`MetricContext.range`), so a trade held over several
 *   days books each exit on its own day and only those in the range.
 */
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
        breakevenRange: prefs.data?.breakevenRange,
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
    prefs.data?.breakevenRange,
  ]);

  return { ...state, data: state.status === 'success' ? data : undefined };
}

/**
 * Metrics for `useTradeSet(filters)`, one bundle per P&L currency, never
 * mixed. The prefs' base currency comes first and is always present (empty
 * when no trade is in it); other currencies follow in code order. Status,
 * filters and the day rule are `useTradeSet`'s.
 */
export function useMetrics(filters: GlobalFilters): Derived<CurrencyMetrics[]> {
  const set = useTradeSet(filters);
  const prefs = usePrefs().data;
  const data = useMemo(
    () =>
      set.data && prefs
        ? metricsByCurrency(set.data.trades, {
            accounts: set.data.accounts,
            // Day figures count only the exits dated inside the date range.
            ctx: {
              ...metricContextOf(prefs),
              range: resolveRange(
                set.data.filters.range,
                localDate(new Date().toISOString(), prefs.timeZone),
              ),
            },
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

/** Inputs are the same file and mapping when their fields are: the object may be rebuilt every render. */
function sameInput(a: ImportInput | null, b: ImportInput | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.parsed === b.parsed &&
    a.mapping === b.mapping &&
    a.accountId === b.accountId &&
    a.fileName === b.fileName
  );
}

/**
 * The plan for a file. Its id and time hold while the input's fields (`parsed`,
 * `mapping`, `accountId`, `fileName`, compared by reference, so an inline
 * object is fine) and the workspace's import revision stay the same, so
 * re-renders and refetches keep one plan identity. A new input, or an import
 * committed or undone since, makes a new plan with a new id: a commit never
 * reuses an id in the history. Keep `parsed` and `mapping` stable (state or a
 * memo) while the file and mapping are unchanged.
 *
 * The plan is made from the stored identity's input, and the status stays
 * `pending` until that identity matches the current input and revision, so no
 * render pass reports `success` without data or with a plan for an old input.
 */
export function useImportPlan(input: ImportInput | null): Derived<ImportPlan> {
  const context = useImportContext(input?.accountId);
  const revision = context.data?.importRevision;
  const [identity, setIdentity] = useState(() =>
    newPlanIdentity(input, revision),
  );
  // Adjusting state while rendering: React re-renders at once with the new identity.
  const current =
    sameInput(identity.input, input) && identity.revision === revision;
  if (!current) setIdentity(newPlanIdentity(input, revision));
  const planInput = identity.input;
  const data = useMemo(
    () =>
      current && planInput && context.data
        ? planImport(planInput.parsed, planInput.mapping, context.data, {
            importId: identity.importId,
            now: identity.now,
            fileName: planInput.fileName,
          })
        : undefined,
    [current, planInput, context.data, identity],
  );
  // A failure wins even before the identity catches up.
  const state =
    current || context.status === 'error'
      ? context
      : { status: 'pending' as const, error: null };
  return {
    status: state.status === 'success' && !data ? 'pending' : state.status,
    error: state.error,
    data,
  };
}

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
  narrowToUnit,
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
import { routineNow, routineToday } from '@/domain/tracker/defaults';
import {
  msToLocalMidnight,
  routineCurrency,
  scoreHistory,
  type ScoreHistory,
} from '../routine';
import {
  useAccounts,
  useActiveWorkspace,
  useCashFlows,
  useDays,
  useImportContext,
  usePatterns,
  usePrefs,
  useStrategies,
  useTags,
  useTracker,
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
  /** The trades the filters match that the display unit reads. */
  trades: Trade[];
  /** The same filters except the date, narrowed the same way: what the day figures are built from. */
  dayTrades: Trade[];
  /** The selected accounts: the active ones when no account is filtered. */
  accounts: Account[];
  /** The trades the filters matched that the display unit leaves out (R, ticks, pips, points); 0 otherwise. */
  unitLeftOut: number;
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
 *   (calendar, daily bars, day stats) take instead the exits dated
 *   inside the range (`MetricContext.range`), so a trade held over several
 *   days books each exit on its own day and only those in the range. They
 *   are built from `dayTrades` (every filter but the date), so an exit in the
 *   range counts even when its trade is matched outside it.
 * - The display unit narrows both sets (Part 2, U1): Ticks and Points keep the
 *   futures trades, Pips the forex trades, R those with an initial risk.
 *   `unitLeftOut` counts the matched trades it drops.
 * - A Patterns pick reads where the patterns fired over all the workspace's
 *   trades (`usePatterns`), and only then waits for them; without a pick
 *   nothing computes them.
 */
export function useTradeSet(filters: GlobalFilters): Derived<TradeSet> {
  const trades = useTrades();
  const accounts = useAccounts();
  const strategies = useStrategies();
  const tags = useTags();
  const prefs = usePrefs();
  const wantsPatterns = filters.patterns.length > 0;
  const patterns = usePatterns(wantsPatterns);
  const state = combine([
    trades,
    accounts,
    strategies,
    tags,
    prefs,
    ...(wantsPatterns ? [patterns] : []),
  ]);

  const filterKey = serializeFilters(filters).toString();
  const timeZone = prefs.data?.timeZone;
  const unit = prefs.data?.displayUnit ?? 'dollar';
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
    const env = {
      timeZone,
      today,
      accounts: accounts.data,
      breakevenRange: prefs.data?.breakevenRange,
      pnlBasis: prefs.data?.pnlBasis,
      weekStart: prefs.data?.weekStart,
      patterns: patterns.data,
    };
    const matched = applyFilters(trades.data, clean, env);
    const kept = narrowToUnit(matched, unit);
    const dayMatched = applyFilters(trades.data, { ...clean, range: {} }, env);
    return {
      filters: clean,
      trades: kept,
      dayTrades: narrowToUnit(dayMatched, unit),
      accounts: selectedAccounts(accounts.data, clean),
      unitLeftOut: matched.length - kept.length,
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
    prefs.data?.pnlBasis,
    prefs.data?.weekStart,
    patterns.data,
    unit,
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
  const flows = useCashFlows();
  const everyTrade = useTrades().data;
  const state = combine([set, flows]);
  const data = useMemo(
    () =>
      set.data && prefs && flows.data
        ? metricsByCurrency(set.data.trades, {
            dayTrades: set.data.dayTrades,
            accounts: set.data.accounts,
            flows: flows.data,
            balanceTrades: everyTrade,
            // Day figures count only the exits dated inside the date range.
            ctx: {
              ...metricContextOf(prefs),
              range: resolveRange(
                set.data.filters.range,
                localDate(new Date().toISOString(), prefs.timeZone),
                prefs.weekStart,
              ),
            },
            baseCurrency: prefs.baseCurrency,
          })
        : undefined,
    [set.data, prefs, flows.data, everyTrade],
  );
  return { ...state, data: state.status === 'success' ? data : undefined };
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

/**
 * The clock for the routine's today. A one-shot timer re-reads it at the next
 * local midnight, so the date rolls over while the page is open.
 */
function useRoutineClock(timeZone: string | undefined): [string, () => void] {
  const [now, setNow] = useState(() => new Date().toISOString());
  const refresh = useCallback(() => setNow(new Date().toISOString()), []);
  useEffect(() => {
    if (timeZone === undefined) return;
    const id = setTimeout(refresh, msToLocalMidnight(now, timeZone) + 100);
    return () => clearTimeout(id);
  }, [now, timeZone, refresh]);
  return [now, refresh];
}

/** The routine's today (K23): the sample's fixed date, else the local date in the profile zone. */
export function useRoutineToday(): string | undefined {
  const tracker = useTracker().data;
  const timeZone = usePrefs().data?.timeZone;
  const [now] = useRoutineClock(timeZone);
  return useMemo(
    () =>
      tracker && timeZone !== undefined
        ? routineToday(tracker, now, timeZone)
        : undefined,
    [tracker, timeZone, now],
  );
}

/**
 * Every day's score from the tracker's start to the routine's today. It
 * follows only the global account selection (K14): no other filter applies.
 * Call it under a `<Suspense>` boundary, as `useGlobalFilters` needs.
 */
export function useDayScores(): Derived<ScoreHistory> {
  const { filters } = useGlobalFilters();
  const tracker = useTracker();
  const days = useDays();
  const trades = useTrades();
  const accounts = useAccounts();
  const flows = useCashFlows();
  const prefs = usePrefs();
  const workspace = useActiveWorkspace();
  const state = combine([
    tracker,
    days,
    trades,
    accounts,
    flows,
    prefs,
    workspace,
  ]);
  const selection = filters.accountIds.join(',');
  const timeZone = prefs.data?.timeZone;
  const baseCurrency =
    prefs.data && workspace.data
      ? routineCurrency(workspace.data.id, prefs.data.baseCurrency)
      : undefined;

  const [now, refresh] = useRoutineClock(timeZone);

  const data = useMemo(() => {
    if (
      !tracker.data ||
      !days.data ||
      !trades.data ||
      !accounts.data ||
      !flows.data ||
      timeZone === undefined ||
      baseCurrency === undefined
    )
      return undefined;
    return scoreHistory(
      tracker.data,
      days.data,
      trades.data,
      accounts.data,
      flows.data,
      {
        timeZone,
        baseCurrency,
        now: routineNow(tracker.data, now, timeZone),
        today: routineToday(tracker.data, now, timeZone),
        ...(selection ? { accountIds: selection.split(',') } : {}),
      },
    );
  }, [
    tracker.data,
    days.data,
    trades.data,
    accounts.data,
    flows.data,
    timeZone,
    baseCurrency,
    selection,
    now,
  ]);

  // R8: only while today's score is live (scored, not finished), re-read the
  // clock each minute, so a missed start time turns failed while the page is open.
  const todayScore = data?.scoreOn(data.today);
  const live =
    todayScore !== undefined &&
    todayScore.unscored === undefined &&
    !todayScore.finished;
  useEffect(() => {
    if (!live) return;
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [live, refresh]);

  return { ...state, data: state.status === 'success' ? data : undefined };
}

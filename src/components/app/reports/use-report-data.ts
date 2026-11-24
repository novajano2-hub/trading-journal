'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { pickPartition } from '@/data/dashboard';
import { EMPTY_FILTERS, resolveRange } from '@/data/filters';
import { metricContextOf, type CurrencyMetrics } from '@/data/metrics';
import {
  useGlobalFilters,
  useMetrics,
  useTradeSet,
} from '@/data/query/derived';
import {
  useAccounts,
  useCashFlows,
  usePrefs,
  useTrades,
} from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import type { MetricContext } from '@/domain/metrics/context';
import { isTradeUnit, type TradeUnit } from '@/domain/metrics/units';
import { localDate } from '@/domain/time';
import type { PnlBasis } from '@/domain/types';
import { pctBaseOf, type FigureSource } from '@/lib/display';
import { rangeCaption } from '@/lib/range-label';
import { hasActiveFilters } from '../filter-model';

/** What every report is built from: one currency's metrics and the context that reads them. */
export interface ReportData {
  partition: CurrencyMetrics;
  currency: string;
  /** Currencies that have closed trades, to switch between. */
  currencies: string[];
  setCurrency(currency: string): void;
  /** The prefs' context, with the date range: day figures take only the exits inside it. */
  ctx: MetricContext;
  basis: PnlBasis;
  today: string;
  /** The range in words, e.g. "all time", "1-20 Nov". */
  caption: string;
  /** What the display units read: the trades behind the figures, the context and the percentage's base. */
  source: FigureSource;
}

export type ReportState =
  | { state: 'loading' }
  | { state: 'error'; error: Error; retry(): void }
  | {
      state: 'empty';
      variant: 'no-trades' | 'no-closed';
      filtered: boolean;
      /** The display unit, when it left out trades the filters matched. */
      unit?: TradeUnit;
      clearFilters(): void;
    }
  | { state: 'ready'; data: ReportData };

/** Writes one parameter, keeping the others (the filters). */
export function writeParam(key: string, value: string | null): void {
  const params = new URLSearchParams(window.location.search);
  if (value === null) params.delete(key);
  else params.set(key, value);
  const qs = params.toString();
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (qs ? `?${qs}` : ''),
  );
}

/**
 * The URL's filters turned into one currency's metrics, with the loading, error
 * and empty states every report shares. Trade-level figures read
 * `partition.trades`; day-level ones read `partition.dayTrades` with `ctx.range`.
 * Render inside `<Suspense>`: it reads the search params.
 */
export function useReportData(): ReportState {
  const { filters, setFilters } = useGlobalFilters();
  const set = useTradeSet(filters);
  const metrics = useMetrics(filters);
  const prefs = usePrefs().data;
  const accounts = useAccounts().data;
  const flows = useCashFlows().data;
  const allTrades = useTrades().data;
  const queryClient = useQueryClient();
  const chosen = useSearchParams().get('cur') ?? undefined;

  const shown = set.data?.filters;
  const view = useMemo(() => {
    if (!metrics.data || !shown || !prefs || !accounts || !flows || !allTrades)
      return undefined;
    const today = localDate(new Date().toISOString(), prefs.timeZone);
    const withClosed = metrics.data.filter((m) => m.summary.closedCount > 0);
    if (withClosed.length === 0) return { today, none: true as const };
    const range = resolveRange(shown.range, today);
    const partition = pickPartition(
      metrics.data,
      withClosed.some((m) => m.currency === chosen) ? chosen : undefined,
      prefs.baseCurrency,
    );
    const ctx: MetricContext = { ...metricContextOf(prefs), range };
    const source: FigureSource = {
      tradesById: new Map(partition.trades.map((t) => [t.id, t])),
      ctx,
      pctBase: pctBaseOf({
        accounts,
        flows,
        trades: allTrades,
        accountIds: shown.accountIds,
        currency: partition.currency,
        from: range.from,
        timeZone: prefs.timeZone,
      }),
    };
    return {
      today,
      none: false as const,
      partition,
      ctx,
      source,
      currencies: withClosed.map((m) => m.currency),
      caption: rangeCaption(range, today),
    };
  }, [metrics.data, shown, prefs, accounts, flows, allTrades, chosen]);

  const setCurrency = useCallback((c: string) => writeParam('cur', c), []);

  const error = set.error ?? metrics.error;
  if (error)
    return {
      state: 'error',
      error,
      retry() {
        // A stalled open never recovers in place; a fresh page opens storage again.
        if (error instanceof StorageUnavailableError) window.location.reload();
        else void queryClient.resetQueries({ queryKey: ['keel'] });
      },
    };
  if (!view || !shown || !allTrades || !prefs) return { state: 'loading' };
  if (view.none) {
    const unit = prefs.displayUnit;
    return {
      state: 'empty',
      variant: allTrades.length === 0 ? 'no-trades' : 'no-closed',
      filtered: hasActiveFilters(shown),
      ...((set.data?.unitLeftOut ?? 0) > 0 && isTradeUnit(unit)
        ? { unit }
        : {}),
      clearFilters: () => setFilters(EMPTY_FILTERS),
    };
  }
  return {
    state: 'ready',
    data: {
      partition: view.partition,
      currency: view.partition.currency,
      currencies: view.currencies,
      setCurrency,
      ctx: view.ctx,
      basis: view.ctx.pnlBasis,
      today: view.today,
      caption: view.caption,
      source: view.source,
    },
  };
}

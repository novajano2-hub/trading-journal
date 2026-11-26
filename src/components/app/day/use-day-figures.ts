'use client';

import { useMemo } from 'react';
import { dayOfTrade, groupDays, type DayStats } from '@/data/day-log';
import { selectedAccounts } from '@/data/filters';
import { useGlobalFilters } from '@/data/query/derived';
import { useAccounts, usePrefs, useTrades } from '@/data/query/hooks';
import type { MetricContext } from '@/domain/metrics/context';
import type { Trade } from '@/domain/types';

/** One day of the page's accounts: its trades, its figures and the context that read them. */
export interface DayFigures {
  trades: Trade[];
  /** Undefined for a day with no trade in the base currency. */
  stats: DayStats | undefined;
  ctx: MetricContext;
}

/**
 * The day's trades on the accounts the page is scoped to, grouped as the trade
 * log groups a day (K37's day, the base currency's figures, the others apart).
 * The page has no Display menu and every money figure is net, so the outcomes
 * and the win rate classify on net whatever the hidden basis, and no unit
 * narrows the day. Undefined until the trades, accounts and prefs have loaded.
 */
export function useDayFigures(date: string): DayFigures | undefined {
  const { filters } = useGlobalFilters();
  const trades = useTrades().data;
  const accounts = useAccounts().data;
  const prefs = usePrefs().data;
  return useMemo(() => {
    if (!trades || !accounts || !prefs) return undefined;
    const ids = new Set(selectedAccounts(accounts, filters).map((a) => a.id));
    const own = trades.filter(
      (t) => ids.has(t.accountId) && dayOfTrade(t, prefs.timeZone) === date,
    );
    const ctx: MetricContext = {
      timeZone: prefs.timeZone,
      breakevenRange: prefs.breakevenRange,
      pnlBasis: 'net',
      weekStart: prefs.weekStart ?? 'sunday',
    };
    const group = groupDays(own, {
      timeZone: prefs.timeZone,
      baseCurrency: prefs.baseCurrency,
      ctx,
      weekStart: prefs.weekStart ?? 'sunday',
      noteDates: new Set(),
    })[0];
    return {
      trades: group ? [...group.trades, ...group.otherCurrency] : own,
      stats: group?.stats,
      ctx,
    };
  }, [trades, accounts, prefs, filters, date]);
}

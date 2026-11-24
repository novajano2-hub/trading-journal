'use client';

import { useMemo } from 'react';
import { resolveRange, type GlobalFilters } from '@/data/filters';
import { metricContextOf } from '@/data/metrics';
import { strategyLogHref } from '@/data/report-links';
import { useGlobalFilters, useTradeSet } from '@/data/query/derived';
import {
  useAccounts,
  useCashFlows,
  usePrefs,
  useStrategies,
  useTrades,
} from '@/data/query/hooks';
import { classify, pnlOf } from '@/domain/metrics/context';
import { isTradeUnit, type TradeUnit } from '@/domain/metrics/units';
import { dailyPnl } from '@/domain/metrics/days';
import { maxDrawdown } from '@/domain/metrics/equity';
import { ruleStats, type RuleStat } from '@/domain/metrics/rules';
import { tradeStreaks, type StreakResult } from '@/domain/metrics/streaks';
import { summarize, type Summary } from '@/domain/metrics/summary';
import { localDate } from '@/domain/time';
import { closedInOrder, isClosed } from '@/domain/trade-status';
import type { Cents, Strategy, Trade } from '@/domain/types';
import { pctBaseOf, type FigureSource } from '@/lib/display';
import { hasActiveFilters } from '../filter-model';

/** Why a strategy that has trades shows none of them: the filters, the display unit, or only archived accounts. */
export type HiddenWhy = 'filters' | 'unit' | 'archived';

/** One strategy's figures: the trades in the filters (and the display unit), on the P&L basis, in the base currency. */
export interface StrategyFigures {
  strategy: Strategy;
  /** The trades `tradesHref` lists: the strategy's in the filters and the base currency, closed ones unless the filters ask for open. */
  tradeCount: number;
  /** Every trade that has the strategy, whatever the filters. */
  totalCount: number;
  /** Set when the strategy has trades but the filters leave none of them. */
  hidden: HiddenWhy | null;
  /** The trade log for this strategy's trades, in the same filters (and the base currency when they span more); undefined when the filters cannot say both. */
  tradesHref: string | undefined;
  /** The trades the figures read: the strategy's, in the base currency. */
  trades: Trade[];
  summary: Summary;
  /** Basis P&L of the closed trades. */
  pnl: Cents;
  closedIds: string[];
  /** Cumulative basis P&L by close, from 0. */
  equity: number[];
  /** The trading date (YYYY-MM-DD) each closed trade closed on, in `closedIds` order. */
  equityDates: string[];
  /** Trades the figures leave out because their P&L is in another currency. */
  leftOut: number;
  /** The closed winners, for the average win in any display unit. */
  winIds: string[];
  /** The closed trades inside the deepest drawdown, closed on the days after the peak day up to the trough day. */
  drawdownIds: string[];
  rules: RuleStat[];
  /** Rule checks kept of those answered, on the trades each rule applies to. */
  adherence: number | null;
  /** Closed trades that broke at least one rule that applied to them: each counts once. */
  broken: { pnl: Cents; ids: string[] };
  /** The deepest fall of the closed-trade equity from its peak (a positive amount). */
  drawdown: Cents;
  streaks: StreakResult;
}

export interface StrategyData {
  figures: Map<string, StrategyFigures>;
  source: FigureSource;
  strategies: Strategy[];
  /** Closed trades with no strategy in the base currency, their P&L, and the log that lists them under the same filters. */
  unassigned: {
    count: number;
    pnl: Cents;
    ids: string[];
    href: string | undefined;
  };
  basis: 'net' | 'gross';
  /** The filters as applied, and whether any is set. */
  filters: GlobalFilters;
  filtered: boolean;
  /** The display unit, when it narrows the trades. */
  unit: TradeUnit | undefined;
}

/**
 * Per-strategy figures over the trades in the global filters (and the display
 * unit's narrowing); undefined until the data has loaded. Needs a `<Suspense>`
 * boundary above it: it reads the URL's filters.
 */
export function useStrategyData(): {
  data: StrategyData | undefined;
  error: Error | null;
  setFilters(next: GlobalFilters): void;
} {
  const { filters: urlFilters, setFilters } = useGlobalFilters();
  const set = useTradeSet(urlFilters);
  const trades = useTrades();
  const strategies = useStrategies();
  const prefs = usePrefs();
  const accounts = useAccounts();
  const flows = useCashFlows();
  const error =
    set.error ??
    trades.error ??
    strategies.error ??
    prefs.error ??
    accounts.error ??
    flows.error;

  const data = useMemo(() => {
    if (
      !set.data ||
      !trades.data ||
      !strategies.data ||
      !prefs.data ||
      !accounts.data ||
      !flows.data
    )
      return undefined;
    // The filtered set is already narrowed to the display unit, so the ratios
    // read in it (the context carries `unit`).
    const ctx = metricContextOf(prefs.data);
    const base = prefs.data.baseCurrency;
    const today = localDate(new Date().toISOString(), prefs.data.timeZone);
    const { filters } = set.data;
    const inSet = set.data.trades;
    // Day figures take the exits inside the date range, as the reports' do.
    const dayCtx = {
      ...ctx,
      range: resolveRange(filters.range, today, prefs.data.weekStart),
    };
    // The log lists closed trades unless the filters ask for open ones, in every currency unless named.
    const listed = (t: Trade) =>
      filters.status === 'open' ? t.status === 'open' : isClosed(t);
    const named = (some: readonly Trade[]) =>
      some.some((t) => t.pnlCurrency !== base)
        ? { ...filters, currency: base }
        : filters;
    const filtered = hasActiveFilters(filters);
    const unit = isTradeUnit(prefs.data.displayUnit)
      ? prefs.data.displayUnit
      : undefined;
    const figures = new Map<string, StrategyFigures>();
    for (const strategy of strategies.data) {
      const own = inSet.filter((t) => t.strategyIds.includes(strategy.id));
      const totalCount = trades.data.filter((t) =>
        t.strategyIds.includes(strategy.id),
      ).length;
      const read = own.filter((t) => t.pnlCurrency === base);
      const closed = closedInOrder(read);
      let run = 0;
      const rules = ruleStats(read, strategy, ctx);
      const kept = rules.reduce((n, r) => n + r.kept, 0);
      const answered = rules.reduce((n, r) => n + r.kept + r.broken, 0);
      const brokenIds = [...new Set(rules.flatMap((r) => r.brokenTradeIds))];
      const brokenSet = new Set(brokenIds);
      // On the real balance of the accounts it traded in, as the reports read it.
      const accountIds = new Set(read.map((t) => t.accountId));
      const dayRead = set.data.dayTrades.filter(
        (t) => t.strategyIds.includes(strategy.id) && t.pnlCurrency === base,
      );
      const drawdown = maxDrawdown(
        dailyPnl(dayRead, dayCtx),
        accounts.data
          .filter((a) => accountIds.has(a.id))
          .reduce((n, a) => n + a.startingBalance, 0),
        flows.data.filter((f) => accountIds.has(f.accountId)),
      );
      figures.set(strategy.id, {
        strategy,
        tradeCount: read.filter(listed).length,
        totalCount,
        hidden:
          own.length > 0 || totalCount === 0
            ? null
            : filtered
              ? 'filters'
              : unit
                ? 'unit'
                : 'archived',
        tradesHref: strategyLogHref(named(own), strategy.id),
        trades: read,
        summary: summarize(read, ctx),
        pnl: closed.reduce((n, t) => n + pnlOf(t, ctx.pnlBasis), 0),
        closedIds: closed.map((t) => t.id),
        equity: [0, ...closed.map((t) => (run += pnlOf(t, ctx.pnlBasis)))],
        equityDates: closed.map((t) =>
          localDate(t.closedAt, prefs.data.timeZone),
        ),
        leftOut: own.length - read.length,
        winIds: closed
          .filter((t) => classify(t, ctx).outcome === 'win')
          .map((t) => t.id),
        drawdownIds:
          drawdown.amount === 0
            ? []
            : closed
                .filter((t) => {
                  const day = localDate(t.closedAt, prefs.data.timeZone);
                  return (
                    (drawdown.peakDay === undefined ||
                      day > drawdown.peakDay) &&
                    day <= drawdown.troughDay!
                  );
                })
                .map((t) => t.id),
        rules,
        adherence: answered === 0 ? null : kept / answered,
        broken: {
          ids: brokenIds,
          pnl: closed
            .filter((t) => brokenSet.has(t.id))
            .reduce((n, t) => n + pnlOf(t, ctx.pnlBasis), 0),
        },
        drawdown: drawdown.amount,
        streaks: tradeStreaks(read, ctx),
      });
    }
    const unassigned = inSet.filter((t) => t.strategyIds.length === 0);
    const loose = closedInOrder(
      unassigned.filter((t) => t.pnlCurrency === base),
    );
    return {
      figures,
      strategies: strategies.data,
      source: {
        tradesById: new Map(trades.data.map((t) => [t.id, t])),
        ctx,
        pctBase: pctBaseOf({
          accounts: accounts.data,
          flows: flows.data,
          trades: trades.data,
          accountIds: filters.accountIds,
          currency: base,
          from: resolveRange(filters.range, today, prefs.data.weekStart).from,
          timeZone: prefs.data.timeZone,
        }),
      },
      unassigned: {
        count: loose.length,
        pnl: loose.reduce((n, t) => n + pnlOf(t, ctx.pnlBasis), 0),
        ids: loose.map((t) => t.id),
        href: strategyLogHref(named(unassigned), null),
      },
      basis: ctx.pnlBasis,
      filters,
      filtered,
      unit,
    } satisfies StrategyData;
  }, [
    set.data,
    trades.data,
    strategies.data,
    prefs.data,
    accounts.data,
    flows.data,
  ]);

  return { data, error, setFilters };
}

'use client';

import { useMemo } from 'react';
import { metricContextOf } from '@/data/metrics';
import {
  useAccounts,
  usePrefs,
  useStrategies,
  useTrades,
} from '@/data/query/hooks';
import { pnlOf } from '@/domain/metrics/context';
import { maxDrawdown } from '@/domain/metrics/equity';
import { ruleStats, type RuleStat } from '@/domain/metrics/rules';
import { tradeStreaks, type StreakResult } from '@/domain/metrics/streaks';
import { summarize, type Summary } from '@/domain/metrics/summary';
import { closedInOrder } from '@/domain/trade-status';
import type { Cents, Strategy, Trade } from '@/domain/types';
import { pctBaseOf, type FigureSource } from '@/lib/display';

/** One strategy's figures: all time, all accounts, on the P&L basis, in the base currency. */
export interface StrategyFigures {
  strategy: Strategy;
  /** Every trade that has the strategy (many-to-many), whatever its currency. */
  tradeCount: number;
  /** The trades the figures read: the strategy's, in the base currency. */
  trades: Trade[];
  summary: Summary;
  /** Basis P&L of the closed trades. */
  pnl: Cents;
  closedIds: string[];
  /** Cumulative basis P&L by close, from 0. */
  equity: number[];
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
  /** Closed trades with no strategy, and their P&L. */
  unassigned: { count: number; pnl: Cents };
  basis: 'net' | 'gross';
}

/** Per-strategy figures over every trade; undefined until the data has loaded. */
export function useStrategyData(): {
  data: StrategyData | undefined;
  error: Error | null;
} {
  const trades = useTrades();
  const strategies = useStrategies();
  const prefs = usePrefs();
  const accounts = useAccounts();
  const error =
    trades.error ?? strategies.error ?? prefs.error ?? accounts.error;

  const data = useMemo(() => {
    if (!trades.data || !strategies.data || !prefs.data || !accounts.data)
      return undefined;
    const ctx = metricContextOf(prefs.data);
    const base = prefs.data.baseCurrency;
    const figures = new Map<string, StrategyFigures>();
    for (const strategy of strategies.data) {
      const own = trades.data.filter((t) =>
        t.strategyIds.includes(strategy.id),
      );
      const read = own.filter((t) => t.pnlCurrency === base);
      const closed = closedInOrder(read);
      let run = 0;
      const rules = ruleStats(read, strategy, ctx);
      const kept = rules.reduce((n, r) => n + r.kept, 0);
      const answered = rules.reduce((n, r) => n + r.kept + r.broken, 0);
      const brokenIds = [...new Set(rules.flatMap((r) => r.brokenTradeIds))];
      const brokenSet = new Set(brokenIds);
      figures.set(strategy.id, {
        strategy,
        tradeCount: own.length,
        trades: read,
        summary: summarize(read, ctx),
        pnl: closed.reduce((n, t) => n + pnlOf(t, ctx.pnlBasis), 0),
        closedIds: closed.map((t) => t.id),
        equity: [0, ...closed.map((t) => (run += pnlOf(t, ctx.pnlBasis)))],
        rules,
        adherence: answered === 0 ? null : kept / answered,
        broken: {
          ids: brokenIds,
          pnl: closed
            .filter((t) => brokenSet.has(t.id))
            .reduce((n, t) => n + pnlOf(t, ctx.pnlBasis), 0),
        },
        drawdown: maxDrawdown(read, 0, ctx).amount,
        streaks: tradeStreaks(read, ctx),
      });
    }
    const loose = closedInOrder(
      trades.data.filter(
        (t) => t.strategyIds.length === 0 && t.pnlCurrency === base,
      ),
    );
    return {
      figures,
      strategies: strategies.data,
      source: {
        tradesById: new Map(trades.data.map((t) => [t.id, t])),
        ctx,
        pctBase: pctBaseOf({
          accounts: accounts.data,
          trades: trades.data,
          accountIds: [],
          currency: base,
          timeZone: prefs.data.timeZone,
        }),
      },
      unassigned: {
        count: loose.length,
        pnl: loose.reduce((n, t) => n + pnlOf(t, ctx.pnlBasis), 0),
      },
      basis: ctx.pnlBasis,
    } satisfies StrategyData;
  }, [trades.data, strategies.data, prefs.data, accounts.data]);

  return { data, error };
}

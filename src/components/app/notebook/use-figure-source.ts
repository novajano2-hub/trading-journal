'use client';

import { useMemo } from 'react';
import { metricContextOf } from '@/data/metrics';
import {
  useAccounts,
  useCashFlows,
  usePrefs,
  useTrades,
} from '@/data/query/hooks';
import type { Trade } from '@/domain/types';
import { pctBaseOf, type FigureSource } from '@/lib/display';

/**
 * What the figures under a card are read from: the trades behind them, the
 * metrics context and the percentage's base (the accounts' balance the day
 * before `from`). Undefined until the data has loaded.
 * `trades` must keep its identity between renders.
 */
export function useFigureSource(args: {
  trades: readonly Trade[] | undefined;
  accountIds: readonly string[];
  currency: string;
  /** The local date the figures start on. */
  from: string;
}): FigureSource | undefined {
  const prefs = usePrefs().data;
  const accounts = useAccounts().data;
  const flows = useCashFlows().data;
  const everyTrade = useTrades().data;
  const { trades, currency, from } = args;
  // The ids' content is the key: a call site may pass a fresh array each render.
  const accountKey = args.accountIds.join(',');
  return useMemo(() => {
    if (!prefs || !accounts || !flows || !everyTrade || !trades)
      return undefined;
    return {
      tradesById: new Map(trades.map((t) => [t.id, t])),
      ctx: metricContextOf(prefs),
      pctBase: pctBaseOf({
        accounts,
        flows,
        trades: everyTrade,
        accountIds: accountKey === '' ? [] : accountKey.split(','),
        currency,
        from,
        timeZone: prefs.timeZone,
      }),
    };
  }, [prefs, accounts, flows, everyTrade, trades, accountKey, currency, from]);
}

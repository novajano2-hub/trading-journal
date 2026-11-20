import { partitionByCurrency } from '../domain/currency';
import {
  dailyPnl,
  dayStreaks,
  daySummary,
  type DayStat,
} from '../domain/metrics/days';
import type { MetricContext } from '../domain/metrics/context';
import {
  equityCurve,
  maxDrawdown,
  type Drawdown,
  type EquityPoint,
} from '../domain/metrics/equity';
import { tradeStreaks, type StreakResult } from '../domain/metrics/streaks';
import { summarize, type Summary } from '../domain/metrics/summary';
import type { Account, Cents, Trade, UserPrefs } from '../domain/types';

export function metricContextOf(prefs: UserPrefs): MetricContext {
  return {
    timeZone: prefs.timeZone,
    breakevenRange: prefs.breakevenRange,
    pnlBasis: prefs.pnlBasis,
  };
}

export interface CurrencyMetrics {
  currency: string;
  trades: Trade[];
  startingBalance: Cents;
  summary: Summary;
  days: DayStat[];
  daySummary: ReturnType<typeof daySummary>;
  equity: EquityPoint[];
  drawdown: Drawdown;
  tradeStreaks: StreakResult;
  dayStreaks: StreakResult;
}

/**
 * One metrics bundle per P&L currency (never mixed). The base currency is first and
 * always present; the others follow in code order. Starting balances of the selected
 * accounts in that currency add up.
 */
export function metricsByCurrency(
  trades: readonly Trade[],
  opts: {
    accounts: readonly Account[];
    ctx: MetricContext;
    baseCurrency: string;
  },
): CurrencyMetrics[] {
  const { accounts, ctx, baseCurrency } = opts;
  const parts = partitionByCurrency(trades);
  const others = [...parts.keys()]
    .filter((c) => c !== baseCurrency)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [baseCurrency, ...others].map((currency) => {
    const own = parts.get(currency) ?? [];
    const startingBalance = accounts
      .filter((a) => a.currency === currency)
      .reduce((sum, a) => sum + a.startingBalance, 0);
    const days = dailyPnl(own, ctx);
    return {
      currency,
      trades: own,
      startingBalance,
      summary: summarize(own, ctx),
      days,
      daySummary: daySummary(days, ctx),
      equity: equityCurve(own, startingBalance, ctx),
      drawdown: maxDrawdown(own, startingBalance, ctx),
      tradeStreaks: tradeStreaks(own, ctx),
      dayStreaks: dayStreaks(days, ctx),
    };
  });
}

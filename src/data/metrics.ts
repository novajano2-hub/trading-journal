import { partitionByCurrency } from '../domain/currency';
import {
  winRateOfDays,
  dailyPnl,
  dayDurations,
  dayStreaks,
  daySummary,
  type DayStat,
} from '../domain/metrics/days';
import { type MetricContext } from '../domain/metrics/context';
import {
  equityCurve,
  maxDrawdown,
  type Drawdown,
  type EquityPoint,
} from '../domain/metrics/equity';
import { riskRatios } from '../domain/metrics/risk';
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
  /** The trades matched by every filter, the date included: the trade log, win rate and summary. */
  trades: Trade[];
  /** The trades matched by every filter but the date: what the day figures are built from. */
  dayTrades: Trade[];
  startingBalance: Cents;
  summary: Summary;
  /** On ctx.pnlBasis, the exits dated inside ctx.range. */
  days: DayStat[];
  /** The same days always on net, as goals and the risk ratios read them. */
  netDays: DayStat[];
  daySummary: ReturnType<typeof daySummary>;
  equity: EquityPoint[];
  drawdown: Drawdown;
  tradeStreaks: StreakResult;
  dayStreaks: StreakResult;
  dayDurations: ReturnType<typeof dayDurations>;
  avgDailyWinRate: number | null;
  risk: ReturnType<typeof riskRatios>;
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
    /**
     * The trades with every filter but the date, for the day-level figures
     * (days, day durations, goals, risk); `ctx.range` clips their exits.
     * Defaults to `trades`.
     */
    dayTrades?: readonly Trade[];
  },
): CurrencyMetrics[] {
  const { accounts, ctx, baseCurrency } = opts;
  const parts = partitionByCurrency(trades);
  const dayParts = partitionByCurrency(opts.dayTrades ?? trades);
  const others = [...new Set([...parts.keys(), ...dayParts.keys()])]
    .filter((c) => c !== baseCurrency)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [baseCurrency, ...others].map((currency) => {
    const own = parts.get(currency) ?? [];
    const startingBalance = accounts
      .filter((a) => a.currency === currency)
      .reduce((sum, a) => sum + a.startingBalance, 0);
    const dayOwn = dayParts.get(currency) ?? [];
    const days = dailyPnl(dayOwn, ctx);
    const netCtx = { ...ctx, pnlBasis: 'net' as const };
    const netDays = ctx.pnlBasis === 'net' ? days : dailyPnl(dayOwn, netCtx);
    // The balance at the range start: the starting balances plus the net booked before it.
    const from = ctx.range?.from;
    const booked =
      from === undefined
        ? 0
        : dailyPnl(dayOwn, { ...netCtx, range: undefined })
            .filter((d) => d.date < from)
            .reduce((n, d) => n + d.net, 0);
    return {
      currency,
      trades: own,
      dayTrades: dayOwn,
      startingBalance,
      summary: summarize(own, ctx),
      days,
      netDays,
      daySummary: daySummary(days, ctx),
      equity: equityCurve(own, startingBalance, ctx),
      drawdown: maxDrawdown(own, startingBalance, ctx),
      tradeStreaks: tradeStreaks(own, ctx),
      dayStreaks: dayStreaks(days, ctx),
      dayDurations: dayDurations(dayOwn, ctx),
      avgDailyWinRate: winRateOfDays(days),
      risk: riskRatios(netDays, startingBalance + booked),
    };
  });
}

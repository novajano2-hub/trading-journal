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
import { balanceAt, dayBefore } from '../domain/metrics/balance';
import { riskRatios } from '../domain/metrics/risk';
import { tradeStreaks, type StreakResult } from '../domain/metrics/streaks';
import { summarize, type Summary } from '../domain/metrics/summary';
import type {
  Account,
  CashFlow,
  Cents,
  Trade,
  UserPrefs,
} from '../domain/types';

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
    /** The deposits and withdrawals of the workspace's accounts; the risk ratios' start balance counts those before the range. */
    flows?: readonly CashFlow[];
    /** Every trade of the selected accounts, whatever the other filters: what the balance before the range is booked from. Defaults to `dayTrades`. */
    balanceTrades?: readonly Trade[];
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
    const currencyAccounts = accounts.filter((a) => a.currency === currency);
    const startingBalance = currencyAccounts.reduce(
      (sum, a) => sum + a.startingBalance,
      0,
    );
    const dayOwn = dayParts.get(currency) ?? [];
    const days = dailyPnl(dayOwn, ctx);
    const netCtx = { ...ctx, pnlBasis: 'net' as const };
    const netDays = ctx.pnlBasis === 'net' ? days : dailyPnl(dayOwn, netCtx);
    // The balance the day before the range starts: the starting balances,
    // the flows dated before it and the net booked before it.
    // An open range starts the day before its first day.
    const startDay = ctx.range?.from ?? netDays[0]?.date;
    const ownFlows = (opts.flows ?? []).filter((f) =>
      currencyAccounts.some((a) => a.id === f.accountId),
    );
    const riskStart =
      startDay === undefined
        ? startingBalance
        : balanceAt(
            currencyAccounts,
            ownFlows,
            (opts.balanceTrades ?? opts.dayTrades ?? trades).filter(
              (t) => t.pnlCurrency === currency,
            ),
            dayBefore(startDay),
            ctx,
          );
    const riskFlows =
      startDay === undefined
        ? []
        : ownFlows.filter((f) => f.date > dayBefore(startDay));
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
      drawdown: maxDrawdown(days, riskStart, riskFlows),
      tradeStreaks: tradeStreaks(own, ctx),
      dayStreaks: dayStreaks(days, ctx),
      dayDurations: dayDurations(dayOwn, ctx),
      avgDailyWinRate: winRateOfDays(days),
      risk: riskRatios(netDays, riskStart, riskFlows),
    };
  });
}

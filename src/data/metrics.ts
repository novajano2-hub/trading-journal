import { partitionByCurrency } from '../domain/currency';
import {
  dailyPnl,
  dayDurations,
  dayStreaks,
  daySummary,
  monthSummary,
  type DayStat,
} from '../domain/metrics/days';
import { type MetricContext } from '../domain/metrics/context';
import {
  avgDrawdown,
  equityCurve,
  maxDrawdown,
  type Drawdown,
  type EquityPoint,
} from '../domain/metrics/equity';
import { balanceAt, dayBefore } from '../domain/metrics/balance';
import { riskRatios } from '../domain/metrics/risk';
import { tradeStreaks, type StreakResult } from '../domain/metrics/streaks';
import {
  costsOf,
  holdTimes,
  summarize,
  volumeOf,
  type Summary,
} from '../domain/metrics/summary';
import { isTradeUnit } from '../domain/metrics/units';
import type {
  Account,
  CashFlow,
  Cents,
  Trade,
  UserPrefs,
} from '../domain/types';

/**
 * The prefs' context. A display unit that narrows the trade set (R, ticks,
 * pips, points) rides along as `unit`, so the ratios read in it; a view whose
 * trades are not narrowed to the unit drops it.
 */
export function metricContextOf(prefs: UserPrefs): MetricContext {
  return {
    timeZone: prefs.timeZone,
    breakevenRange: prefs.breakevenRange,
    pnlBasis: prefs.pnlBasis,
    ...(isTradeUnit(prefs.displayUnit) ? { unit: prefs.displayUnit } : {}),
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
  /** The mean daily drawdown over the days under a peak; `amount` is the positive depth, `pct` null in a unit. */
  avgDrawdown: ReturnType<typeof avgDrawdown>;
  /** Best, lowest and average month by P&L. */
  months: ReturnType<typeof monthSummary>;
  /** Minutes held on average, over all closed trades and the winners, losers and breakevens. */
  holds: ReturnType<typeof holdTimes>;
  /** The commissions and the fees of the closed trades' fills. */
  costs: ReturnType<typeof costsOf>;
  tradeStreaks: StreakResult;
  dayStreaks: StreakResult;
  dayDurations: ReturnType<typeof dayDurations>;
  /** Each trade's quantity, counted once: every trade matched, open ones too. */
  volume: number;
  /** The volume over the trading days; null with none. */
  avgDailyVolume: number | null;
  risk: ReturnType<typeof riskRatios>;
  /** The balance the day before the range starts, and the deposits and withdrawals after it: what Sharpe and Sortino are read on, and the same series per period. */
  riskStart: Cents;
  riskFlows: readonly { date: string; amount: Cents }[];
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
    const drawdown = maxDrawdown(days, riskStart, riskFlows);
    const avgDd = avgDrawdown(days, riskStart, riskFlows);
    const volume = volumeOf(own);
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
      // A share of the balance means nothing once the unit has narrowed the
      // trades to some of the accounts' P&L: it has no value then. Nor do
      // Sharpe and Sortino, daily returns on that balance.
      drawdown: ctx.unit ? { ...drawdown, pct: null } : drawdown,
      avgDrawdown: ctx.unit ? { ...avgDd, pct: null } : avgDd,
      months: monthSummary(days, ctx),
      holds: holdTimes(own, ctx),
      costs: costsOf(own),
      tradeStreaks: tradeStreaks(own, ctx),
      dayStreaks: dayStreaks(days, ctx),
      dayDurations: dayDurations(dayOwn, ctx),
      volume,
      avgDailyVolume: days.length === 0 ? null : volume / days.length,
      risk: ctx.unit
        ? { sharpe: null, sortino: null }
        : riskRatios(netDays, riskStart, riskFlows),
      riskStart,
      riskFlows,
    };
  });
}

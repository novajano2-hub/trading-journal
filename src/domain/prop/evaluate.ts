import { defaultMetricContext } from '../metrics/context';
import { dailyPnl } from '../metrics/days';
import { localDate } from '../time';
import { closedInOrder, isClosed } from '../trade-status';
import type { Cents, DrawdownType, PropRuleSet, Trade } from '../types';

export type RuleState = 'clear' | 'near' | 'breached';
/** "near" once remaining <= 25 % of the limit. */
export const NEAR_FRACTION = 0.25;

export interface PropStatus {
  equity: Cents;
  profit: { current: Cents; target: Cents; progress: number };
  dailyLoss: {
    todayNet: Cents;
    limit: Cents;
    remaining: Cents;
    state: RuleState;
    breachedOn?: string;
    /** The day's running net at the trade that broke it. */
    breachedNet?: Cents;
    worstDay: { date: string; net: Cents } | null;
  };
  drawdown: {
    type: DrawdownType;
    floor: Cents;
    remaining: Cents;
    state: RuleState;
    breachedAt?: string;
    /** The equity and the limit in force at the trade that broke it. */
    breachedEquity?: Cents;
    breachedFloor?: Cents;
  };
  tradingDays: { count: number; min: number; met: boolean };
  consistency: {
    bestDayShare: number | null;
    limitPct: number;
    met: boolean;
    bestDay: { date: string; net: Cents } | null;
  } | null;
  /** Null when the rules set no period, or no start is known yet (no trades, no start date). */
  period: {
    start: string;
    /** Day `periodDays` counting the start as day 1. */
    lastDay: string;
    /** Days after `now`'s local day up to the last day, 0 on it and after it. */
    daysLeft: number;
    /** `now` is past the last day. */
    ended: boolean;
  } | null;
  /** 'breached' also covers a period that ended with the target unmet. */
  overall: 'in-progress' | 'breached' | 'target-reached';
}

/** `date` (YYYY-MM-DD) moved by `n` days. */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );

function ruleState(
  breached: boolean,
  remaining: Cents,
  limit: Cents,
): RuleState {
  if (breached) return 'breached';
  return remaining <= NEAR_FRACTION * limit ? 'near' : 'clear';
}

/**
 * Closed-trade equity basis; intraday unrealised P&L needs market data (backlog #14).
 * The input trades must be a single-currency set (the data layer partitions by pnlCurrency first).
 */
export function evaluateProp(input: {
  startingBalance: Cents;
  rules: PropRuleSet;
  trades: readonly Trade[];
  timeZone: string;
  now: string;
  /** The phase's first day (YYYY-MM-DD), where the period starts; default the first trade's day. */
  startDate?: string;
  /** The local day to read "today" as (default: `now`'s), for a caller that holds a date, not an instant. */
  today?: string;
}): PropStatus {
  const { startingBalance: start, rules, timeZone, now } = input;
  const nowMs = Date.parse(now);
  const today = input.today ?? localDate(now, timeZone);
  const closed = closedInOrder(
    input.trades.filter((t) => isClosed(t) && Date.parse(t.closedAt) <= nowMs),
  );

  // The period runs from its start to `periodDays` days on; later trades don't count.
  const periodStart =
    rules.periodDays === undefined
      ? undefined
      : (input.startDate ??
        (closed[0] ? localDate(closed[0].closedAt, timeZone) : undefined));
  const lastDay =
    periodStart === undefined || rules.periodDays === undefined
      ? undefined
      : addDays(periodStart, rules.periodDays - 1);
  const trades =
    lastDay === undefined
      ? closed
      : closed.filter((t) => localDate(t.closedAt, timeZone) <= lastDay);

  // Floor in force before a trade, from the peak *before* that trade. A trailing
  // drawdown follows the peak up and locks at `drawdownFloor` (the starting
  // balance unless set); a static one ignores it.
  const lock = rules.drawdownFloor ?? start;
  const floorFor = (peak: Cents): Cents =>
    rules.drawdownType === 'static'
      ? start - rules.maxDrawdown
      : Math.min(peak - rules.maxDrawdown, lock);

  let equity = start;
  let peak = start; // trailing: peak of equity; eod-trailing: peak of prior days' end-of-day equity
  let currentDay: string | undefined;
  let breachedAt: string | undefined;
  let breachedOn: string | undefined;
  let breachedNet: Cents | undefined;
  let breachedEquity: Cents | undefined;
  let breachedFloor: Cents | undefined;
  let dayRunning = 0; // closed-trade net so far on currentDay

  for (const t of trades) {
    const day = localDate(t.closedAt, timeZone);
    if (day !== currentDay) dayRunning = 0;
    if (
      rules.drawdownType === 'eod-trailing' &&
      currentDay !== undefined &&
      day !== currentDay
    ) {
      peak = Math.max(peak, equity); // equity is still the previous day's close
    }
    currentDay = day;
    equity += t.net;
    dayRunning += t.net;
    // Daily loss breaches the first time the running day net touches the limit.
    if (breachedOn === undefined && dayRunning <= -rules.dailyLossLimit) {
      breachedOn = day;
      breachedNet = dayRunning;
    }
    if (breachedAt === undefined && equity <= floorFor(peak)) {
      breachedAt = t.closedAt;
      breachedEquity = equity;
      breachedFloor = floorFor(peak);
    }
    if (rules.drawdownType === 'trailing') peak = Math.max(peak, equity);
  }
  // eod-trailing: the last trading day's close counts once that day has ended.
  if (
    rules.drawdownType === 'eod-trailing' &&
    currentDay !== undefined &&
    today > currentDay
  ) {
    peak = Math.max(peak, equity);
  }
  const floor = floorFor(peak);

  const days = dailyPnl(
    trades,
    defaultMetricContext(timeZone),
  ); /* firm rules count fees: net, range 0..0 */
  const todayNet = days.find((d) => d.date === today)?.net ?? 0;
  const worst = days.reduce<{ date: string; net: Cents } | null>(
    (w, d) => (w === null || d.net < w.net ? { date: d.date, net: d.net } : w),
    null,
  );
  const dlRemaining = rules.dailyLossLimit + Math.min(todayNet, 0);
  const ddRemaining = equity - floor;

  const profitCurrent = equity - start;
  const tradingDayCount = days.filter((d) => d.tradeCount > 0).length;
  const daysMet = tradingDayCount >= rules.minTradingDays;

  let consistency: PropStatus['consistency'] = null;
  if (rules.consistencyPct !== undefined) {
    const bestDay = days.reduce<{ date: string; net: Cents } | null>(
      (b, d) =>
        b === null || d.net > b.net ? { date: d.date, net: d.net } : b,
      null,
    );
    const best = bestDay?.net ?? -Infinity;
    const share = profitCurrent > 0 ? best / profitCurrent : null;
    consistency = {
      bestDay,
      bestDayShare: share,
      limitPct: rules.consistencyPct,
      met: share !== null && share <= rules.consistencyPct,
    };
  }

  const dailyBreached = breachedOn !== undefined;
  const ddBreached = breachedAt !== undefined;
  // A funded phase has no target to reach.
  const targetReached =
    rules.phase === 'evaluation' &&
    profitCurrent >= rules.profitTarget &&
    daysMet &&
    (consistency === null || consistency.met);
  const period: PropStatus['period'] =
    periodStart === undefined || lastDay === undefined
      ? null
      : {
          start: periodStart,
          lastDay,
          daysLeft: Math.max(0, daysBetween(today, lastDay)),
          ended: today > lastDay,
        };
  const overall: PropStatus['overall'] =
    dailyBreached || ddBreached || (period?.ended === true && !targetReached)
      ? 'breached'
      : targetReached
        ? 'target-reached'
        : 'in-progress';

  return {
    equity,
    profit: {
      current: profitCurrent,
      target: rules.profitTarget,
      progress:
        rules.profitTarget > 0
          ? Math.max(0, profitCurrent) / rules.profitTarget
          : 0,
    },
    dailyLoss: {
      todayNet,
      limit: rules.dailyLossLimit,
      remaining: dlRemaining,
      state: ruleState(dailyBreached, dlRemaining, rules.dailyLossLimit),
      ...(breachedOn !== undefined && {
        breachedOn,
        breachedNet,
      }),
      worstDay: worst,
    },
    drawdown: {
      type: rules.drawdownType,
      floor,
      remaining: ddRemaining,
      state: ruleState(ddBreached, ddRemaining, rules.maxDrawdown),
      ...(breachedAt !== undefined && {
        breachedAt,
        breachedEquity,
        breachedFloor,
      }),
    },
    tradingDays: {
      count: tradingDayCount,
      min: rules.minTradingDays,
      met: daysMet,
    },
    consistency,
    period,
    overall,
  };
}

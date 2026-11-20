import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { dailyPnl } from '../metrics/days';
import { closedInOrder } from '../metrics/equity';
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
    worstDay: { date: string; net: Cents } | null;
  };
  drawdown: { type: DrawdownType; floor: Cents; remaining: Cents; state: RuleState; breachedAt?: string };
  tradingDays: { count: number; min: number; met: boolean };
  consistency: { bestDayShare: number | null; limitPct: number; met: boolean } | null;
  overall: 'in-progress' | 'breached' | 'target-reached';
}

function localDate(iso: string, timeZone: string): string {
  return format(new TZDate(Date.parse(iso), timeZone), 'yyyy-MM-dd');
}

function ruleState(breached: boolean, remaining: Cents, limit: Cents): RuleState {
  if (breached) return 'breached';
  return remaining <= NEAR_FRACTION * limit ? 'near' : 'clear';
}

/** Closed-trade equity basis; intraday unrealised P&L needs market data (backlog #14). */
export function evaluateProp(input: {
  startingBalance: Cents;
  rules: PropRuleSet;
  trades: readonly Trade[];
  timeZone: string;
  now: string;
}): PropStatus {
  const { startingBalance: start, rules, timeZone, now } = input;
  const nowMs = Date.parse(now);
  const trades = input.trades.filter(
    (t) => t.closedAt !== undefined && Date.parse(t.closedAt) <= nowMs,
  );

  // Floor in force before a trade, from the peak *before* that trade.
  const floorFor = (peak: Cents): Cents =>
    rules.drawdownType === 'static'
      ? start - rules.maxDrawdown
      : Math.min(peak - rules.maxDrawdown, start);

  let equity = start;
  let peak = start; // trailing: peak of equity; eod-trailing: peak of prior days' end-of-day equity
  let currentDay: string | undefined;
  let breachedAt: string | undefined;

  for (const t of closedInOrder(trades)) {
    const day = localDate(t.closedAt, timeZone);
    if (rules.drawdownType === 'eod-trailing' && currentDay !== undefined && day !== currentDay) {
      peak = Math.max(peak, equity); // equity is still the previous day's close
    }
    currentDay = day;
    equity += t.net;
    if (breachedAt === undefined && equity <= floorFor(peak)) breachedAt = t.closedAt;
    if (rules.drawdownType === 'trailing') peak = Math.max(peak, equity);
  }
  // Floor in force after the last trade (eod-trailing peak only moves at day rollover).
  const floor = floorFor(peak);

  const days = dailyPnl(trades, timeZone, 0);
  const today = localDate(now, timeZone);
  const todayNet = days.find((d) => d.date === today)?.net ?? 0;
  const breachedOn = days.find((d) => d.net <= -rules.dailyLossLimit)?.date;
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
    const best = days.reduce((m, d) => Math.max(m, d.net), -Infinity);
    const share = profitCurrent > 0 ? best / profitCurrent : null;
    consistency = {
      bestDayShare: share,
      limitPct: rules.consistencyPct,
      met: share !== null && share <= rules.consistencyPct,
    };
  }

  const dailyBreached = breachedOn !== undefined;
  const ddBreached = breachedAt !== undefined;
  const overall: PropStatus['overall'] =
    dailyBreached || ddBreached
      ? 'breached'
      : profitCurrent >= rules.profitTarget && daysMet && (consistency === null || consistency.met)
        ? 'target-reached'
        : 'in-progress';

  return {
    equity,
    profit: {
      current: profitCurrent,
      target: rules.profitTarget,
      progress: Math.max(0, profitCurrent) / rules.profitTarget,
    },
    dailyLoss: {
      todayNet,
      limit: rules.dailyLossLimit,
      remaining: dlRemaining,
      state: ruleState(dailyBreached, dlRemaining, rules.dailyLossLimit),
      ...(breachedOn !== undefined && { breachedOn }),
      worstDay: worst,
    },
    drawdown: {
      type: rules.drawdownType,
      floor,
      remaining: ddRemaining,
      state: ruleState(ddBreached, ddRemaining, rules.maxDrawdown),
      ...(breachedAt !== undefined && { breachedAt }),
    },
    tradingDays: { count: tradingDayCount, min: rules.minTradingDays, met: daysMet },
    consistency,
    overall,
  };
}

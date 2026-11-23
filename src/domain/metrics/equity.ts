import { closedInOrder } from '../trade-status';
import type { Cents, Trade } from '../types';
import { pnlOf, type MetricContext } from './context';
import type { DayStat } from './days';

export interface EquityPoint {
  time: string;
  equity: Cents;
  tradeId: string;
}
export interface Drawdown {
  amount: Cents;
  pct: number | null;
  /** Local dates (YYYY-MM-DD) of the peak day and the trough day. */
  peakDay?: string;
  troughDay?: string;
}

/** Closed-trade equity on ctx.pnlBasis; the input must be a single-currency set. */
export function equityCurve(
  trades: readonly Trade[],
  startingBalance: Cents,
  ctx: MetricContext,
): EquityPoint[] {
  let equity = startingBalance;
  return closedInOrder(trades).map((t) => {
    equity += pnlOf(t, ctx.pnlBasis);
    return { time: t.closedAt, equity, tradeId: t.id };
  });
}

/**
 * The deepest fall of the cumulative daily P&L from a running peak, as TradeZella
 * reads it: days are booked by exit realization (the days the calendar shows), the
 * peak starts at the starting balance, and `pct` is the fall over the real balance
 * at the peak: the equity there plus the `flows` (deposits and withdrawals) dated on
 * or before the peak day; the starting-balance peak counts those dated before the
 * first day. `peakDay` is absent when the fall starts from the starting balance.
 */
export function maxDrawdown(
  days: readonly DayStat[],
  startingBalance: Cents,
  flows: readonly { date: string; amount: Cents }[] = [],
): Drawdown {
  const flowsTo = (date: string | undefined, inclusive: boolean): Cents =>
    flows.reduce(
      (n, f) =>
        date !== undefined && (inclusive ? f.date <= date : f.date < date)
          ? n + f.amount
          : n,
      0,
    );
  let equity = startingBalance;
  let peak = startingBalance;
  let peakBase = startingBalance + flowsTo(days[0]?.date, false);
  let peakDay: string | undefined;
  let amount = 0;
  let pct: number | null = 0;
  let sawPositivePeak = false;
  let result: Drawdown = { amount: 0, pct: 0 };
  for (const d of days) {
    equity += d.net;
    if (equity > peak) {
      peak = equity;
      peakDay = d.date;
      peakBase = peak + flowsTo(d.date, true);
    }
    const dd = peak - equity;
    if (dd > amount) {
      amount = dd;
      result = { ...result, amount, peakDay, troughDay: d.date };
    }
    if (peakBase > 0) {
      sawPositivePeak = true;
      const r = dd / peakBase;
      if (pct === null || r > pct) pct = r;
    }
  }
  // pct is null only when a drawdown exists but no positive peak ever did.
  result.pct = sawPositivePeak || amount === 0 ? pct : null;
  return result;
}

/**
 * How far the cumulative daily P&L sits under its highest point so far, a value per
 * day, 0 or below. The peak starts at the starting balance, as `maxDrawdown` reads
 * it, so the curve's low is that figure.
 */
export function drawdownSeries(
  days: readonly DayStat[],
): { key: string; value: number }[] {
  let equity = 0;
  let peak = 0;
  return days.map((d) => {
    equity += d.net;
    if (equity > peak) peak = equity;
    return { key: d.date, value: equity - peak };
  });
}

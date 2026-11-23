import { localDate } from '../time';
import { closedInOrder } from '../trade-status';
import type { Cents, Trade } from '../types';
import { pnlOf, type MetricContext } from './context';

export interface EquityPoint {
  time: string;
  equity: Cents;
  tradeId: string;
}
export interface Drawdown {
  amount: Cents;
  pct: number | null;
  peakAt?: string;
  troughAt?: string;
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
 * The deepest fall from a running peak. `pct` is that fall over the real balance at
 * the peak: the equity there plus the `flows` (deposits and withdrawals) dated on or
 * before the peak's local day; the starting-balance peak counts those dated before
 * the first closed trade's day.
 */
export function maxDrawdown(
  trades: readonly Trade[],
  startingBalance: Cents,
  ctx: MetricContext,
  flows: readonly { date: string; amount: Cents }[] = [],
): Drawdown {
  const curve = equityCurve(trades, startingBalance, ctx);
  const flowsTo = (date: string | undefined, inclusive: boolean): Cents =>
    flows.reduce(
      (n, f) =>
        date !== undefined && (inclusive ? f.date <= date : f.date < date)
          ? n + f.amount
          : n,
      0,
    );
  const firstDay = curve[0] && localDate(curve[0].time, ctx.timeZone);
  let peak = startingBalance;
  let peakBase = startingBalance + flowsTo(firstDay, false);
  let peakAt: string | undefined;
  let amount = 0;
  let pct: number | null = 0;
  let sawPositivePeak = false;
  let result: Drawdown = { amount: 0, pct: 0 };
  for (const p of curve) {
    if (p.equity > peak) {
      peak = p.equity;
      peakAt = p.time;
      peakBase = peak + flowsTo(localDate(p.time, ctx.timeZone), true);
    }
    const dd = peak - p.equity;
    if (dd > amount) {
      amount = dd;
      result = { ...result, amount, peakAt, troughAt: p.time };
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
 * How far the equity line sits under its highest point so far, a value per
 * local day: the deepest it reached that day, 0 or below. The peak starts at the
 * starting balance, as `maxDrawdown` reads it, so the curve's low is that figure.
 */
export function drawdownSeries(
  equity: readonly EquityPoint[],
  startingBalance: Cents,
  timeZone: string,
): { key: string; value: number }[] {
  let peak = startingBalance;
  const days = new Map<string, number>();
  for (const p of equity) {
    if (p.equity > peak) peak = p.equity;
    const key = localDate(p.time, timeZone);
    days.set(key, Math.min(days.get(key) ?? 0, p.equity - peak));
  }
  return [...days]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => ({ key, value }));
}

import { closedInOrder } from '../trade-status';
import type { Cents, Trade } from '../types';

export interface EquityPoint { time: string; equity: Cents; tradeId: string }
export interface Drawdown { amount: Cents; pct: number | null; peakAt?: string; troughAt?: string }

/** Closed-trade equity; the input must be a single-currency set. */
export function equityCurve(trades: readonly Trade[], startingBalance: Cents): EquityPoint[] {
  let equity = startingBalance;
  return closedInOrder(trades).map((t) => {
    equity += t.net;
    return { time: t.closedAt, equity, tradeId: t.id };
  });
}

export function maxDrawdown(trades: readonly Trade[], startingBalance: Cents): Drawdown {
  let peak = startingBalance;
  let peakAt: string | undefined;
  let amount = 0;
  let pct: number | null = 0;
  let sawPositivePeak = false;
  let result: Drawdown = { amount: 0, pct: 0 };
  for (const p of equityCurve(trades, startingBalance)) {
    if (p.equity > peak) {
      peak = p.equity;
      peakAt = p.time;
    }
    const dd = peak - p.equity;
    if (dd > amount) {
      amount = dd;
      result = { ...result, amount, peakAt, troughAt: p.time };
    }
    if (peak > 0) {
      sawPositivePeak = true;
      const r = dd / peak;
      if (pct === null || r > pct) pct = r;
    }
  }
  // pct is null only when a drawdown exists but no positive peak ever did.
  result.pct = sawPositivePeak || amount === 0 ? pct : null;
  return result;
}

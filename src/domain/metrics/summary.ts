import { quoteToPnl } from '../currency';
import { roundHalfEven, toCents } from '../money';
import { outcomeOf } from '../outcome';
import { isClosed } from '../trade-status';
import type { Cents, Trade } from '../types';
import { costBasis, pnlOf, type MetricContext, type PnlBasis } from './context';

export interface Summary {
  closedCount: number; openCount: number; wins: number; losses: number; breakevens: number;
  netPnl: Cents; grossPnl: Cents; fees: Cents;
  /** Which P&L every classification, sum and ratio below is computed on. */
  basis: PnlBasis;
  winRate: number | null; profitFactor: number | null;
  avgWin: Cents | null; avgLoss: Cents | null; winLossRatio: number | null;
  expectancy: Cents | null;
  avgRealizedR: number | null; realizedRTradeCount: number; noRiskCount: number;
  avgPlannedR: number | null; plannedRTradeCount: number;
  largestWin: Cents | null; largestLoss: Cents | null; ruleAdherence: number | null;
  /** Sorted distinct pnlCurrency values of the closed trades; more than one means the set is mixed. */
  currencies: string[];
}

/** Realized R: P&L on the basis / initialRisk, only when initialRisk > 0. */
export function rOf(trade: Trade, basis: PnlBasis = 'net'): number | undefined {
  if (trade.initialRisk === undefined || !(trade.initialRisk > 0)) return undefined;
  return pnlOf(trade, basis) / trade.initialRisk;
}

/** Planned R: |target - entry| / |entry - stop|; needs both a target and a stop distinct from the entry. */
export function plannedR(trade: Trade): number | undefined {
  const { plannedStop: stop, plannedTarget: target, avgEntry } = trade;
  if (stop === undefined || target === undefined) return undefined;
  const risk = Math.abs(avgEntry - stop);
  return risk === 0 ? undefined : Math.abs(target - avgEntry) / risk;
}

/**
 * Risk in cents implied by a stop price: |avgEntry - stop| x maxPosition x pointValue,
 * converted to the trade's P&L currency at the entry price.
 */
export function riskFromStop(trade: Trade, stop: number): Cents {
  const quote = Math.abs(trade.avgEntry - stop) * trade.maxPosition * trade.instrument.pointValue;
  return toCents(quoteToPnl(quote, trade.instrument, trade.pnlCurrency, trade.avgEntry));
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

/**
 * Aggregate closed trades. The input must be a single-currency set (the data layer
 * partitions by pnlCurrency first); `currencies` lets the UI warn when it is not.
 */
export function summarize(trades: readonly Trade[], ctx: MetricContext): Summary {
  const closed = trades.filter(isClosed);
  const classified = closed.map((t) => {
    const value = pnlOf(t, ctx.pnlBasis);
    const basis = costBasis(t);
    return { value, outcome: outcomeOf(value, ctx.breakevenRange, basis > 0 ? value / basis : undefined) };
  });
  const winNets = classified.filter((c) => c.outcome === 'win').map((c) => c.value);
  const lossNets = classified.filter((c) => c.outcome === 'loss').map((c) => c.value);
  const wins = winNets.length;
  const losses = lossNets.length;

  const winSum = sum(winNets);
  const lossSum = sum(lossNets);
  const avgWinRaw = ratio(winSum, wins);
  const avgLossRaw = ratio(lossSum, losses);

  const rs = closed.map((t) => rOf(t, ctx.pnlBasis)).filter((r): r is number => r !== undefined);
  const planned = closed.map(plannedR).filter((r): r is number => r !== undefined);
  const checks = closed.flatMap((t) => t.ruleChecks).filter((c) => c.followed !== null);
  const followed = checks.filter((c) => c.followed === true).length;
  const decisive = wins + losses;
  // Win% x Avg Win + Loss% x Avg Loss (avg loss is negative), over decisive trades, unrounded.
  const expectancy =
    decisive === 0 ? null : (wins / decisive) * (avgWinRaw ?? 0) + (losses / decisive) * (avgLossRaw ?? 0);

  return {
    closedCount: closed.length,
    openCount: trades.length - closed.length,
    wins,
    losses,
    breakevens: closed.length - wins - losses,
    netPnl: sum(closed.map((t) => t.net)),
    basis: ctx.pnlBasis,
    grossPnl: sum(closed.map((t) => t.gross)),
    fees: sum(closed.map((t) => t.fees)),
    winRate: ratio(wins, decisive),
    profitFactor: losses === 0 ? null : ratio(winSum, Math.abs(lossSum)),
    avgWin: avgWinRaw === null ? null : roundHalfEven(avgWinRaw),
    avgLoss: avgLossRaw === null ? null : roundHalfEven(avgLossRaw),
    winLossRatio:
      avgWinRaw === null || avgLossRaw === null || avgLossRaw === 0 ? null : avgWinRaw / Math.abs(avgLossRaw),
    expectancy: expectancy === null ? null : roundHalfEven(expectancy),
    avgRealizedR: ratio(sum(rs), rs.length),
    realizedRTradeCount: rs.length,
    noRiskCount: closed.length - rs.length,
    avgPlannedR: ratio(sum(planned), planned.length),
    plannedRTradeCount: planned.length,
    largestWin: wins === 0 ? null : Math.max(...winNets),
    largestLoss: losses === 0 ? null : Math.min(...lossNets),
    ruleAdherence: ratio(followed, checks.length),
    currencies: [...new Set(closed.map((t) => t.pnlCurrency))].sort(),
  };
}

import { roundHalfEven, toCents } from '../money';
import type { Cents, Trade } from '../types';

export interface Summary {
  closedCount: number; openCount: number; wins: number; losses: number; breakevens: number;
  netPnl: Cents; grossPnl: Cents; fees: Cents;
  winRate: number | null; profitFactor: number | null;
  avgWin: Cents | null; avgLoss: Cents | null; winLossRatio: number | null;
  expectancy: Cents | null; expectancyR: number | null; rTradeCount: number; noRiskCount: number;
  largestWin: Cents | null; largestLoss: Cents | null; ruleAdherence: number | null;
}

/** R multiple: net / initialRisk, only when initialRisk > 0. */
export function rOf(trade: Trade): number | undefined {
  if (trade.initialRisk === undefined || !(trade.initialRisk > 0)) return undefined;
  return trade.net / trade.initialRisk;
}

/** Risk in cents implied by a stop price: |avgEntry - stop| x maxPosition x pointValue. */
export function riskFromStop(trade: Trade, stop: number): Cents {
  return toCents(Math.abs(trade.avgEntry - stop) * trade.maxPosition * trade.instrument.pointValue);
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

export function summarize(trades: readonly Trade[], opts: { breakevenThreshold: Cents }): Summary {
  const th = opts.breakevenThreshold;
  const closed = trades.filter((t) => t.status === 'closed');
  const nets = closed.map((t) => t.net);
  const winNets = nets.filter((n) => n > th);
  const lossNets = nets.filter((n) => n < -th);
  const wins = winNets.length;
  const losses = lossNets.length;

  const winSum = sum(winNets);
  const lossSum = sum(lossNets);
  const avgWinRaw = ratio(winSum, wins);
  const avgLossRaw = ratio(lossSum, losses);

  const rs = closed.map(rOf).filter((r): r is number => r !== undefined);
  const checks = closed.flatMap((t) => t.ruleChecks).filter((c) => c.followed !== null);
  const followed = checks.filter((c) => c.followed === true).length;
  const netPnl = sum(nets);
  const expectancy = ratio(netPnl, closed.length);

  return {
    closedCount: closed.length,
    openCount: trades.length - closed.length,
    wins,
    losses,
    breakevens: closed.length - wins - losses,
    netPnl,
    grossPnl: sum(closed.map((t) => t.gross)),
    fees: sum(closed.map((t) => t.fees)),
    winRate: ratio(wins, wins + losses),
    profitFactor: losses === 0 ? null : ratio(winSum, Math.abs(lossSum)),
    avgWin: avgWinRaw === null ? null : roundHalfEven(avgWinRaw),
    avgLoss: avgLossRaw === null ? null : roundHalfEven(avgLossRaw),
    winLossRatio:
      avgWinRaw === null || avgLossRaw === null || avgLossRaw === 0 ? null : avgWinRaw / Math.abs(avgLossRaw),
    expectancy: expectancy === null ? null : roundHalfEven(expectancy),
    expectancyR: ratio(sum(rs), rs.length),
    rTradeCount: rs.length,
    noRiskCount: closed.length - rs.length,
    largestWin: wins === 0 ? null : Math.max(...winNets),
    largestLoss: losses === 0 ? null : Math.min(...lossNets),
    ruleAdherence: ratio(followed, checks.length),
  };
}

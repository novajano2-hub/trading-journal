import { closedInOrder } from '../trade-status';
import type { Cents, Trade } from '../types';
import { classify, type MetricContext } from './context';
import { minuteOfDay } from './scatter';
import { unitOf } from './units';

/** The figures after one closed trade, in the order the trades closed through the day. */
export interface ThroughDayPoint {
  tradeId: string;
  /** Minutes of the local day the trade closed at: where the point sits. */
  minute: number;
  /** The closed trades up to and including this one. */
  trades: number;
  /** Wins over wins and losses so far (a breakeven decides nothing); null before the first decided trade. */
  winRate: number | null;
  /** The mean winning trade so far, in cents (or the unit's own number under a narrowing unit). */
  avgWin: number | null;
  /** The mean losing trade so far, negative: a loss. */
  avgLoss: number | null;
}

/**
 * The closed trades in order of the time of day they closed, whatever the day,
 * with the running win rate, average win and average loss after each (C14):
 * how a trader's results evolve through the day. Trades are classified on the
 * breakeven range as every figure is; the averages read the unit when a
 * narrowing one is set. The set is already the filtered one.
 */
export function throughDay(
  trades: readonly Trade[],
  ctx: Pick<MetricContext, 'timeZone' | 'pnlBasis' | 'breakevenRange' | 'unit'>,
): ThroughDayPoint[] {
  const ordered = closedInOrder(trades)
    .map((t) => ({ t, minute: minuteOfDay(t.closedAt, ctx.timeZone) }))
    // Stable: trades closing in one minute keep the order they closed in.
    .sort((a, b) => a.minute - b.minute);
  let wins = 0;
  let losses = 0;
  let winSum = 0;
  let winN = 0;
  let lossSum = 0;
  let lossN = 0;
  return ordered.map(({ t, minute }, i) => {
    const { value, outcome } = classify(t, ctx);
    if (outcome !== 'breakeven') {
      const amount: Cents | number | null = ctx.unit
        ? unitOf(t, ctx.unit, ctx.pnlBasis)
        : value;
      if (outcome === 'win') {
        wins += 1;
        if (amount !== null) {
          winSum += amount;
          winN += 1;
        }
      } else {
        losses += 1;
        if (amount !== null) {
          lossSum += amount;
          lossN += 1;
        }
      }
    }
    return {
      tradeId: t.id,
      minute,
      trades: i + 1,
      winRate: wins + losses === 0 ? null : wins / (wins + losses),
      avgWin: winN === 0 ? null : winSum / winN,
      avgLoss: lossN === 0 ? null : lossSum / lossN,
    };
  });
}

import { outcomeOf } from '../outcome';
import { closedInOrder } from '../trade-status';
import type { Cents, Trade } from '../types';
import { costBasis, pnlOf, type MetricContext } from './context';

export interface StreakResult {
  maxWin: number;
  maxLoss: number;
  current: { kind: 'win' | 'loss' | null; length: number };
}

/** Folds decisive outcomes (undefined = neutral: skipped, neither extends nor breaks). */
export function streaksOf(
  outcomes: readonly ('win' | 'loss' | undefined)[],
): StreakResult {
  let maxWin = 0;
  let maxLoss = 0;
  let kind: 'win' | 'loss' | null = null;
  let length = 0;
  for (const o of outcomes) {
    if (o === undefined) continue;
    length = o === kind ? length + 1 : 1;
    kind = o;
    if (o === 'win') maxWin = Math.max(maxWin, length);
    else maxLoss = Math.max(maxLoss, length);
  }
  return {
    maxWin,
    maxLoss,
    current: { kind, length: kind === null ? 0 : length },
  };
}

export function tradeStreaks(
  trades: readonly Trade[],
  ctx: MetricContext,
): StreakResult {
  return streaksOf(
    closedInOrder(trades).map((t) => {
      const value = pnlOf(t, ctx.pnlBasis);
      const basis = costBasis(t);
      const o = outcomeOf(
        value,
        ctx.breakevenRange,
        basis > 0 ? value / basis : undefined,
      );
      return o === 'breakeven' ? undefined : o;
    }),
  );
}

/**
 * The wins in a row ending at the last item (C16): 0 when the last is not a
 * win. A breakeven or a loss ends a run, unlike `streaksOf`, which skips
 * breakevens. A win is a P&L above zero, so a caller with a breakeven range
 * passes its breakevens as 0.
 */
export function winStreak(items: readonly { pnl: Cents }[]): number {
  let n = 0;
  for (let i = items.length - 1; i >= 0 && items[i]!.pnl > 0; i--) n++;
  return n;
}

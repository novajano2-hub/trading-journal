import { outcomeOf } from '../outcome';
import { closedInOrder } from '../trade-status';
import type { Trade } from '../types';
import { costBasis, pnlOf, type MetricContext } from './context';

export interface StreakResult {
  maxWin: number;
  maxLoss: number;
  current: { kind: 'win' | 'loss' | null; length: number };
}

/** Folds decisive outcomes (undefined = neutral: skipped, neither extends nor breaks). */
export function streaksOf(outcomes: readonly ('win' | 'loss' | undefined)[]): StreakResult {
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
  return { maxWin, maxLoss, current: { kind, length: kind === null ? 0 : length } };
}

export function tradeStreaks(trades: readonly Trade[], ctx: MetricContext): StreakResult {
  return streaksOf(
    closedInOrder(trades).map((t) => {
      const value = pnlOf(t, ctx.pnlBasis);
      const basis = costBasis(t);
      const o = outcomeOf(value, ctx.breakevenRange, basis > 0 ? value / basis : undefined);
      return o === 'breakeven' ? undefined : o;
    }),
  );
}

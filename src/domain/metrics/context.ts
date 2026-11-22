import { quoteToPnl } from '../currency';
import { toCents } from '../money';
import { outcomeOf } from '../outcome';
import type { BreakevenRange, Cents, PnlBasis, Trade } from '../types';

export type { BreakevenRange, PnlBasis } from '../types';

export interface MetricContext {
  timeZone: string;
  breakevenRange: BreakevenRange;
  pnlBasis: PnlBasis;
  /**
   * The date filter, resolved (inclusive local dates; an open end is open).
   * Day-level figures take only the realizations and fills dated inside it;
   * trade-level sets are already chosen by the filters.
   */
  range?: { from?: string; to?: string };
}

/** Whether a local date falls inside `range` (always, when there is none). */
export function inRange(
  date: string,
  range: { from?: string; to?: string } | undefined,
): boolean {
  if (!range) return true;
  if (range.from !== undefined && date < range.from) return false;
  if (range.to !== undefined && date > range.to) return false;
  return true;
}

export function defaultMetricContext(timeZone: string): MetricContext {
  return {
    timeZone,
    breakevenRange: { unit: 'amount', from: 0, to: 0 },
    pnlBasis: 'net',
  };
}

/** The trade's P&L on the chosen basis: gross excludes fees and commissions. */
export function pnlOf(t: Trade, basis: PnlBasis): Cents {
  return basis === 'gross' ? t.gross : t.net;
}

/** Capital committed: avgEntry x maxPosition x pointValue, in the P&L currency. The denominator of Net ROI. */
export function costBasis(t: Trade): Cents {
  return toCents(
    quoteToPnl(
      t.avgEntry * t.maxPosition * t.instrument.pointValue,
      t.instrument,
      t.pnlCurrency,
      t.avgEntry,
    ),
  );
}

/**
 * The one way a closed trade is classified: its P&L on the chosen basis against
 * the breakeven range (percent ranges use Net ROI on the cost basis). `summarize`
 * and the Outcome filter both call it, so they never disagree.
 */
export function classify(
  t: Trade,
  ctx: Pick<MetricContext, 'pnlBasis' | 'breakevenRange'>,
): { value: Cents; outcome: 'win' | 'loss' | 'breakeven' } {
  const value = pnlOf(t, ctx.pnlBasis);
  const basis = costBasis(t);
  return {
    value,
    outcome: outcomeOf(
      value,
      ctx.breakevenRange,
      basis > 0 ? value / basis : undefined,
    ),
  };
}

import { quoteToPnl } from '../currency';
import { toCents } from '../money';
import type { BreakevenRange, Cents, PnlBasis, Trade } from '../types';

export type { BreakevenRange, PnlBasis } from '../types';

export interface MetricContext {
  timeZone: string;
  breakevenRange: BreakevenRange;
  pnlBasis: PnlBasis;
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

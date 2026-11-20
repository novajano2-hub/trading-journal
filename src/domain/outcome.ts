import type { BreakevenRange, Cents } from './types';

/**
 * Classify a result against the breakeven range (inclusive at both ends).
 * Amount ranges compare `value`; percent ranges compare `roi` (value / cost basis).
 * A percent range without a usable `roi` (cost basis 0) falls back to amount 0..0.
 */
export function outcomeOf(
  value: Cents,
  range: BreakevenRange,
  roi?: number,
): 'win' | 'loss' | 'breakeven' {
  let v: number = value;
  let from = 0;
  let to = 0;
  if (range.unit === 'amount') {
    from = range.from;
    to = range.to;
  } else if (roi !== undefined) {
    v = roi;
    from = range.from;
    to = range.to;
  }
  return v > to ? 'win' : v < from ? 'loss' : 'breakeven';
}

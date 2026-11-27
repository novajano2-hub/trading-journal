import type { TradeUnit } from '@/domain/metrics/units';
import type { DisplayUnit } from '@/domain/types';

/** How each unit that narrows the trade set is named, and the trades it keeps, in words. */
export const UNIT_SCOPE: Record<TradeUnit, { name: string; keeps: string }> = {
  r: { name: 'R-multiple', keeps: 'trades with a stop' },
  ticks: { name: 'Ticks', keeps: 'futures trades' },
  pips: { name: 'Pips', keeps: 'forex trades' },
  points: { name: 'Points', keeps: 'futures trades' },
};

/** A page with no closed (or open) trade the unit reads: what its empty state says. */
export function unitEmptyCopy(
  unit: TradeUnit,
  status: 'closed' | 'open' = 'closed',
): { title: string; body: string } {
  const { name, keeps } = UNIT_SCOPE[unit];
  return {
    title: `No ${status} ${keeps} in these filters.`,
    body: `${name} counts ${keeps} only.`,
  };
}

/** What each display unit says in a caption: "in dollars", "with amounts hidden". The snapshot and the printed report read it. */
export const UNIT_WORDS: Record<DisplayUnit, string> = {
  dollar: 'in dollars',
  percent: 'in percent',
  r: 'in R',
  ticks: 'in ticks',
  pips: 'in pips',
  points: 'in points',
  privacy: 'with amounts hidden',
};

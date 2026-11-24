import type { TradeUnit } from '@/domain/metrics/units';

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

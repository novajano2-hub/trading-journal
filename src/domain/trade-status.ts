import type { Trade } from './types';

export type ClosedTrade = Trade & { closedAt: string };

/** The one definition of "closed": status closed and a close time. */
export function isClosed(t: Trade): t is ClosedTrade {
  return t.status === 'closed' && t.closedAt !== undefined;
}

/** Closed trades only, ordered by closedAt (instant) then serial. */
export function closedInOrder(trades: readonly Trade[]): ClosedTrade[] {
  return trades
    .filter(isClosed)
    .sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt) || a.serial - b.serial);
}

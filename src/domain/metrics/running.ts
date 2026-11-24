import { closedInOrder } from '../trade-status';
import { localDate } from '../time';
import type { Trade } from '../types';

/**
 * A running total over the closed trades, read at the close of each exit day
 * (the trader's local date of `closedAt`), oldest first. `value` is what each
 * trade adds: its P&L, or its figure in a display unit. Open trades are left
 * out; no closed trade gives an empty line.
 */
export function runningByExit(
  trades: readonly Trade[],
  value: (t: Trade) => number,
  timeZone: string,
): number[] {
  const out: number[] = [];
  let total = 0;
  let day: string | undefined;
  for (const t of closedInOrder(trades)) {
    const d = localDate(t.closedAt, timeZone);
    total += value(t);
    if (d === day) out[out.length - 1] = total;
    else {
      out.push(total);
      day = d;
    }
  }
  return out;
}

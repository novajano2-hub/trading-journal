import { TZDate } from '@date-fns/tz';
import { closedInOrder } from '../trade-status';
import type { Cents, Trade } from '../types';
import { pnlOf, type MetricContext } from './context';

export interface ScatterPoint {
  tradeId: string;
  /** Minutes of the local day, or log10 of the minutes held. */
  x: number;
  pnl: Cents;
}

/** The hold-time axis labels, left to right (log scale). */
export const DURATION_TICKS = [
  '4m',
  '8m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '7h',
  '14h',
  '1d',
  '2d',
  '4d',
] as const;

const MINUTE = 60_000;

// The hour and minute only: `localParts` also formats the date, three times the work over a few thousand trades.
const minuteOfDay = (iso: string, timeZone: string) => {
  const d = new TZDate(Date.parse(iso), timeZone);
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * One point per closed trade, in the order the trades closed (C19): the trade's
 * P&L on the chosen basis against the minute of the local day it opened
 * (`entry`) or closed (`exit`) in `ctx.timeZone`, or against log10 of the
 * minutes it was held (`duration`). A trade held under a minute plots at one
 * minute, where the log axis would otherwise run to minus infinity. The set is
 * already the filtered one; the range does not cut it further.
 */
export function scatterPoints(
  trades: readonly Trade[],
  ctx: Pick<MetricContext, 'timeZone' | 'pnlBasis'>,
  axis: 'entry' | 'exit' | 'duration',
): ScatterPoint[] {
  return closedInOrder(trades).map((t) => ({
    tradeId: t.id,
    x:
      axis === 'entry'
        ? minuteOfDay(t.openedAt, ctx.timeZone)
        : axis === 'exit'
          ? minuteOfDay(t.closedAt, ctx.timeZone)
          : Math.log10(
              Math.max(
                1,
                (Date.parse(t.closedAt) - Date.parse(t.openedAt)) / MINUTE,
              ),
            ),
    pnl: pnlOf(t, ctx.pnlBasis),
  }));
}

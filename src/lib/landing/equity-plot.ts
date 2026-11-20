import type { DayStat } from '@/domain/metrics/days';
import type { EquityPoint } from '@/domain/metrics/equity';
import type { Cents } from '@/domain/types';

export interface Plotted {
  x: number; // 0..1000 across the week
  y: number; // 0..1000, top down
  day: number;
  point?: EquityPoint;
}

/**
 * Lay the equity points out on the week: five equal day columns, each day's
 * closes spaced inside its own column, the starting balance at the left edge.
 * Shared by the recap sheet's curve and the rack's analytics mark.
 */
export function plotEquity(
  equity: readonly EquityPoint[],
  days: readonly DayStat[],
  start: Cents,
) {
  const values = [start, ...equity.map((p) => p.equity)];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.14 || 1;
  const y = (v: number) => 1000 - ((v - lo + pad) / (hi - lo + 2 * pad)) * 1000;
  const col = 1000 / days.length;
  const points: Plotted[] = [{ x: 0, y: y(start), day: 0 }];
  let i = 0;
  days.forEach((d, day) => {
    for (let k = 0; k < d.tradeCount; k++) {
      const p = equity[i++];
      if (!p) continue;
      points.push({
        x: col * day + (col * (k + 1)) / (d.tradeCount + 1),
        y: y(p.equity),
        day,
        point: p,
      });
    }
  });
  return { points, col, baseline: y(start) };
}

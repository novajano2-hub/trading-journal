'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/** The width a chart draws at before it has been measured (and where nothing is laid out). */
export const DEFAULT_WIDTH = 720;

/**
 * The width of the box a chart fills, tracked as it resizes. Measured before
 * paint, so a chart never shows a frame at the wrong width; `active` turns
 * the observer on once the box exists (a chart with no data has none).
 */
export function useBoxWidth(
  box: RefObject<HTMLElement | null>,
  active: boolean,
): number {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [box, active]);
  return width;
}

/**
 * The labels that fit: left to right, each kept only when it sits at least
 * `gap` pixels after the last one kept.
 */
export function thinTicks<T extends { px: number }>(
  ticks: readonly T[],
  gap: number,
): T[] {
  const out: T[] = [];
  let last = -Infinity;
  for (const t of ticks)
    if (t.px - last >= gap) {
      out.push(t);
      last = t.px;
    }
  return out;
}

/** The look of a chart's hover and focus readout: one card, in the house style. */
export const READOUT =
  'pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-control border border-line bg-surface-1 px-2.5 py-2 text-[12.5px] whitespace-nowrap text-muted shadow-[var(--shadow)]';

/**
 * How far the plot stops short of the chart's right edge: at least `base`, and
 * enough for the last x label, which is centred on its tick and would run off
 * the edge (and be clipped) when its tick is at the plot's end.
 */
export function endRoom(
  ticks: readonly { at: number; text: string }[],
  lo: number,
  hi: number,
  base: number,
): number {
  const near = hi - Math.max((hi - lo) * 0.04, 0.51);
  return Math.max(
    base,
    ...ticks
      .filter((t) => t.at >= near)
      .map((t) => Math.ceil(t.text.length * 3.3) + 2),
  );
}

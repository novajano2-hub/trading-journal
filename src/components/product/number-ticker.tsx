'use client';

// Adapted from HorizonX animated-number-ticker, commercial licence.
// Counts up to the exact final string; screen readers only ever get that final value.
import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { EASING_POINTS } from '@/lib/motion';
import { formatPct, formatPnl, formatRatio } from '@/lib/format';

export type TickerKind = 'money' | 'pct' | 'ratio';

/** The single formatter for each kind: cents for money, 0..1 for pct, a plain ratio for ratio. */
export function formatTicker(kind: TickerKind, value: number): string {
  if (kind === 'money') return formatPnl(Math.round(value));
  if (kind === 'pct') return formatPct(value, 1);
  return formatRatio(value);
}

/**
 * What the visible counter shows. Under reduced motion it is the final value at once;
 * otherwise it follows the count, which starts at zero so the final value never flashes first.
 */
export function visibleTickerValue(
  reduced: boolean | null,
  counted: number,
  value: number,
): number {
  return reduced ? value : counted;
}

const DURATION_S = 0.9;

export function NumberTicker({
  value,
  kind,
  className = '',
}: {
  value: number;
  kind: TickerKind;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [shown, setShown] = useState(0);
  const final = formatTicker(kind, value);
  const tone =
    kind === 'money' && Math.round(value) !== 0
      ? value > 0
        ? 'text-gain'
        : 'text-loss'
      : '';

  useEffect(() => {
    if (reduced || !inView) return;
    const controls = animate(0, value, {
      duration: DURATION_S,
      ease: [...EASING_POINTS.out],
      onUpdate: setShown,
      onComplete: () => setShown(value),
    });
    return () => controls.stop();
  }, [inView, reduced, value]);

  return (
    <span
      ref={ref}
      className={`inline-block font-mono tabular-nums ${tone} ${className}`}
      style={{ minWidth: `${final.length}ch` }}
    >
      <span className="sr-only">{final}</span>
      <span aria-hidden="true">
        {formatTicker(kind, visibleTickerValue(reduced, shown, value))}
      </span>
    </span>
  );
}

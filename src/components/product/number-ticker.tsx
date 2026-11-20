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

const DURATION_S = 0.9;

/**
 * Without JS the count never runs, and under reduced motion it must not: CSS
 * then shows the final copy instead of the counter (see `motion-reduce:`).
 * The counter itself always starts at zero, so the server and the first
 * client render agree whatever the visitor's motion setting.
 */
const NO_SCRIPT_CSS =
  '.ticker-count{display:none!important}.ticker-final{display:inline!important}';

export function NumberTicker({
  value,
  kind,
  delay = 0,
  className = '',
}: {
  value: number;
  kind: TickerKind;
  /** Seconds to wait once in view, to sit in a larger entrance. */
  delay?: number;
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
      delay,
      duration: DURATION_S,
      ease: [...EASING_POINTS.out],
      onUpdate: setShown,
      onComplete: () => setShown(value),
    });
    return () => controls.stop();
  }, [delay, inView, reduced, value]);

  return (
    <span
      ref={ref}
      className={`inline-block font-mono tabular-nums ${tone} ${className}`}
      style={{ minWidth: `${final.length}ch` }}
    >
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
      <span className="sr-only">{final}</span>
      <span aria-hidden="true" className="ticker-count motion-reduce:hidden">
        {formatTicker(kind, shown)}
      </span>
      <span
        aria-hidden="true"
        className="ticker-final hidden motion-reduce:inline"
      >
        {final}
      </span>
    </span>
  );
}

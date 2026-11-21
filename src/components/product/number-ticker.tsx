'use client';

// Adapted from HorizonX animated-number-ticker, commercial licence.
// Counts up to the exact final string; screen readers only ever get that final value.
import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { EASING_POINTS } from '@/lib/motion';
import {
  formatAdherence,
  formatPct,
  formatPnl,
  formatRatio,
} from '@/lib/format';

export type TickerKind = 'money' | 'pct' | 'adherence' | 'ratio';

/** The single formatter for each kind: cents for money, 0..1 for pct and adherence, a plain ratio for ratio. */
export function formatTicker(
  kind: TickerKind,
  value: number,
  opts: { digits?: number; currency?: string } = {},
): string {
  if (kind === 'money')
    return formatPnl(Math.round(value), opts.currency ?? 'USD');
  if (kind === 'pct') return formatPct(value, opts.digits ?? 1);
  if (kind === 'adherence') return formatAdherence(value);
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
  digits,
  currency,
  className = '',
}: {
  value: number;
  kind: TickerKind;
  /** Seconds to wait once in view, to sit in a larger entrance. */
  delay?: number;
  /** Decimals for pct (default 1). */
  digits?: number;
  /** ISO code for money (default USD). */
  currency?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [shown, setShown] = useState(0);
  // What is on screen now, so a later value counts from here and not from zero.
  const shownRef = useRef(0);
  const fmt = { digits, currency };
  const final = formatTicker(kind, value, fmt);
  const tone =
    kind === 'money' && Math.round(value) !== 0
      ? value > 0
        ? 'text-gain'
        : 'text-loss'
      : '';

  useEffect(() => {
    if (reduced || !inView) return;
    const controls = animate(shownRef.current, value, {
      delay,
      duration: DURATION_S,
      ease: [...EASING_POINTS.out],
      onUpdate: (v) => {
        shownRef.current = v;
        setShown(v);
      },
      onComplete: () => {
        shownRef.current = value;
        setShown(value);
      },
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
        {formatTicker(kind, shown, fmt)}
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

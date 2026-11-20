'use client';

import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { equityPath } from '@/lib/landing/equity-path';
import { EASING_POINTS } from '@/lib/motion';

const BOX = { xMax: 680, top: 15, bottom: 145, floor: 160 } as const;
const DRAW_S = 0.9;

/**
 * Equity curve from the engine's series. By default the line draws once when
 * it scrolls into view. `draw="entrance"` hands the draw to CSS instead, timed
 * by `delayMs`, so it can play inside a page-load entrance before JS arrives.
 */
export function EquityChart({
  series,
  label,
  draw = 'in-view',
  delayMs = 0,
}: {
  /** Equity in cents, starting balance first. */
  series: readonly number[];
  label: string;
  draw?: 'in-view' | 'entrance';
  delayMs?: number;
}) {
  const reduced = useReducedMotion();
  const gid = `eq-${useId().replace(/:/g, '')}`;
  const { line, area } = equityPath(series, BOX);
  const grid = [20, 85, 150];
  // Inline, so it outranks the delay the `animation` shorthand resets.
  const timed = { animationDelay: `${delayMs}ms` };
  return (
    <div className="px-3.5 pb-1.5">
      {/* Without JS the in-view draw never runs, so show the finished curve. */}
      <noscript>
        <style>
          {'.eq-draw{opacity:1!important;stroke-dasharray:none!important}'}
        </style>
      </noscript>
      {/* Scales uniformly with its width, so a pathLength draw stays exact. */}
      <svg
        viewBox="0 0 700 170"
        width="100%"
        role="img"
        aria-label={label}
        className="block h-auto"
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--gain)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--gain)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="var(--line)">
          {grid.map((y) => (
            <line
              key={y}
              x1="0"
              x2="700"
              y1={y}
              y2={y}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {draw === 'entrance' ? (
          <>
            <path
              d={area}
              fill={`url(#${gid})`}
              style={timed}
              className="motion-safe:animate-fade"
            />
            <path
              d={line}
              fill="none"
              stroke="var(--gain)"
              strokeWidth="2"
              strokeLinejoin="round"
              pathLength={1}
              style={timed}
              className="motion-safe:animate-draw"
            />
          </>
        ) : (
          <>
            <motion.path
              d={area}
              className="eq-draw"
              fill={`url(#${gid})`}
              initial={reduced ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: DRAW_S, ease: [...EASING_POINTS.out] }}
            />
            <motion.path
              d={line}
              className="eq-draw"
              fill="none"
              stroke="var(--gain)"
              strokeWidth="2"
              strokeLinejoin="round"
              initial={reduced ? false : { pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: DRAW_S, ease: [...EASING_POINTS.out] }}
            />
          </>
        )}
      </svg>
    </div>
  );
}

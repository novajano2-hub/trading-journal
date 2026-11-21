'use client';

import { useId } from 'react';
import { equityPath } from '@/lib/landing/equity-path';

const BOX = { xMax: 680, top: 15, bottom: 145, floor: 160 } as const;

/**
 * Equity curve from the engine's series, in the app's ultramarine: the line,
 * an area that fades from it, a dashed baseline at the starting balance and a
 * marker on the latest point. The draw is CSS, timed by `delayMs`, so it
 * plays inside a page-load entrance before JS arrives.
 */
export function EquityChart({
  series,
  label,
  delayMs = 0,
}: {
  /** Equity in cents, starting balance first. */
  series: readonly number[];
  label: string;
  delayMs?: number;
}) {
  const gid = `eq-${useId().replace(/:/g, '')}`;
  const { line, area, first, last } = equityPath(series, BOX);
  // Inline, so it outranks the delay the `animation` shorthand resets.
  const timed = { animationDelay: `${delayMs}ms` };
  // The marker lands as the line arrives at it.
  const landed = { animationDelay: `${delayMs + 600}ms` };
  return (
    <div className="px-4 pt-1 pb-2">
      {/* Scales uniformly with its width, so a pathLength draw stays exact. */}
      <svg
        viewBox="0 0 700 170"
        width="100%"
        role="img"
        aria-label={label}
        className="block h-auto overflow-visible"
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.3" />
            <stop offset="0.55" stopColor="var(--accent)" stopOpacity="0.11" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {first ? (
          <line
            x1="0"
            x2="700"
            y1={first.y}
            y2={first.y}
            stroke="var(--line-2)"
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <path
          d={area}
          fill={`url(#${gid})`}
          style={timed}
          className="motion-safe:animate-fade"
        />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          style={timed}
          className="motion-safe:animate-draw"
        />
        {last ? (
          <circle
            cx={last.x}
            cy={last.y}
            r="4.5"
            fill="var(--surface-1)"
            stroke="var(--accent)"
            strokeWidth="2.25"
            style={landed}
            className="motion-safe:animate-fade"
          />
        ) : null}
      </svg>
    </div>
  );
}

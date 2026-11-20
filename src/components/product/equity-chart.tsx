'use client';

import { useId } from 'react';
import { equityPath } from '@/lib/landing/equity-path';

const BOX = { xMax: 680, top: 15, bottom: 145, floor: 160 } as const;

/**
 * Equity curve from the engine's series. The draw is CSS, timed by `delayMs`,
 * so it plays inside a page-load entrance before JS arrives.
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
  const { line, area } = equityPath(series, BOX);
  const grid = [20, 85, 150];
  // Inline, so it outranks the delay the `animation` shorthand resets.
  const timed = { animationDelay: `${delayMs}ms` };
  return (
    <div className="px-3.5 pb-1.5">
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
      </svg>
    </div>
  );
}

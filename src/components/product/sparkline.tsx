import { useId } from 'react';
import { equityPath } from '@/lib/landing/equity-path';

/** The equity chart's drawing box, in viewBox units. */
const W = 460;
const H = 80;

/**
 * An equity line in the accent: a soft area fading down to nothing, a
 * hairline at the starting value and a ringed dot on the last point. The
 * line draws in once and the rest fades in after it; under reduced motion
 * everything is simply there. `variant="line"` is the small KPI trend: the
 * line alone, 2 points or more, decorative unless it is given a label.
 */
export function Sparkline({
  series,
  label,
  className = '',
  variant = 'area',
}: {
  series: readonly number[];
  label?: string;
  className?: string;
  variant?: 'area' | 'line';
}): React.JSX.Element | null {
  const gradientId = `eq${useId().replace(/[^\w-]/g, '')}`;
  const a11y = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': true as const };

  if (variant === 'line') {
    if (series.length < 2) return null;
    const { line } = equityPath(series, {
      xMax: 56,
      top: 2.5,
      bottom: 21.5,
      floor: 24,
    });
    return (
      <svg
        {...a11y}
        viewBox="0 0 56 24"
        preserveAspectRatio="none"
        className={`block overflow-visible ${className}`}
      >
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity={0.85}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const { line, area, first, last } = equityPath(series, {
    xMax: W,
    top: 7,
    bottom: 74,
    floor: H,
  });
  if (!line || !first || !last) return null;
  // Fills arrive once the line is mostly drawn.
  const after =
    'motion-safe:animate-[fade_900ms_var(--ease-glide)_700ms_backwards]';
  return (
    <div className={`relative ${className}`}>
      <svg
        {...a11y}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-20 w-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0"
              style={{ stopColor: 'var(--accent)' }}
              stopOpacity={0.3}
            />
            <stop
              offset="0.55"
              style={{ stopColor: 'var(--accent)' }}
              stopOpacity={0.11}
            />
            <stop
              offset="1"
              style={{ stopColor: 'var(--accent)' }}
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        {/* Where the range started: above it the curve is up, below it down. */}
        <line
          x1={0}
          x2={W}
          y1={first.y}
          y2={first.y}
          stroke="var(--line-2)"
          strokeWidth={1}
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={area}
          fill={`url(#${gradientId})`}
          stroke="none"
          className={after}
        />
        <path
          d={line}
          pathLength={1}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="motion-safe:animate-[draw_1.3s_var(--ease-glide)_150ms_backwards]"
        />
      </svg>
      {/* The end dot in HTML, so the stretched viewBox never turns it into an oval. */}
      <span
        aria-hidden="true"
        className={`absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface-1 ${after}`}
        style={{
          left: `${(last.x / W) * 100}%`,
          top: `${(last.y / H) * 100}%`,
        }}
      />
    </div>
  );
}

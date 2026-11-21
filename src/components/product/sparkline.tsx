import { equityPath } from '@/lib/landing/equity-path';

/** A small equity line: accent stroke, faint area, drawn once (never under reduced motion). */
export function Sparkline({
  series,
  label,
  className = '',
}: {
  series: readonly number[];
  label: string;
  className?: string;
}): React.JSX.Element | null {
  const { line, area } = equityPath(series, {
    xMax: 300,
    top: 3,
    bottom: 53,
    floor: 56,
  });
  if (!line) return null;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 300 56"
      preserveAspectRatio="none"
      className={`block h-14 w-full ${className}`}
    >
      <path d={area} fill="var(--accent)" fillOpacity={0.07} stroke="none" />
      <path
        d={line}
        pathLength={1}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="motion-safe:animate-draw"
      />
    </svg>
  );
}

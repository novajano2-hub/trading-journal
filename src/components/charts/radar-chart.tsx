'use client';

import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

/** One spoke of the radar. */
export interface RadarAxis {
  key: string;
  /** The name written at the spoke's end. */
  label: string;
  /** 0 to 100: where the spoke is drawn. Values past the ends are drawn at them. */
  value: number;
  /** What the readout says of the part and its table row holds: its score, and why. */
  text: ReactNode;
}

// The drawing box, in viewBox units: wide enough that the names at the sides stay inside it.
const W = 320;
const H = 250;
const CX = W / 2;
const CY = H / 2;
/** The outermost ring's radius, and the five rings inside it. */
const R = 80;
const RINGS = 5;
/** How far from the centre a spoke's name sits. */
const LABEL_R = 98;

const clamp = (n: number) => Math.min(100, Math.max(0, n));
/** The angle of spoke `i` of `n`: the first is straight up, the rest follow clockwise. */
const angleOf = (i: number, n: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
const at = (i: number, n: number, r: number): [number, number] => [
  CX + r * Math.cos(angleOf(i, n)),
  CY + r * Math.sin(angleOf(i, n)),
];
const pointsOf = (list: readonly [number, number][]) =>
  list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/**
 * A radar of the parts of a score (#23): the spokes clockwise from the top,
 * five rings inside the outer one at the part scores 20, 40, 60, 80 and 100,
 * and each part's value joined into one accent polygon. It draws no number:
 * the rings are unlabelled, as the parts' scores belong to the readout. Hover
 * or focus reads the part nearest the pointer, or, from the keyboard, the
 * arrow keys step round the parts (Home and End jump to the first and the
 * last). The chart is an image with `label`, and its parts are in a table
 * only assistive technology sees.
 */
export function RadarChart({
  axes,
  label,
  caption,
  className = '',
}: {
  axes: readonly RadarAxis[];
  /** What the image is: the score and its range. */
  label: string;
  /** Names the table of the parts. */
  caption: string;
  className?: string;
}): React.JSX.Element {
  const n = axes.length;
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  // A press focuses the chart too; that focus must not default to the first part.
  const pressed = useRef(false);
  const active = hover ?? focused;
  const shown = active === null ? undefined : axes[active];

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, (cur: number | null) => number> = {
      ArrowRight: (cur) => ((cur ?? -1) + 1) % n,
      ArrowDown: (cur) => ((cur ?? -1) + 1) % n,
      ArrowLeft: (cur) => ((cur ?? 0) - 1 + n) % n,
      ArrowUp: (cur) => ((cur ?? 0) - 1 + n) % n,
      Home: () => 0,
      End: () => n - 1,
    };
    const next = step[e.key];
    if (!next) return;
    e.preventDefault();
    setFocused(next);
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || n === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * W - CX;
    const y = ((e.clientY - rect.top) / rect.height) * H - CY;
    // Clockwise from the top, in turns of 360 degrees.
    const turns = (Math.atan2(y, x) + Math.PI / 2) / (2 * Math.PI);
    setHover(Math.round(((turns + 1) % 1) * n) % n);
  };

  const dotAt = (i: number): [number, number] =>
    at(i, n, (R * clamp(axes[i]!.value)) / 100);
  const outline = axes.map((_, i) => dotAt(i));
  const flip = shown !== undefined && at(active!, n, 1)[0] > CX;

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="relative mx-auto max-w-[340px]">
        <div
          role="img"
          aria-label={label}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => {
            const fromPress = pressed.current;
            pressed.current = false;
            if (!fromPress) setFocused((cur) => cur ?? 0);
          }}
          onBlur={() => setFocused(null)}
          onPointerDown={() => {
            pressed.current = true;
          }}
          className="rounded-control outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg
            data-chart="radar"
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full overflow-visible"
            aria-hidden="true"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setHover(null)}
          >
            {Array.from({ length: RINGS }, (_, k) => (
              <polygon
                key={k}
                data-ring={k + 1}
                points={pointsOf(
                  axes.map((_, i) => at(i, n, (R * (k + 1)) / RINGS)),
                )}
                fill="none"
                stroke="var(--line)"
                strokeWidth={1}
              />
            ))}
            {axes.map((a, i) => {
              const [x, y] = at(i, n, R);
              return (
                <line
                  key={a.key}
                  data-spoke={a.key}
                  x1={CX}
                  y1={CY}
                  x2={x}
                  y2={y}
                  stroke={i === active ? 'var(--accent)' : 'var(--line)'}
                  strokeOpacity={i === active ? 0.55 : 1}
                />
              );
            })}
            <polygon
              data-shape=""
              points={pointsOf(outline)}
              fill="var(--accent)"
              fillOpacity={0.16}
              stroke="var(--accent)"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
            {axes.map((a, i) => (
              <circle
                key={a.key}
                data-axis={a.key}
                cx={outline[i]![0]}
                cy={outline[i]![1]}
                r={i === active ? 4.5 : 3}
                fill={i === active ? 'var(--accent)' : 'var(--surface-1)'}
                stroke="var(--accent)"
                strokeWidth={1.6}
              />
            ))}
            {axes.map((a, i) => {
              const [x, y] = at(i, n, LABEL_R);
              const cos = Math.cos(angleOf(i, n));
              const sin = Math.sin(angleOf(i, n));
              return (
                <text
                  key={a.key}
                  x={x}
                  y={y + (sin > 0.5 ? 10 : sin < -0.5 ? -2 : 4)}
                  textAnchor={
                    cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'
                  }
                  fontSize={10.5}
                  fontWeight={i === active ? 600 : 500}
                  fill={i === active ? 'var(--text)' : 'var(--muted)'}
                >
                  {a.label}
                </text>
              );
            })}
          </svg>
        </div>
        <div role="status">
          {shown ? (
            <div
              className={`pointer-events-none absolute top-0 z-10 max-w-[210px] rounded-control border border-line bg-surface-1 px-2.5 py-2 text-[12.5px] leading-[1.4] text-muted shadow-[var(--shadow)] ${flip ? 'left-0' : 'right-0'}`}
            >
              <b className="block text-[13px] font-semibold text-text">
                {shown.label}
              </b>
              {shown.text}
            </div>
          ) : null}
        </div>
      </div>
      <div className="sr-only">
        <table aria-label={caption}>
          <tbody>
            {axes.map((a) => (
              <tr key={a.key}>
                <th scope="row">{a.label}</th>
                <td>{a.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

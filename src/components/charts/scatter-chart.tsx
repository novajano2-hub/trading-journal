'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  formatterOf,
  niceScale,
  type Formatter,
} from '@/components/app/reports/report-chart';
import { usePrefs } from '@/data/query/hooks';
import type { Axis } from '@/domain/metrics/scatter';
import { useDisplay } from '@/lib/display';
import { endRoom, READOUT, thinTicks, useBoxWidth } from './chart-kit';

/** One closed trade: where it sits on x, and its P&L in cents on y. */
export interface ScatterDot {
  id: string;
  x: number;
  y: number;
}

/** What the readout says of a trade, and where a click on it leads. */
export interface DotReadout {
  title: string;
  lines: { label: string; value: ReactNode }[];
  href: string;
}

const PAD_Y = 8;
const PAD_R = 12;
const X_AXIS = 24;
/** A pointer within this many pixels of a dot is on it. */
const HIT = 14;
/** How far PageUp and PageDown step through the trades. */
const PAGE = 10;

type Tone = 'gain' | 'loss' | 'flat';
const toneOf = (y: number): Tone => (y > 0 ? 'gain' : y < 0 ? 'loss' : 'flat');

interface Placed {
  id: string;
  cx: number;
  cy: number;
  tone: Tone;
}

interface Layout {
  width: number;
  plotH: number;
  height: number;
  padL: number;
  plotW: number;
  y: { lo: number; hi: number; ticks: number[]; at(v: number): number };
  xTicks: { px: number; text: string }[];
  placed: Placed[];
}

/** The dots and the axes: static between hovers, so it is memoised. */
const Plot = memo(function Plot({
  layout,
  fmt,
}: {
  layout: Layout;
  fmt: Formatter;
}) {
  const { padL, plotW, plotH, y } = layout;
  return (
    <>
      {y.ticks.map((t) => (
        <g key={t}>
          <line
            x1={padL}
            x2={padL + plotW}
            y1={y.at(t)}
            y2={y.at(t)}
            stroke="var(--line)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          <text
            data-axis-label="y"
            x={padL - 8}
            y={y.at(t) + 4}
            textAnchor="end"
            fontSize={11}
            fill="var(--faint)"
            className="tabular-nums"
          >
            {fmt.tick('money', t)}
          </text>
        </g>
      ))}
      <line
        x1={padL}
        x2={padL + plotW}
        y1={y.at(0)}
        y2={y.at(0)}
        stroke="var(--line-2)"
        strokeWidth={1}
        shapeRendering="crispEdges"
      />
      {layout.placed.map((p) =>
        p.tone === 'gain' ? (
          // Above zero: a filled dot.
          <circle
            key={p.id}
            data-dot={p.id}
            data-tone="gain"
            cx={p.cx}
            cy={p.cy}
            r={2.6}
            fill="var(--gain-fill)"
            fillOpacity={0.75}
          />
        ) : (
          // Below zero a hollow ring in the loss colour; at zero a quiet one: shape as well as colour.
          <circle
            key={p.id}
            data-dot={p.id}
            data-tone={p.tone}
            cx={p.cx}
            cy={p.cy}
            r={2.3}
            fill="none"
            stroke={p.tone === 'loss' ? 'var(--loss-fill)' : 'var(--faint)'}
            strokeWidth={1.3}
            strokeOpacity={0.85}
          />
        ),
      )}
      {layout.xTicks.map((t) => (
        <text
          key={t.px}
          data-axis-label="x"
          x={t.px}
          y={plotH + 16}
          textAnchor="middle"
          fontSize={11}
          fill="var(--faint)"
        >
          {t.text}
        </text>
      ))}
    </>
  );
});

/**
 * One dot a closed trade (C19): its P&L up the page and `xAxis` across, both
 * rescaled to the trades given. A trade above zero is a filled dot, one below
 * a hollow ring (shape as well as colour, for the colour-blind), one at zero a
 * quiet ring. Hover or focus reads a trade's `describe` card, and a click
 * opens it: a finger's first tap reads it and offers the link, the second
 * opens it. From the keyboard, Left and Right step through the trades by x,
 * PageUp and PageDown by ten, Home and End jump to the first and the last,
 * and Enter opens the one read. The chart is an image with `label`, which
 * carries the range and its key values; a long run of trades has no table, as
 * the keyboard path reaches each one.
 */
export function ScatterChart({
  label,
  dots,
  xAxis,
  describe,
  currency,
  note,
  height = 210,
}: {
  label: string;
  dots: readonly ScatterDot[];
  xAxis: Axis;
  /** The readout of a trade by its id; undefined leaves it unread. */
  describe(id: string): DotReadout | undefined;
  /** The currency of the P&L; default: the base currency. */
  currency?: string;
  /** An extra legend line, such as the time zone. */
  note?: string;
  /** The plot's height, without the x labels. */
  height?: number;
}): React.JSX.Element {
  const display = useDisplay();
  const base = usePrefs().data?.baseCurrency ?? 'USD';
  const cur = currency ?? base;
  const fmt = useMemo(
    () => formatterOf(display, cur),
    // `display` is rebuilt on every render; what it reads is the unit and the currency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display.unit, cur],
  );
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const whole = useRef<HTMLDivElement>(null);
  const width = useBoxWidth(box, dots.length > 0);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  // A finger's first tap reads a trade and offers it: the dot it is on.
  const [picked, setPicked] = useState<number | null>(null);
  // A press focuses the chart too; that focus must not default to the first trade.
  const pressed = useRef(false);
  const pointer = useRef('mouse');

  const layout = useMemo<Layout>(() => {
    const plotH = height;
    const top = PAD_Y;
    const bottom = plotH - PAD_Y;
    const ys = dots.map((d) => d.y);
    const scale = niceScale(Math.min(0, ...ys, 0), Math.max(0, ...ys, 0));
    const at = (v: number) =>
      bottom - ((v - scale.lo) / (scale.hi - scale.lo)) * (bottom - top);
    const widest = Math.max(
      0,
      ...scale.ticks.map((t) => fmt.tick('money', t).length),
    );
    const padL = Math.max(36, Math.ceil(widest * 6.4) + 16);
    const padR = endRoom(xAxis.ticks, xAxis.lo, xAxis.hi, PAD_R);
    const plotW = Math.max(40, width - padL - padR);
    const span = xAxis.hi - xAxis.lo || 1;
    const x = (v: number) => padL + ((v - xAxis.lo) / span) * plotW;
    const labels = xAxis.ticks.map((t) => ({ px: x(t.at), text: t.text }));
    const longest = Math.max(0, ...labels.map((t) => t.text.length));
    return {
      width,
      plotH,
      height: plotH + X_AXIS,
      padL,
      plotW,
      y: { ...scale, at },
      xTicks: thinTicks(labels, longest * 6.4 + 12),
      placed: dots.map((d) => ({
        id: d.id,
        cx: x(d.x),
        cy: at(d.y),
        tone: toneOf(d.y),
      })),
    };
  }, [dots, xAxis, width, height, fmt]);

  // A finger's pick stays until the page is touched somewhere else: pressing its link moves the focus off the chart.
  useEffect(() => {
    if (picked === null) return;
    const away = (e: Event) => {
      if (whole.current?.contains(e.target as Node)) return;
      setPicked(null);
      setHover(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [picked]);

  // The trades left to right, for the keyboard: ties by id so the order is the same every time.
  const order = useMemo(
    () =>
      dots
        .map((_, i) => i)
        .sort(
          (a, b) =>
            dots[a]!.x - dots[b]!.x || (dots[a]!.id < dots[b]!.id ? -1 : 1),
        ),
    [dots],
  );

  const active = hover ?? picked ?? focused;
  const shown = active === null ? undefined : describe(dots[active]!.id);

  const hit = (e: {
    clientX: number;
    clientY: number;
    currentTarget: Element;
  }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best: number | null = null;
    let near = HIT * HIT;
    layout.placed.forEach((p, i) => {
      const d = (p.cx - px) ** 2 + (p.cy - py) ** 2;
      // Of two as near, the later: the dot drawn on top.
      if (d <= near) {
        near = d;
        best = i;
      }
    });
    return best;
  };
  const open = (i: number) => {
    const to = describe(dots[i]!.id);
    if (to) router.push(to.href);
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const i = hit(e);
    if (i === null) {
      setPicked(null);
      return;
    }
    // A mouse already has hover: a click opens. A finger reads first, then opens.
    if (pointer.current === 'mouse' || picked === i) open(i);
    else {
      setPicked(i);
    }
  };
  const step = (by: number | 'first' | 'last') => {
    setFocused((cur) => {
      if (order.length === 0) return null;
      const at = cur === null ? -1 : order.indexOf(cur);
      const to =
        by === 'first'
          ? 0
          : by === 'last'
            ? order.length - 1
            : Math.min(
                order.length - 1,
                Math.max(0, (at < 0 && by < 0 ? order.length : at) + by),
              );
      return order[to]!;
    });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number | 'first' | 'last'> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      PageDown: PAGE,
      PageUp: -PAGE,
      Home: 'first',
      End: 'last',
    };
    if (e.key === 'Enter') {
      const i = focused ?? picked;
      if (i !== null) {
        e.preventDefault();
        open(i);
      }
      return;
    }
    const by = keys[e.key];
    if (by === undefined) return;
    e.preventDefault();
    step(by);
  };

  const hint =
    shown === undefined ? null : picked === active ? (
      <Link
        href={shown.href}
        prefetch={false}
        className="pointer-events-auto mt-1 inline-block rounded-chip font-semibold text-accent-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Open trade
      </Link>
    ) : (
      <span className="mt-1 block text-[12px] text-faint">
        {hover === null && focused !== null
          ? 'Press Enter to open'
          : 'Click to open'}
      </span>
    );
  const on = active === null ? undefined : layout.placed[active];
  const flip = on !== undefined && on.cx > layout.width * 0.55;

  return (
    <div ref={whole} className="min-w-0">
      <div className="relative">
        <div
          ref={box}
          role="img"
          aria-label={label}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => {
            const fromPress = pressed.current;
            pressed.current = false;
            if (!fromPress) step('first');
          }}
          onBlur={() => setFocused(null)}
          onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
            pressed.current = true;
            pointer.current = e.pointerType || 'mouse';
          }}
          onPointerMove={(e) => setHover(hit(e))}
          onPointerLeave={() => setHover(null)}
          onClick={onClick}
          className="relative cursor-default overflow-hidden rounded-control outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="block overflow-visible"
            aria-hidden="true"
          >
            <Plot layout={layout} fmt={fmt} />
            {on ? (
              <circle
                cx={on.cx}
                cy={on.cy}
                r={6}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.75}
                pointerEvents="none"
              />
            ) : null}
          </svg>
        </div>
        <div role="status">
          {shown && on ? (
            <div
              className={READOUT}
              style={
                flip
                  ? { right: layout.width - on.cx + 12 }
                  : { left: on.cx + 12 }
              }
            >
              <b className="block text-[13px] font-semibold text-text">
                {shown.title}
              </b>
              {shown.lines.map((row) => (
                <div key={row.label} className="flex justify-between gap-4">
                  <span>{row.label}</span>
                  <span className="font-semibold text-text tabular-nums">
                    {row.value}
                  </span>
                </div>
              ))}
              {hint}
            </div>
          ) : null}
        </div>
      </div>
      <ul
        data-legend=""
        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-faint"
      >
        <li className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            data-swatch="win"
            className="size-2.5 rounded-full bg-gain-fill"
          />
          Win
        </li>
        <li className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            data-swatch="loss"
            className="size-2.5 rounded-full border-[1.4px] border-loss-fill"
          />
          Loss
        </li>
        {note ? <li>{note}</li> : null}
      </ul>
    </div>
  );
}

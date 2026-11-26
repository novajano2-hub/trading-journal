'use client';

import {
  memo,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  formatterOf,
  niceScale,
  type Formatter,
} from '@/components/app/reports/report-chart';
import { usePrefs } from '@/data/query/hooks';
import type { SeriesUnit } from '@/domain/metrics/series';
import { useDisplay } from '@/lib/display';
import { endRoom, READOUT, thinTicks, useBoxWidth } from './chart-kit';

/** One series of the chart, on the left or the right scale. */
export interface DualSeries {
  key: string;
  label: string;
  /** A joined line, a line that holds its value until the next point, or bars from zero. */
  kind: 'line' | 'step' | 'bars';
  axis: 'left' | 'right';
  /** How its values read: the axis labels, the readout and the table follow it. */
  unit: SeriesUnit;
  /** One value per x; null is a gap. */
  values: readonly (number | null)[];
  /** Bars `signed` wear the gain and loss colours by sign; the default is the accent. */
  tone?: 'accent' | 'muted' | 'signed';
  dashed?: boolean;
}

export interface DualAxisX {
  lo: number;
  hi: number;
  /** Where the x axis may be labelled, left to right; the chart drops the ones that would touch. */
  ticks: readonly { at: number; text: string }[];
}

const PAD_Y = 8;
const PAD_R = 12;
const X_AXIS = 24;
const MIN_LABEL_GAP = 52;
const TABLE_ROWS = 120;
const TONE = {
  accent: 'var(--accent)',
  muted: 'var(--muted)',
  signed: 'var(--accent)',
} as const;

interface Scale {
  lo: number;
  hi: number;
  ticks: number[];
  y(v: number): number;
}

/** The values a series is drawn from: a gap has none. */
const valuesOf = (s: readonly DualSeries[]): number[] =>
  s.flatMap((x) => x.values.filter((v): v is number => v !== null));

/** Bars and amounts grow from zero; a rate or a balance spans only what it reached. */
const keepsZero = (s: readonly DualSeries[]): boolean =>
  s.some((x) => x.kind === 'bars' || x.unit === 'money' || x.unit === 'count');

function rawDomain(s: readonly DualSeries[]): { lo: number; hi: number } {
  const vals = valuesOf(s);
  let lo = vals.length === 0 ? 0 : Math.min(...vals);
  let hi = vals.length === 0 ? 1 : Math.max(...vals);
  if (keepsZero(s)) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  return { lo, hi };
}

/**
 * Both axes with the same share of their height under zero, so one zero line
 * serves both: the axis with less below zero is extended downward. With an
 * axis that does not rise above zero there is no such line, and the two
 * scales stand apart.
 */
function alignedDomains(
  a: { lo: number; hi: number },
  b: { lo: number; hi: number },
): [{ lo: number; hi: number }, { lo: number; hi: number }] {
  if (!(a.hi > 0) || !(b.hi > 0)) return [a, b];
  const below = (d: { lo: number; hi: number }) => -d.lo / (d.hi - d.lo);
  const f = Math.max(below(a), below(b));
  if (!(f < 1)) return [a, b];
  const stretch = (d: { lo: number; hi: number }) => ({
    lo: (-f * d.hi) / (1 - f),
    hi: d.hi,
  });
  return [stretch(a), stretch(b)];
}

function scaleOf(
  d: { lo: number; hi: number },
  top: number,
  bottom: number,
): Scale {
  const nice = niceScale(d.lo, d.hi);
  return {
    ...nice,
    y: (v) => bottom - ((v - nice.lo) / (nice.hi - nice.lo)) * (bottom - top),
  };
}

interface Layout {
  width: number;
  plotH: number;
  height: number;
  padL: number;
  padR: number;
  plotW: number;
  x(v: number): number;
  left: Scale;
  right?: Scale;
  /** The x labels that fit. */
  ticks: { px: number; at: number; text: string }[];
  barW: number;
}

const Plot = memo(function Plot({
  series,
  layout,
  xs,
  fmt,
}: {
  series: readonly DualSeries[];
  layout: Layout;
  xs: readonly number[];
  fmt: Formatter;
}) {
  const { left, right, padL, plotW, plotH, x } = layout;
  const leftSeries = series.filter((s) => s.axis === 'left');
  const rightSeries = series.filter((s) => s.axis === 'right');
  const unitOf = (list: readonly DualSeries[]) => list[0]!.unit;
  return (
    <>
      {left.ticks.map((t) => (
        <g key={`l${t}`}>
          <line
            x1={padL}
            x2={padL + plotW}
            y1={left.y(t)}
            y2={left.y(t)}
            stroke="var(--line)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          {leftSeries.length > 0 ? (
            <text
              data-tick="left"
              x={padL - 8}
              y={left.y(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--faint)"
              className="tabular-nums"
            >
              {fmt.tick(unitOf(leftSeries), t)}
            </text>
          ) : null}
        </g>
      ))}
      {right && rightSeries.length > 0
        ? right.ticks.map((t) => (
            <text
              key={`r${t}`}
              data-tick="right"
              x={padL + plotW + 8}
              y={right.y(t) + 4}
              textAnchor="start"
              fontSize={11}
              fill="var(--faint)"
              className="tabular-nums"
            >
              {fmt.tick(unitOf(rightSeries), t)}
            </text>
          ))
        : null}
      {series.map((s) => {
        const scale = s.axis === 'left' ? left : (right ?? left);
        const colour = TONE[s.tone ?? 'accent'];
        if (s.kind === 'bars') {
          const zero = scale.y(0);
          return (
            <g key={s.key} data-series={s.key}>
              {s.values.map((v, i) => {
                if (v === null) return null;
                const y = scale.y(v);
                const h = Math.max(1, Math.abs(zero - y));
                return (
                  <rect
                    key={i}
                    data-mark="bar"
                    x={x(xs[i]!) - layout.barW / 2}
                    y={v >= 0 ? zero - h : zero}
                    width={layout.barW}
                    height={h}
                    rx={Math.min(1.5, layout.barW / 2)}
                    fill={
                      s.tone === 'signed'
                        ? v < 0
                          ? 'var(--loss-fill)'
                          : 'var(--gain-fill)'
                        : colour
                    }
                  />
                );
              })}
              {scale.lo <= 0 && scale.hi >= 0 ? (
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={zero}
                  y2={zero}
                  stroke="var(--line-2)"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
              ) : null}
            </g>
          );
        }
        // One run of points per stretch without a gap.
        const runs: { x: number; y: number }[][] = [];
        s.values.forEach((v, i) => {
          if (v === null) {
            runs.push([]);
            return;
          }
          if (runs.length === 0) runs.push([]);
          runs[runs.length - 1]!.push({ x: x(xs[i]!), y: scale.y(v) });
        });
        const drawn = runs.filter((r) => r.length > 0);
        const path = (r: { x: number; y: number }[]) =>
          r
            .map((p, i) =>
              i === 0
                ? `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
                : s.kind === 'step'
                  ? `H${p.x.toFixed(1)} V${p.y.toFixed(1)}`
                  : `L${p.x.toFixed(1)},${p.y.toFixed(1)}`,
            )
            .join(' ');
        return (
          <g key={s.key} data-series={s.key}>
            <g data-mark="line" fill="none">
              {drawn.map((r, i) =>
                r.length === 1 ? (
                  <circle
                    key={i}
                    cx={r[0]!.x}
                    cy={r[0]!.y}
                    r={2.5}
                    fill={colour}
                  />
                ) : (
                  <path
                    key={i}
                    d={path(r)}
                    stroke={colour}
                    strokeWidth={1.75}
                    strokeDasharray={s.dashed ? '5 4' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ),
              )}
            </g>
          </g>
        );
      })}
      {layout.ticks.map((t) => (
        <text
          key={t.at}
          data-axis-label=""
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

/** The index of the x nearest `v`; of two as near, the later (a running figure is read after the last point there). */
function nearest(xs: readonly number[], v: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && v - xs[lo - 1]! < xs[lo]! - v) return lo - 1;
  // Past a run of equal x, the last of them.
  while (lo + 1 < xs.length && xs[lo + 1] === xs[lo]) lo += 1;
  return lo;
}

function Swatch({ s }: { s: DualSeries }): React.JSX.Element {
  if (s.kind === 'bars' && s.tone === 'signed')
    return (
      <span
        aria-hidden="true"
        data-swatch="signed"
        className="inline-flex gap-0.5"
      >
        <i className="size-2.5 rounded-[3px] bg-gain-fill" />
        <i className="size-2.5 rounded-[3px] bg-loss-fill" />
      </span>
    );
  if (s.kind === 'bars')
    return (
      <span
        aria-hidden="true"
        data-swatch="box"
        className="size-2.5 rounded-[3px]"
        style={{ background: TONE[s.tone ?? 'accent'] }}
      />
    );
  return (
    <span
      aria-hidden="true"
      data-swatch="line"
      className="h-0 w-3.5 border-t-2"
      style={{
        borderColor: TONE[s.tone ?? 'accent'],
        borderStyle: s.dashed ? 'dashed' : 'solid',
      }}
    />
  );
}

/**
 * Lines and bars over one shared x axis, with a scale on the left and one on
 * the right (C14, C15, C75): each series reads on the scale of its `axis`, so
 * a rate and an amount, or a balance and the deposits beside it, share a plot
 * without sharing a number line. `alignZero` puts both scales' zero on one
 * line. Money reads in the display unit, axes included, and Privacy hides it.
 *
 * Hover, touch or focus gives a readout of the point and every series at it;
 * with focus on the chart, Left and Right step through the points, Home and
 * End jump to the first and the last. The chart is an image with `label`, and
 * its values are in a table only assistive technology sees (a sample of 120
 * rows for a long run, the last point always among them).
 */
export function DualAxisChart({
  label,
  currency,
  xs,
  pointLabel,
  xHeading = 'Point',
  xAxis,
  series,
  height = 200,
  alignZero = false,
  note,
}: {
  label: string;
  /** The currency of money values; default: the base currency. */
  currency?: string;
  /** Where each point sits on the x axis, ascending. */
  xs: readonly number[];
  /** How a point reads in the readout and the table. */
  pointLabel(i: number): string;
  /** The table's first column. */
  xHeading?: string;
  xAxis: DualAxisX;
  series: readonly DualSeries[];
  /** The plot's height, without the x labels. */
  height?: number;
  alignZero?: boolean;
  /** An extra legend line, such as the time zone. */
  note?: string;
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
  const box = useRef<HTMLDivElement>(null);
  const n = xs.length;
  const width = useBoxWidth(box, n > 0);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const pressed = useRef(false);

  const layout = useMemo<Layout | undefined>(() => {
    if (n === 0) return undefined;
    const plotH = height;
    const top = PAD_Y;
    const bottom = plotH - PAD_Y;
    const onLeft = series.filter((s) => s.axis === 'left');
    const onRight = series.filter((s) => s.axis === 'right');
    let leftDomain = rawDomain(onLeft.length > 0 ? onLeft : series);
    let rightDomain = onRight.length > 0 ? rawDomain(onRight) : undefined;
    if (alignZero && rightDomain)
      [leftDomain, rightDomain] = alignedDomains(leftDomain, rightDomain);
    const left = scaleOf(leftDomain, top, bottom);
    const right = rightDomain ? scaleOf(rightDomain, top, bottom) : undefined;
    const widest = (sc: Scale, list: readonly DualSeries[]) =>
      Math.max(
        0,
        ...sc.ticks.map((t) => fmt.tick(list[0]?.unit ?? 'money', t).length),
      );
    const padL = Math.max(36, Math.ceil(widest(left, onLeft) * 6.4) + 16);
    const padR =
      right && onRight.length > 0
        ? Math.max(36, Math.ceil(widest(right, onRight) * 6.4) + 14)
        : endRoom(xAxis.ticks, xAxis.lo, xAxis.hi, PAD_R);
    const plotW = Math.max(40, width - padL - padR);
    const span = xAxis.hi - xAxis.lo || 1;
    const x = (v: number) => padL + ((v - xAxis.lo) / span) * plotW;
    const gaps = xs
      .slice(1)
      .map((v, i) => v - xs[i]!)
      .filter((g) => g > 0);
    const gap = gaps.length === 0 ? span : Math.min(...gaps);
    const barW = Math.max(1, Math.min(30, (gap / span) * plotW * 0.72));
    const labels = xAxis.ticks.map((t) => ({ ...t, px: x(t.at) }));
    const longest = Math.max(0, ...labels.map((t) => t.text.length));
    return {
      width,
      plotH,
      height: plotH + X_AXIS,
      padL,
      padR,
      plotW,
      x,
      left,
      right,
      barW,
      ticks: thinTicks(labels, Math.max(MIN_LABEL_GAP, longest * 6.4 + 12)),
    };
  }, [n, height, series, alignZero, width, xAxis, xs, fmt]);

  const rows = useMemo(() => {
    const step = Math.max(1, Math.ceil(n / (TABLE_ROWS - 1)));
    const picked: number[] = [];
    for (let i = 0; i < n; i += step) picked.push(i);
    if (picked[picked.length - 1] !== n - 1) picked.push(n - 1);
    return picked;
  }, [n]);

  if (!layout) return <></>;

  const active = hover ?? focused;
  const move = (by: number | 'first' | 'last') =>
    setFocused((cur) =>
      by === 'first'
        ? 0
        : by === 'last'
          ? n - 1
          : Math.min(n - 1, Math.max(0, (cur ?? (by > 0 ? -1 : n)) + by)),
    );
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number | 'first' | 'last'> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: 'first',
      End: 'last',
    };
    const by = keys[e.key];
    if (by === undefined) return;
    e.preventDefault();
    move(by);
  };
  const indexAt = (e: PointerEvent<HTMLDivElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const span = xAxis.hi - xAxis.lo || 1;
    const v =
      xAxis.lo + ((e.clientX - rect.left - layout.padL) / layout.plotW) * span;
    return nearest(xs, v);
  };
  const px = active === null ? 0 : layout.x(xs[active]!);
  const flip = px > layout.width * 0.55;
  const valueAt = (s: DualSeries, i: number) => s.values[i] ?? null;
  const scaleFor = (s: DualSeries) =>
    s.axis === 'left' ? layout.left : (layout.right ?? layout.left);
  return (
    <div className="min-w-0">
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
            if (!fromPress) setFocused((cur) => cur ?? 0);
          }}
          onBlur={() => setFocused(null)}
          onPointerDown={(e) => {
            pressed.current = true;
            const i = indexAt(e);
            setHover(i);
            setFocused(i);
          }}
          onPointerMove={(e) => setHover(indexAt(e))}
          onPointerLeave={() => setHover(null)}
          className="relative overflow-hidden rounded-control outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="block overflow-visible"
            aria-hidden="true"
          >
            <Plot series={series} layout={layout} xs={xs} fmt={fmt} />
            {active !== null ? (
              <g pointerEvents="none">
                <line
                  x1={px}
                  x2={px}
                  y1={PAD_Y / 2}
                  y2={layout.plotH + 6}
                  stroke="var(--faint)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                {series.map((s) => {
                  const v = valueAt(s, active);
                  if (v === null) return null;
                  return (
                    <circle
                      key={s.key}
                      cx={px}
                      cy={scaleFor(s).y(v)}
                      r={4}
                      fill={
                        s.tone === 'signed' && s.kind === 'bars'
                          ? v < 0
                            ? 'var(--loss-fill)'
                            : 'var(--gain-fill)'
                          : TONE[s.tone ?? 'accent']
                      }
                      stroke="var(--surface-1)"
                      strokeWidth={2}
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>
        </div>
        <div role="status">
          {active !== null ? (
            <div
              className={READOUT}
              style={
                flip ? { right: layout.width - px + 12 } : { left: px + 12 }
              }
            >
              <b className="block text-[13px] font-semibold text-text">
                {pointLabel(active)}
              </b>
              {series.map((s) => (
                <div key={s.key} className="flex justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ background: TONE[s.tone ?? 'accent'] }}
                    />
                    {s.label}
                  </span>
                  <span className="font-semibold text-text tabular-nums">
                    {fmt.node(s.unit, valueAt(s, active))}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <ul
        data-legend=""
        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-faint"
      >
        {series.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <Swatch s={s} />
            {s.label}
          </li>
        ))}
        {note ? <li>{note}</li> : null}
      </ul>
      <div className="sr-only">
        <table aria-label={label}>
          <thead>
            <tr>
              <th scope="col">{xHeading}</th>
              {series.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i}>
                <th scope="row">{pointLabel(i)}</th>
                {series.map((s) => (
                  <td key={s.key}>{fmt.node(s.unit, valueAt(s, i))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

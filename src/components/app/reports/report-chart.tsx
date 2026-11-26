'use client';

import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  memo,
  useContext,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { ArrowsOut } from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { usePrefs } from '@/data/query/hooks';
import type { SeriesPoint, SeriesUnit } from '@/domain/metrics/series';
import {
  FigureSourceContext,
  formatUnitValue,
  useDisplay,
  type Display,
} from '@/lib/display';
import { formatMinutes, formatPct, formatQty } from '@/lib/format';

export interface ChartSeries {
  label: string;
  /** `dots` is a marker per category, never joined: for series over named buckets (a symbol, a weekday). */
  kind: 'bar' | 'line' | 'dots';
  /** Every series of one chart has the same keys, in the same order. */
  points: readonly SeriesPoint[];
  /** `money` values are cents: they read in the chosen display unit. */
  unit: SeriesUnit;
  /** For `dots`: how much stands behind each point (its trades). More is larger and stronger. */
  counts?: readonly number[];
}

/** Each series' own colour when a chart holds several. */
// Accent, then ink, then a lighter accent tint drawn dashed: cyan and marigold
// keep their own jobs (mistakes among them), so a series never takes them.
const COLOURS = [
  'var(--accent)',
  'var(--muted)',
  'color-mix(in srgb, var(--accent) 55%, var(--surface-1))',
];
/** The third series' line is dashed, so it reads apart from the first two without colour. */
const DASHES = [undefined, undefined, '5 4'] as const;

const PAD_R = 12;
const PAD_Y = 8;
const BAND_GAP = 18;
const X_AXIS = 24;
/** Tilted axis labels: a label's height over sin 45 is the least spacing, and how far they hang. */
const TILT_STEP = 13;
const TILT_MAX_CHARS = 14;
const MIN_LABEL_GAP = 52;
const DEFAULT_WIDTH = 720;

/** "Fri 30 Oct" for a day, "Oct 2026" for a month. */
export function periodText(key: string): string {
  const date = parseISO(key.length === 7 ? `${key}-01` : key);
  return format(date, key.length === 7 ? 'MMM yyyy' : 'EEE d MMM');
}

/**
 * The domain [lo, hi] with a little room, and the round ticks inside it (about
 * four steps apart). The domain is not stretched to the outer ticks, so a
 * line that dips just under zero does not get a whole step of empty axis.
 */
export function niceScale(
  lo: number,
  hi: number,
): { lo: number; hi: number; ticks: number[] } {
  if (!(hi > lo)) {
    if (lo === 0) return { lo: 0, hi: 1, ticks: [0, 1] };
    const pad = Math.abs(lo) * 0.1;
    return niceScale(lo - pad, hi + pad);
  }
  const raw = (hi - lo) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step =
    (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  const ticks: number[] = [];
  for (
    let v = Math.ceil(lo / step - 1e-9) * step;
    v <= hi + step * 1e-9;
    v += step
  )
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  const room = (hi - lo) * 0.04;
  return {
    // A bar's zero line stays where it is: the room goes only to the side with data.
    lo: lo === 0 ? 0 : lo - room,
    hi: hi === 0 ? 0 : hi + room,
    ticks,
  };
}

/** The steps a duration axis counts in: whole minutes, a quarter hour, hours, days. */
const MINUTE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];

/** `niceScale` for minutes: ticks fall on minutes, hours and days, so no tick reads "1h 7m". */
function niceMinutes(
  lo: number,
  hi: number,
): { lo: number; hi: number; ticks: number[] } {
  const raw = Math.max(hi - lo, 1) / 4;
  const step =
    MINUTE_STEPS.find((x) => x >= raw) ?? Math.ceil(raw / 1440) * 1440;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step)
    ticks.push(v);
  if (ticks.length < 2) ticks.push((ticks[0] ?? 0) + step);
  const room = (hi - lo) * 0.04;
  return {
    lo: lo === 0 ? 0 : lo - room,
    hi: hi === 0 ? 0 : Math.max(hi + room, ticks[ticks.length - 1]!),
    ticks,
  };
}

/** Where the x axis is labelled: every period when there is room, else each new month, never closer than a label's width. */
function xTicks(
  keys: readonly string[],
  plotW: number,
  xLabel?: (key: string) => string,
  tiltLabels = false,
  tiltMax = TILT_MAX_CHARS,
): { ticks: { i: number; text: string }[]; tilt: boolean; hang: number } {
  const step = plotW / Math.max(1, keys.length);
  let candidates: { i: number; text: string }[];
  if (xLabel) {
    // Named buckets (a weekday, a symbol, 10:30): label each, as many as fit.
    candidates = keys.map((k, i) => ({ i, text: xLabel(k) }));
  } else if (step >= 28 && keys.length <= 40) {
    candidates = keys.map((k, i) => ({
      i,
      text:
        k.length === 7
          ? format(parseISO(`${k}-01`), 'MMM')
          : format(parseISO(k), 'd MMM'),
    }));
  } else {
    candidates = [];
    let last = '';
    keys.forEach((k, i) => {
      const month = k.slice(0, 7);
      if (month === last) return;
      last = month;
      const d = parseISO(`${month}-01`);
      candidates.push({
        i,
        text: format(d, month.endsWith('-01') ? 'MMM yyyy' : 'MMM'),
      });
    });
  }
  const flat = xLabel
    ? Math.max(
        MIN_LABEL_GAP,
        ...candidates.map((c) => c.text.length * 6.4 + 10),
      )
    : MIN_LABEL_GAP;
  // Named bars that would collide flat are tilted so every one keeps its label.
  const tilt =
    tiltLabels &&
    xLabel !== undefined &&
    step < flat &&
    step >= TILT_STEP &&
    keys.length <= 30;
  if (tilt) {
    const shown = candidates.map((c) => ({
      ...c,
      text:
        c.text.length > tiltMax ? `${c.text.slice(0, tiltMax - 1)}…` : c.text,
    }));
    const longest = Math.max(...shown.map((c) => c.text.length));
    return {
      ticks: shown,
      tilt,
      hang: Math.ceil(longest * 6.6 * Math.SQRT1_2) + 24,
    };
  }
  const out: typeof candidates = [];
  let lastX = -Infinity;
  for (const c of candidates) {
    const x = (c.i + 0.5) * step;
    if (x - lastX >= flat) {
      out.push(c);
      lastX = x;
    }
  }
  return { ticks: out, tilt, hang: X_AXIS };
}

/** Compact dollars for an axis: +$5k, −$1.5k, $0; a balance reads $5k, with no plus. */
function compactMoney(cents: number, currency: string, signed = true): string {
  if (cents === 0)
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(0);
  const body = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  })
    .format(Math.abs(cents) / 100)
    .replace(/([KMBT])$/, (m) => m.toLowerCase());
  return `${cents < 0 ? '−' : signed ? '+' : ''}${body}`;
}

export interface Formatter {
  /** A value as the readout and the table show it. */
  node(unit: SeriesUnit, v: number | null): React.ReactNode;
  /** A value as plain words, for a label that names where a metric runs. */
  text(unit: SeriesUnit, v: number): string;
  /** A value as an axis tick shows it. */
  tick(unit: SeriesUnit, v: number): string;
}

/** A multiple of risk: +1.25R, −0.50R. */
const multiple = (v: number, digits: number): string =>
  `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(digits)}R`;

/**
 * How each kind of value reads. Money and the display unit's own numbers go
 * through the display formatter, so Privacy and the unit apply to the axis,
 * the readout, the table and the label alike; shares, ratios, counts,
 * quantities and durations are not amounts and read as they are.
 */
export function formatterOf(display: Display, currency: string): Formatter {
  const unitText = (v: number, compact: boolean, signed: boolean) =>
    formatUnitValue(display.unit, v, { currency, signed, compact });
  const text = (unit: SeriesUnit, v: number): string => {
    switch (unit) {
      case 'money':
        return display.cash(v, true, currency).label;
      case 'balance':
        return display.cash(v, false, currency).label;
      case 'tradeunit':
        return unitText(v, false, true);
      case 'pct':
        return formatPct(v, 1);
      case 'ratio':
        return v.toFixed(2);
      case 'moneyratio':
        return display.ratio(v).label;
      case 'multiple':
        return multiple(v, 2);
      case 'count':
        return String(Math.round(v));
      case 'qty':
        return formatQty(v);
      case 'minutes':
        return formatMinutes(v);
    }
  };
  return {
    node(unit, v) {
      if (v === null) return 'None';
      if (unit === 'money')
        return <FigureText f={display.cash(v, true, currency)} />;
      if (unit === 'balance')
        return <FigureText f={display.cash(v, false, currency)} />;
      if (unit === 'moneyratio') return <FigureText f={display.ratio(v)} />;
      return text(unit, v);
    },
    text,
    tick(unit, v) {
      switch (unit) {
        case 'money':
          return display.unit === 'dollar'
            ? compactMoney(v, currency)
            : display.cash(v, v !== 0, currency).text;
        case 'balance':
          return display.unit === 'dollar'
            ? compactMoney(v, currency, false)
            : display.cash(v, false, currency).text;
        case 'tradeunit':
          return unitText(v, true, v !== 0);
        case 'pct':
          return formatPct(v, 0);
        case 'ratio':
          return Number.isInteger(v) ? String(v) : v.toFixed(1);
        case 'moneyratio':
          return display.unit === 'privacy'
            ? display.ratio(v).text
            : Number.isInteger(v)
              ? String(v)
              : v.toFixed(1);
        case 'multiple':
          return v === 0 ? '0R' : multiple(v, Number.isInteger(v) ? 0 : 1);
        case 'count':
          return String(Math.round(v));
        case 'qty':
          return formatQty(Math.round(v * 10) / 10);
        case 'minutes':
          return formatMinutes(v);
      }
    },
  };
}

/** A stretch of the x axis to shade, from one key to another (inclusive). */
export interface Shade {
  /** Names the mark: `data-band`. */
  name: string;
  from: string;
  to: string;
  /** Written in the band; plain text, so under Privacy it has already been hidden. */
  label: string;
}

/** The indices of the first key at or after `from` and the last at or before `to`; undefined when none lie between. */
function spanOf(
  keys: readonly string[],
  shade: Shade,
): { from: number; to: number } | undefined {
  const from = keys.findIndex((k) => k >= shade.from);
  let to = -1;
  keys.forEach((k, i) => {
    if (k <= shade.to) to = i;
  });
  return from === -1 || to < from ? undefined : { from, to };
}

interface Layout {
  width: number;
  /** Each band's height: the first is the chart's, later ones follow `rowRatio`. */
  bandHs: number[];
  /** The x axis' height under the last band, more when its labels are tilted. */
  axisH: number;
  tilt: boolean;
  /** The longest a tilted label runs before it is cut. */
  tiltMax: number;
  padL: number;
  plotW: number;
  step: number;
  /** Each band's top edge. */
  tops: number[];
  height: number;
}

const xOf = (l: Layout, i: number) => l.padL + l.step * (i + 0.5);

interface Band {
  height: number;
  scale: { lo: number; hi: number; ticks: number[] };
  y(v: number): number;
}

/** The series as one, so a shared band's scale spans all of their values. */
function together(series: readonly ChartSeries[]): ChartSeries {
  return {
    ...series[0]!,
    kind: series.some((s) => s.kind === 'bar') ? 'bar' : 'line',
    points: series.flatMap((s) => s.points),
  };
}

function bandOf(s: ChartSeries, top: number, bandH: number): Band {
  const vals = s.points.flatMap((p) => (p.value === null ? [] : [p.value]));
  let lo = Math.min(...vals, Infinity);
  let hi = Math.max(...vals, -Infinity);
  if (vals.length === 0) {
    lo = 0;
    hi = 1;
  }
  // Bars and amounts grow from zero; a rate or a ratio only spans what it reached.
  if (s.kind === 'bar' || s.unit === 'money' || s.unit === 'count') {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  const scale = s.unit === 'minutes' ? niceMinutes(lo, hi) : niceScale(lo, hi);
  const t = top + PAD_Y;
  const b = top + bandH - PAD_Y;
  return {
    height: bandH,
    scale,
    y: (v) => b - ((v - scale.lo) / (scale.hi - scale.lo)) * (b - t),
  };
}

/** The indices of the largest and the smallest value, when they are two bars with different values. */
function extremesOf(points: readonly SeriesPoint[]): number[] {
  let hi = -1;
  let lo = -1;
  points.forEach((p, i) => {
    if (p.value === null) return;
    if (hi === -1 || p.value > points[hi]!.value!) hi = i;
    if (lo === -1 || p.value < points[lo]!.value!) lo = i;
  });
  if (hi === -1) return [];
  return hi === lo || points[hi]!.value === points[lo]!.value ? [hi] : [hi, lo];
}

/** The drawing: axes, bars and lines. Static between hovers, so it is memoised. */
const Plot = memo(function Plot({
  series,
  layout,
  bands,
  format: fmt,
  gradientId,
  xLabel,
  overlay,
  shade,
  labelExtremes,
}: {
  series: readonly ChartSeries[];
  layout: Layout;
  bands: readonly Band[];
  format: Formatter;
  gradientId: string;
  xLabel?: (key: string) => string;
  overlay: boolean;
  shade?: Shade;
  labelExtremes: boolean;
}) {
  const keys = series[0]!.points.map((p) => p.key);
  const { padL, plotW, step } = layout;
  const bandH = layout.bandHs[0]!;
  // Gain and loss colours when net is the only money series of the chart.
  const moneyCount = series.filter((s) => s.unit === 'money').length;
  const barW = Math.max(1, Math.min(step * 0.72, 30));
  const { ticks } = xTicks(keys, plotW, xLabel, layout.tilt, layout.tiltMax);
  const shaded = shade ? spanOf(keys, shade) : undefined;
  // A label that would run off the plot's right edge hangs from the band's end instead.
  const nearRight =
    shaded !== undefined &&
    xOf(layout, shaded.from) - layout.step / 2 + 170 > padL + plotW;
  const lastBottom =
    layout.tops[series.length - 1]! + layout.bandHs[series.length - 1]!;
  return (
    <>
      {shade && shaded ? (
        <g data-band={shade.name} pointerEvents="none">
          <rect
            x={xOf(layout, shaded.from) - layout.step / 2}
            width={(shaded.to - shaded.from + 1) * layout.step}
            y={layout.tops[0]! + PAD_Y / 2}
            height={bandH - PAD_Y}
            fill="var(--loss-fill)"
            fillOpacity={0.12}
          />
          <text
            x={
              nearRight
                ? xOf(layout, shaded.to) + layout.step / 2 - 6
                : xOf(layout, shaded.from) - layout.step / 2 + 6
            }
            textAnchor={nearRight ? 'end' : 'start'}
            y={layout.tops[0]! + PAD_Y + 10}
            fontSize={11}
            fontWeight={600}
            fill="var(--loss)"
          >
            {shade.label}
          </text>
        </g>
      ) : null}
      {series.map((s, si) => {
        const band = bands[si]!;
        const colour = COLOURS[si % COLOURS.length]!;
        const top = layout.tops[si]!;
        const zero = band.y(0);
        const counts = s.counts ?? [];
        const biggest = Math.max(1, ...counts);
        const signed = s.unit === 'money' && moneyCount === 1;
        const zeroInside = band.scale.lo <= 0 && band.scale.hi >= 0;
        return (
          <g
            key={s.label}
            data-series={s.label}
            data-band-height={layout.bandHs[si]}
          >
            {(overlay && si > 0 ? [] : band.scale.ticks).map((t) => (
              <g key={t}>
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={band.y(t)}
                  y2={band.y(t)}
                  stroke="var(--line)"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={padL - 8}
                  y={band.y(t) + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--faint)"
                  className="tabular-nums"
                >
                  {fmt.tick(s.unit, t)}
                </text>
              </g>
            ))}
            {s.kind === 'bar' ? (
              s.points.map((p, i) => {
                if (p.value === null) return null;
                const y = band.y(p.value);
                const h = Math.max(1, Math.abs(zero - y));
                return (
                  <rect
                    key={p.key}
                    data-mark="bar"
                    x={xOf(layout, i) - barW / 2}
                    y={p.value >= 0 ? zero - h : zero}
                    width={barW}
                    height={h}
                    rx={Math.min(1.5, barW / 2)}
                    fill={
                      signed
                        ? p.value < 0
                          ? 'var(--loss-fill)'
                          : 'var(--gain-fill)'
                        : colour
                    }
                  />
                );
              })
            ) : s.kind === 'dots' ? (
              s.points.map((p, i) => {
                if (p.value === null) return null;
                const w = Math.sqrt((counts[i] ?? biggest) / biggest);
                return (
                  <circle
                    key={p.key}
                    data-mark="dot"
                    cx={xOf(layout, i)}
                    cy={band.y(p.value)}
                    r={2.5 + 3 * w}
                    fill={colour}
                    fillOpacity={0.28 + 0.72 * w}
                  />
                );
              })
            ) : (
              <Line
                s={s}
                layout={layout}
                band={band}
                top={top}
                colour={colour}
                dash={DASHES[si % DASHES.length]}
                area={series.length === 1}
                gradientId={`${gradientId}-${si}`}
              />
            )}
            {labelExtremes && s.kind === 'bar' && si === 0
              ? extremesOf(s.points).map((i) => {
                  const v = s.points[i]!.value!;
                  const up = v >= 0;
                  return (
                    <text
                      key={`x${i}`}
                      data-extreme={up ? 'best' : 'worst'}
                      x={xOf(layout, i)}
                      y={band.y(v) + (up ? -5 : 13)}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill={up ? 'var(--gain)' : 'var(--loss)'}
                      className="tabular-nums"
                    >
                      {fmt.tick(s.unit, v)}
                    </text>
                  );
                })
              : null}
            {zeroInside && s.kind === 'bar' ? (
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
      })}
      {ticks.map((t) => (
        <text
          key={t.i}
          data-axis-label=""
          x={xOf(layout, t.i)}
          y={lastBottom + 16}
          textAnchor={layout.tilt ? 'end' : 'middle'}
          transform={
            layout.tilt
              ? `rotate(-45 ${xOf(layout, t.i)} ${lastBottom + 16})`
              : undefined
          }
          fontSize={layout.tilt ? 10.5 : 11}
          fill="var(--faint)"
        >
          {t.text}
        </text>
      ))}
    </>
  );
});

function Line({
  s,
  layout,
  band,
  top,
  colour,
  dash,
  area,
  gradientId,
}: {
  s: ChartSeries;
  layout: Layout;
  band: Band;
  top: number;
  colour: string;
  /** A dash pattern: the line is dashed and its markers hollow. */
  dash?: string;
  area: boolean;
  gradientId: string;
}) {
  // One run of points per stretch without a gap.
  const runs: { x: number; y: number }[][] = [];
  s.points.forEach((p, i) => {
    if (p.value === null) {
      runs.push([]);
      return;
    }
    if (runs.length === 0) runs.push([]);
    runs[runs.length - 1]!.push({ x: xOf(layout, i), y: band.y(p.value) });
  });
  const solid = runs.filter((r) => r.length > 0);
  const path = (r: { x: number; y: number }[]) =>
    r
      .map(
        (p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`,
      )
      .join(' ');
  const floor = Math.min(
    band.y(Math.max(band.scale.lo, 0)),
    top + band.height - PAD_Y,
  );
  return (
    <g data-mark="line" fill="none">
      {area && solid.length === 1 && solid[0]!.length > 1 ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={colour} stopOpacity={0.26} />
              <stop offset="0.55" stopColor={colour} stopOpacity={0.09} />
              <stop offset="1" stopColor={colour} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={`${path(solid[0]!)} L${solid[0]![solid[0]!.length - 1]!.x.toFixed(1)},${floor} L${solid[0]![0]!.x.toFixed(1)},${floor} Z`}
            fill={`url(#${gradientId})`}
            stroke="none"
          />
        </>
      ) : null}
      {solid.map((r, i) =>
        r.length === 1 ? (
          <circle key={i} cx={r[0]!.x} cy={r[0]!.y} r={2.5} fill={colour} />
        ) : (
          <path
            key={i}
            d={path(r)}
            stroke={colour}
            strokeWidth={1.75}
            strokeDasharray={dash}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ),
      )}
      {s.points.length <= 31
        ? solid
            .flat()
            .map((p) => (
              <circle
                key={p.x}
                cx={p.x}
                cy={p.y}
                r={2.5}
                fill={dash ? 'var(--surface-1)' : colour}
                stroke={dash ? colour : undefined}
                strokeWidth={dash ? 1.5 : undefined}
              />
            ))
        : null}
    </g>
  );
}

/** A legend key: net bars wear the gain and loss pair, markers a dot, anything else its colour. */
function Swatch({
  kind,
  colour,
}: {
  kind: 'signed' | 'dot' | 'box';
  colour: string;
}): React.JSX.Element {
  if (kind === 'signed')
    return (
      <span aria-hidden="true" className="inline-flex gap-0.5">
        <i data-swatch="gain" className="size-2.5 rounded-[3px] bg-gain-fill" />
        <i data-swatch="loss" className="size-2.5 rounded-[3px] bg-loss-fill" />
      </span>
    );
  return (
    <span
      aria-hidden="true"
      data-swatch={kind === 'dot' ? 'dot' : undefined}
      className={`size-2.5 ${kind === 'dot' ? 'rounded-full' : 'rounded-[3px]'}`}
      style={{ background: colour }}
    />
  );
}

/** The values as a table for assistive technology: the chart's twin. */
const ValuesTable = memo(function ValuesTable({
  label,
  series,
  fmt,
  periodLabel,
}: {
  label: string;
  series: readonly ChartSeries[];
  fmt: Formatter;
  periodLabel: (key: string) => string;
}) {
  // The clip goes on a box around the table: `overflow` does nothing on a table,
  // so a clipped table's rows would still stretch the page's scroll height.
  return (
    <div className="sr-only">
      <table aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((s) => (
              <th key={s.label} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series[0]!.points.map((p, i) => (
            <tr key={p.key}>
              <th scope="row">{periodLabel(p.key)}</th>
              {series.map((s) => (
                <td key={s.label}>{fmt.node(s.unit, s.points[i]!.value)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

/**
 * Bars and lines over one shared x axis. A chart of several series stacks one
 * band per series, each on its own scale, so metrics in different units never
 * share an axis. Money reads in the chosen display unit, axes included.
 *
 * Hover, touch or focus gives a readout of the period and every series' value;
 * with focus on the chart, Left and Right step through the periods, Home and End
 * jump to the first and the last. The chart is an image with `label`, and its
 * values are in a table only assistive technology sees.
 */
function ChartBody({
  series,
  label,
  periodLabel: periodLabelProp,
  height,
  currency,
  xLabel,
  overlay = false,
  shade,
  labelExtremes = false,
  extra,
  rowRatio = 1,
  tiltLabels = false,
  tiltMaxChars = TILT_MAX_CHARS,
  hrefOf,
  expand,
}: {
  series: readonly ChartSeries[];
  label: string;
  /** How a period's key reads in the readout and the table. */
  periodLabel?: (key: string) => string;
  /** One band's height; default 260 for one series, 150 for several. */
  height?: number;
  /** The currency of money values; default: the base currency. */
  currency?: string;
  /**
   * For named periods (a weekday, a symbol, 10:30) rather than dates: how a key
   * reads under the axis. Without it keys are dates, days or months.
   */
  xLabel?: (key: string) => string;
  /** Draw every series on one shared axis, rather than a band each. The series should share a unit. */
  overlay?: boolean;
  /** A stretch to shade, such as the max drawdown. */
  shade?: Shade;
  /** Write the value on the largest and the smallest bar of the first series. */
  labelExtremes?: boolean;
  /** More rows for the readout, such as the trades in the period; not drawn. */
  extra?: readonly { label: string; text(key: string): string }[];
  /** Bands after the first are this share of its height (the win-rate panel under the P&L bars). */
  rowRatio?: number;
  /** Named bars with no order (symbols, strategies) tilt their labels rather than skip some, so every bar is named. */
  tiltLabels?: boolean;
  /** How long a tilted label may run before it is cut with an ellipsis; default 14. Names that begin alike (Switched sides, green and red) need more. */
  tiltMaxChars?: number;
  /**
   * Where a period's bar leads (its trades in the log), or undefined when it leads nowhere.
   * A pointer user clicks the bar; the keyboard and assistive technology use the
   * table the chart sits over, which carries the same links. Touch taps read the chart.
   */
  hrefOf?(key: string): string | undefined;
  /** The Expand action, drawn at the top right of the chart. */
  expand?: React.ReactNode;
}): React.JSX.Element {
  // Named periods read as they are named; dated ones as a date.
  const periodLabel = periodLabelProp ?? xLabel ?? periodText;
  const display = useDisplay();
  const base = usePrefs().data?.baseCurrency ?? 'USD';
  const pctBase = useContext(FigureSourceContext)?.pctBase ?? null;
  const cur = currency ?? base;
  const fmt = useMemo(
    () => formatterOf(display, cur),
    // `display` is rebuilt on every render; what it reads is the unit, the
    // currency and the percentage's base, so those are the keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display.unit, cur, pctBase],
  );
  const gradientId = `rc${useId().replace(/[^\w-]/g, '')}`;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  // A press focuses the chart too; that focus must not default to the first period.
  const pressed = useRef(false);

  const n = series[0]?.points.length ?? 0;
  const hasData = n > 0;
  // Before paint, so the chart never shows a frame at the wrong width.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasData]);

  const stacked = overlay ? 1 : series.length;
  const bandH = height ?? (stacked === 1 ? 260 : 150);
  const layout = useMemo<Layout | undefined>(() => {
    if (n === 0) return undefined;
    const widest = Math.max(
      ...series.flatMap((s) => {
        const band = bandOf(overlay ? together(series) : s, 0, bandH);
        return band.scale.ticks.map((t) => fmt.tick(s.unit, t).length);
      }),
    );
    const padL = Math.max(36, Math.ceil(widest * 6.4) + 16);
    const plotW = Math.max(40, width - padL - PAD_R);
    const bandHs = series.map((_, i) =>
      i === 0 || overlay ? bandH : Math.round(bandH * rowRatio),
    );
    const tops = series.map((_, i) =>
      overlay
        ? 0
        : bandHs.slice(0, i).reduce((sum, h) => sum + h + BAND_GAP, 0),
    );
    const axis = xTicks(
      series[0]!.points.map((p) => p.key),
      plotW,
      xLabel,
      tiltLabels,
      tiltMaxChars,
    );
    const axisH = axis.hang;
    return {
      width,
      bandHs,
      axisH,
      tilt: axis.tilt,
      tiltMax: tiltMaxChars,
      padL,
      plotW,
      step: plotW / n,
      tops,
      height:
        (overlay
          ? bandH
          : bandHs.reduce((sum, h) => sum + h, 0) + (stacked - 1) * BAND_GAP) +
        axisH,
    };
  }, [
    series,
    width,
    bandH,
    n,
    fmt,
    overlay,
    stacked,
    rowRatio,
    xLabel,
    tiltLabels,
    tiltMaxChars,
  ]);
  const bands = useMemo(() => {
    if (!layout) return [];
    if (!overlay)
      return series.map((s, i) =>
        bandOf(s, layout.tops[i]!, layout.bandHs[i]!),
      );
    // One scale for all, so the lines can be read against each other.
    const shared = bandOf(together(series), 0, bandH);
    return series.map(() => shared);
  }, [series, layout, bandH, overlay]);

  if (!layout || n === 0)
    return (
      <p className="py-10 text-center text-[13.5px] text-faint">
        Nothing to chart in this range.
      </p>
    );

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
  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - layout.padL) / layout.step);
    setHover(i < 0 || i >= n ? null : i);
  };
  const onPress = (e: PointerEvent<HTMLDivElement>) => {
    pressed.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - layout.padL) / layout.step);
    if (i < 0 || i >= n) return;
    setHover(i);
    setFocused(i);
  };
  const moneyOnly = series.filter((s) => s.unit === 'money').length === 1;
  const x = active === null ? 0 : xOf(layout, active);
  const flip = x > layout.width * 0.55;

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-start justify-between gap-3 empty:hidden">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[12.5px] text-muted">
            {series.map((s, i) => (
              <li key={s.label} className="inline-flex items-center gap-1.5">
                <Swatch
                  kind={
                    s.kind === 'bar' && s.unit === 'money' && moneyOnly
                      ? 'signed'
                      : s.kind === 'dots'
                        ? 'dot'
                        : 'box'
                  }
                  colour={COLOURS[i % COLOURS.length]!}
                />
                {s.label}
              </li>
            ))}
          </ul>
        ) : null}
        {expand ? <div className="ml-auto flex-none">{expand}</div> : null}
      </div>
      <div className="relative">
        <div
          ref={box}
          role="img"
          aria-label={label}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => {
            // From the keyboard the readout starts on the first period; after a press it keeps the pressed one.
            const fromPress = pressed.current;
            pressed.current = false;
            if (!fromPress) setFocused((cur) => cur ?? 0);
          }}
          onBlur={() => setFocused(null)}
          onPointerDown={onPress}
          onPointerMove={onPointer}
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
            <Plot
              series={series}
              layout={layout}
              bands={bands}
              format={fmt}
              gradientId={gradientId}
              xLabel={xLabel}
              overlay={overlay}
              shade={shade}
              labelExtremes={labelExtremes}
            />
            {active !== null ? (
              <g pointerEvents="none">
                <line
                  x1={x}
                  x2={x}
                  y1={layout.tops[0]! + PAD_Y / 2}
                  y2={layout.height - layout.axisH + 6}
                  stroke="var(--faint)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                {series.map((s, si) => {
                  const v = s.points[active]!.value;
                  if (v === null) return null;
                  return (
                    <circle
                      key={s.label}
                      cx={x}
                      cy={bands[si]!.y(v)}
                      r={4}
                      fill={
                        s.kind === 'bar' && s.unit === 'money' && moneyOnly
                          ? v < 0
                            ? 'var(--loss-fill)'
                            : 'var(--gain-fill)'
                          : COLOURS[si % COLOURS.length]
                      }
                      stroke="var(--surface-1)"
                      strokeWidth={2}
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>
          {hrefOf
            ? series[0]!.points.map((p, i) => {
                const href = hrefOf(p.key);
                return href === undefined ? null : (
                  // A real link for a click, a middle click or a new tab. The
                  // table beside the chart is the keyboard and screen reader path.
                  <Link
                    key={p.key}
                    href={href}
                    prefetch={false}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="absolute top-0 block cursor-pointer bg-accent/0 transition-colors duration-200 hover:bg-accent/[0.06] pointer-coarse:hidden"
                    style={{
                      left: layout.padL + layout.step * i,
                      width: layout.step,
                      height: layout.height,
                    }}
                  />
                );
              })
            : null}
        </div>
        <div role="status">
          {active !== null ? (
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-control border border-line bg-surface-1 px-2.5 py-2 text-[12.5px] whitespace-nowrap text-muted shadow-[var(--shadow)]"
              style={flip ? { right: layout.width - x + 12 } : { left: x + 12 }}
            >
              <b className="block text-[13px] font-semibold text-text">
                {periodLabel(series[0]!.points[active]!.key)}
              </b>
              {series.map((s, i) => (
                <div key={s.label} className="flex justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ background: COLOURS[i % COLOURS.length] }}
                    />
                    {s.label}
                  </span>
                  <span className="font-semibold text-text tabular-nums">
                    {fmt.node(s.unit, s.points[active]!.value)}
                  </span>
                </div>
              ))}
              {extra?.map((row) => (
                <div key={row.label} className="flex justify-between gap-4">
                  <span className="pl-3.5">{row.label}</span>
                  <span className="font-semibold text-text tabular-nums">
                    {row.text(series[0]!.points[active]!.key)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <ValuesTable
        label={label}
        series={series}
        fmt={fmt}
        periodLabel={periodLabel}
      />
    </div>
  );
}

/** The first sentence of a chart's label, for the title of its full-screen view. */
function titleOf(label: string): string {
  return label.split(/\.\s/)[0]!.replace(/\.$/, '');
}

/**
 * Where a chart card's header holds the Expand action: put `<ExpandSlot />` in
 * the header's `end` and pass `slot` to the chart as `expandSlot`.
 */
export function useExpandSlot(): [
  slot: HTMLElement | null,
  setSlot: (el: HTMLElement | null) => void,
] {
  return useState<HTMLElement | null>(null);
}

/**
 * The chart in its full-screen dialog: it measures the dialog's body and sets
 * the plot height so the chart fills down to the body's bottom padding.
 */
function FilledChart({
  start,
  bands,
  ...props
}: ComponentProps<typeof ChartBody> & {
  start: number;
  bands: number;
}): React.JSX.Element {
  const wrap = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(start);
  // Each size of the dialog gets a few passes to settle, so a scrollbar that
  // appears and vanishes can never make the plot hunt.
  const passes = useRef(0);
  const seen = useRef('');
  useLayoutEffect(() => {
    const el = wrap.current;
    const scroller = el?.parentElement;
    if (!el || !scroller) return;
    const fit = () => {
      const cs = getComputedStyle(scroller);
      const room =
        scroller.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom) -
        2;
      const size = `${scroller.clientWidth}x${scroller.clientHeight}`;
      if (size !== seen.current) {
        seen.current = size;
        passes.current = 0;
      }
      // Everything is read from the DOM at this instant (the plot height drawn,
      // the svg's height, the wrapper's), so the pass is right whatever render
      // it lands on.
      const svg = el.querySelector('svg');
      const drawn = Number(
        el
          .querySelector('[data-band-height]')
          ?.getAttribute('data-band-height'),
      );
      if (!svg || !drawn) return;
      const diff = room - el.offsetHeight;
      if (room <= 0 || Math.abs(diff) < 2 || passes.current >= 4) return;
      passes.current += 1;
      setH(Math.max(120, Math.round(drawn + diff / bands)));
    };
    // Once at once, so the first frame is already the right size; again from a
    // timer (a frame callback never runs in a tab that is not showing) and on
    // every resize, so it tracks the dialog's final size.
    fit();
    let timer = setTimeout(fit, 0);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(fit, 0);
          });
    observer?.observe(scroller);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, [h, bands]);
  return (
    // Reduced motion gives every element a 0.01ms transition on all properties,
    // so a size changed in this commit still reads as the old one until the next
    // frame; the plot's sizes must not transition, or the fit measures stale boxes.
    <div
      ref={wrap}
      data-expanded-chart=""
      className="!transition-none [&_*]:!transition-none"
    >
      <ChartBody {...props} height={h} />
    </div>
  );
}

/**
 * Bars and lines over one shared x axis (see `ChartBody`), with an Expand
 * action that opens the same chart full screen over a taller plot. Escape or
 * Close returns to the page, and focus goes back to Expand.
 */
export function ReportChart({
  expandSlot,
  ...props
}: ComponentProps<typeof ChartBody> & {
  /** The card header's slot for Expand; without one it sits above the plot. */
  expandSlot?: HTMLElement | null;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const filled = (props.series[0]?.points.length ?? 0) > 0;
  const bands = props.overlay ? 1 : props.series.length;
  // The plot grows by four fifths of what it had; the dialog scrolls if the bands outgrow it.
  const taller = Math.round((props.height ?? (bands === 1 ? 260 : 150)) * 1.8);
  const slotted = expandSlot !== undefined;
  const expandButton = (
    <button
      ref={trigger}
      type="button"
      aria-label="Expand chart"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
      className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-control px-2 text-[12.5px] font-medium text-muted transition-colors duration-200 ease-(--ease-glide) hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:px-3"
    >
      <ArrowsOut size={14} aria-hidden="true" />
      Expand
    </button>
  );
  return (
    <>
      <ChartBody
        {...props}
        expand={slotted ? undefined : filled ? expandButton : null}
      />
      {slotted && filled && expandSlot
        ? createPortal(expandButton, expandSlot)
        : null}
      {filled ? (
        <MorphDialog
          open={open}
          onOpenChange={setOpen}
          origin={trigger}
          returnFocus={trigger}
          title={titleOf(props.label)}
          size="full"
        >
          <FilledChart {...props} start={taller} bands={bands} />
        </MorphDialog>
      ) : null}
    </>
  );
}

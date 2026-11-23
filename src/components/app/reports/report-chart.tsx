'use client';

import { format, parseISO } from 'date-fns';
import {
  memo,
  useContext,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { FigureText } from '@/components/product/figure-text';
import { usePrefs } from '@/data/query/hooks';
import type { SeriesPoint, SeriesUnit } from '@/domain/metrics/series';
import { FigureSourceContext, useDisplay, type Display } from '@/lib/display';
import { formatPct } from '@/lib/format';

export interface ChartSeries {
  label: string;
  kind: 'bar' | 'line';
  /** Every series of one chart has the same keys, in the same order. */
  points: readonly SeriesPoint[];
  /** `money` values are cents: they read in the chosen display unit. */
  unit: SeriesUnit;
}

/** Each series' own colour when a chart holds several. */
const COLOURS = ['var(--accent)', 'var(--info-fill)', 'var(--warn-fill)'];

const PAD_R = 12;
const PAD_Y = 8;
const BAND_GAP = 18;
const X_AXIS = 24;
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

/** Where the x axis is labelled: every period when there is room, else each new month, never closer than a label's width. */
function xTicks(
  keys: readonly string[],
  plotW: number,
  xLabel?: (key: string) => string,
): { i: number; text: string }[] {
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
  const out: typeof candidates = [];
  let lastX = -Infinity;
  const gap = xLabel
    ? Math.max(
        MIN_LABEL_GAP,
        ...candidates.map((c) => c.text.length * 6.4 + 10),
      )
    : MIN_LABEL_GAP;
  for (const c of candidates) {
    const x = (c.i + 0.5) * step;
    if (x - lastX >= gap) {
      out.push(c);
      lastX = x;
    }
  }
  return out;
}

/** Compact dollars for an axis: +$5k, −$1.5k, $0. */
function compactMoney(cents: number, currency: string): string {
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
  return `${cents < 0 ? '−' : '+'}${body}`;
}

interface Formatter {
  /** A value as the readout and the table show it. */
  node(unit: SeriesUnit, v: number | null): React.ReactNode;
  /** A value as an axis tick shows it. */
  tick(unit: SeriesUnit, v: number): string;
}

function formatterOf(display: Display, currency: string): Formatter {
  return {
    node(unit, v) {
      if (v === null) return 'None';
      switch (unit) {
        case 'money':
          return <FigureText f={display.cash(v, true, currency)} />;
        case 'pct':
          return formatPct(v, 1);
        case 'ratio':
          return v.toFixed(2);
        case 'count':
          return String(Math.round(v));
      }
    },
    tick(unit, v) {
      switch (unit) {
        case 'money':
          return display.unit === 'dollar'
            ? compactMoney(v, currency)
            : display.cash(v, v !== 0, currency).text;
        case 'pct':
          return formatPct(v, 0);
        case 'ratio':
          return Number.isInteger(v) ? String(v) : v.toFixed(1);
        case 'count':
          return String(Math.round(v));
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
  bandH: number;
  padL: number;
  plotW: number;
  step: number;
  /** Each band's top edge. */
  tops: number[];
  height: number;
}

const xOf = (l: Layout, i: number) => l.padL + l.step * (i + 0.5);

interface Band {
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
  const scale = niceScale(lo, hi);
  const t = top + PAD_Y;
  const b = top + bandH - PAD_Y;
  return {
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
  const { padL, plotW, step, bandH } = layout;
  // Gain and loss colours when net is the only money series of the chart.
  const moneyCount = series.filter((s) => s.unit === 'money').length;
  const barW = Math.max(1, Math.min(step * 0.72, 30));
  const ticks = xTicks(keys, plotW, xLabel);
  const shaded = shade ? spanOf(keys, shade) : undefined;
  // A label that would run off the plot's right edge hangs from the band's end instead.
  const nearRight =
    shaded !== undefined &&
    xOf(layout, shaded.from) - layout.step / 2 + 170 > padL + plotW;
  const lastBottom = layout.tops[series.length - 1]! + bandH;
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
        const signed = s.unit === 'money' && moneyCount === 1;
        const zeroInside = band.scale.lo <= 0 && band.scale.hi >= 0;
        return (
          <g key={s.label} data-series={s.label}>
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
            ) : (
              <Line
                s={s}
                layout={layout}
                band={band}
                top={top}
                colour={colour}
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
          x={xOf(layout, t.i)}
          y={lastBottom + 16}
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

function Line({
  s,
  layout,
  band,
  top,
  colour,
  area,
  gradientId,
}: {
  s: ChartSeries;
  layout: Layout;
  band: Band;
  top: number;
  colour: string;
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
    top + layout.bandH - PAD_Y,
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
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ),
      )}
      {s.points.length <= 31
        ? solid
            .flat()
            .map((p) => (
              <circle key={p.x} cx={p.x} cy={p.y} r={2.5} fill={colour} />
            ))
        : null}
    </g>
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
  return (
    <table aria-label={label} className="sr-only">
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
export function ReportChart({
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
    const tops = series.map((_, i) => (overlay ? 0 : i * (bandH + BAND_GAP)));
    return {
      width,
      bandH,
      padL,
      plotW,
      step: plotW / n,
      tops,
      height: stacked * bandH + (stacked - 1) * BAND_GAP + X_AXIS,
    };
  }, [series, width, bandH, n, fmt, overlay, stacked]);
  const bands = useMemo(() => {
    if (!layout) return [];
    if (!overlay)
      return series.map((s, i) => bandOf(s, layout.tops[i]!, bandH));
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
      {series.length > 1 ? (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
          {series.map((s, i) => (
            <li key={s.label} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-[3px]"
                style={{ background: COLOURS[i % COLOURS.length] }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
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
          className="overflow-hidden rounded-control outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
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
                  y2={layout.height - X_AXIS + 6}
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

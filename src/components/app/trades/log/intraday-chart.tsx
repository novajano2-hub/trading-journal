'use client';

import { useId, useRef, useState } from 'react';
import { MorphDialog } from '@/components/ui/morph-dialog';
import type { IntradayPoint } from '@/data/day-log';
import { usePrefs } from '@/data/query/hooks';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { signTone } from '../../dashboard/shared';
import { clockOf } from '@/lib/day-label';

/**
 * The span of the day's trading the x axis covers (see `daySpan`, Keel's call:
 * the record says only "the start, the middle and the end of the day's trading").
 */
export interface ChartSpan {
  from: string;
  to: string;
}

const W = 600;
const PAD = 8;

/** A tick step of 1, 2 or 5 times a power of ten that is at least `raw`. */
function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

/**
 * The day's running net as a step line (a hand-rolled SVG, as the Performance
 * card's), tinted gain above zero and loss below. The card's chart has $ labels
 * on the y axis and no time labels; clicking it (or Enter or Space) opens the
 * enlarged chart, which adds three time labels. Hover and keyboard focus
 * read the trade behind a point; the arrow keys move between points.
 * Every amount goes through the display unit, so Privacy masks all of them.
 */
export function IntradayChart({
  series,
  label,
  large = false,
  span,
  nameOf = (id) => id,
}: {
  series: readonly IntradayPoint[];
  /** The day, as the labels name it: "Tue 24 Nov 2026". */
  label: string;
  large?: boolean;
  span?: ChartSpan;
  /** How a trade reads in the readout: the contract, "TSLA 385 Call". */
  nameOf?: (tradeId: string) => string;
}): React.JSX.Element | null {
  const display = useDisplay();
  const timeZone = usePrefs().data?.timeZone ?? 'UTC';
  const uid = useId().replace(/:/g, '');
  const trigger = useRef<HTMLButtonElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ i: number; by: 'pointer' | 'focus' } | null>(
    null,
  );
  if (series.length === 0) return null;

  const H = large ? 300 : 94;
  const times = series.map((p) => Date.parse(p.time));
  const start = Math.min(Date.parse(span?.from ?? series[0]!.time), times[0]!);
  const last = Math.max(
    Date.parse(span?.to ?? series.at(-1)!.time),
    times.at(-1)!,
  );
  const end = last > start ? last : start + 60_000;
  const xOf = (ms: number) => ((ms - start) / (end - start)) * W;

  const cums = series.map((p) => p.cumulative);
  const lo = Math.min(0, ...cums);
  const hi = Math.max(0, ...cums, lo + 100);
  const yOf = (v: number) => PAD + ((hi - v) / (hi - lo)) * (H - 2 * PAD);
  const y0 = yOf(0);

  const step = niceStep((hi - lo) / (large ? 4 : 2));
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

  const path =
    `M0 ${y0.toFixed(1)}` +
    series
      .map(
        (p, i) =>
          ` H${xOf(times[i]!).toFixed(1)} V${yOf(p.cumulative).toFixed(1)}`,
      )
      .join('');
  const area = `${path} V${y0.toFixed(1)} Z`;

  const ids = series.map((p) => p.tradeId);
  const amount = (n: ReadonlyArray<string>, cents: number) =>
    display.figure(display.ofTrades(n, cents));
  const final = series.at(-1)!;
  const high = Math.max(...cums);
  const low = Math.min(...cums);
  const aria = `Running net on ${label}: ${series.length} closed ${plural(series.length, 'trade')} from ${clockOf(new Date(start).toISOString(), timeZone)} to ${clockOf(new Date(end).toISOString(), timeZone)}, ending ${amount(ids, final.cumulative).label}, high ${display.cash(high).label}, low ${display.cash(low).label}`;

  const pick = (e: React.PointerEvent) => {
    const rect = plot.current?.getBoundingClientRect();
    if (!rect || rect.width === 0)
      return setAt({ i: series.length - 1, by: 'pointer' });
    const ms = start + ((e.clientX - rect.left) / rect.width) * (end - start);
    let best = 0;
    times.forEach((t, i) => {
      if (Math.abs(t - ms) < Math.abs(times[best]! - ms)) best = i;
    });
    setAt({ i: best, by: 'pointer' });
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const from = at?.i ?? series.length - 1;
    const i = Math.min(
      series.length - 1,
      Math.max(0, from + (e.key === 'ArrowLeft' ? -1 : 1)),
    );
    setAt({ i, by: 'focus' });
  };
  const shared = {
    onPointerMove: pick,
    onPointerLeave: () => setAt((a) => (a?.by === 'pointer' ? null : a)),
    onFocus: () => setAt((a) => a ?? { i: series.length - 1, by: 'focus' }),
    onBlur: () => setAt(null),
    onKeyDown: keys,
  };

  const hit = at ? series[at.i] : undefined;
  const readout =
    at && hit ? (
      <div
        role={at.by === 'focus' ? 'status' : undefined}
        aria-hidden={at.by === 'pointer' ? true : undefined}
        style={{
          left: `${Math.min(85, Math.max(15, (xOf(times[at.i]!) / W) * 100))}%`,
          top: -6,
        }}
        className="pointer-events-none absolute z-10 w-max max-w-[min(320px,80vw)] -translate-x-1/2 -translate-y-full rounded-control border border-line bg-surface-1 px-3 py-2 text-[12.5px] leading-[1.4] text-muted shadow-[var(--shadow)]"
      >
        <b className="font-semibold text-text">
          {clockOf(hit.time, timeZone)}, {nameOf(hit.tradeId)}
        </b>{' '}
        <span className={signTone(hit.net)}>
          {amount([hit.tradeId], hit.net).text}
        </span>
        , running net {amount(ids.slice(0, at.i + 1), hit.cumulative).text}
      </div>
    ) : null;

  const body = (
    <div ref={plot} style={{ height: H }} className="relative">
      <div aria-hidden="true">
        {ticks.map((v) => (
          <span
            key={v}
            style={{ top: yOf(v) }}
            className="absolute right-full -translate-y-1/2 pr-2 text-[11px] leading-none whitespace-nowrap text-faint tabular-nums"
          >
            {display.cash(v).text}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={aria}
        className="block size-full overflow-visible"
      >
        <defs>
          <clipPath id={`${uid}up`}>
            <rect x="0" y="-10" width={W} height={y0 + 10} />
          </clipPath>
          <clipPath id={`${uid}dn`}>
            <rect x="0" y={y0} width={W} height={H} />
          </clipPath>
        </defs>
        {ticks.map((v) => (
          <line
            key={v}
            x1="0"
            x2={W}
            y1={yOf(v)}
            y2={yOf(v)}
            stroke="var(--line)"
            strokeDasharray={v === 0 ? '2 3' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={area}
          fill="var(--gain-fill)"
          opacity=".14"
          clipPath={`url(#${uid}up)`}
        />
        <path
          d={area}
          fill="var(--loss-fill)"
          opacity=".14"
          clipPath={`url(#${uid}dn)`}
        />
        <path
          d={path}
          fill="none"
          stroke="var(--gain-fill)"
          strokeWidth="1.75"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          clipPath={`url(#${uid}up)`}
        />
        <path
          d={path}
          fill="none"
          stroke="var(--loss-fill)"
          strokeWidth="1.75"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          clipPath={`url(#${uid}dn)`}
        />
      </svg>
      {at && hit ? (
        <i
          aria-hidden="true"
          style={{
            left: `${(xOf(times[at.i]!) / W) * 100}%`,
            top: `${(yOf(hit.cumulative) / H) * 100}%`,
          }}
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-text bg-surface-1"
        />
      ) : null}
    </div>
  );

  const gutter = large ? 'pl-[76px]' : 'pl-[64px]';
  // The readout is a sibling of the plot (not inside the card chart's button), so it is announced.
  const overlay = (
    <div className={`pointer-events-none absolute inset-x-0 top-0 ${gutter}`}>
      <div className="relative" style={{ height: H }}>
        {readout}
      </div>
    </div>
  );

  if (large)
    return (
      <div className={`relative ${gutter}`}>
        {/* A focus stop, so the arrow keys read the points in the enlarged chart too. */}
        <div
          role="group"
          tabIndex={0}
          aria-label={`Points of the running net on ${label}`}
          className="rounded-chip outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
          {...shared}
        >
          {body}
        </div>
        {overlay}
        <ul
          aria-label="Times"
          className="mt-2 flex list-none justify-between p-0 text-[11px] text-faint tabular-nums"
        >
          {[start, (start + end) / 2, end].map((ms, i) => (
            <li key={i}>
              {clockOf(new Date(Math.round(ms)).toISOString(), timeZone, true)}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <>
      <div className="relative">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          aria-label={`Enlarge the chart. ${aria}`}
          onClick={() => setOpen(true)}
          className={`block w-full cursor-zoom-in rounded-control text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent ${gutter}`}
          {...shared}
        >
          {body}
        </button>
        {overlay}
      </div>
      <MorphDialog
        open={open}
        onOpenChange={setOpen}
        origin={trigger}
        returnFocus={trigger}
        title="Running net through the day"
        description={label}
      >
        <div className="pt-8 pb-2">
          <IntradayChart
            large
            series={series}
            label={label}
            span={
              span ?? {
                from: new Date(start).toISOString(),
                to: new Date(end).toISOString(),
              }
            }
            nameOf={nameOf}
          />
        </div>
      </MorphDialog>
    </>
  );
}

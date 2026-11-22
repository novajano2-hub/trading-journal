'use client';

import { useEffect, useRef, useState } from 'react';
import { FigureText } from '@/components/product/figure-text';
import type { Execution, Trade } from '@/domain/types';
import type { Display } from '@/lib/display';
import { plural } from '@/lib/format';
import { price, qty } from './columns';
import { clock, clockOnDay } from './trade-time';

const MARGIN = { top: 14, bottom: 26, left: 10 };
const HEIGHT = 244;

/** The fills in time order. */
export function sortedFills(trade: Trade): Execution[] {
  return [...trade.executions].sort(
    (a, b) =>
      Date.parse(a.time) - Date.parse(b.time) || a.id.localeCompare(b.id),
  );
}

/** The chart's width, following its box. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.max(260, Math.round(el.clientWidth)));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** A triangle centred on (x, y): up for a buy, down for a sell. */
function triangle(x: number, y: number, up: boolean): string {
  const h = 6.5;
  return up
    ? `M${x},${y - h} L${x + h},${y + h - 1} L${x - h},${y + h - 1} Z`
    : `M${x},${y + h} L${x + h},${y - h + 1} L${x - h},${y - h + 1} Z`;
}

/**
 * Price against time, from the fills only: a marker per fill (a filled triangle
 * up for a buy, an open one down for a sell), joined by a dotted line, and
 * dashed lines at the average entry and exit. Keel has no market data, so
 * nothing between the fills is drawn. Each marker is focusable and reads out
 * its fill on hover and on focus.
 */
export function FillsTimeline({
  trade,
  timeZone,
  display,
}: {
  trade: Trade;
  timeZone: string;
  display: Display;
}): React.JSX.Element | null {
  const fills = sortedFills(trade);
  const [box, width] = useWidth();
  const [active, setActive] = useState<string | null>(null);
  if (fills.length === 0) return null;

  const tick = trade.instrument.tickSize;
  const narrow = width < 520;
  const right = narrow ? 76 : 116;
  const plotW = width - MARGIN.left - right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const t0 = Date.parse(fills[0]!.time);
  const t1 = Date.parse(fills[fills.length - 1]!.time);
  const span = t1 - t0;
  const inset = Math.min(34, plotW * 0.08);
  const x = (iso: string) =>
    span === 0
      ? MARGIN.left + plotW / 2
      : MARGIN.left +
        inset +
        ((Date.parse(iso) - t0) / span) * (plotW - inset * 2);

  const prices = [
    ...fills.map((f) => f.price),
    trade.avgEntry,
    ...(trade.avgExit === undefined ? [] : [trade.avgExit]),
  ];
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = hi === lo ? Math.max(tick * 4, hi * 0.002) : (hi - lo) * 0.3;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const y = (p: number) =>
    MARGIN.top + (1 - (p - yMin) / (yMax - yMin)) * plotH;

  const tickCount = narrow ? 3 : 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const at = span === 0 ? t0 : t0 + (span * i) / (tickCount - 1);
    return { at, x: x(new Date(at).toISOString()) };
  });
  const showSeconds = span < 5 * 60_000;
  const grid = [0.2, 0.5, 0.8].map((f) => MARGIN.top + plotH * f);

  const entryLabel = narrow ? 'Entry' : 'Avg entry';
  const exitLabel = narrow ? 'Exit' : 'Avg exit';
  const lines = [
    {
      key: 'entry',
      label: entryLabel,
      value: trade.avgEntry,
      line: 'stroke-accent',
      text: 'fill-accent-ink',
    },
    ...(trade.avgExit === undefined
      ? []
      : [
          {
            key: 'exit',
            label: exitLabel,
            value: trade.avgExit,
            line: 'stroke-muted',
            text: 'fill-muted',
          },
        ]),
  ];
  // Two labels at nearly the same height would overprint: nudge the lower one.
  const labelY = lines.map((l) => y(l.value));
  if (labelY.length === 2 && Math.abs(labelY[0]! - labelY[1]!) < 30) {
    const lower = labelY[0]! > labelY[1]! ? 0 : 1;
    const mid = (labelY[0]! + labelY[1]!) / 2;
    labelY[lower] = mid + 15;
    labelY[1 - lower] = mid - 15;
  }
  const where = (f: Execution) =>
    `${f.side === 'buy' ? 'Buy' : 'Sell'} ${qty(f.qty)} at ${price(f.price, tick)}`;
  const current = fills.find((f) => f.id === active);
  const first = clockOnDay(fills[0]!.time, trade.openedAt, timeZone);
  const last = clockOnDay(
    fills[fills.length - 1]!.time,
    trade.openedAt,
    timeZone,
  );
  const label = `Fills from ${first} to ${last}, ${fills.length} ${plural(fills.length, 'fill')}`;
  const path = fills
    .map((f, i) => `${i === 0 ? 'M' : 'L'}${x(f.time)},${y(f.price)}`)
    .join(' ');

  return (
    <div className="mt-3">
      <div ref={box} className="relative w-full">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="group"
          aria-label={label}
          className="block max-w-full overflow-visible"
        >
          {grid.map((gy) => (
            <line
              key={gy}
              x1={MARGIN.left}
              x2={width - right}
              y1={gy}
              y2={gy}
              className="stroke-line"
              strokeWidth={1}
            />
          ))}
          {lines.map((l, i) => (
            <g key={l.key}>
              <line
                x1={MARGIN.left}
                x2={width - right + 6}
                y1={y(l.value)}
                y2={y(l.value)}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                className={l.line}
              />
              <text
                x={width - right + 12}
                y={labelY[i]! - 3}
                className={`${l.text} text-[11.5px] font-medium`}
              >
                {l.label}
              </text>
              <text
                x={width - right + 12}
                y={labelY[i]! + 11}
                className="fill-text text-[11.5px] font-semibold tabular-nums"
              >
                {price(l.value, tick)}
              </text>
            </g>
          ))}
          {fills.length > 1 ? (
            <path
              d={path}
              fill="none"
              strokeDasharray="1.5 4"
              strokeLinecap="round"
              strokeWidth={1.5}
              className="stroke-faint"
            />
          ) : null}
          {ticks.map((t) => (
            <text
              key={t.at}
              x={t.x}
              y={HEIGHT - 6}
              textAnchor="middle"
              className="fill-faint text-[11.5px] tabular-nums"
            >
              {clock(new Date(t.at).toISOString(), timeZone, showSeconds)}
            </text>
          ))}
          {fills.map((f) => {
            const cx = x(f.time);
            const cy = y(f.price);
            const on = f.id === active;
            const buy = f.side === 'buy';
            return (
              <g
                key={f.id}
                role="img"
                tabIndex={0}
                aria-label={`${where(f)}, ${clock(f.time, timeZone)}`}
                onMouseEnter={() => setActive(f.id)}
                onMouseLeave={() => setActive((a) => (a === f.id ? null : a))}
                onFocus={() => setActive(f.id)}
                onBlur={() => setActive((a) => (a === f.id ? null : a))}
                className="cursor-default outline-none"
              >
                <circle cx={cx} cy={cy} r={16} fill="transparent" />
                {on ? (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={13}
                    fill="none"
                    strokeWidth={2}
                    className="stroke-accent"
                  />
                ) : null}
                <path
                  d={triangle(cx, cy, buy)}
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                  className={
                    buy ? 'fill-text stroke-text' : 'fill-surface-1 stroke-text'
                  }
                />
                {narrow ? null : (
                  <text
                    x={cx}
                    y={buy ? cy + 22 : cy - 12}
                    textAnchor="middle"
                    strokeWidth={4}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    className="fill-text stroke-surface-1 text-[11.5px] font-[550] tabular-nums"
                  >
                    {where(f)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p
        role="status"
        aria-live="off"
        aria-label="Fill readout"
        className="mt-1 min-h-5 text-[12.5px] text-muted"
      >
        {current ? (
          <>
            <span className="font-semibold text-text">{where(current)}</span>
            {', '}
            {clock(current.time, timeZone)}
            {', commission '}
            <FigureText
              f={display.cash(current.commission, false, trade.pnlCurrency)}
            />
            {', fees '}
            <FigureText
              f={display.cash(current.fees, false, trade.pnlCurrency)}
            />
          </>
        ) : (
          <span className="text-faint">
            Hover or focus a marker to read its fill.
          </span>
        )}
      </p>
    </div>
  );
}

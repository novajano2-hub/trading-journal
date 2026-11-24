'use client';

import { useEffect, useRef, useState } from 'react';
import { FigureText } from '@/components/product/figure-text';
import type { Execution, Trade } from '@/domain/types';
import type { Display } from '@/lib/display';
import { plural } from '@/lib/format';
import { price } from '@/lib/format';
import { qty } from './columns';
import { clock, clockOnDay } from './trade-time';

const MARGIN = { top: 14, bottom: 26, left: 10 };
const HEIGHT = 244;
/** The position strip under the chart: its box, and the heights of flat and of the largest position. */
const STRIP = { height: 44, base: 38, top: 8 };
/** The room one right-hand label needs (name over value). */
const LABEL_GAP = 30;

/** The fills in time order. */
export function sortedFills(trade: Trade): Execution[] {
  return [...trade.executions].sort(
    (a, b) =>
      Date.parse(a.time) - Date.parse(b.time) || a.id.localeCompare(b.id),
  );
}

/** The running position after each fill, in the direction of the trade. */
export function positions(trade: Trade, fills: readonly Execution[]): number[] {
  const into = trade.direction === 'long' ? 'buy' : 'sell';
  let held = 0;
  return fills.map((f) => (held += f.side === into ? f.qty : -f.qty));
}

/** Label heights moved apart so no two overprint, each kept as near its line as the others allow. */
function spread(ys: readonly number[], floor: number): number[] {
  const order = ys.map((_, i) => i).sort((a, b) => ys[a]! - ys[b]!);
  const out = [...ys];
  for (let k = 1; k < order.length; k++) {
    const at = order[k]!;
    const above = out[order[k - 1]!]!;
    if (out[at]! - above < LABEL_GAP) out[at] = above + LABEL_GAP;
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const at = order[k]!;
    if (out[at]! > floor) out[at] = floor;
    if (k < order.length - 1) {
      const below = out[order[k + 1]!]!;
      if (below - out[at]! < LABEL_GAP) out[at] = below - LABEL_GAP;
    }
  }
  return out;
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
 * dashed lines at the average entry and exit. A planned target and stop, when
 * set, are dashed lines too, with the zone between each and the average entry
 * shaded; the position held after each fill steps along a strip beneath. Keel
 * has no market data, so
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
    ...(trade.plannedTarget === undefined ? [] : [trade.plannedTarget]),
    ...(trade.plannedStop === undefined ? [] : [trade.plannedStop]),
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
  const targetLabel = narrow ? 'Target' : 'Planned target';
  const stopLabel = narrow ? 'Stop' : 'Planned stop';
  const lines = [
    ...(trade.plannedTarget === undefined
      ? []
      : [
          {
            key: 'target',
            label: targetLabel,
            value: trade.plannedTarget,
            line: 'stroke-gain-fill',
            text: 'fill-gain',
            dash: '4 4',
            width: 1.25,
          },
        ]),
    ...(trade.avgExit === undefined
      ? []
      : [
          {
            key: 'exit',
            label: exitLabel,
            value: trade.avgExit,
            line: 'stroke-muted',
            text: 'fill-muted',
            dash: '2 3',
            width: 1.25,
          },
        ]),
    {
      key: 'entry',
      label: entryLabel,
      value: trade.avgEntry,
      line: 'stroke-accent',
      text: 'fill-accent-ink',
      dash: undefined,
      width: 1.5,
    },
    ...(trade.plannedStop === undefined
      ? []
      : [
          {
            key: 'stop',
            label: stopLabel,
            value: trade.plannedStop,
            line: 'stroke-loss-fill',
            text: 'fill-loss',
            dash: '4 4',
            width: 1.25,
          },
        ]),
  ];
  // Labels at nearly the same height would overprint: spread them apart.
  const labelY = spread(
    lines.map((l) => y(l.value)),
    HEIGHT - MARGIN.bottom - 14,
  );
  const xs = fills.map((f) => x(f.time));
  const zoneFrom = span === 0 ? MARGIN.left : Math.min(...xs);
  const zoneTo = span === 0 ? width - right : Math.max(...xs);
  const zone = (to: number | undefined) =>
    to === undefined
      ? null
      : {
          y: Math.min(y(trade.avgEntry), y(to)),
          h: Math.abs(y(trade.avgEntry) - y(to)),
        };
  const targetZone = zone(trade.plannedTarget);
  const riskZone = zone(trade.plannedStop);
  const held = positions(trade, fills);
  const maxHeld = Math.max(...held.map(Math.abs), 1);
  const level = (n: number) =>
    STRIP.base - (Math.abs(n) / maxHeld) * (STRIP.base - STRIP.top);
  const stepPath = [
    `M${xs[0]!},${STRIP.base}`,
    ...fills.map((_, i) => {
      const next = i + 1 < fills.length ? xs[i + 1]! : undefined;
      return `L${xs[i]!},${level(held[i]!)}${next === undefined ? '' : ` L${next},${level(held[i]!)}`}`;
    }),
  ].join(' ');
  const stripLabel = `Position size: ${held
    .map((n) => (n === 0 ? 'flat' : qty(Math.abs(n))))
    .join(', then ')}`;
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
          {targetZone ? (
            <rect
              data-plan="target-zone"
              x={zoneFrom}
              y={targetZone.y}
              width={Math.max(0, zoneTo - zoneFrom)}
              height={targetZone.h}
              className="fill-gain-soft"
              opacity={0.75}
            />
          ) : null}
          {riskZone ? (
            <rect
              data-plan="risk-zone"
              x={zoneFrom}
              y={riskZone.y}
              width={Math.max(0, zoneTo - zoneFrom)}
              height={riskZone.h}
              className="fill-loss-soft"
              opacity={0.9}
            />
          ) : null}
          {lines.map((l, i) => (
            <g key={l.key}>
              <line
                data-plan={
                  l.key === 'target' || l.key === 'stop'
                    ? `${l.key}-line`
                    : undefined
                }
                x1={MARGIN.left}
                x2={width - right + 6}
                y1={y(l.value)}
                y2={y(l.value)}
                strokeDasharray={l.dash}
                strokeWidth={l.width}
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
            // A label that would run into the right-hand line labels ends at its marker.
            const atEdge = cx + 70 > width - right;
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
                    x={atEdge ? cx + 8 : cx}
                    y={buy ? cy + 22 : cy - 12}
                    textAnchor={atEdge ? 'end' : 'middle'}
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
        {fills.length > 1 ? (
          <svg
            width={width}
            height={STRIP.height}
            viewBox={`0 0 ${width} ${STRIP.height}`}
            role="img"
            aria-label={stripLabel}
            className="mt-1.5 block max-w-full overflow-visible"
          >
            <path
              d={`${stepPath} L${xs[xs.length - 1]!},${STRIP.base} Z`}
              className="fill-accent-soft"
              stroke="none"
            />
            <path
              d={stepPath}
              fill="none"
              strokeWidth={1.5}
              strokeLinejoin="round"
              className="stroke-accent"
            />
            <line
              x1={MARGIN.left}
              x2={width - right}
              y1={STRIP.base}
              y2={STRIP.base}
              className="stroke-line"
              strokeWidth={1}
            />
            <text
              x={width - right + 12}
              y={12}
              className="fill-muted text-[11.5px] font-medium"
            >
              Position
            </text>
            <text
              x={width - right + 12}
              y={26}
              className="fill-text text-[11.5px] font-semibold tabular-nums"
            >
              max {qty(maxHeld)}
            </text>
            {held.slice(0, -1).map((n, i) =>
              n === 0 ? null : (
                <text
                  key={fills[i]!.id}
                  data-qty=""
                  x={(xs[i]! + xs[i + 1]!) / 2}
                  y={level(n) + 13}
                  textAnchor="middle"
                  className="fill-accent-ink text-[11px] font-semibold tabular-nums"
                >
                  {qty(Math.abs(n))}
                </text>
              ),
            )}
          </svg>
        ) : null}
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

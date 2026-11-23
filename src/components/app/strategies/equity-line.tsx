'use client';

import { useState } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { Sparkline } from '@/components/product/sparkline';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { onTradingDate } from '@/lib/time-format';
import type { StrategyFigures } from './use-strategy-figures';

/** The Sparkline's drawing box, as `Sparkline` lays it out (viewBox units). */
const H = 80;
const TOP = 7;
const BOTTOM = 74;

const day = (date: string): string =>
  onTradingDate(date, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A strategy's equity line with a text alternative (its range, how many
 * closed trades and where it ends) and a point readout. Hover moves the
 * readout along the line; focus puts it on the last point and Left, Right,
 * Home and End step through the others. Amounts go through the display unit,
 * so Privacy hides them here too.
 */
export function EquityLine({
  f,
  className = '',
}: {
  f: StrategyFigures;
  className?: string;
}): React.JSX.Element {
  const display = useDisplay();
  const [active, setActive] = useState<number | null>(null);
  const { equity, equityDates: dates, closedIds } = f;
  const last = equity.length - 1;

  const at = (i: number) =>
    display.figure(display.ofTrades(closedIds.slice(0, i), equity[i]!));
  const end = at(last);
  const first = day(dates[0]!);
  const final = day(dates[dates.length - 1]!);
  const range = first === final ? first : `${first} to ${final}`;
  const label = `Equity of ${f.strategy.name}, ${range}, ${closedIds.length} closed ${plural(closedIds.length, 'trade')}, ends at ${end.label}`;

  const min = Math.min(...equity);
  const span = Math.max(...equity) - min;
  const place = (i: number) => ({
    left: `${(i / last) * 100}%`,
    top: `${((span === 0 ? (TOP + BOTTOM) / 2 : BOTTOM - ((equity[i]! - min) / span) * (BOTTOM - TOP)) / H) * 100}%`,
  });

  const key = (e: React.KeyboardEvent) => {
    const to: Record<string, number> = {
      ArrowLeft: Math.max(0, (active ?? last) - 1),
      ArrowRight: Math.min(last, (active ?? last) + 1),
      Home: 0,
      End: last,
    };
    const next = to[e.key];
    if (next === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    setActive(next);
  };

  return (
    <div className={className}>
      <div
        data-equity-points=""
        tabIndex={0}
        role="group"
        aria-label={`Points of the equity line of ${f.strategy.name}`}
        className="relative rounded-chip outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
        onFocus={() => setActive((a) => a ?? last)}
        onBlur={() => setActive(null)}
        onKeyDown={key}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          if (box.width > 0)
            setActive(
              Math.round(
                Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) *
                  last,
              ),
            );
        }}
        onPointerLeave={() => setActive(null)}
      >
        <Sparkline series={equity} label={label} />
        {active !== null ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-px bg-line-2"
              style={{ left: place(active).left }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface-1"
              style={place(active)}
            />
          </>
        ) : null}
      </div>
      <div
        role="status"
        aria-label="Equity readout"
        className="mt-1.5 min-h-[18px] text-[12.5px] text-faint tabular-nums"
      >
        {active === null ? null : active === 0 ? (
          'Before the first trade'
        ) : (
          <>
            <span className="text-muted">{day(dates[active - 1]!)}</span>, after
            trade {active} of {closedIds.length}:{' '}
            <b className="font-semibold text-text">
              <FigureText f={at(active)} />
            </b>
          </>
        )}
      </div>
    </div>
  );
}

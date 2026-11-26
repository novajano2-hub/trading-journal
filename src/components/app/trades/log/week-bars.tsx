'use client';

import { useId, useState } from 'react';
import type { WeekGroup } from '@/data/day-log';
import { isClosed } from '@/domain/trade-status';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { usePhone } from '@/lib/use-phone';
import { dayLabel, onTradingDate, weekdayOf } from '@/lib/time-format';
import { signTone } from '../../dashboard/shared';
import { weekLabel } from '@/lib/day-label';

/** The plot's height in px, and the room a value label takes above or below a bar. */
const PLOT = 132;
const LABEL = 20;
const EDGE = 4;

/**
 * The week's daily net as bars, Sun to Sat (or from the week's first day), on
 * a dollar axis with a zero baseline: gains rise and losses hang, with the
 * amount at the bar's end and the weekday under it. Every amount goes through
 * the display unit, so Privacy hides it in the labels, the readout and the
 * image's name. The plot is one `role="img"` naming every day; hover or focus
 * (arrow keys move between days with trades) shows a readout. Bar height
 * reads the dollar net; the unit only changes the words. A day without
 * closed trades has no bar.
 */
export function WeekBars({ week }: { week: WeekGroup }): React.JSX.Element {
  const display = useDisplay();
  const phone = usePhone();
  const uid = useId();
  const [at, setAt] = useState<{ i: number; by: 'pointer' | 'focus' } | null>(
    null,
  );

  const dates = week.days.map((_, i) =>
    new Date(Date.parse(`${week.start}T00:00:00Z`) + i * 86_400_000)
      .toISOString()
      .slice(0, 10),
  );
  const nets = week.dailyNet;
  const figure = (i: number) => {
    const day = week.days[i];
    const net = nets[i];
    if (!day || net === null || net === undefined) return null;
    return display.ofTrades(
      day.trades.filter(isClosed).map((t) => t.id),
      net,
    );
  };
  const withTrades = week.days.flatMap((d, i) =>
    d && d.trades.length > 0 ? [i] : [],
  );

  const maxPos = Math.max(0, ...nets.map((n) => n ?? 0));
  const maxNeg = Math.max(0, ...nets.map((n) => -(n ?? 0)));
  const span = maxPos + maxNeg;
  const unit = span === 0 ? 0 : PLOT / span;
  const top = maxPos > 0 || span === 0 ? LABEL : EDGE;
  const bottom = maxNeg > 0 ? LABEL : EDGE;
  const base = top + maxPos * unit;
  const height = top + PLOT + bottom;
  const xOf = (i: number) => ((i + 0.5) / 7) * 100;

  const words = week.days.map((d, i) => {
    const f = figure(i);
    return `${weekdayOf(dates[i]!, 'short')} ${f ? display.figure(f).label : 'none'}`;
  });
  const span_ = weekLabel(week.start, week.end);
  const aria = `Net P&L by day, ${span_}: ${words.join(', ')}`;

  const keys = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const now = at ? withTrades.indexOf(at.i) : -1;
    const next = Math.min(
      withTrades.length - 1,
      Math.max(0, (now === -1 ? 0 : now) + (e.key === 'ArrowLeft' ? -1 : 1)),
    );
    setAt({ i: withTrades[next]!, by: 'focus' });
  };

  const hit = at ? week.days[at.i] : undefined;
  const hitFigure = at ? figure(at.i) : null;
  const readout =
    at && hit ? (
      <div
        role={at.by === 'focus' ? 'status' : undefined}
        aria-hidden={at.by === 'pointer' ? true : undefined}
        style={{ left: `${Math.min(85, Math.max(15, xOf(at.i)))}%`, top: 0 }}
        className="pointer-events-none absolute z-10 w-max max-w-[min(320px,80vw)] -translate-x-1/2 rounded-control border border-line bg-surface-1 px-3 py-2 text-[12.5px] leading-[1.4] text-muted shadow-[var(--shadow)]"
      >
        <b className="font-semibold text-text">{dayLabel(dates[at.i]!)}</b>{' '}
        <span className={nets[at.i] != null ? signTone(nets[at.i]!) : ''}>
          {hitFigure ? display.figure(hitFigure).text : 'No closed trades'}
        </span>
        , {hit.trades.length} {plural(hit.trades.length, 'trade')}
      </div>
    ) : null;

  return (
    <div className="my-4">
      {/* The readout is the plot's sibling, not inside the image, so it is announced. */}
      <div className="relative">
        <div
          role="img"
          tabIndex={0}
          aria-label={aria}
          onFocus={() =>
            setAt(
              (a) =>
                a ??
                (withTrades.length ? { i: withTrades[0]!, by: 'focus' } : null),
            )
          }
          onBlur={() => setAt(null)}
          onKeyDown={keys}
          onPointerLeave={() => setAt((a) => (a?.by === 'pointer' ? null : a))}
          style={{ height }}
          className="relative rounded-control outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span
            aria-hidden="true"
            style={{ top: base }}
            className="absolute inset-x-0 h-px bg-line-2"
          />
          {week.days.map((_, i) => {
            const n = nets[i];
            const f = figure(i);
            if (n === null || n === undefined || !f) return null;
            const h = n === 0 ? 0 : Math.max(2, Math.abs(n) * unit);
            const label = display.figure(f, true, undefined, phone).text;
            return (
              <span key={`${uid}${i}`} aria-hidden="true">
                {n === 0 ? null : (
                  <span
                    style={{
                      left: `${xOf(i)}%`,
                      top: n > 0 ? base - h : base,
                      height: h,
                    }}
                    className={`absolute w-[min(44px,9%)] -translate-x-1/2 ${n > 0 ? 'rounded-t-[6px] bg-gain-fill' : 'rounded-b-[6px] bg-loss-fill'}`}
                  />
                )}
                <span
                  style={{
                    left: `${xOf(i)}%`,
                    top: n >= 0 ? base - h - 18 : base + h + 2,
                  }}
                  className={`absolute -translate-x-1/2 text-[10.5px] font-medium whitespace-nowrap tabular-nums sm:text-xs ${signTone(n)}`}
                >
                  {label}
                </span>
              </span>
            );
          })}
          {week.days.map((d, i) =>
            d && d.trades.length > 0 ? (
              <span
                key={`${uid}hit${i}`}
                aria-hidden="true"
                onPointerEnter={() => setAt({ i, by: 'pointer' })}
                style={{ left: `${(i / 7) * 100}%`, width: `${100 / 7}%` }}
                className="absolute inset-y-0"
              />
            ) : null,
          )}
        </div>
        {readout}
      </div>
      <div
        aria-hidden="true"
        className="mt-1.5 grid grid-cols-7 text-center text-[11px] leading-4 text-faint sm:text-xs"
      >
        {dates.map((date) => (
          <span key={date} className="whitespace-nowrap">
            {`${weekdayOf(date, 'short')} ${onTradingDate(date, { day: 'numeric' })}`}
          </span>
        ))}
      </div>
    </div>
  );
}

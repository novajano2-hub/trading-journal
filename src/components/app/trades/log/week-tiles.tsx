'use client';

import { Minus, TrendDown, TrendUp } from '@phosphor-icons/react/dist/ssr';
import { useId } from 'react';
import type { DayGroup, WeekGroup } from '@/data/day-log';
import { isClosed } from '@/domain/trade-status';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { usePhone } from '@/lib/use-phone';
import { onTradingDate, weekdayOf } from '@/lib/time-format';
import { tileLabel, weekLabel } from '@/lib/day-label';

export type Trend = 'up' | 'down' | 'flat' | 'open' | 'other';

/**
 * How a day with trades reads on a tile. Up marks a positive day and down a
 * negative one (the record, inferred). Keel's call (TradeZella unknown): a
 * zero-net day is "flat", read as the Day view reads a zero figure, uncoloured
 * and with a dash for a glyph; a day none of whose trades closed ("open") and a
 * day with only other-currency trades ("other") carry no net, as their day
 * cards read None and the other-currency line.
 */
export function trendOf(day: DayGroup): Trend {
  if (day.trades.length === 0) return 'other';
  const net = day.stats.net;
  return net === null ? 'open' : net > 0 ? 'up' : net < 0 ? 'down' : 'flat';
}

const TINT: Record<Trend, string> = {
  up: 'bg-gain-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--gain-fill)_28%,transparent)]',
  down: 'bg-loss-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--loss-fill)_26%,transparent)]',
  flat: 'bg-sunken shadow-[inset_0_0_0_1px_var(--line)]',
  open: 'bg-sunken shadow-[inset_0_0_0_1px_var(--line)]',
  other: 'bg-sunken shadow-[inset_0_0_0_1px_var(--line)]',
};

const TONE: Record<Trend, string> = {
  up: 'text-gain',
  down: 'text-loss',
  flat: 'text-text',
  open: 'text-faint',
  other: 'text-faint',
};

const FOCUS =
  'outline-offset-0 focus-visible:outline-2 focus-visible:outline-accent';

/** What a tile says in words: the day, its net, its count. */
export function useTileFigures() {
  const display = useDisplay();
  return (day: DayGroup) => {
    const trend = trendOf(day);
    const count = day.trades.length;
    const closedIds = day.trades.filter(isClosed).map((t) => t.id);
    const figure =
      day.stats.net === null
        ? null
        : display.ofTrades(closedIds, day.stats.net);
    return {
      trend,
      count,
      full: figure ? display.figure(figure) : null,
      compact: figure ? display.figure(figure, true, undefined, true) : null,
    };
  };
}

/**
 * The week's seven tiles, in week order. A day with trades is a button that
 * opens its card body; a day without is grey and blank (its weekday and date,
 * nothing more) and not a button. Below `sm` they are one row of seven narrow
 * tiles: the weekday initial, the day number and a compact net, with the count
 * in the accessible name.
 */
export function WeekTiles({
  week,
  onOpen,
}: {
  week: WeekGroup;
  onOpen(date: string, opener: HTMLElement): void;
}): React.JSX.Element {
  const phone = usePhone();
  const figures = useTileFigures();
  const id = useId();
  const dates = week.days.map((d, i) => {
    const base = Date.parse(`${week.start}T00:00:00Z`) + i * 86_400_000;
    return new Date(base).toISOString().slice(0, 10);
  });
  return (
    <ul
      aria-label={`Days of ${weekLabel(week.start, week.end)}`}
      className={`m-0 mt-3 grid list-none grid-cols-7 p-0 ${phone ? 'gap-1' : 'gap-2'}`}
    >
      {week.days.map((day, i) => {
        const date = dates[i]!;
        const dayNumber = onTradingDate(date, { day: 'numeric' });
        // K46, Keel's call (TradeZella unknown): a tile without trades is not a button.
        if (
          !day ||
          (day.trades.length === 0 && day.otherCurrency.length === 0)
        ) {
          return (
            <li
              key={`${id}${date}`}
              className={
                phone
                  ? 'flex flex-col items-center rounded-[8px] py-1.5 text-[11px] text-faint shadow-[inset_0_0_0_1px_var(--line)]'
                  : 'flex min-h-[76px] items-start rounded-[10px] px-2.5 pt-[9px] text-[12.5px] font-medium text-faint shadow-[inset_0_0_0_1px_var(--line)]'
              }
            >
              {phone ? (
                <>
                  <span>{weekdayOf(date, 'short').slice(0, 1)}</span>
                  <b className="text-[13px] font-medium">{dayNumber}</b>
                  <em className="min-h-3.5" />
                </>
              ) : (
                <span>{`${weekdayOf(date, 'short')} ${dayNumber}`}</span>
              )}
            </li>
          );
        }
        const f = figures(day);
        const other = day.otherCurrency.length;
        const nameCount =
          f.count === 0
            ? `${other} ${plural(other, 'trade')} in other currencies`
            : `${f.count} ${plural(f.count, 'trade')}`;
        const name = `${tileLabel(date)}, ${
          f.trend === 'other'
            ? nameCount
            : f.full
              ? `${f.full.label}, ${nameCount}`
              : `no closed trades, ${nameCount}`
        }`;
        const Glyph =
          f.trend === 'up' ? TrendUp : f.trend === 'down' ? TrendDown : Minus;
        const showGlyph =
          f.trend === 'up' || f.trend === 'down' || f.trend === 'flat';
        return (
          <li key={`${id}${date}`} className="min-w-0">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={name}
              data-trend={f.trend}
              onClick={(e) => onOpen(date, e.currentTarget)}
              className={`w-full cursor-pointer text-left transition-[transform,box-shadow] duration-200 ease-(--ease-glide) hover:-translate-y-px hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_40%,transparent),var(--shadow-chip)] pointer-coarse:min-h-11 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${FOCUS} ${TINT[f.trend]} ${
                phone
                  ? 'flex flex-col items-center gap-px rounded-[8px] py-1.5 text-[11px] text-muted'
                  : 'flex min-h-[76px] flex-col items-start gap-0.5 rounded-[10px] px-2.5 pt-[9px] pb-2'
              }`}
            >
              {phone ? (
                <>
                  <span aria-hidden="true">
                    {weekdayOf(date, 'short').slice(0, 1)}
                  </span>
                  <b
                    aria-hidden="true"
                    className="text-[13px] font-semibold text-text"
                  >
                    {dayNumber}
                  </b>
                  <em
                    aria-hidden="true"
                    className={`min-h-3.5 text-[11px] font-semibold tabular-nums not-italic ${TONE[f.trend]}`}
                  >
                    {f.compact ? f.compact.text : ''}
                  </em>
                </>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="flex w-full items-center justify-between text-[12.5px] font-semibold text-text"
                  >
                    <span>{`${weekdayOf(date, 'short')} ${dayNumber}`}</span>
                    {showGlyph ? (
                      <Glyph size={15} className={TONE[f.trend]} />
                    ) : null}
                  </span>
                  <b
                    aria-hidden="true"
                    className={`mt-1 text-sm font-semibold whitespace-nowrap tabular-nums ${TONE[f.trend]}`}
                  >
                    {f.trend === 'other'
                      ? 'Other currencies'
                      : f.full
                        ? f.full.text
                        : 'None'}
                  </b>
                  <span aria-hidden="true" className="text-xs text-muted">
                    {f.trend === 'other'
                      ? `${other} ${plural(other, 'trade')}`
                      : `${f.count} ${plural(f.count, 'trade')}`}
                  </span>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

'use client';

import { NotePencil } from '@phosphor-icons/react/dist/ssr';
import { useRef, useState } from 'react';
import { FigureText } from '@/components/product/figure-text';
import {
  addDays,
  weekIndex,
  type CalendarDay,
  type CalendarWeek,
  type UnitSums,
} from '@/data/calendar';
import type { CalendarStat, Cents, WeekStart } from '@/domain/types';
import { rotateFromWeekStart } from '@/domain/week';
import { formatUnitValue } from '@/lib/display';
import { formatPct, plural } from '@/lib/format';
import { onTradingDate, weekdayOf } from '@/lib/time-format';

/** A figure as text and label; the view builds it from the display unit. */
export type FormatMoney = (
  money: Cents,
  r?: number | null,
  /** A short figure for the phone's small cell: `+1.1k`. */
  compact?: boolean,
  /** The ticks, pips and points of the day, week or month, so it reads in those display units. */
  units?: UnitSums,
) => { text: string; label: string };

/** "Thu 19 Nov". */
export const dayLabel = (date: string): string =>
  `${weekdayOf(date, 'short')} ${onTradingDate(date, { day: 'numeric', month: 'short' })}`;

/** A day's fill and hairline by tone; the bar under its figures. */
export const TONE_BOX: Record<CalendarDay['tone'], string> = {
  gain: 'bg-gain-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--gain-fill)_28%,transparent)]',
  loss: 'bg-loss-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--loss-fill)_26%,transparent)]',
  flat: 'bg-accent-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)]',
  none: 'bg-surface-1 shadow-[inset_0_0_0_1px_var(--line)]',
};
export const TONE_BAR: Record<CalendarDay['tone'], string> = {
  gain: 'bg-gain-fill',
  loss: 'bg-loss-fill',
  flat: 'bg-accent/55',
  none: 'bg-transparent',
};
export const TONE_INK: Record<CalendarDay['tone'], string> = {
  gain: 'text-gain',
  loss: 'text-loss',
  flat: 'text-text',
  none: 'text-text',
};

export const STAT_LABELS: Record<CalendarStat, string> = {
  net: 'Net P&L',
  trades: 'Trades',
  winRate: 'Win rate',
  rating: 'Day rating',
  r: 'R',
  fees: 'Fees',
  ticks: 'Ticks',
  pips: 'Pips',
  points: 'Points',
};

/** One decimal: 4.3. */
export const ratingText = (rating: number): string => rating.toFixed(1);

/** A line under the lead reads short in a narrow cell and in full once the cell is wide enough to hold it. */
const FULL_FROM_HIDE = '@[1000px]/cal:hidden';
const FULL_FROM_SHOW = 'hidden @[1000px]/cal:inline';

/** The longest lead figure that fits the cell as written ('+$951.10'); a longer one reads short until the cell is wide. */
const LEAD_FITS = 8;

interface Line {
  key: CalendarStat;
  node: React.ReactNode;
  /** Money and R take the day's tone; counts stay quiet. */
  toned: boolean;
  /** The short form (`+1.1k`, `+64t`), for the phone's small cell and for a line under the lead in a narrow cell. */
  compact?: string;
  /** The full value as plain text, to tell whether it fits a narrow cell. */
  text: string;
  /** The full value in words: the cell's tooltip and its accessible label. */
  label: string;
}

function linesOf(
  day: CalendarDay,
  stats: readonly CalendarStat[],
  fmt: FormatMoney,
  currency: string,
): Line[] {
  return stats.flatMap<Line>((key) => {
    switch (key) {
      case 'net': {
        const full = fmt(day.net, day.r, false, day);
        return [
          {
            key,
            toned: true,
            node: <FigureText f={full} />,
            text: full.text,
            compact: fmt(day.net, day.r, true, day).text,
            label: full.label,
          },
        ];
      }
      case 'trades': {
        const text = `${day.trades} ${plural(day.trades, 'trade')}`;
        return [{ key, toned: false, node: text, text, label: text }];
      }
      case 'winRate': {
        const decided = day.wins + day.losses;
        if (decided === 0) return [];
        const rate = formatPct(day.wins / decided);
        return [
          {
            key,
            toned: false,
            node: `${rate} win rate`,
            text: `${rate} win rate`,
            compact: `${rate} win`,
            label: `${rate} win rate`,
          },
        ];
      }
      case 'rating': {
        // Nothing rated, nothing shown: the cell omits the line.
        if (day.rating === null) return [];
        const text = `${ratingText(day.rating)}★`;
        return [
          {
            key,
            toned: false,
            node: text,
            text,
            label: `Day rating ${ratingText(day.rating)} of 5`,
          },
        ];
      }
      case 'r': {
        if (day.r === null) return [];
        const full = formatUnitValue('r', day.r, { currency, signed: true });
        return [
          {
            key,
            toned: true,
            node: full,
            text: full,
            compact: formatUnitValue('r', day.r, {
              currency,
              signed: true,
              compact: true,
            }),
            label: full,
          },
        ];
      }
      case 'ticks':
      case 'pips':
      case 'points': {
        const value = day[key];
        // A day without an eligible trade says None, never a dash.
        if (value === null)
          return [
            {
              key,
              toned: false,
              node: 'None',
              text: 'None',
              compact: 'None',
              label: `${STAT_LABELS[key]}: None`,
            },
          ];
        const full = formatUnitValue(key, value, { currency, signed: true });
        return [
          {
            key,
            toned: true,
            node: full,
            text: full,
            compact: formatUnitValue(key, value, {
              currency,
              signed: true,
              compact: true,
            }),
            label: full,
          },
        ];
      }
      case 'fees': {
        const full = fmt(-day.fees);
        return [
          {
            key,
            toned: false,
            node: (
              <>
                <FigureText f={full} /> fees
              </>
            ),
            text: `${full.text} fees`,
            compact: `${fmt(-day.fees, null, true).text} fees`,
            label: `${full.label} fees`,
          },
        ];
      }
    }
  });
}

/** What a screen reader gets for a day: the date, its net, its trades, its note. */
function dayName(
  day: CalendarDay,
  fmt: FormatMoney,
  lines: readonly Line[],
): string {
  const when = dayLabel(day.date);
  if (day.trades === 0)
    return `${when}, no trades${day.hasNote ? ', daily note' : ''}`;
  // The net and the trades first, then every other stat the cell shows, in full.
  const more = lines
    .filter((l) => l.key !== 'net' && l.key !== 'trades')
    .map((l) => `, ${l.label}`)
    .join('');
  return `${when}, ${fmt(day.net, day.r, false, day).label}, ${day.trades} ${plural(day.trades, 'trade')}${more}${day.hasNote ? ', daily note' : ''}`;
}

function Cell({
  day,
  stats,
  fmt,
  currency,
  today,
  selected,
  tabbable,
  barWidth,
  onSelect,
  onFocusDay,
}: {
  day: CalendarDay;
  stats: readonly CalendarStat[];
  fmt: FormatMoney;
  currency: string;
  today: string;
  selected: boolean;
  /** The one day in the tab order (roving tabindex). */
  tabbable: boolean;
  barWidth: number;
  onSelect(date: string): void;
  onFocusDay(date: string): void;
}): React.JSX.Element {
  const isToday = day.date === today;
  const future = day.date > today;
  const lines = day.trades > 0 ? linesOf(day, stats, fmt, currency) : [];
  const [head, ...rest] = lines;
  return (
    <div role="gridcell" aria-selected={selected} className="flex min-w-0">
      <button
        type="button"
        data-date={day.date}
        tabIndex={tabbable ? 0 : -1}
        aria-label={dayName(day, fmt, lines)}
        aria-current={isToday ? 'date' : undefined}
        onClick={() => onSelect(day.date)}
        onFocus={() => onFocusDay(day.date)}
        className={`group relative flex min-h-[58px] w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-[10px] p-1.5 text-left outline-offset-2 transition-[box-shadow,transform] duration-200 ease-(--ease-glide) hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 @[600px]/cal:min-h-[92px] @[600px]/cal:px-2 @[600px]/cal:py-2 @[700px]/cal:px-2.5 ${TONE_BOX[day.tone]} ${
          selected
            ? 'shadow-[inset_0_0_0_2px_var(--accent),var(--shadow-chip)]'
            : isToday
              ? 'shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--accent)_45%,transparent)]'
              : ''
        }`}
      >
        <span
          className={`text-[12.5px] font-semibold ${isToday ? 'text-accent-ink' : future && day.trades === 0 ? 'font-medium text-faint' : 'text-muted'}`}
        >
          {Number(day.date.slice(8))}
          {day.tone === 'flat' ? (
            <em className="ml-1 hidden text-[11.5px] font-semibold text-accent-ink not-italic @[600px]/cal:inline">
              Flat
            </em>
          ) : null}
        </span>
        {day.hasNote ? (
          <NotePencil
            aria-hidden="true"
            size={15}
            className="absolute top-1.5 right-1 hidden text-muted @[600px]/cal:top-1.5 @[600px]/cal:right-2 @[600px]/cal:block"
          />
        ) : null}
        {head ? (
          <span className="mt-auto hidden min-w-0 @[600px]/cal:block">
            <span
              title={head.label}
              className={`block text-[12px] leading-tight font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums @[700px]/cal:text-[13.5px] @[780px]/cal:text-[14.5px] ${head.toned ? TONE_INK[day.tone] : 'text-text'}`}
            >
              {head.compact !== undefined && head.text.length > LEAD_FITS ? (
                <>
                  <span aria-hidden="true" className={FULL_FROM_HIDE}>
                    {head.compact}
                  </span>
                  <span className={FULL_FROM_SHOW}>{head.node}</span>
                </>
              ) : (
                head.node
              )}
            </span>
            {rest.map((l) => (
              <span
                key={l.key}
                title={l.label}
                className="mt-px block text-[11.5px] whitespace-nowrap text-muted tabular-nums @[700px]/cal:text-[12px]"
              >
                {l.compact === undefined ? (
                  l.node
                ) : (
                  <>
                    <span aria-hidden="true" className={FULL_FROM_HIDE}>
                      {l.compact}
                    </span>
                    <span className={FULL_FROM_SHOW}>{l.node}</span>
                  </>
                )}
              </span>
            ))}
            <span aria-hidden="true" className="block h-[11px]" />
          </span>
        ) : isToday ? (
          <span className="mt-auto hidden text-[12px] font-semibold text-accent-ink @[600px]/cal:block">
            Today
          </span>
        ) : null}
        {day.trades > 0 ? (
          <span
            data-testid="day-compact"
            aria-hidden="true"
            className={`mt-auto block pb-[7px] text-[11.5px] leading-tight font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums @[600px]/cal:hidden ${TONE_INK[day.tone]}`}
          >
            {head?.compact ?? fmt(day.net, day.r, true, day).text}
          </span>
        ) : null}
        {day.trades > 0 ? (
          <i
            aria-hidden="true"
            style={{ width: `${barWidth}%` }}
            className={`absolute bottom-1.5 left-1.5 h-[3px] max-w-[calc(100%-12px)] rounded-sm @[600px]/cal:bottom-[7px] @[600px]/cal:left-2.5 @[600px]/cal:max-w-[calc(100%-20px)] ${TONE_BAR[day.tone]}`}
          />
        ) : null}
      </button>
    </div>
  );
}

/** A date of the next or previous month. */
function MutedCell({ number }: { number: number }): React.JSX.Element {
  return (
    <div
      role="gridcell"
      aria-disabled="true"
      aria-hidden="true"
      className="flex min-h-[58px] min-w-0 rounded-[10px] p-1.5 text-[12.5px] font-medium text-faint/60 @[600px]/cal:min-h-[92px] @[600px]/cal:px-2.5 @[600px]/cal:py-2"
    >
      {number}
    </div>
  );
}

/** A week's total on the sunken column. */
function WeekTotal({
  week,
  index,
  fmt,
}: {
  week: CalendarWeek;
  index: number;
  fmt: FormatMoney;
}): React.JSX.Element {
  const none = week.tradingDays === 0;
  const tone =
    week.net < 0 ? 'text-loss' : week.net > 0 ? 'text-gain' : 'text-text';
  return (
    <div
      role="gridcell"
      data-testid="week-total"
      className="hidden min-h-[92px] min-w-0 flex-col rounded-[10px] bg-sunken px-3 py-2 @[600px]/cal:flex"
    >
      <span className="text-[12px] font-medium text-faint">
        Week {index + 1}
      </span>
      <b
        className={`mt-auto text-[14.5px] font-semibold tracking-[-0.02em] tabular-nums xl:text-[15px] ${none ? 'text-faint' : tone}`}
      >
        <FigureText f={fmt(week.net, week.r, false, week)} />
      </b>
      <small className="text-[12px] text-muted">
        {none ? (
          <span className="block whitespace-nowrap">No trades</span>
        ) : (
          <>
            <span className="block whitespace-nowrap">
              {week.tradingDays} {plural(week.tradingDays, 'day')}
            </span>
            <span className="sr-only">, </span>
            <span className="block whitespace-nowrap">
              {week.trades} {plural(week.trades, 'trade')}
            </span>
          </>
        )}
      </small>
    </div>
  );
}

const SUNDAY_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** The column headers, from the day the week starts on. */
const weekdayHeaders = (weekStart: WeekStart) =>
  rotateFromWeekStart(SUNDAY_FIRST, weekStart);

/**
 * The month as a grid of week rows, from the preferred first day, with a week column. One day is
 * in the tab order; the arrows move by a day or a week, Home and End to the
 * row's ends, and Enter or Space picks (the day is a button). Below `sm` the
 * cells shrink to a day number over a coloured box and the weeks list under
 * the grid: seven columns cannot hold a figure at 390px. The page's date range
 * does not touch the month.
 */
export function MonthGrid({
  label,
  weeks,
  stats,
  fmt,
  currency,
  today,
  selected,
  onSelect,
  weekStart = 'sunday',
}: {
  label: string;
  weeks: readonly CalendarWeek[];
  stats: readonly CalendarStat[];
  fmt: FormatMoney;
  currency: string;
  today: string;
  selected: string | undefined;
  onSelect(date: string): void;
  weekStart?: WeekStart;
}): React.JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string>();
  const max = Math.max(
    0,
    ...weeks.flatMap((w) => w.days.map((d) => Math.abs(d?.net ?? 0))),
  );
  const width = (d: CalendarDay) =>
    max === 0 ? 0 : Math.max(6, (Math.abs(d.net) / max) * 100);
  const days = new Map(
    weeks
      .flatMap((w) => w.days)
      .flatMap((d) => (d ? [[d.date, d] as const] : [])),
  );
  const pickable = (date: string) => days.has(date);
  const tabDate =
    [active, selected, today].find((d) => d !== undefined && pickable(d)) ??
    [...days.keys()].find(pickable);

  /** The next pickable date from `from` stepping `by` days, within the month. */
  const step = (from: string, by: number): string | undefined => {
    for (let d = addDays(from, by); days.has(d); d = addDays(d, by))
      if (pickable(d)) return d;
    return undefined;
  };
  const target = (from: string, key: string): string | undefined => {
    const first = addDays(from, -weekIndex(from, weekStart));
    const row = Array.from({ length: 7 }, (_, i) => addDays(first, i));
    switch (key) {
      case 'ArrowRight':
        return step(from, 1);
      case 'ArrowLeft':
        return step(from, -1);
      case 'ArrowDown':
        return step(from, 7);
      case 'ArrowUp':
        return step(from, -7);
      case 'Home':
        return row.find(pickable);
      case 'End':
        return row.findLast(pickable);
    }
    return undefined;
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Alt+Left is the browser's back, Ctrl/Cmd+Home the page's: not the grid's.
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const from = (e.target as HTMLElement).getAttribute('data-date');
    if (from === null) return;
    const to = target(from, e.key);
    if (to === undefined) return;
    e.preventDefault();
    setActive(to);
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${to}"]`)?.focus();
  };
  return (
    <>
      <div
        ref={gridRef}
        role="grid"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="mt-3 grid grid-cols-7 gap-1 @[600px]/cal:grid-cols-[repeat(7,minmax(0,1fr))_minmax(76px,112px)] @[700px]/cal:gap-1.5"
      >
        <div role="row" className="contents">
          {weekdayHeaders(weekStart).map((w) => (
            <span
              key={w}
              role="columnheader"
              className="py-1 pl-1 text-[12px] text-faint @[600px]/cal:pl-1"
            >
              {w}
            </span>
          ))}
          <span
            role="columnheader"
            className="hidden py-1 pl-3 text-[12px] text-faint @[600px]/cal:block"
          >
            Week
          </span>
        </div>
        {weeks.map((week, i) => (
          <div
            key={week.start}
            role="row"
            data-testid="week-row"
            className="contents"
          >
            {week.days.map((day, di) =>
              day === null ? (
                <MutedCell
                  key={`${week.start}-${di}`}
                  number={Number(addDays(week.start, di).slice(8))}
                />
              ) : (
                <Cell
                  key={day.date}
                  day={day}
                  stats={stats}
                  fmt={fmt}
                  currency={currency}
                  today={today}
                  selected={day.date === selected}
                  tabbable={day.date === tabDate}
                  barWidth={width(day)}
                  onSelect={onSelect}
                  onFocusDay={setActive}
                />
              ),
            )}
            <WeekTotal week={week} index={i} fmt={fmt} />
          </div>
        ))}
      </div>
      <ul
        aria-label="Weeks"
        className="mt-3 divide-y divide-line rounded-[10px] bg-sunken @[600px]/cal:hidden"
      >
        {weeks.map((week, i) => (
          <li
            key={week.start}
            className="flex items-baseline justify-between gap-3 px-3 py-2 text-[13px]"
          >
            <span className="text-muted">
              Week {i + 1}
              <span className="ml-2 text-faint">
                {week.tradingDays === 0
                  ? 'No trades'
                  : `${week.tradingDays} ${plural(week.tradingDays, 'day')}`}
              </span>
            </span>
            <b
              className={`font-semibold tabular-nums ${week.net < 0 ? 'text-loss' : week.net > 0 ? 'text-gain' : 'text-faint'}`}
            >
              <FigureText f={fmt(week.net, week.r, false, week)} />
            </b>
          </li>
        ))}
      </ul>
    </>
  );
}

'use client';

import { NotePencil } from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import type { CalendarDay, CalendarWeek } from '@/data/calendar';
import type { CalendarStat, Cents } from '@/domain/types';
import { formatUnitValue } from '@/lib/display';
import { formatPct, plural } from '@/lib/format';
import { onTradingDate, weekdayOf } from '@/lib/time-format';

/** A figure as text and label; the view builds it from the display unit. */
export type FormatMoney = (
  money: Cents,
  r?: number | null,
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
  r: 'R',
  fees: 'Fees',
};

interface Line {
  key: CalendarStat;
  node: React.ReactNode;
  /** Money and R take the day's tone; counts stay quiet. */
  toned: boolean;
}

function linesOf(
  day: CalendarDay,
  stats: readonly CalendarStat[],
  fmt: FormatMoney,
): Line[] {
  return stats.flatMap<Line>((key) => {
    switch (key) {
      case 'net':
        return [
          {
            key,
            toned: true,
            node: <FigureText f={fmt(day.net, day.r)} />,
          },
        ];
      case 'trades':
        return [
          {
            key,
            toned: false,
            node: `${day.trades} ${plural(day.trades, 'trade')}`,
          },
        ];
      case 'winRate': {
        const decided = day.wins + day.losses;
        return decided === 0
          ? []
          : [
              {
                key,
                toned: false,
                node: `${formatPct(day.wins / decided)} win rate`,
              },
            ];
      }
      case 'r':
        return day.r === null
          ? []
          : [
              {
                key,
                toned: true,
                node: formatUnitValue('r', day.r, {
                  currency: 'USD',
                  signed: true,
                }),
              },
            ];
      case 'fees':
        return [
          {
            key,
            toned: false,
            node: (
              <>
                <FigureText f={fmt(-day.fees)} /> fees
              </>
            ),
          },
        ];
    }
  });
}

/** What a screen reader gets for a day: the date, its net, its trades, its note. */
function dayName(day: CalendarDay, fmt: FormatMoney): string {
  const when = dayLabel(day.date);
  if (day.trades === 0)
    return `${when}, no trades${day.hasNote ? ', daily note' : ''}`;
  return `${when}, ${fmt(day.net, day.r).label}, ${day.trades} ${plural(day.trades, 'trade')}${day.hasNote ? ', daily note' : ''}`;
}

function Cell({
  day,
  stats,
  fmt,
  today,
  selected,
  barWidth,
  onSelect,
}: {
  day: CalendarDay;
  stats: readonly CalendarStat[];
  fmt: FormatMoney;
  today: string;
  selected: boolean;
  barWidth: number;
  onSelect(date: string): void;
}): React.JSX.Element {
  const isToday = day.date === today;
  const future = day.date > today;
  const lines = day.trades > 0 ? linesOf(day, stats, fmt) : [];
  const [head, ...rest] = lines;
  return (
    <button
      type="button"
      aria-label={dayName(day, fmt)}
      aria-pressed={selected}
      aria-current={isToday ? 'date' : undefined}
      onClick={() => onSelect(day.date)}
      className={`group relative flex min-h-[58px] min-w-0 cursor-pointer flex-col overflow-hidden rounded-[10px] p-1.5 text-left outline-offset-2 transition-[box-shadow,transform] duration-200 ease-(--ease-glide) hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 @[600px]/cal:min-h-[92px] @[600px]/cal:px-2 @[600px]/cal:py-2 @[700px]/cal:px-2.5 ${TONE_BOX[day.tone]} ${
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
          weight="duotone"
          className="absolute top-1.5 right-1 text-muted @[600px]/cal:top-1.5 @[600px]/cal:right-2"
        />
      ) : null}
      {head ? (
        <span className="mt-auto hidden min-w-0 @[600px]/cal:block">
          <span
            className={`block text-[12px] leading-tight font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums @[700px]/cal:text-[13.5px] @[780px]/cal:text-[14.5px] ${head.toned ? TONE_INK[day.tone] : 'text-text'}`}
          >
            {head.node}
          </span>
          {rest.map((l) => (
            <span
              key={l.key}
              className="mt-px block truncate text-[11.5px] whitespace-nowrap text-muted tabular-nums @[700px]/cal:text-[12px]"
            >
              {l.node}
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
        <i
          aria-hidden="true"
          style={{ width: `${barWidth}%` }}
          className={`absolute bottom-1.5 left-1.5 h-[3px] max-w-[calc(100%-12px)] rounded-sm @[600px]/cal:bottom-[7px] @[600px]/cal:left-2.5 @[600px]/cal:max-w-[calc(100%-20px)] ${TONE_BAR[day.tone]}`}
        />
      ) : null}
    </button>
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
      data-testid="week-total"
      className="hidden min-h-[92px] min-w-0 flex-col rounded-[10px] bg-sunken px-3 py-2 @[600px]/cal:flex"
    >
      <span className="text-[12px] font-medium text-faint">
        Week {index + 1}
      </span>
      <b
        className={`mt-auto text-[14.5px] font-semibold tracking-[-0.02em] tabular-nums xl:text-[15px] ${none ? 'text-faint' : tone}`}
      >
        <FigureText f={fmt(week.net, week.r)} />
      </b>
      <small className="text-[12px] text-muted">
        {none
          ? 'No trades'
          : `${week.tradingDays} ${plural(week.tradingDays, 'day')}, ${week.trades} ${plural(week.trades, 'trade')}`}
      </small>
    </div>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The month as Monday-to-Sunday rows with a week column. Below `sm` the
 * cells shrink to a day number over a coloured box and the weeks list under
 * the grid: seven columns cannot hold a figure at 390px.
 */
export function MonthGrid({
  label,
  weeks,
  stats,
  fmt,
  today,
  selected,
  onSelect,
}: {
  label: string;
  weeks: readonly CalendarWeek[];
  stats: readonly CalendarStat[];
  fmt: FormatMoney;
  today: string;
  selected: string | undefined;
  onSelect(date: string): void;
}): React.JSX.Element {
  const max = Math.max(
    0,
    ...weeks.flatMap((w) => w.days.map((d) => Math.abs(d?.net ?? 0))),
  );
  const width = (d: CalendarDay) =>
    max === 0 ? 0 : Math.max(6, (Math.abs(d.net) / max) * 100);
  return (
    <>
      <div
        role="group"
        aria-label={label}
        className="mt-3 grid grid-cols-7 gap-1 @[600px]/cal:grid-cols-[repeat(7,minmax(0,1fr))_minmax(76px,112px)] @[700px]/cal:gap-1.5"
      >
        {WEEKDAYS.map((w) => (
          <span
            key={w}
            className="py-1 pl-1 text-[12px] text-faint @[600px]/cal:pl-1"
          >
            {w}
          </span>
        ))}
        <span className="hidden py-1 pl-3 text-[12px] text-faint @[600px]/cal:block">
          Week
        </span>
        {weeks.map((week, i) => (
          <div key={week.start} data-testid="week-row" className="contents">
            {week.days.map((day, di) =>
              day ? (
                <Cell
                  key={day.date}
                  day={day}
                  stats={stats}
                  fmt={fmt}
                  today={today}
                  selected={day.date === selected}
                  barWidth={width(day)}
                  onSelect={onSelect}
                />
              ) : (
                <div
                  key={`${week.start}-${di}`}
                  aria-hidden="true"
                  className="flex min-h-[58px] p-1.5 text-[12.5px] font-medium text-faint/60 @[600px]/cal:min-h-[92px] @[600px]/cal:px-2.5 @[600px]/cal:py-2"
                >
                  {Number(
                    new Date(
                      Date.parse(`${week.start}T00:00:00Z`) + di * 86_400_000,
                    )
                      .toISOString()
                      .slice(8, 10),
                  )}
                </div>
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
              <FigureText f={fmt(week.net, week.r)} />
            </b>
          </li>
        ))}
      </ul>
    </>
  );
}

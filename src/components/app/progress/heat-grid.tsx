'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretLeft, CaretRight } from '@phosphor-icons/react/dist/ssr';
import { buttonClasses } from '@/components/ui/button-styles';
import type { DayScore } from '@/domain/tracker/score';
import { gridStep, type GridStep } from '@/domain/tracker/summary';
import type { Tracker, WeekStart } from '@/domain/types';
import { weekFirstDay, weekStartsOn } from '@/domain/week';
import { plural } from '@/lib/format';
import { onTradingDate, weekdayOf } from '@/lib/time-format';

const DAY_MS = 86_400_000;
const addDays = (date: string, n: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** "Tue 24 Nov". */
const dayLabel = (date: string): string =>
  `${weekdayOf(date, 'short')} ${onTradingDate(date, { day: 'numeric', month: 'short' })}`;
const monthName = (date: string): string =>
  onTradingDate(date, { month: 'short' });

/** Five accent steps by share of rules met (theme.css --hg0 to --hg4). */
const STEP_BG: Record<GridStep, string> = {
  0: 'bg-[var(--hg0)]',
  1: 'bg-[var(--hg1)]',
  2: 'bg-[var(--hg2)]',
  3: 'bg-[var(--hg3)]',
  4: 'bg-[var(--hg4)]',
};

/** The weekday column's width and gap, in px. */
const AXIS = 30;
const AXIS_GAP = 8;
/** Cell and gap sizes: the comp's 22 and 5 on a wide card, 14 and 4 on a narrow one. */
const sizeFor = (width: number) =>
  width > 0 && width < 520 ? { c: 14, g: 4 } : { c: 22, g: 5 };

const ICON_BUTTON =
  'grid size-[30px] place-items-center rounded-control border border-line bg-surface-1 text-muted transition-colors hover:border-accent/35 hover:text-text focus-visible:outline-2 focus-visible:outline-accent aria-disabled:opacity-55 aria-disabled:hover:border-line aria-disabled:hover:text-muted pointer-coarse:size-11';

const NOTE = "Blank days aren't scored: weekends and other non-trading days.";

/**
 * Every trading day since the tracker began as one square, shaded by the share
 * of rules met: weekday rows in week order, a column per week, month labels
 * above. Blank squares are days that aren't scored. It fits as many weeks as
 * its width allows; with `paging` the older ones are a click away.
 */
export function HeatGrid({
  days,
  today,
  tracker,
  weekStart,
  markToday,
  paging,
  label,
  controlsHost,
}: {
  days: readonly DayScore[];
  today: string;
  tracker: Tracker;
  weekStart?: WeekStart;
  markToday: boolean;
  paging: boolean;
  label: string;
  /**
   * Where the paging controls go. Omitted: above the grid. An element: portalled
   * into it, so a card can put them in its header. `null`: that element isn't
   * mounted yet, so they wait.
   */
  controlsHost?: HTMLElement | null;
}): React.JSX.Element {
  const textId = useId();
  const host = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const [focusDate, setFocusDate] = useState(today);
  const [hover, setHover] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  // Before paint, so the grid never shows a frame at the wrong size.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const first = tracker.startedOn;
  const lastDay = today < first ? first : today;
  const firstWeek = weekFirstDay(first, weekStart);
  const totalWeeks =
    Math.round(
      (Date.parse(`${weekFirstDay(lastDay, weekStart)}T00:00:00Z`) -
        Date.parse(`${firstWeek}T00:00:00Z`)) /
        (7 * DAY_MS),
    ) + 1;

  const { c, g } = sizeFor(width);
  const fit =
    width > 0
      ? Math.max(
          1,
          Math.min(
            totalWeeks,
            Math.floor((width - AXIS - AXIS_GAP + g) / (c + g)),
          ),
        )
      : totalWeeks;
  const maxOffset = Math.max(0, totalWeeks - fit);
  const back = Math.min(offset, maxOffset);
  const startIndex = totalWeeks - fit - back;
  const weeks = Array.from({ length: fit }, (_, j) =>
    addDays(firstWeek, (startIndex + j) * 7),
  );
  const drawn = (date: string) => date >= first && date <= lastDay;
  const firstShown = weeks
    .map((w) => addDays(w, 0))
    .flatMap((w) => Array.from({ length: 7 }, (_, r) => addDays(w, r)))
    .find(drawn);
  const lastShown = [...weeks]
    .reverse()
    .flatMap((w) => Array.from({ length: 7 }, (_, r) => addDays(w, 6 - r)))
    .find(drawn);

  const visible = (date: string) =>
    date >= weeks[0]! && date <= addDays(weeks[weeks.length - 1]!, 6);
  // The one tab stop: the last focused square if it shows, else the latest one.
  const stop =
    drawn(focusDate) && visible(focusDate) ? focusDate : (lastShown ?? today);

  const textOf = (date: string): string => {
    const d = byDate.get(date);
    return d && !d.unscored && d.active > 0
      ? `${dayLabel(date)}, ${d.met} of ${d.active} rules met`
      : `${dayLabel(date)}, not scored`;
  };

  // Month labels: over the column that holds the 1st, and over the first column
  // unless a month starts within two columns of it.
  const monthAt = new Map<number, string>();
  weeks.forEach((w, j) => {
    for (let r = 0; r < 7; r++) {
      const date = addDays(w, r);
      if (drawn(date) && date.endsWith('-01')) monthAt.set(j, monthName(date));
    }
  });
  const nearest = Math.min(...[...monthAt.keys()], Infinity);
  if (!monthAt.has(0) && nearest >= 3 && firstShown)
    monthAt.set(0, monthName(firstShown));

  // The text alternative: the range, the scored days and the perfect ones.
  const inView = weeks.flatMap((w) =>
    Array.from({ length: 7 }, (_, r) => byDate.get(addDays(w, r))).filter(
      (d): d is DayScore => d !== undefined && drawn(d.date),
    ),
  );
  const scored = inView.filter((d) => !d.unscored && d.active > 0);
  const perfect = scored
    .filter((d) => d.perfect)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = perfect.slice(-10);
  const alternative =
    firstShown && lastShown
      ? `${dayLabel(firstShown)} to ${dayLabel(lastShown)}: ${scored.length} scored ${plural(scored.length, 'day')}, ${perfect.length} perfect ${plural(perfect.length, 'day')}${
          latest.length > 0
            ? `${perfect.length > latest.length ? ', the latest' : ''}: ${latest.map((d) => dayLabel(d.date)).join(', ')}`
            : ''
        }.`
      : '';

  const move = (date: string, key: string) => {
    const step: Record<string, number> = {
      ArrowLeft: -7,
      ArrowRight: 7,
      ArrowUp: -1,
      ArrowDown: 1,
    };
    const by = step[key];
    if (by === undefined) return false;
    // Up and down stay inside the week's column.
    const target = addDays(date, by);
    const sameWeek =
      Math.abs(by) === 7 ||
      weekFirstDay(target, weekStart) === weekFirstDay(date, weekStart);
    if (!sameWeek || !drawn(target) || !visible(target)) return true;
    setFocusDate(target);
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-date="${target}"]`)
      ?.focus();
    return true;
  };

  const shown = hover ?? focused;
  const rowOffset = weekStartsOn(weekStart);

  const controls = (
    <>
      <button
        type="button"
        aria-label="Earlier weeks"
        aria-disabled={back >= maxOffset ? 'true' : undefined}
        onClick={() =>
          setOffset(Math.min(maxOffset, back + Math.max(1, fit - 1)))
        }
        className={ICON_BUTTON}
      >
        <CaretLeft size={15} weight="bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Later weeks"
        aria-disabled={back === 0 ? 'true' : undefined}
        onClick={() => setOffset(Math.max(0, back - Math.max(1, fit - 1)))}
        className={ICON_BUTTON}
      >
        <CaretRight size={15} weight="bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setOffset(0)}
        className={buttonClasses('secondary', 'sm')}
      >
        Today
      </button>
    </>
  );

  return (
    <div ref={host}>
      {paging ? (
        controlsHost === undefined ? (
          <div className="mb-1 flex items-center justify-end gap-2">
            {controls}
          </div>
        ) : controlsHost ? (
          createPortal(controls, controlsHost)
        ) : null
      ) : null}
      <div
        className="mt-3 inline-flex flex-col gap-1.5"
        style={{ '--c': `${c}px`, '--g': `${g}px` } as React.CSSProperties}
      >
        <div
          aria-hidden="true"
          className="grid h-3.5 text-[11px] text-faint"
          style={{
            marginLeft: AXIS + AXIS_GAP,
            gridTemplateColumns: `repeat(${weeks.length}, var(--c))`,
            columnGap: 'var(--g)',
          }}
        >
          {[...monthAt].map(([j, name]) => (
            <span
              key={j}
              className="whitespace-nowrap"
              style={{ gridColumn: j + 1, gridRow: 1 }}
            >
              {name}
            </span>
          ))}
        </div>
        <div className="flex" style={{ gap: AXIS_GAP }}>
          <div
            aria-hidden="true"
            className="grid text-[11px] text-faint"
            style={{
              width: AXIS,
              gridTemplateRows: 'repeat(7, var(--c))',
              rowGap: 'var(--g)',
            }}
          >
            {Array.from({ length: 7 }, (_, r) => {
              const weekday = (rowOffset + r) % 7;
              return (
                <span key={r} style={{ lineHeight: 'var(--c)' }}>
                  {weekday === 1
                    ? 'Mon'
                    : weekday === 3
                      ? 'Wed'
                      : weekday === 5
                        ? 'Fri'
                        : ''}
                </span>
              );
            })}
          </div>
          <div
            ref={gridRef}
            role="grid"
            aria-label={label}
            aria-describedby={textId}
            className="flex flex-col"
            style={{ gap: 'var(--g)' }}
            onKeyDown={(e) => {
              const date = (e.target as HTMLElement).dataset.date;
              if (date && move(date, e.key)) e.preventDefault();
            }}
          >
            {Array.from({ length: 7 }, (_, r) => (
              <div
                key={r}
                role="row"
                data-weekday={(rowOffset + r) % 7}
                className="flex"
                style={{ gap: 'var(--g)' }}
              >
                {weeks.map((w) => {
                  const date = addDays(w, r);
                  if (!drawn(date))
                    return (
                      <span
                        key={date}
                        aria-hidden="true"
                        style={{ width: 'var(--c)', height: 'var(--c)' }}
                      />
                    );
                  const d = byDate.get(date);
                  const step = d ? gridStep(d) : null;
                  const isToday = markToday && date === today;
                  return (
                    <div
                      key={date}
                      role="gridcell"
                      aria-label={textOf(date)}
                      data-date={date}
                      data-step={step ?? undefined}
                      data-today={isToday ? '' : undefined}
                      tabIndex={date === stop ? 0 : -1}
                      onMouseEnter={() => setHover(date)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => {
                        setFocused(date);
                        setFocusDate(date);
                      }}
                      onBlur={() => setFocused(null)}
                      className={`rounded-[3px] outline-offset-2 hover:shadow-[0_0_0_1.5px_var(--surface-1),0_0_0_3px_var(--accent)] focus-visible:outline-2 focus-visible:outline-accent ${
                        step === null ? '' : STEP_BG[step]
                      } ${isToday ? 'shadow-[0_0_0_1.5px_var(--surface-1),0_0_0_3px_var(--text)]' : ''}`}
                      style={{ width: 'var(--c)', height: 'var(--c)' }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p id={textId} className="sr-only">
        {alternative}
      </p>
      <div className="mt-3.5 flex flex-col items-start justify-between gap-2.5 text-[12.5px] text-faint sm:flex-row sm:items-center sm:gap-4">
        <span role="status" className="tabular-nums">
          {shown ? textOf(shown) : NOTE}
        </span>
        <span
          aria-hidden="true"
          className="inline-flex flex-none items-center gap-1 text-[12px]"
        >
          Less
          {([0, 1, 2, 3, 4] as const).map((s) => (
            <i
              key={s}
              className={`block size-[11px] rounded-[2.5px] ${STEP_BG[s]}`}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

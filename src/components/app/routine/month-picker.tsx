'use client';

import { CaretLeft, CaretRight } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useRef, type ReactNode } from 'react';
import { isRealDate } from '@/components/app/notebook/notebook-model';
import { rotateFromWeekStart, weekIndexOf } from '@/domain/week';
import type { WeekStart } from '@/domain/types';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_MS = 86_400_000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');

const SELECT =
  'h-8 rounded-[8px] border border-line-2 bg-surface-1 px-2 text-[13px] font-semibold text-text outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:h-11';
const ARROW =
  'inline-flex size-8 flex-none items-center justify-center rounded-[8px] text-muted outline-none transition-colors duration-200 hover:bg-sunken hover:text-text focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:size-11';

/** A month grid: dropdowns for the month and year, arrows, today ringed, every date enabled. */
export function MonthPicker({
  month,
  onMonth,
  today,
  selected,
  weekStart,
  label,
  onPick,
  renderDay,
}: {
  /** YYYY-MM */
  month: string;
  onMonth(month: string): void;
  today: string;
  selected?: string;
  weekStart: WeekStart;
  label: string;
  onPick(date: string): void;
  renderDay?(date: string): ReactNode;
}): React.JSX.Element {
  const [yearText, monthText] = month.split('-') as [string, string];
  const year = Number(yearText);
  const first = `${month}-01`;
  const lead = weekIndexOf(first, weekStart);
  const count = new Date(Date.UTC(year, Number(monthText), 0)).getUTCDate();
  const cells: (string | undefined)[] = [
    ...Array<undefined>(lead).fill(undefined),
    ...Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(undefined);
  const rows: (string | undefined)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const grid = useRef<HTMLTableElement>(null);
  const pending = useRef<string | undefined>(undefined);
  // The one tab stop: the selected date, else today, when they are in view.
  const inMonth = (d: string | undefined) => d?.startsWith(`${month}-`);
  const stop = inMonth(selected) ? selected : inMonth(today) ? today : first;

  // After an arrow key crosses a month edge, the new month's cell takes focus.
  useEffect(() => {
    const date = pending.current;
    if (!date) return;
    pending.current = undefined;
    grid.current?.querySelector<HTMLElement>(`[data-date="${date}"]`)?.focus();
  }, [month]);

  const shift = (by: number) => {
    const at = year * 12 + Number(monthText) - 1 + by;
    onMonth(`${Math.floor(at / 12)}-${pad((at % 12) + 1)}`);
  };

  const move = (from: string, to: string) => {
    if (to.startsWith(`${month}-`)) {
      grid.current?.querySelector<HTMLElement>(`[data-date="${to}"]`)?.focus();
    } else {
      pending.current = to;
      onMonth(to.slice(0, 7));
    }
  };

  const onKey = (e: React.KeyboardEvent, date: string) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const by = step[e.key];
    if (by !== undefined) {
      e.preventDefault();
      move(date, iso(utc(date) + by * DAY_MS));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const idx = weekIndexOf(date, weekStart);
      move(date, iso(utc(date) + (e.key === 'Home' ? -idx : 6 - idx) * DAY_MS));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(date);
    }
    // Escape is left to the popover around the grid.
  };

  const years = Array.from({ length: 21 }, (_, i) => year - 10 + i);
  const head = rotateFromWeekStart(DAYS, weekStart);

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Previous month"
          className={ARROW}
          onClick={() => shift(-1)}
        >
          <CaretLeft size={16} aria-hidden="true" />
        </button>
        <select
          aria-label="Month"
          className={`${SELECT} min-w-0 flex-1`}
          value={monthText}
          onChange={(e) => onMonth(`${year}-${e.target.value}`)}
        >
          {MONTHS.map((name, i) => (
            <option key={name} value={pad(i + 1)}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Year"
          className={`${SELECT} w-[76px] flex-none`}
          value={String(year)}
          onChange={(e) => onMonth(`${e.target.value}-${monthText}`)}
        >
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Next month"
          className={ARROW}
          onClick={() => shift(1)}
        >
          <CaretRight size={16} aria-hidden="true" />
        </button>
      </div>
      <table
        ref={grid}
        role="grid"
        aria-label={`${MONTHS[Number(monthText) - 1]} ${year}`}
        className="w-full table-fixed border-collapse"
      >
        <thead>
          <tr>
            {head.map((d) => (
              <th
                key={d}
                scope="col"
                className="pb-1 text-center text-[11.5px] font-medium text-faint"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((date, c) => {
                if (!date || !isRealDate(date)) return <td key={c} />;
                const day = Number(date.slice(8));
                const long = `${day} ${MONTHS[Number(monthText) - 1]} ${year}`;
                const isToday = date === today;
                const isSelected = date === selected;
                return (
                  <td
                    key={date}
                    role="presentation"
                    className="p-0 text-center"
                  >
                    <button
                      type="button"
                      role="gridcell"
                      data-date={date}
                      aria-label={long}
                      aria-current={isToday ? 'date' : undefined}
                      aria-selected={isSelected}
                      tabIndex={date === stop ? 0 : -1}
                      onClick={() => onPick(date)}
                      onKeyDown={(e) => onKey(e, date)}
                      className={`relative mx-auto inline-flex size-9 items-center justify-center rounded-full text-[13px] tabular-nums outline-offset-2 transition-colors duration-200 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11 ${
                        isSelected
                          ? 'bg-accent font-semibold text-accent-fg hover:bg-accent'
                          : 'text-text'
                      } ${isToday ? 'ring-2 ring-accent ring-inset' : ''}`}
                    >
                      {day}
                      {renderDay?.(date)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

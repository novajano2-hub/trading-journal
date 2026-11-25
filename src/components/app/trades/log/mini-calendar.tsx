'use client';

import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react/dist/ssr';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { buttonClasses } from '@/components/ui/button-styles';
import { groupDays, type DayGroup } from '@/data/day-log';
import { resolveRange } from '@/data/filters';
import { metricContextOf } from '@/data/metrics';
import {
  useGlobalFilters,
  useRoutineToday,
  useTradeSet,
} from '@/data/query/derived';
import {
  useAccounts,
  useCashFlows,
  usePrefs,
  useTracker,
  useTrades,
} from '@/data/query/hooks';
import { localDate } from '@/domain/time';
import type { WeekStart } from '@/domain/types';
import { weekIndexOf } from '@/domain/week';
import { FigureSourceContext } from '@/lib/display';
import { onTradingDate } from '@/lib/time-format';
import { plural } from '@/lib/format';
import { tileLabel } from '@/lib/day-label';
import { CARD } from '../../dashboard/shared';
import { figureSourceOf } from './log-shell';
import { useTileFigures, type Trend } from './week-tiles';

/*
 * The mini month calendar beside the Day and Week views (the record: a month
 * title with arrows, a weekday header, trading days underlined by the sign of
 * the day's net, today bold, the selected day outlined; a click filters the
 * list to that day; hovering previews the day's P&L and trade count).
 */

const DAY_MS = 86_400_000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (date: string, n: number) =>
  new Date(utc(date) + n * DAY_MS).toISOString().slice(0, 10);
const monthOf = (date: string) => date.slice(0, 7);
const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

/** Sunday first; rotated to the week-start preference. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type Tone = 'gain' | 'loss' | 'flat';

/**
 * The underline's tone: the sign of the net, and neutral for a flat day (K39).
 * Keel's call (TradeZella unknown): a day with trades but no net (none closed,
 * or another currency only) reads neutral too, as its week tile does.
 */
const toneOf = (trend: Trend): Tone =>
  trend === 'up' ? 'gain' : trend === 'down' ? 'loss' : 'flat';

const UNDERLINE: Record<Tone, string> = {
  gain: 'bg-gain-fill',
  loss: 'bg-loss-fill',
  flat: 'bg-faint',
};

const TIP_TONE: Record<Trend, string> = {
  up: 'text-gain',
  down: 'text-loss',
  flat: 'text-text',
  open: 'text-faint',
  other: 'text-faint',
};

const ARROW =
  'inline-grid size-7 place-items-center rounded-control border border-line text-muted outline-offset-2 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11';

/**
 * The month, its days and their underlines. Pure but for the display's units:
 * `groups` are the days' trades (every filter but the date range, so a picked
 * day leaves the others underlined, R23), `selected` the one-day range in
 * force. The month opens on the selected day's, else today's. Arrow keys move
 * between days and across months; one day is the tab stop.
 */
export function MiniCalendar({
  groups,
  today,
  selected,
  onPick,
  weekStart,
  bare = false,
}: {
  groups: readonly DayGroup[];
  today: string;
  selected?: string;
  onPick(date: string): void;
  weekStart: WeekStart;
  /** Without the card around it (inside a sheet). */
  bare?: boolean;
}): React.JSX.Element {
  const titleId = useId();
  const figures = useTileFigures();
  const [view, setView] = useState({
    month: monthOf(selected ?? today),
    selected,
  });
  // A day picked elsewhere (the address, the date chip) brings its month into view.
  if (view.selected !== selected)
    setView({
      month: selected === undefined ? view.month : monthOf(selected),
      selected,
    });
  const month = view.month;
  const [hot, setHot] = useState<string>();
  const [focusDate, setFocusDate] = useState<string>();
  const grid = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  const byDate = useMemo(
    () => new Map(groups.map((g) => [g.date, g])),
    [groups],
  );
  const first = `${month}-01`;
  const lead = weekIndexOf(first, weekStart);
  const dates = Array.from(
    { length: daysIn(month) },
    (_, i) => `${month}-${pad(i + 1)}`,
  );
  const stop =
    focusDate !== undefined && monthOf(focusDate) === month
      ? focusDate
      : selected !== undefined && monthOf(selected) === month
        ? selected
        : monthOf(today) === month
          ? today
          : first;
  const title = onTradingDate(first, { month: 'long', year: 'numeric' });

  useEffect(() => {
    if (!moveFocus.current || focusDate === undefined) return;
    moveFocus.current = false;
    grid.current
      ?.querySelector<HTMLElement>(`[data-date="${focusDate}"]`)
      ?.focus();
  }, [focusDate, month]);

  const go = (date: string) => {
    moveFocus.current = true;
    setFocusDate(date);
    setView((v) => ({ ...v, month: monthOf(date) }));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setHot(undefined);
    const from = (e.target as HTMLElement).closest<HTMLElement>('[data-date]')
      ?.dataset.date;
    if (from === undefined) return;
    const col = weekIndexOf(from, weekStart);
    let next: string | undefined;
    switch (e.key) {
      case 'ArrowLeft':
        next = addDays(from, -1);
        break;
      case 'ArrowRight':
        next = addDays(from, 1);
        break;
      case 'ArrowUp':
        next = addDays(from, -7);
        break;
      case 'ArrowDown':
        next = addDays(from, 7);
        break;
      case 'Home':
        next = addDays(from, -col);
        break;
      case 'End':
        next = addDays(from, 6 - col);
        break;
      case 'PageUp':
      case 'PageDown': {
        const m = addMonths(monthOf(from), e.key === 'PageUp' ? -1 : 1);
        next = `${m}-${pad(Math.min(Number(from.slice(8)), daysIn(m)))}`;
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    go(next);
  };

  const Root = bare ? 'div' : 'aside';
  return (
    <Root
      {...(bare
        ? { role: 'group' as const, 'aria-labelledby': titleId }
        : { 'aria-labelledby': titleId })}
      className={bare ? '' : `${CARD} px-4 pt-4 pb-3.5`}
    >
      <div className="flex items-center justify-between">
        <h2
          id={titleId}
          aria-live="polite"
          className="text-[15px] font-semibold tracking-[-0.015em] text-text"
        >
          {title}
        </h2>
        <span className="flex gap-1.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() =>
              setView((v) => ({ ...v, month: addMonths(month, -1) }))
            }
            className={ARROW}
          >
            <CaretLeft size={13} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() =>
              setView((v) => ({ ...v, month: addMonths(month, 1) }))
            }
            className={ARROW}
          >
            <CaretRight size={13} weight="bold" aria-hidden="true" />
          </button>
        </span>
      </div>
      <div
        data-testid="mini-weekdays"
        aria-hidden="true"
        className="mt-3 grid grid-cols-7 text-center text-[11px] text-faint"
      >
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>
            {WEEKDAYS[(i + (weekStart === 'monday' ? 1 : 0)) % 7]}
          </span>
        ))}
      </div>
      <div
        ref={grid}
        onKeyDown={onKeyDown}
        className="mt-1 grid grid-cols-7 gap-y-0.5"
      >
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden="true" />
        ))}
        {dates.map((date, i) => {
          const day = byDate.get(date);
          const f = day ? figures(day) : undefined;
          const tone = f ? toneOf(f.trend) : undefined;
          const other = day?.otherCurrency.length ?? 0;
          const count = f?.trend === 'other' ? other : (f?.count ?? 0);
          const countText = `${count} ${plural(count, 'trade')}`;
          const net =
            f === undefined
              ? ''
              : f.trend === 'other'
                ? 'Other currencies'
                : f.full
                  ? f.full.text
                  : 'None';
          // The name carries the same facts as the preview, in words (Privacy: no amount).
          const name = f
            ? `${tileLabel(date)}, ${
                f.trend === 'other'
                  ? `${count} ${plural(count, 'trade')} in other currencies`
                  : f.full
                    ? `${f.full.label}, ${countText}`
                    : `no closed trades, ${countText}`
              }`
            : tileLabel(date);
          const isToday = date === today;
          const isSelected = date === selected;
          const col = (lead + i) % 7;
          return (
            <div key={date} className="relative">
              <button
                type="button"
                data-date={date}
                data-tone={tone}
                aria-label={name}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                tabIndex={date === stop ? 0 : -1}
                onClick={() => onPick(date)}
                onMouseEnter={() => setHot(date)}
                onMouseLeave={() => setHot((h) => (h === date ? undefined : h))}
                onFocus={() => {
                  setHot(date);
                  setFocusDate(date);
                }}
                onBlur={() => setHot((h) => (h === date ? undefined : h))}
                className={`flex h-10 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[9px] text-[13px] outline-offset-0 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 ${
                  isToday
                    ? 'font-bold text-text'
                    : isSelected
                      ? 'font-semibold text-text'
                      : date > today
                        ? 'font-medium text-faint'
                        : 'font-medium text-muted'
                } ${isSelected ? 'shadow-[inset_0_0_0_1.5px_var(--accent)]' : ''}`}
              >
                <span aria-hidden="true">{i + 1}</span>
                <i
                  aria-hidden="true"
                  className={`h-[2.5px] w-3.5 rounded-sm ${tone ? UNDERLINE[tone] : 'bg-transparent'}`}
                />
              </button>
              {/* Keel's call (TradeZella unknown): a day with no trades previews nothing. */}
              {hot === date && f ? (
                <span
                  role="tooltip"
                  className={`pointer-events-none absolute bottom-full z-[6] mb-1 rounded-[10px] border border-line bg-surface-1 px-2.5 py-2 text-[12.5px] leading-[1.45] whitespace-nowrap text-muted shadow-[var(--shadow)] ${
                    col <= 1
                      ? 'left-0'
                      : col >= 5
                        ? 'right-0'
                        : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  <b className="block text-[13px] font-semibold text-text">
                    {tileLabel(date)}
                  </b>
                  <span className={TIP_TONE[f.trend]}>{net}</span>, {countText}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-3 border-t border-line pt-3 text-xs leading-normal text-faint">
        Underlined days have trades: green for a net gain, red for a net loss,
        grey for a flat day. Pick a day to see only its trades.
      </p>
    </Root>
  );
}

/**
 * The calendar on the page's filters. R23 (Keel's call, TradeZella unknown
 * which trades it reads): it reads every filter except the date range, so a
 * picked day leaves the other days underlined and one more click moves on.
 * "Today" is the routine's (K23: the sample's fixed date, else the profile
 * zone's), falling back to the local date. A pick sets the range to that day
 * (equal from and to); the date chip shows it and clears it. Render inside
 * the view's `<Suspense>` (it reads the URL's filters).
 */
export function TradesMiniCalendar({
  onPicked,
  bare = false,
}: {
  /** After a pick, for the sheet to close. */
  onPicked?(): void;
  bare?: boolean;
}): React.JSX.Element {
  const { filters, setFilters } = useGlobalFilters();
  const set = useTradeSet(filters);
  const prefs = usePrefs().data;
  const tracker = useTracker();
  const routineToday = useRoutineToday();
  const tradesQuery = useTrades();
  const accountsQuery = useAccounts();
  const flowsQuery = useCashFlows();

  const ctx = useMemo(
    () => (prefs ? metricContextOf(prefs) : undefined),
    [prefs],
  );
  const groups = useMemo(
    () =>
      set.data && prefs && ctx
        ? groupDays(set.data.dayTrades, {
            timeZone: prefs.timeZone,
            baseCurrency: prefs.baseCurrency,
            ctx,
            weekStart: prefs.weekStart ?? 'sunday',
            noteDates: new Set<string>(),
          })
        : undefined,
    [set.data, prefs, ctx],
  );

  const allTrades = tradesQuery.data;
  const accounts = accountsQuery.data;
  const flows = flowsQuery.data;
  // A failed query ends the placeholder: a short line says so. (The tracker is
  // not one of them: without it "today" is the local date.)
  const error =
    set.error ?? tradesQuery.error ?? accountsQuery.error ?? flowsQuery.error;
  if (error)
    return (
      <p
        role="alert"
        className={`text-[13px] text-muted ${bare ? '' : `${CARD} px-4 py-3.5`}`}
      >
        The calendar couldn&apos;t load.
      </p>
    );
  if (
    !set.data ||
    !groups ||
    !prefs ||
    !allTrades ||
    !accounts ||
    !flows ||
    tracker.isPending
  )
    return (
      <div
        aria-hidden="true"
        className={bare ? 'h-[360px]' : `${CARD} h-[392px]`}
      />
    );

  const localToday = localDate(new Date().toISOString(), prefs.timeZone);
  const today = routineToday ?? localToday;
  const weekStart = prefs.weekStart ?? 'sunday';
  // Keel's call (TradeZella unknown): any one-day range in force (a picked day,
  // or the Today preset) is the selected day, outlined.
  const { from, to } = resolveRange(
    set.data.filters.range,
    localToday,
    weekStart,
  );
  const selected = from !== undefined && from === to ? from : undefined;
  // The days' figures read the trades they are built from, not the date range's.
  const source = figureSourceOf({
    trades: set.data.dayTrades,
    prefs,
    accounts,
    flows,
    allTrades,
    filters: set.data.filters,
    today: localToday,
  });

  return (
    <FigureSourceContext.Provider value={source}>
      <MiniCalendar
        groups={groups}
        today={today}
        selected={selected}
        weekStart={weekStart}
        bare={bare}
        onPick={(date) => {
          // Keel's call (TradeZella unknown): picking the day already picked keeps it; the date chip clears it.
          setFilters({ ...filters, range: { from: date, to: date } });
          onPicked?.();
        }}
      />
    </FigureSourceContext.Provider>
  );
}

/**
 * Below the column's width the calendar waits behind a Calendar button: it
 * opens as a sheet, and a pick closes it and filters. Keel's call (TradeZella
 * unknown): the record has the column only.
 */
export function CalendarSheetButton(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`${buttonClasses('secondary')} gap-1.5 pr-[15px] pl-3`}
      >
        <CalendarBlank size={16} aria-hidden="true" className="flex-none" />
        Calendar
      </button>
      <MorphDialog
        open={open}
        onOpenChange={setOpen}
        origin={opener}
        returnFocus={opener}
        title="Calendar"
        size="compact"
      >
        <div className="pt-1 pb-2">
          <TradesMiniCalendar bare onPicked={() => setOpen(false)} />
        </div>
      </MorphDialog>
    </>
  );
}

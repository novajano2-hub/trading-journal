'use client';

import { CaretLeft, CaretRight } from '@phosphor-icons/react/dist/ssr';
import { NotePencil } from '@phosphor-icons/react/dist/ssr';
import { useRouter } from 'next/navigation';
import { useContext, useId, useMemo, useState } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { WIDGET_TITLES } from '@/content/dashboard-widgets';
import {
  calendarMonth,
  calendarYear,
  dayExits,
  dayGrading,
  type CalendarDay,
} from '@/data/calendar';
import { groupDays } from '@/data/day-log';
import { queryString, serializeFilters } from '@/data/filters';
import { metricContextOf } from '@/data/metrics';
import { useGlobalFilters, useRoutineToday } from '@/data/query/derived';
import {
  useAccounts,
  useCashFlows,
  useJournal,
  usePrefs,
  useStrategies,
  useTagCategories,
  useTags,
  useTracker,
  useTrades,
  useUpdatePrefs,
} from '@/data/query/hooks';
import { WIDGETS } from '@/domain/dashboard/widgets';
import { localDate } from '@/domain/time';
import type { Trade, WidgetKey } from '@/domain/types';
import {
  FigureSourceContext,
  pctBaseOf,
  useDisplay,
  type FigureSource,
} from '@/lib/display';
import { plural } from '@/lib/format';
import { onTradingDate } from '@/lib/time-format';
import {
  DaySheet,
  ICON_BUTTON,
  StatsMenu,
  TEXT_BUTTON,
} from '../../calendar/calendar-controls';
import { DayPanel } from '../../calendar/day-panel';
import { monthFormat } from '../../calendar/month-format';
import { MonthGrid } from '../../calendar/month-grid';
import { CalendarSnapshot } from '../../calendar/snapshot-panel';
import { YearGrid } from '../../calendar/year-grid';
import { MiniCalendar } from '../../trades/log/mini-calendar';
import { CARD, CARD_PAD, signTone } from '../shared';
import { useWidgetPage, useWidgetValue } from './context';
import { TipGlyph, WidgetFrame } from './frame';
import type { WidgetRender } from './registry';

/**
 * The calendar widgets (#46, C12, C13): the plain month, the mini month, the
 * month with stats and the year. They book every exit on its own day and show
 * the whole month or year, so the date range does not touch them; the other
 * filters, the display unit and the currency the page shows do. Each keeps its
 * own month or year, starting on today's. Money goes through `useDisplay()`
 * (cells, week totals, the month's net, names a screen reader gets), so
 * Privacy hides it everywhere.
 */

const Loading = ({ k }: { k: WidgetKey }) => (
  <WidgetFrame
    widgetKey={k}
    title={WIDGET_TITLES[k]}
    tip={WIDGETS[k].metric}
    state="loading"
  />
);

/**
 * The date the calendars call today: the routine's (the sample workspace's own
 * date, as the mini calendar beside the Day view reads it), else the local
 * date in the profile zone.
 */
function useToday(): string | undefined {
  const routine = useRoutineToday();
  const tracker = useTracker();
  const timeZone = usePrefs().data?.timeZone;
  // Held until the tracker is in, so the day marked today never moves under the eye; a failed tracker falls back to the local date.
  if (tracker.isPending) return undefined;
  if (routine !== undefined) return routine;
  return timeZone === undefined
    ? undefined
    : localDate(new Date().toISOString(), timeZone);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `month` (YYYY-MM) moved by `by` months. */
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

const monthName = (month: string) =>
  onTradingDate(`${month}-01`, { month: 'long', year: 'numeric' }, 'en-US');

/** Everything a calendar reads besides its trades: the percentage's base for a stretch of days starting on `from`. */
function usePctBase(from: string | undefined, currency: string | undefined) {
  const prefs = usePrefs().data;
  const accounts = useAccounts().data;
  const flows = useCashFlows().data;
  const allTrades = useTrades().data;
  const { filters } = useGlobalFilters();
  const accountIds = filters.accountIds;
  return useMemo(
    () =>
      prefs && accounts && flows && allTrades && from && currency
        ? pctBaseOf({
            accounts,
            flows,
            trades: allTrades,
            accountIds,
            currency,
            from,
            timeZone: prefs.timeZone,
          })
        : null,
    [prefs, accounts, flows, allTrades, accountIds, from, currency],
  );
}

/** The arrows of a calendar's header, by month or by year. */
function Arrows({
  unit,
  onStep,
}: {
  unit: 'month' | 'year';
  onStep(by: -1 | 1): void;
}): React.JSX.Element {
  return (
    <span className="flex gap-1">
      <button
        type="button"
        aria-label={`Previous ${unit}`}
        className={ICON_BUTTON}
        onClick={() => onStep(-1)}
      >
        <CaretLeft size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`Next ${unit}`}
        className={ICON_BUTTON}
        onClick={() => onStep(1)}
      >
        <CaretRight size={15} aria-hidden="true" />
      </button>
    </span>
  );
}

/** A day's panel, as the Calendar page draws it: its figures, the trades that exited and the way into its note and the Day view. */
function DayDetail({
  date,
  headingId,
  model,
  trades,
  currency,
  fmt,
}: {
  date: string;
  headingId: string;
  model: ReturnType<typeof calendarMonth> & {
    ctx: ReturnType<typeof metricContextOf>;
  };
  trades: readonly Trade[];
  currency: string;
  fmt: ReturnType<typeof monthFormat>;
}): React.JSX.Element | null {
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const categories = useTagCategories().data;
  const { filters } = useGlobalFilters();
  const { ctx } = model;
  const day = model.weeks
    .flatMap((w) => w.days)
    .find((d): d is CalendarDay => d !== null && d.date === date);
  const exits = useMemo(
    () => (day ? dayExits(trades, date, ctx) : []),
    [trades, date, ctx, day],
  );
  if (!day) return null;
  const stillOpen = trades.filter(
    (t) =>
      t.status === 'open' &&
      localDate(t.openedAt, ctx.timeZone) === date &&
      !exits.some((e) => e.trade.id === t.id),
  ).length;
  return (
    <DayPanel
      date={date}
      day={day}
      exits={exits}
      grading={dayGrading(
        exits,
        strategies ?? [],
        tags ?? [],
        categories ?? [],
        ctx,
      )}
      currency={currency}
      stillOpen={stillOpen}
      fmt={fmt}
      basis={ctx.pnlBasis}
      timeZone={ctx.timeZone}
      filters={filters}
      headingId={headingId}
      inSheet
    />
  );
}

const SWATCH = 'size-3 rounded-[4px]';

/**
 * A month of days, the whole month whatever the date range. `advanced` is the
 * calendar with stats (cell stats from `UserPrefs.calendarStats`, the Stats
 * shown menu, This month, the month's net and trading days, a week total on
 * each row and a pencil on a day with a note); the plain one is net only,
 * tinted green, red or neutral, with none of that. A day opens its panel in a
 * sheet, with the way into the Day view.
 */
function MonthCard({
  widgetKey,
  advanced,
}: {
  widgetKey: 'calendar' | 'calendar-adv';
  advanced: boolean;
}): React.JSX.Element {
  const trades = useWidgetValue(widgetKey);
  const page = useWidgetPage();
  const prefs = usePrefs().data;
  const notes = useJournal({ enabled: advanced }).data;
  const updatePrefs = useUpdatePrefs();
  const display = useDisplay();
  const today = useToday();
  const [chosen, setChosen] = useState<string>();
  const [openDay, setOpenDay] = useState<string>();
  const sheetId = useId();
  const month = chosen ?? today?.slice(0, 7);
  const currency = page?.currency;
  const pctBase = usePctBase(month && `${month}-01`, currency);
  const model = useMemo(() => {
    if (!trades || !prefs || !month || (advanced && !notes)) return undefined;
    const ctx = metricContextOf(prefs);
    return { ctx, ...calendarMonth(trades, notes ?? [], month, ctx) };
  }, [trades, prefs, notes, month, advanced]);
  if (!trades || !page || !prefs || !model || !month || !today || !currency)
    return <Loading k={widgetKey} />;

  const fmt = monthFormat(display, pctBase, currency);
  const { weeks, summary } = model;
  const name = monthName(month);
  const stats = advanced ? prefs.calendarStats : (['net'] as const);
  const controls = (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      <Arrows
        unit="month"
        onStep={(by) => {
          setChosen(shiftMonth(month, by));
          setOpenDay(undefined);
        }}
      />
      {advanced ? (
        <>
          <button
            type="button"
            className={TEXT_BUTTON}
            onClick={() => {
              setChosen(undefined);
              setOpenDay(undefined);
            }}
          >
            This month
          </button>
          <StatsMenu
            stats={stats}
            onChange={(next) => updatePrefs.mutate({ calendarStats: next })}
          />
          <CalendarSnapshot
            month={month}
            data={model}
            stats={stats}
            fmt={fmt}
            currency={currency}
          />
        </>
      ) : null}
    </span>
  );
  return (
    <WidgetFrame
      widgetKey={widgetKey}
      title={name}
      about={WIDGET_TITLES[widgetKey]}
      tip={WIDGETS[widgetKey].metric}
      caption={
        advanced ? (
          <>
            Month{' '}
            <b className={`font-semibold ${signTone(summary.net)}`}>
              <FigureText f={fmt(summary.net, summary.r, false, summary)} />
            </b>
            , {summary.tradingDays} {plural(summary.tradingDays, 'day')}
          </>
        ) : undefined
      }
      end={controls}
    >
      <div className="@container/cal min-w-0">
        <MonthGrid
          weekStart={prefs.weekStart}
          label={name}
          weeks={weeks}
          stats={stats}
          fmt={fmt}
          currency={currency}
          today={today}
          selected={openDay}
          weekTotals={advanced}
          onSelect={setOpenDay}
        />
      </div>
      {advanced ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[12px] text-muted">
          <span className="inline-flex items-center gap-[7px]">
            <i
              aria-hidden="true"
              className={`${SWATCH} bg-gain-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--gain-fill)_30%,transparent)]`}
            />
            Green day
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <i
              aria-hidden="true"
              className={`${SWATCH} bg-loss-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--loss-fill)_30%,transparent)]`}
            />
            Red day
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <NotePencil size={15} aria-hidden="true" className="text-muted" />
            Journal entry
          </span>
        </div>
      ) : null}
      <DaySheet
        open={openDay !== undefined}
        onClose={() => setOpenDay(undefined)}
        titleId={sheetId}
      >
        {openDay !== undefined ? (
          <DayDetail
            date={openDay}
            headingId={sheetId}
            model={model}
            trades={trades}
            currency={currency}
            fmt={fmt}
          />
        ) : null}
      </DaySheet>
    </WidgetFrame>
  );
}

export const Calendar = () => (
  <MonthCard widgetKey="calendar" advanced={false} />
);
export const CalendarAdvanced = () => (
  <MonthCard widgetKey="calendar-adv" advanced />
);

/**
 * 6A's mini calendar, the whole month whatever the date range: the days with
 * trades underlined by how they ended, today bold. A day opens its Day view on
 * that date, the filters carried. Its trades are the day trades of the shown
 * currency, which stands in for the base currency here, so the days read in it.
 */
export function CalendarMini(): React.JSX.Element {
  const trades = useWidgetValue('calendar-mini');
  const page = useWidgetPage();
  const prefs = usePrefs().data;
  const today = useToday();
  const router = useRouter();
  const { filters } = useGlobalFilters();
  const pageSource = useContext(FigureSourceContext);
  const basis = prefs?.pnlBasis ?? 'net';
  const currency = page?.currency;
  const weekStart = prefs?.weekStart ?? 'sunday';
  const groups = useMemo(() => {
    if (!trades || !prefs || !currency) return undefined;
    return groupDays(trades, {
      timeZone: prefs.timeZone,
      baseCurrency: currency,
      ctx: metricContextOf(prefs),
      weekStart,
      noteDates: new Set<string>(),
    });
  }, [trades, prefs, currency, weekStart]);
  // The days' figures read the trades they are built from (not the date range's), and, as the header net of the Trades pages is, after costs.
  const source = useMemo<FigureSource | undefined>(
    () =>
      trades && prefs
        ? {
            tradesById: new Map(trades.map((t) => [t.id, t])),
            ctx: { ...metricContextOf(prefs), pnlBasis: 'net' },
            pctBase: pageSource?.pctBase ?? null,
          }
        : undefined,
    [trades, prefs, pageSource?.pctBase],
  );
  if (!groups || !source || !today) return <Loading k="calendar-mini" />;
  return (
    <section
      data-widget="calendar-mini"
      aria-label={WIDGET_TITLES['calendar-mini']}
      className={`${CARD} ${CARD_PAD} min-w-0`}
    >
      <FigureSourceContext.Provider value={source}>
        <MiniCalendar
          bare
          groups={groups}
          today={today}
          weekStart={weekStart}
          tip={
            <TipGlyph
              id={WIDGETS['calendar-mini'].metric}
              basis={basis}
              name={WIDGET_TITLES['calendar-mini']}
              className=""
            />
          }
          note="Underlined days have trades: green for a net gain, red for a net loss, grey for a flat day. Pick a day to open its Day view."
          onPick={(date) => {
            const query = serializeFilters({
              ...filters,
              range: { from: date, to: date },
            }).toString();
            router.push(`/app/trades/day${query ? `?${query}` : ''}`);
          }}
        />
      </FigureSourceContext.Provider>
    </section>
  );
}

/**
 * The twelve months of a year, the whole year whatever the date range (C13): a
 * square for each day in its tone and each month's net. A month opens the
 * Calendar on it, with the filters carried and, when trades are in several
 * currencies, the one shown here.
 */
export function Year(): React.JSX.Element {
  const trades = useWidgetValue('year');
  const page = useWidgetPage();
  const prefs = usePrefs().data;
  const display = useDisplay();
  const today = useToday();
  const { filters } = useGlobalFilters();
  const [chosen, setChosen] = useState<number>();
  const thisYear = today ? Number(today.slice(0, 4)) : undefined;
  const year = chosen ?? thisYear;
  const currency = page?.currency;
  const pctBase = usePctBase(year ? `${year}-01-01` : undefined, currency);
  const ctx = useMemo(
    () => (prefs ? metricContextOf(prefs) : undefined),
    [prefs],
  );
  const months = useMemo(
    () => (trades && ctx && year ? calendarYear(trades, year, ctx) : undefined),
    [trades, ctx, year],
  );
  if (!months || !page || !year || !currency) return <Loading k="year" />;

  const fmt = monthFormat(display, pctBase, currency);
  const net = months.reduce((n, m) => n + m.net, 0);
  // The year's R and units, summed as each month's are: a unit no month has stays empty.
  const sum = (u: 'r' | 'ticks' | 'pips' | 'points') => {
    const have = months.flatMap((m) => m[u] ?? []);
    return have.length === 0 ? null : have.reduce((a, b) => a + b, 0);
  };
  const traded = months.reduce(
    (n, m) => n + m.days.filter((d) => d.trades > 0).length,
    0,
  );
  const links = serializeFilters(filters);
  if (page.currencies.length > 1) links.set('cur', currency);
  const filterQuery = queryString(links);
  return (
    <WidgetFrame
      widgetKey="year"
      title={String(year)}
      about={WIDGET_TITLES.year}
      tip={WIDGETS.year.metric}
      caption={
        <>
          {traded} trading {plural(traded, 'day')}, net{' '}
          <b className={`font-semibold ${signTone(net)}`}>
            <FigureText
              f={fmt(net, sum('r'), false, {
                ticks: sum('ticks'),
                pips: sum('pips'),
                points: sum('points'),
              })}
            />
          </b>
        </>
      }
      end={<Arrows unit="year" onStep={(by) => setChosen(year + by)} />}
    >
      <div className="mt-4">
        <YearGrid
          year={year}
          months={months}
          fmt={fmt}
          dense
          hrefFor={(month) =>
            `/app/calendar?month=${month}${filterQuery ? `&${filterQuery}` : ''}`
          }
        />
      </div>
      <p className="mt-3 text-[12px] text-faint">
        A month opens in the Calendar. The whole year shows, whatever the date
        range.
      </p>
    </WidgetFrame>
  );
}

export const CALENDAR_RENDER = {
  calendar: Calendar,
  'calendar-mini': CalendarMini,
  'calendar-adv': CalendarAdvanced,
  year: Year,
} satisfies Partial<Record<WidgetKey, WidgetRender>>;

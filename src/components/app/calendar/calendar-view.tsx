'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  NotePencil,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Suspense,
  useEffect,
  useId,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { FigureText } from '@/components/product/figure-text';
import { buttonClasses } from '@/components/ui/button-styles';
import { Segmented } from '@/components/ui/segmented';
import { MetricTip } from '@/components/ui/metric-tip';
import {
  calendarMonth,
  dayExits,
  dayGrading,
  type CalendarDay,
} from '@/data/calendar';
import { serializeFilters } from '@/data/filters';
import { monthReportHref } from '@/data/report-links';
import { metricContextOf } from '@/data/metrics';
import { useGlobalFilters, useTradeSet } from '@/data/query/derived';
import {
  useAccounts,
  useCashFlows,
  useJournal,
  usePrefs,
  useStrategies,
  useTagCategories,
  useTags,
  useTrades,
  useUpdatePrefs,
} from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import { localDate } from '@/domain/time';
import { pctBaseOf, useDisplay } from '@/lib/display';
import { useAddressCopy } from '@/lib/use-address-copy';
import { formatPct, plural } from '@/lib/format';
import { onTradingDate } from '@/lib/time-format';
import { CARD } from '../dashboard/shared';
import {
  DaySheet,
  ICON_BUTTON,
  StatsMenu,
  TEXT_BUTTON,
} from './calendar-controls';
import { DayPanel } from './day-panel';
import { MonthPanel } from './month-panel';
import { dayLabel, MonthGrid } from './month-grid';
import { monthFormat } from './month-format';
import { CalendarSnapshot } from './snapshot-panel';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Writes `?month` and `?day`, keeping every other parameter (the filters). */
function writeParams(patch: Record<string, string | null>): void {
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (qs ? `?${qs}` : ''),
  );
}

/** Whether `date` is a real calendar date: 2026-02-31 is not. */
function realDate(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** The `?day` value when it is a real date. */
function dayOf(search: string) {
  const param = new URLSearchParams(search).get('day');
  return param !== null && DAY.test(param) && realDate(param)
    ? param
    : undefined;
}

/** The `?month` value when it is a month, else the month of `?day`, else this month. */
function monthOf(search: string, today: string | undefined) {
  const param = new URLSearchParams(search).get('month');
  if (param !== null && MONTH.test(param)) return param;
  return dayOf(search)?.slice(0, 7) ?? today?.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Whether the viewport is `xl` (1280px) or wider, where the day panel sits
 * beside the grid. Narrower, the panel is a sheet and the grid keeps the full
 * width for its in-cell figures. Prerenders as wide.
 */
const WIDE = '(min-width: 1280px)';
function useDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = matchMedia(WIDE);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () => matchMedia(WIDE).matches,
    () => true,
  );
}

function Skeleton(): React.JSX.Element {
  return (
    <div data-testid="calendar-loading" aria-busy="true" className="px-5 pb-5">
      <div className={`${CARD} h-[640px] animate-pulse bg-sunken/60`} />
    </div>
  );
}

function Kpi({
  label,
  children,
  small,
  action,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  small: React.ReactNode;
  /** A link under the figure. */
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-w-0 py-1 sm:shrink-0 sm:border-l sm:border-line sm:px-3 sm:first:border-l-0 sm:first:pl-0 @[760px]/cal:sm:px-5">
      <span className="text-[12.5px] text-faint">{label}</span>
      <b className="block text-[19px] whitespace-nowrap leading-tight font-semibold tracking-[-0.03em] tabular-nums">
        {children}
      </b>
      <small className="block truncate text-[12px] text-muted">{small}</small>
      {action}
    </div>
  );
}

const toneInk = (n: number) =>
  n < 0 ? 'text-loss' : n > 0 ? 'text-gain' : 'text-text';

/**
 * The Calendar on the URL's filters. Render inside `<Suspense>`: it reads the
 * search params (`?month=YYYY-MM`, `?day=YYYY-MM-DD`).
 */
export function CalendarView(): React.JSX.Element {
  const { filters } = useGlobalFilters();
  const set = useTradeSet(filters);
  const prefs = usePrefs().data;
  const notes = useJournal().data;
  const tradesQuery = useTrades();
  const allTrades = tradesQuery.data;
  const accounts = useAccounts().data;
  const flowsQuery = useCashFlows();
  const flows = flowsQuery.data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const tagCategories = useTagCategories().data;
  const search = useSearchParams().toString();
  const updatePrefs = useUpdatePrefs();
  const queryClient = useQueryClient();
  const display = useDisplay();
  const desktop = useDesktop();
  const titleId = useId();

  const timeZone = prefs?.timeZone;
  const today =
    timeZone === undefined
      ? undefined
      : localDate(new Date().toISOString(), timeZone);
  const addressMonth = useMemo(() => monthOf(search, today), [search, today]);
  // The arrows move the shown month at once and it follows the address when
  // that changes, so two quick clicks move two months.
  const [month, setMonth] = useAddressCopy(addressMonth, addressMonth ?? '');
  const day = dayOf(search);
  const hasDayParam = new URLSearchParams(search).has('day');
  // The currency is in the address (`?cur`), as on Reports, so a link from
  // one carries it to the other.
  const picked = new URLSearchParams(search).get('cur') ?? undefined;

  const dayTrades = set.data?.dayTrades;
  const currencies = useMemo(
    () => [...new Set((dayTrades ?? []).map((t) => t.pnlCurrency))].sort(),
    [dayTrades],
  );
  const baseCurrency = prefs?.baseCurrency ?? 'USD';
  const currency =
    picked !== undefined && currencies.includes(picked)
      ? picked
      : currencies.includes(baseCurrency)
        ? baseCurrency
        : (currencies[0] ?? baseCurrency);

  const model = useMemo(() => {
    if (
      !dayTrades ||
      !prefs ||
      !notes ||
      month === undefined ||
      today === undefined
    )
      return undefined;
    // The month shows every one of its days: the page's date range does not clip it.
    const ctx = metricContextOf(prefs);
    const trades = dayTrades.filter((t) => t.pnlCurrency === currency);
    return { ctx, trades, ...calendarMonth(trades, notes, month, ctx) };
  }, [dayTrades, prefs, notes, month, currency, today]);

  // With no ?day the panel opens on today if it has trades, else the latest day that has.
  // Only where the panel sits beside the grid: below xl it is a sheet, and a sheet must not open by itself.
  const defaultDay = useMemo(() => {
    if (!model || today === undefined) return undefined;
    const live = model.weeks
      .flatMap((w) => w.days)
      .filter((d): d is CalendarDay => d !== null && d.trades > 0);
    return (
      live.find((d) => d.date === today)?.date ??
      live.reduce<string | undefined>(
        (latest, d) =>
          latest === undefined || d.date > latest ? d.date : latest,
        undefined,
      )
    );
  }, [model, today]);
  useEffect(() => {
    // replaceState: the default is where the page starts, not a step Back should undo.
    if (desktop && !hasDayParam && defaultDay !== undefined)
      writeParams({ day: defaultDay });
  }, [desktop, hasDayParam, defaultDay]);

  const accountIds = set.data?.filters.accountIds;
  const pctBase = useMemo(
    () =>
      accounts && flows && allTrades && prefs && month
        ? pctBaseOf({
            accounts,
            flows,
            trades: allTrades,
            accountIds: accountIds ?? [],
            currency,
            from: `${month}-01`,
            timeZone: prefs.timeZone,
          })
        : null,
    [accounts, flows, allTrades, prefs, month, currency, accountIds],
  );

  // The % base reads every trade and the flows: a failed read is not a quiet fall back to dollars.
  const error = set.error ?? tradesQuery.error ?? flowsQuery.error ?? null;
  if (error)
    return (
      <div role="alert" className={`${CARD} mx-5 p-6 text-[14px] text-text`}>
        <p>Keel couldn&apos;t load the calendar: {error.message}</p>
        <button
          type="button"
          className={`${buttonClasses('secondary', 'sm')} mt-3`}
          onClick={() => {
            if (error instanceof StorageUnavailableError)
              window.location.reload();
            else void queryClient.resetQueries({ queryKey: ['keel'] });
          }}
        >
          Try again
        </button>
      </div>
    );
  if (
    !model ||
    !prefs ||
    !set.data ||
    today === undefined ||
    month === undefined
  )
    return <Skeleton />;

  const fmt = monthFormat(display, pctBase, currency);
  const stats = prefs.calendarStats;
  const { weeks, summary, trades, ctx } = model;
  const monthName = onTradingDate(
    `${month}-01`,
    { month: 'long', year: 'numeric' },
    'en-US',
  );
  const thisMonth = today.slice(0, 7);
  const goMonth = (next: string) => {
    setMonth(next);
    writeParams({ month: next === thisMonth ? null : next, day: null });
  };
  // A pick counts only inside the shown month.
  const selected = weeks
    .flatMap((w) => w.days)
    .find((d) => d !== null && d.date === day);
  const exits = selected ? dayExits(trades, selected.date, ctx) : [];
  const stillOpen = selected
    ? trades.filter(
        (t) =>
          t.status === 'open' &&
          localDate(t.openedAt, ctx.timeZone) === selected.date &&
          !exits.some((e) => e.trade.id === t.id),
      ).length
    : 0;
  const range = prefs.breakevenRange;
  const rangeText =
    range.unit === 'amount'
      ? range.from === range.to
        ? `exactly ${fmt(range.from).text}`
        : `${fmt(range.from).text} to ${fmt(range.to).text}`
      : `${range.from * 100}% to ${range.to * 100}%`;
  const filterQuery = serializeFilters(set.data.filters).toString();
  // With several currencies the links open Reports on the one shown here.
  const cur = currencies.length > 1 ? currency : undefined;
  const monthHref = monthReportHref(set.data.filters, month, cur);
  const yearQuery = [filterQuery, cur ? `cur=${cur}` : '']
    .filter(Boolean)
    .join('&');
  const yearHref = `/app/reports/calendar${yearQuery ? `?${yearQuery}` : ''}`;
  const panel = selected ? (
    <DayPanel
      date={selected.date}
      day={selected}
      exits={exits}
      grading={dayGrading(
        exits,
        strategies ?? [],
        tags ?? [],
        tagCategories ?? [],
        ctx,
      )}
      currency={currency}
      stillOpen={stillOpen}
      fmt={fmt}
      basis={ctx.pnlBasis}
      timeZone={ctx.timeZone}
      filters={set.data.filters}
      headingId={titleId}
      inSheet={!desktop}
    />
  ) : null;
  const best = summary.best;
  const worst = summary.worst;
  // The closest month with a trade, for a month that has none: the one before, else the one after.
  const nearby = (() => {
    const months = [
      ...new Set(
        trades.map((t) =>
          localDate(t.closedAt ?? t.openedAt, ctx.timeZone).slice(0, 7),
        ),
      ),
    ].sort();
    const m =
      months.findLast((x) => x < month) ?? months.find((x) => x > month);
    return m === undefined
      ? undefined
      : {
          month: m,
          name: onTradingDate(
            `${m}-01`,
            { month: 'long', year: 'numeric' },
            'en-US',
          ),
        };
  })();

  return (
    <div
      data-testid="calendar-ready"
      className="grid min-w-0 gap-4 px-5 pt-1 pb-5 lg:pt-0 xl:grid-cols-[minmax(0,1fr)_300px] min-[1400px]:grid-cols-[minmax(0,1fr)_350px]"
    >
      <section
        aria-label={monthName}
        className={`${CARD} @container/cal min-w-0 p-4 sm:p-5`}
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <h2 className="mr-1 text-[17px] font-semibold tracking-[-0.02em] text-text">
            {monthName}
          </h2>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Previous month"
              className={ICON_BUTTON}
              onClick={() => goMonth(shiftMonth(month, -1))}
            >
              <CaretLeft size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              className={ICON_BUTTON}
              onClick={() => goMonth(shiftMonth(month, 1))}
            >
              <CaretRight size={15} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className={TEXT_BUTTON}
            onClick={() => goMonth(thisMonth)}
          >
            This month
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {currencies.length > 1 ? (
              <Segmented
                label="Currency"
                options={currencies.map((c) => ({ value: c, label: c }))}
                value={currency}
                onChange={(c) => writeParams({ cur: c })}
                coarseTargets
              />
            ) : null}
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
            <Link href={yearHref} className={TEXT_BUTTON}>
              <CalendarBlank
                size={15}
                aria-hidden="true"
                className="text-faint"
              />
              Year view
            </Link>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-line py-3 sm:flex sm:flex-wrap sm:gap-x-0 sm:gap-y-3">
          <Kpi
            label={<MetricTip id="pnl" basis={ctx.pnlBasis} />}
            small={`${summary.trades} ${plural(summary.trades, 'trade')}`}
          >
            <span className={toneInk(summary.net)}>
              <FigureText f={fmt(summary.net, summary.r, false, summary)} />
            </span>
          </Kpi>
          <Kpi
            label={<MetricTip id="trading-days" basis={ctx.pnlBasis} />}
            small={
              summary.tradingDays === 0
                ? 'None this month'
                : `${summary.greenDays} green, ${summary.redDays} red, ${summary.flatDays} flat`
            }
          >
            {summary.tradingDays}
          </Kpi>
          <Kpi
            label={
              <MetricTip id="win-rate" basis={ctx.pnlBasis}>
                Trade win rate
              </MetricTip>
            }
            small={`${summary.wins} ${plural(summary.wins, 'winner')}, ${summary.losses} ${plural(summary.losses, 'loser')}`}
            action={
              <Link
                href={monthHref}
                className="mt-0.5 inline-flex min-h-6 items-center rounded-chip text-[12.5px] font-semibold text-accent-ink outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
              >
                Month in Reports
              </Link>
            }
          >
            {summary.winRate === null ? 'None' : formatPct(summary.winRate, 1)}
          </Kpi>
          <Kpi
            label={<MetricTip id="best-day" basis={ctx.pnlBasis} />}
            small={best ? dayLabel(best.date) : 'No trades'}
          >
            {best ? (
              <span className={toneInk(best.net)}>
                <FigureText f={fmt(best.net, best.r, false, best)} />
              </span>
            ) : (
              <span className="text-faint">None</span>
            )}
          </Kpi>
          <Kpi
            label={<MetricTip id="worst-day" basis={ctx.pnlBasis} />}
            small={worst ? dayLabel(worst.date) : 'No trades'}
          >
            {worst ? (
              <span className={toneInk(worst.net)}>
                <FigureText f={fmt(worst.net, worst.r, false, worst)} />
              </span>
            ) : (
              <span className="text-faint">None</span>
            )}
          </Kpi>
        </div>

        {allTrades?.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-muted">
            No trades yet.{' '}
            <Link
              href="/app/import"
              className="font-semibold text-accent-ink hover:underline"
            >
              Import some
            </Link>{' '}
            and each day fills in on the date it exits.
          </p>
        ) : null}

        <MonthGrid
          weekStart={prefs.weekStart}
          label={monthName}
          weeks={weeks}
          stats={stats}
          fmt={fmt}
          currency={currency}
          today={today}
          selected={selected?.date}
          onSelect={(date) => {
            // Beside the grid the panel is never emptied: the picked day stays.
            if (date === selected?.date && desktop) return;
            writeParams({ day: date === selected?.date ? null : date });
          }}
        />

        <div className="mt-3.5 flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[12px] text-muted">
          <span className="inline-flex items-center gap-[7px]">
            <i
              aria-hidden="true"
              className="size-3 rounded-[4px] bg-gain-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--gain-fill)_30%,transparent)]"
            />
            Green day
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <i
              aria-hidden="true"
              className="size-3 rounded-[4px] bg-loss-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--loss-fill)_30%,transparent)]"
            />
            Red day
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <i
              aria-hidden="true"
              className="size-3 rounded-[4px] bg-accent-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
            />
            Breakeven, {rangeText}
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <NotePencil size={15} aria-hidden="true" className="text-muted" />
            Journal entry
          </span>
          <span>Days are booked on the date a trade exits.</span>
          <Link
            href="/app/settings"
            className="rounded-chip text-[12.5px] font-semibold text-accent-ink outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent sm:ml-auto"
          >
            Change breakeven range
          </Link>
        </div>
      </section>

      {desktop ? (
        <aside
          aria-labelledby={
            selected || summary.tradingDays === 0 ? titleId : undefined
          }
          aria-label={
            selected ? undefined : summary.tradingDays === 0 ? undefined : 'Day'
          }
          className={`${CARD} min-w-0 self-start p-5`}
        >
          {panel ??
            (summary.tradingDays === 0 ? (
              <MonthPanel
                headingId={titleId}
                monthName={monthName}
                summary={summary}
                basis={ctx.pnlBasis}
                fmt={fmt}
                nearby={nearby}
                onGo={goMonth}
              />
            ) : (
              <p className="text-[14px] leading-relaxed text-muted">
                Pick a day to see the trades that exited on it, its figures and
                its daily note.
              </p>
            ))}
        </aside>
      ) : (
        <DaySheet
          open={panel !== null}
          onClose={() => writeParams({ day: null })}
          titleId={titleId}
        >
          {panel}
        </DaySheet>
      )}
    </div>
  );
}

/** The page's body: the view behind the Suspense the search params need. */
export function CalendarPage(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton />}>
      <CalendarView />
    </Suspense>
  );
}

'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react/dist/ssr';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Dialog, Popover } from 'radix-ui';
import {
  Suspense,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { FigureText } from '@/components/product/figure-text';
import { buttonClasses } from '@/components/ui/button-styles';
import { Segmented } from '@/components/ui/segmented';
import { MetricTip } from '@/components/ui/metric-tip';
import { TaskCheckbox } from '@/components/ui/task-checkbox';
import { calendarMonth, dayExits } from '@/data/calendar';
import { serializeFilters } from '@/data/filters';
import { metricContextOf } from '@/data/metrics';
import { useGlobalFilters, useTradeSet } from '@/data/query/derived';
import {
  useAccounts,
  useJournal,
  usePrefs,
  useTrades,
  useUpdatePrefs,
} from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import { localDate } from '@/domain/time';
import type { CalendarStat } from '@/domain/types';
import { pctBaseOf, useDisplay } from '@/lib/display';
import { formatPct, plural } from '@/lib/format';
import { enter, exit } from '@/lib/motion';
import { onTradingDate } from '@/lib/time-format';
import { CARD } from '../dashboard/shared';
import { DayPanel } from './day-panel';
import {
  dayLabel,
  MonthGrid,
  STAT_LABELS,
  type FormatMoney,
} from './month-grid';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_STATS = 3;
const STAT_ORDER: readonly CalendarStat[] = [
  'net',
  'trades',
  'winRate',
  'r',
  'fees',
];

const ICON_BUTTON =
  'inline-grid size-[30px] place-items-center rounded-[8px] border border-line bg-surface-1 text-muted outline-offset-2 transition-colors duration-200 ease-(--ease-glide) hover:border-accent/35 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11';
const TEXT_BUTTON =
  'inline-flex h-[30px] items-center gap-1.5 rounded-[8px] border border-line bg-surface-1 px-3 text-[13px] font-medium text-text outline-offset-2 transition-colors duration-200 ease-(--ease-glide) hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

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

/** The `?month` value when it is a month, else this month. */
function monthOf(search: string, today: string | undefined) {
  const param = new URLSearchParams(search).get('month');
  return param !== null && MONTH.test(param) ? param : today?.slice(0, 7);
}

/** The `?day` value when it is a date. */
function dayOf(search: string) {
  const param = new URLSearchParams(search).get('day');
  return param !== null && DAY.test(param) ? param : undefined;
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Whether the viewport is `lg` or wider. Prerenders as wide. */
function useDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = matchMedia('(min-width: 1024px)');
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () => matchMedia('(min-width: 1024px)').matches,
    () => true,
  );
}

function StatsMenu({
  stats,
  onChange,
}: {
  stats: readonly CalendarStat[];
  onChange(next: CalendarStat[]): void;
}): React.JSX.Element {
  return (
    <Popover.Root>
      <Popover.Trigger className={TEXT_BUTTON}>
        <SlidersHorizontal
          size={15}
          aria-hidden="true"
          className="text-faint"
        />
        Stats shown
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] w-[240px] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <p className="text-[12.5px] leading-snug text-muted">
            Up to {MAX_STATS} figures in each day. The first one leads.
          </p>
          <ul aria-label="Stats shown" className="mt-2 flex flex-col gap-0.5">
            {STAT_ORDER.map((key) => {
              const on = stats.includes(key);
              return (
                <li key={key} className="flex min-h-9 items-center">
                  <TaskCheckbox
                    checked={on}
                    disabled={
                      on ? stats.length === 1 : stats.length >= MAX_STATS
                    }
                    onCheckedChange={(next) =>
                      onChange(
                        next ? [...stats, key] : stats.filter((s) => s !== key),
                      )
                    }
                  >
                    {STAT_LABELS[key]}
                  </TaskCheckbox>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The day panel below `lg`: a sheet rising from the bottom edge. */
function DaySheet({
  open,
  onClose,
  titleId,
  children,
}: {
  open: boolean;
  onClose(): void;
  titleId: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-veil"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: enter }}
                exit={{ opacity: 0, transition: exit }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-labelledby={titleId}
              aria-describedby={undefined}
            >
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-[20px] border border-b-0 border-line bg-surface-1 px-5 pt-4 pb-6 shadow-[var(--shadow)] outline-none"
                initial={reduced ? { opacity: 0 } : { y: '100%' }}
                animate={{
                  ...(reduced ? { opacity: 1 } : { y: 0 }),
                  transition: enter,
                }}
                exit={{
                  ...(reduced ? { opacity: 0 } : { y: '100%' }),
                  transition: exit,
                }}
              >
                <Dialog.Close
                  aria-label="Close day"
                  className="absolute top-2.5 right-2.5 inline-grid size-11 place-items-center rounded-control text-muted outline-offset-2 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <X size={18} aria-hidden="true" />
                </Dialog.Close>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
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
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  small: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-w-0 py-1 sm:shrink-0 sm:border-l sm:border-line sm:px-3 sm:first:border-l-0 sm:first:pl-0 @[760px]/cal:sm:px-5">
      <span className="text-[12.5px] text-faint">{label}</span>
      <b className="block text-[19px] whitespace-nowrap leading-tight font-semibold tracking-[-0.03em] tabular-nums">
        {children}
      </b>
      <small className="block truncate text-[12px] text-muted">{small}</small>
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
  const allTrades = useTrades().data;
  const accounts = useAccounts().data;
  const search = useSearchParams().toString();
  const updatePrefs = useUpdatePrefs();
  const queryClient = useQueryClient();
  const display = useDisplay();
  const desktop = useDesktop();
  const titleId = useId();
  const [picked, setPicked] = useState<string>();

  const timeZone = prefs?.timeZone;
  const today =
    timeZone === undefined
      ? undefined
      : localDate(new Date().toISOString(), timeZone);
  const month = useMemo(() => monthOf(search, today), [search, today]);
  const day = dayOf(search);

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
    if (!dayTrades || !prefs || !notes || month === undefined) return undefined;
    const ctx = metricContextOf(prefs);
    const trades = dayTrades.filter((t) => t.pnlCurrency === currency);
    return { ctx, trades, ...calendarMonth(trades, notes, month, ctx) };
  }, [dayTrades, prefs, notes, month, currency]);

  const accountIds = set.data?.filters.accountIds;
  const pctBase = useMemo(
    () =>
      accounts && allTrades && prefs && month
        ? pctBaseOf({
            accounts,
            trades: allTrades,
            accountIds: accountIds ?? [],
            currency,
            from: `${month}-01`,
            timeZone: prefs.timeZone,
          })
        : null,
    [accounts, allTrades, prefs, month, currency, accountIds],
  );

  const error = set.error ?? null;
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

  const fmt: FormatMoney = (money, r) =>
    display.figure(
      { money, pct: pctBase ? money / pctBase : null, r: r ?? null },
      true,
      currency,
    );
  const stats = prefs.calendarStats;
  const { weeks, summary, trades, ctx } = model;
  const monthName = onTradingDate(
    `${month}-01`,
    { month: 'long', year: 'numeric' },
    'en-US',
  );
  const thisMonth = today.slice(0, 7);
  const goMonth = (next: string) =>
    writeParams({ month: next === thisMonth ? null : next, day: null });
  const selected = weeks.flatMap((w) => w.days).find((d) => d?.date === day);
  const selectedDay =
    selected ??
    (day
      ? {
          date: day,
          net: 0,
          gross: 0,
          fees: 0,
          trades: 0,
          wins: 0,
          losses: 0,
          r: null,
          tone: 'none' as const,
          hasNote: false,
        }
      : undefined);
  const exits = day ? dayExits(trades, day, ctx) : [];
  const stillOpen = day
    ? trades.filter(
        (t) =>
          t.status === 'open' &&
          localDate(t.openedAt, ctx.timeZone) === day &&
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
  const yearHref = `/app/reports/calendar${filterQuery ? `?${filterQuery}` : ''}`;
  const panel =
    day && selectedDay ? (
      <DayPanel
        date={day}
        day={selectedDay}
        exits={exits}
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

  return (
    <div
      data-testid="calendar-ready"
      className="grid min-w-0 gap-4 px-5 pt-1 pb-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:pt-0 min-[1400px]:grid-cols-[minmax(0,1fr)_350px]"
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
                onChange={setPicked}
                coarseTargets
              />
            ) : null}
            <StatsMenu
              stats={stats}
              onChange={(next) => updatePrefs.mutate({ calendarStats: next })}
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
              <FigureText f={fmt(summary.net, summary.r)} />
            </span>
          </Kpi>
          <Kpi
            label="Trading days"
            small={
              summary.tradingDays === 0
                ? 'None this month'
                : `${summary.greenDays} green, ${summary.redDays} red, ${summary.flatDays} flat`
            }
          >
            {summary.tradingDays}
          </Kpi>
          <Kpi
            label="Green days"
            small={`${summary.greenDays} of ${summary.tradingDays} green days`}
          >
            {summary.tradingDays === 0
              ? 'None'
              : formatPct(summary.greenDays / summary.tradingDays, 1)}
          </Kpi>
          <Kpi
            label="Best day"
            small={best ? dayLabel(best.date) : 'No trades'}
          >
            {best ? (
              <span className={toneInk(best.net)}>
                <FigureText f={fmt(best.net, best.r)} />
              </span>
            ) : (
              <span className="text-faint">None</span>
            )}
          </Kpi>
          <Kpi
            label="Worst day"
            small={worst ? dayLabel(worst.date) : 'No trades'}
          >
            {worst ? (
              <span className={toneInk(worst.net)}>
                <FigureText f={fmt(worst.net, worst.r)} />
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
          label={monthName}
          weeks={weeks}
          stats={stats}
          fmt={fmt}
          today={today}
          selected={day}
          onSelect={(date) => writeParams({ day: date === day ? null : date })}
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
          aria-labelledby={day ? titleId : undefined}
          aria-label={day ? undefined : 'Day'}
          className={`${CARD} min-w-0 self-start p-5`}
        >
          {panel ?? (
            <p className="text-[14px] leading-relaxed text-muted">
              Pick a day to see the trades that exited on it, its figures and
              its daily note.
            </p>
          )}
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

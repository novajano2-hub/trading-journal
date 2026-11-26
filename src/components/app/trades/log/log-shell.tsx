'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  FunnelSimple,
  Table as TableIcon,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { unitEmptyCopy } from '@/content/display-units';
import {
  EMPTY_FILTERS,
  resolveRange,
  serializeFilters,
  type GlobalFilters,
} from '@/data/filters';
import { metricContextOf } from '@/data/metrics';
import { usePrefs } from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import { isTradeUnit } from '@/domain/metrics/units';
import type {
  Account,
  CashFlow,
  Strategy,
  Tag,
  TagCategory,
  Trade,
  UserPrefs,
} from '@/domain/types';
import { pctBaseOf, useDisplay, type FigureSource } from '@/lib/display';
import { usePhone } from '@/lib/use-phone';
import { useWide } from '@/lib/use-wide';
import { PlanTheDay } from '../../routine/plan-the-day';
import { hasActiveFilters } from '../../filter-model';
import { CARD } from '../../dashboard/shared';
import type { CellEnv } from '../columns';
import { StateBlock } from '../trades-view';
import { rowFacts } from '@/data/trade-rows';
import { AddTradeLink } from './add-trade-link';
import { TradesSwitch } from './trades-switch';

/*
 * What the Day and Week views share: the loading and error states, the page
 * shell (the switch row pinned under the top bar, the phone action row, the
 * aside slot), the empty states, the paging and the cell environment.
 */

export function LogSkeleton(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading your trades"
      className="flex flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0"
    >
      <div className={`${CARD} h-[104px]`} aria-hidden="true" />
      <div className={`${CARD} h-[240px]`} aria-hidden="true" />
    </div>
  );
}

/** The state a failed load shows: storage that cannot open, or any other error, with a way to retry. */
export function LogLoadError({ error }: { error: unknown }): React.JSX.Element {
  const queryClient = useQueryClient();
  return (
    <StateBlock
      role="alert"
      icon={Warning}
      title={
        error instanceof StorageUnavailableError
          ? "Keel can't open storage in this browser, so your workspace can't load."
          : "Your trades couldn't load."
      }
      actions={
        <Button
          variant="secondary"
          onClick={() => {
            if (error instanceof StorageUnavailableError)
              window.location.reload();
            else void queryClient.resetQueries({ queryKey: ['keel'] });
          }}
        >
          Try again
        </Button>
      }
    />
  );
}

/**
 * The figure source both views hand `useDisplay`. The header net is always
 * after costs, whatever the P&L basis: figures read the net-basis context.
 */
export function figureSourceOf(args: {
  trades: readonly Trade[];
  prefs: UserPrefs;
  accounts: Account[];
  flows: CashFlow[];
  allTrades: Trade[];
  filters: GlobalFilters;
  today: string;
}): FigureSource {
  const { prefs, filters } = args;
  return {
    tradesById: new Map(args.trades.map((t) => [t.id, t])),
    ctx: { ...metricContextOf(prefs), pnlBasis: 'net' },
    pctBase: pctBaseOf({
      accounts: args.accounts,
      flows: args.flows,
      trades: args.allTrades,
      accountIds: filters.accountIds,
      currency: prefs.baseCurrency,
      from: resolveRange(filters.range, args.today, prefs.weekStart ?? 'sunday')
        .from,
      timeZone: prefs.timeZone,
    }),
  };
}

/** The lists the table cells read their facts from. */
export interface LogLists {
  accounts: Account[];
  strategies: Strategy[];
  tags: Tag[];
  categories: TagCategory[];
}

/** The table cells' environment: the zone, the metrics context, the display and the row facts. */
export function useCellEnv(lists: LogLists, shortDay = false): CellEnv {
  const prefs = usePrefs().data!;
  const display = useDisplay();
  const ctx = metricContextOf(prefs);
  const timeZone = prefs.timeZone;
  const facts = useMemo(
    () => rowFacts({ timeZone, ctx: metricContextOf(prefs), ...lists }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      timeZone,
      prefs,
      lists.accounts,
      lists.strategies,
      lists.tags,
      lists.categories,
    ],
  );
  return { timeZone, ctx, display, facts, ...(shortDay ? { shortDay } : {}) };
}

/**
 * Cards or weeks shown so far, more on scroll or from a Show more button; a
 * changed filter starts the list again at `first`. Keel's call (TradeZella
 * unknown): the record is silent on paging.
 */
export function usePaged(
  total: number,
  filters: GlobalFilters,
  first: number,
  more: number,
) {
  const [shown, setShown] = useState(first);
  const sentinel = useRef<HTMLDivElement>(null);
  const filterKey = serializeFilters(filters).toString();
  const lastKey = useRef(filterKey);
  useEffect(() => {
    if (lastKey.current === filterKey) return;
    lastKey.current = filterKey;
    setShown(first);
  }, [filterKey, first]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => n + more);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, total, more]);

  return {
    shown,
    showMore: () => setShown((n) => n + more),
    sentinel,
    hasMore: total > shown,
  };
}

/** The Show more row that ends a paged list. */
export function ShowMore({
  sentinel,
  onClick,
}: {
  sentinel: React.RefObject<HTMLDivElement | null>;
  onClick(): void;
}): React.JSX.Element {
  return (
    <div ref={sentinel} className="flex justify-center py-2">
      <Button variant="secondary" onClick={onClick}>
        Show more
      </Button>
    </div>
  );
}

/**
 * The page around a log view: the Day / Week / All switch pinned at the top
 * bar with the columns menu and Add trade beside it, the phone action row
 * (the Calendar button goes first), and the aside (the mini calendar) beside
 * the list, pinned as the switch is. The record has the calendar in the right
 * column only; Keel's call (TradeZella unknown): below `xl` the column would
 * either sit under a list that pages on, out of reach, or squeeze the day
 * cards' figures, so the calendar waits behind `calendarAction` (the Calendar
 * button, in the phone row and, from `sm`, by the columns menu) and opens as
 * a sheet.
 */
export function LogShell({
  view,
  columnsMenu,
  aside,
  calendarAction,
  children,
}: {
  view: 'day' | 'week';
  columnsMenu: React.ReactNode;
  aside?: React.ReactNode;
  calendarAction?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  const phone = usePhone();
  const wide = useWide();
  const row = useRef<HTMLDivElement>(null);
  // The switch row's height, on the page: the aside sits under it when both are
  // pinned, and a focused control clears it (globals.css, with the bar's).
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty('--log-switch', `${el.offsetHeight}px`);
    publish();
    const unpublish = () => root.style.removeProperty('--log-switch');
    if (typeof ResizeObserver === 'undefined') return unpublish;
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      unpublish();
    };
  }, []);
  // The column is built only where it shows (from xl): a hidden one would still
  // group every trade again at each filter change.
  const column = aside !== undefined && !phone && wide;
  return (
    <div className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0">
      <div
        ref={row}
        data-pinned=""
        className="sticky top-[var(--top-bar,56px)] z-20 -mx-5 bg-bg px-5 py-2 sm:top-[var(--top-bar,68px)]"
      >
        <div className="flex items-center gap-2.5">
          <div className="max-sm:flex-1">
            <TradesSwitch view={view} />
          </div>
          {phone ? null : (
            <div className="ml-auto flex items-center gap-2">
              {wide ? null : calendarAction}
              {columnsMenu}
              <AddTradeLink />
            </div>
          )}
        </div>
      </div>
      {phone ? (
        <div className="flex items-center gap-1.5">
          {/* Sized by their labels, then sharing what is left; tighter padding so three fit 390px. */}
          {calendarAction ? (
            <div className="min-w-0 flex-auto [&>button]:w-full [&>button]:px-2!">
              {calendarAction}
            </div>
          ) : null}
          <div className="min-w-0 flex-auto [&_button]:px-2!">
            <PlanTheDay wide />
          </div>
          <AddTradeLink className="min-w-0 flex-auto px-2!" />
        </div>
      ) : null}

      <div
        className={
          column
            ? 'grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]'
            : ''
        }
      >
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
        {column ? (
          <div className="sticky top-[calc(var(--top-bar,68px)+var(--log-switch,52px))]">
            {aside}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The empty list: no trades at all (with Import), a display unit that leaves them out, or filters that match none. */
export function LogEmpty({
  noTradesAtAll,
  unitLeftOut,
  filters,
  onFilters,
  noun,
}: {
  noTradesAtAll: boolean;
  unitLeftOut: number;
  filters: GlobalFilters;
  onFilters(next: GlobalFilters): void;
  /** What the Import copy says the list will show: days or weeks. */
  noun: 'days' | 'weeks';
}): React.JSX.Element {
  const prefs = usePrefs().data!;
  const narrowed =
    unitLeftOut > 0 && isTradeUnit(prefs.displayUnit)
      ? prefs.displayUnit
      : undefined;
  const clear = (
    <Button onClick={() => onFilters(EMPTY_FILTERS)}>Clear filters</Button>
  );
  if (noTradesAtAll)
    return (
      <StateBlock
        icon={TableIcon}
        title="No trades yet."
        body={`Import a CSV from your broker to see your ${noun} here.`}
        actions={
          <Link href="/app/import" className={buttonClasses('primary')}>
            Import
          </Link>
        }
      />
    );
  if (narrowed)
    return (
      <StateBlock
        icon={FunnelSimple}
        {...unitEmptyCopy(narrowed, 'closed')}
        actions={hasActiveFilters(filters) ? clear : undefined}
      />
    );
  // Keel's call (TradeZella unknown): the record is silent for Day and Week; matches Keel's All view.
  return (
    <StateBlock
      icon={FunnelSimple}
      title="No trades match these filters."
      actions={clear}
    />
  );
}

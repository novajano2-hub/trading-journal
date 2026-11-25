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
import { groupDays, type DayGroup } from '@/data/day-log';
import {
  advancedFilterCount,
  EMPTY_FILTERS,
  resolveRange,
  serializeFilters,
  type GlobalFilters,
} from '@/data/filters';
import { metricContextOf } from '@/data/metrics';
import { useGlobalFilters, useTradeSet } from '@/data/query/derived';
import {
  useAccounts,
  useCashFlows,
  useDays,
  useJournal,
  usePrefs,
  useStrategies,
  useTagCategories,
  useTags,
  useTrades,
  useUpdatePrefs,
} from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import {
  DAY_CHOICES,
  DAY_COLUMNS,
  sanitizeDayColumns,
  type ColumnId,
} from '@/data/trade-columns';
import { rowFacts } from '@/data/trade-rows';
import { isTradeUnit } from '@/domain/metrics/units';
import { localDate } from '@/domain/time';
import type {
  Account,
  DayRecord,
  Strategy,
  Tag,
  TagCategory,
} from '@/domain/types';
import {
  FigureSourceContext,
  pctBaseOf,
  useDisplay,
  type FigureSource,
} from '@/lib/display';
import { usePhone } from '@/lib/use-phone';
import { PlanTheDay } from '../../routine/plan-the-day';
import { hasActiveFilters } from '../../filter-model';
import { CARD } from '../../dashboard/shared';
import { ColumnsMenu } from '../columns-menu';
import type { CellEnv } from '../columns';
import { StateBlock } from '../trades-view';
import { AddTradeLink } from './add-trade-link';
import { DayCard } from './day-card';
import { LogEnvContext } from './log-env';
import { TradesSwitch } from './trades-switch';

/** TradeZella shows no paging; Keel loads 20 cards and more on scroll (Keel's call, the record is silent). */
const FIRST = 20;
const MORE = 20;

/**
 * Whether a filter other than the date range and the account selection is on.
 * Keel's call (TradeZella unknown): a day note is the workspace's, so only the
 * date range and the accounts leave note-only days in.
 */
export function tradeLevelFilterActive(f: GlobalFilters): boolean {
  return (
    f.symbols.length > 0 ||
    f.side !== undefined ||
    f.strategyIds.length > 0 ||
    f.tagIds.length > 0 ||
    advancedFilterCount(f) > 0
  );
}

function Skeleton(): React.JSX.Element {
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

/**
 * The trade log by day: cards newest first, each collapsed until opened.
 * Render inside `<Suspense>`: it reads the URL's filters. `aside` is where the
 * mini calendar goes, `noteAction` the card's Add note or View note.
 */
export function TradesDayView({
  aside,
  noteAction,
}: {
  aside?: React.ReactNode;
  noteAction?: (date: string) => React.ReactNode;
}): React.JSX.Element {
  const { filters, setFilters } = useGlobalFilters();
  const set = useTradeSet(filters);
  const tradesQuery = useTrades();
  const flowsQuery = useCashFlows();
  const prefs = usePrefs().data;
  const accounts = useAccounts().data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const categories = useTagCategories().data;
  const journal = useJournal().data;
  const days = useDays().data;
  const queryClient = useQueryClient();

  const timeZone = prefs?.timeZone;
  const ctx = useMemo(
    () => (prefs ? metricContextOf(prefs) : undefined),
    [prefs],
  );
  const range = set.data?.filters.range;
  const weekStart = prefs?.weekStart;
  const today =
    timeZone === undefined
      ? undefined
      : localDate(new Date().toISOString(), timeZone);
  const levelFilter = tradeLevelFilterActive(filters);

  // The dates of daily notes (not in Trash), inside the date range; none while a trade-level filter is on.
  const noteDates = useMemo(() => {
    const out = new Set<string>();
    if (!journal || !range || today === undefined || levelFilter) return out;
    const { from, to } = resolveRange(range, today, weekStart ?? 'sunday');
    for (const e of journal) {
      if (e.kind !== 'daily-review' || e.date === undefined) continue;
      if (e.deletedAt !== undefined) continue;
      if (from !== undefined && e.date < from) continue;
      if (to !== undefined && e.date > to) continue;
      out.add(e.date);
    }
    return out;
  }, [journal, range, today, weekStart, levelFilter]);

  const groups = useMemo(
    () =>
      set.data && prefs && ctx
        ? groupDays(set.data.trades, {
            timeZone: prefs.timeZone,
            baseCurrency: prefs.baseCurrency,
            ctx,
            weekStart: prefs.weekStart ?? 'sunday',
            noteDates,
          })
        : undefined,
    [set.data, prefs, ctx, noteDates],
  );

  const error = set.error ?? tradesQuery.error ?? flowsQuery.error;
  if (error)
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
  const allTrades = tradesQuery.data;
  const flows = flowsQuery.data;
  if (
    !set.data ||
    !groups ||
    !allTrades ||
    !flows ||
    !prefs ||
    !ctx ||
    !accounts ||
    !strategies ||
    !tags ||
    !categories ||
    !days ||
    today === undefined
  )
    return <Skeleton />;

  // The header net is always after costs, whatever the P&L basis: figures read the net-basis context.
  const source: FigureSource = {
    tradesById: new Map(set.data.trades.map((t) => [t.id, t])),
    ctx: { ...ctx, pnlBasis: 'net' },
    pctBase: pctBaseOf({
      accounts,
      flows,
      trades: allTrades,
      accountIds: set.data.filters.accountIds,
      currency: prefs.baseCurrency,
      from: resolveRange(set.data.filters.range, today, weekStart ?? 'sunday')
        .from,
      timeZone: prefs.timeZone,
    }),
  };

  return (
    <FigureSourceContext.Provider value={source}>
      <DayList
        groups={groups}
        filters={filters}
        onFilters={setFilters}
        unitLeftOut={set.data.unitLeftOut}
        noTradesAtAll={allTrades.length === 0}
        aside={aside}
        noteAction={noteAction}
        facts={{ accounts, strategies, tags, categories }}
        records={days}
      />
    </FigureSourceContext.Provider>
  );
}

function DayList({
  groups,
  filters,
  onFilters,
  unitLeftOut,
  noTradesAtAll,
  aside,
  noteAction,
  facts: lists,
  records,
}: {
  groups: DayGroup[];
  filters: GlobalFilters;
  onFilters(next: GlobalFilters): void;
  unitLeftOut: number;
  noTradesAtAll: boolean;
  aside?: React.ReactNode;
  noteAction?: (date: string) => React.ReactNode;
  facts: {
    accounts: Account[];
    strategies: Strategy[];
    tags: Tag[];
    categories: TagCategory[];
  };
  records: readonly DayRecord[];
}): React.JSX.Element {
  const prefs = usePrefs().data!;
  const display = useDisplay();
  const phone = usePhone();
  const updatePrefs = useUpdatePrefs();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState(FIRST);
  const sentinel = useRef<HTMLDivElement>(null);

  // A changed filter starts the list again at its first 20.
  const filterKey = serializeFilters(filters).toString();
  const lastKey = useRef(filterKey);
  useEffect(() => {
    if (lastKey.current === filterKey) return;
    lastKey.current = filterKey;
    setShown(FIRST);
  }, [filterKey]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => n + MORE);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, groups.length]);

  const ctx = metricContextOf(prefs);
  const timeZone = prefs.timeZone;
  const pending = updatePrefs.isPending
    ? updatePrefs.variables?.dayColumns
    : undefined;
  const columns: ColumnId[] = useMemo(
    () => sanitizeDayColumns(pending ?? prefs.dayColumns),
    [pending, prefs.dayColumns],
  );
  const factsFor = useMemo(
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
  const env: CellEnv = { timeZone, ctx, display, facts: factsFor };
  const byDate = useMemo(
    () => new Map(records.map((r) => [r.id, r])),
    [records],
  );

  const narrowed =
    unitLeftOut > 0 && isTradeUnit(prefs.displayUnit)
      ? prefs.displayUnit
      : undefined;
  const filtered = hasActiveFilters(filters);
  const clear = (
    <Button onClick={() => onFilters(EMPTY_FILTERS)}>Clear filters</Button>
  );

  const visible = groups.slice(0, shown);
  const toggle = (date: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(date)) next.add(date);
      return next;
    });

  return (
    <LogEnvContext.Provider value={{ env, columns, records: byDate }}>
      <div className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0">
        <div className="sticky top-14 z-20 -mx-5 bg-bg px-5 py-2 sm:top-[68px]">
          <div className="flex items-center gap-2.5">
            <div className="max-sm:flex-1">
              <TradesSwitch view="day" />
            </div>
            {phone ? null : (
              <div className="ml-auto flex items-center gap-2">
                <ColumnsMenu
                  choices={DAY_CHOICES}
                  columns={columns}
                  onChange={(next) => updatePrefs.mutate({ dayColumns: next })}
                  onReset={() =>
                    updatePrefs.mutate({ dayColumns: [...DAY_COLUMNS] })
                  }
                />
                <AddTradeLink />
              </div>
            )}
          </div>
        </div>
        {phone ? (
          <div className="flex items-center gap-2">
            {/* The Calendar button goes first (the mini calendar's sheet). */}
            <div className="flex-1">
              <PlanTheDay wide />
            </div>
            <AddTradeLink className="flex-1" />
          </div>
        ) : null}

        <div
          className={
            aside
              ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]'
              : ''
          }
        >
          <div className="flex min-w-0 flex-col gap-4">
            {groups.length === 0 ? (
              noTradesAtAll && !filtered ? (
                <StateBlock
                  icon={TableIcon}
                  title="No trades yet."
                  body="Import a CSV from your broker to see your days here."
                  actions={
                    <Link
                      href="/app/import"
                      className={buttonClasses('primary')}
                    >
                      Import
                    </Link>
                  }
                />
              ) : narrowed ? (
                <StateBlock
                  icon={FunnelSimple}
                  {...unitEmptyCopy(narrowed, 'closed')}
                  actions={filtered ? clear : undefined}
                />
              ) : (
                <StateBlock
                  icon={FunnelSimple}
                  title="No trades match these filters."
                  actions={clear}
                />
              )
            ) : (
              <>
                {visible.map((g) => (
                  <DayCard
                    key={g.date}
                    group={g}
                    expanded={open.has(g.date)}
                    onToggle={() => toggle(g.date)}
                    noteAction={noteAction?.(g.date)}
                  />
                ))}
                {groups.length > shown ? (
                  <div ref={sentinel} className="flex justify-center py-2">
                    <Button
                      variant="secondary"
                      onClick={() => setShown((n) => n + MORE)}
                    >
                      Show more
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
          {aside}
        </div>
      </div>
    </LogEnvContext.Provider>
  );
}

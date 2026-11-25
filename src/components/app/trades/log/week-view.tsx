'use client';

import { useMemo, useState } from 'react';
import {
  groupDays,
  groupWeeks,
  weekRows,
  type WeekGroup,
  type WeekRows,
} from '@/data/day-log';
import {
  sanitizeColumns,
  sanitizeDayColumns,
  WEEK_CHOICES,
  WEEK_COLUMNS,
  type ColumnId,
} from '@/data/trade-columns';
import { serializeFilters, type GlobalFilters } from '@/data/filters';
import { metricContextOf } from '@/data/metrics';
import { useGlobalFilters, useTradeSet } from '@/data/query/derived';
import {
  useAccounts,
  useCashFlows,
  usePrefs,
  useStrategies,
  useTagCategories,
  useTags,
  useTrades,
  useUpdatePrefs,
} from '@/data/query/hooks';
import type { DayRecord } from '@/domain/types';
import { localDate } from '@/domain/time';
import { FigureSourceContext } from '@/lib/display';
import { useRememberLogView } from '@/lib/log-view';
import { ColumnsMenu } from '../columns-menu';
import { LogEnvContext } from './log-env';
import {
  figureSourceOf,
  LogEmpty,
  LogLoadError,
  LogShell,
  LogSkeleton,
  ShowMore,
  useCellEnv,
  usePaged,
  type LogLists,
} from './log-shell';
import { WeekCard } from './week-card';

/** Keel's call (TradeZella unknown): 8 weeks, then 8 more on scroll or from Show more; the record is silent on paging. */
const FIRST = 8;
const MORE = 8;
const NONE: ReadonlySet<string> = new Set();

/**
 * The trade log by week: cards newest first (weeks with trades only), the
 * first open. Render inside `<Suspense>`: it reads the URL's filters. `aside`
 * is where the mini calendar goes.
 */
export function TradesWeekView({
  aside,
}: {
  aside?: React.ReactNode;
}): React.JSX.Element {
  useRememberLogView('week');
  const { filters, setFilters } = useGlobalFilters();
  const set = useTradeSet(filters);
  const tradesQuery = useTrades();
  const flowsQuery = useCashFlows();
  const prefs = usePrefs().data;
  const accountsQuery = useAccounts();
  const strategiesQuery = useStrategies();
  const tagsQuery = useTags();
  const categoriesQuery = useTagCategories();
  const accounts = accountsQuery.data;
  const strategies = strategiesQuery.data;
  const tags = tagsQuery.data;
  const categories = categoriesQuery.data;

  const ctx = useMemo(
    () => (prefs ? metricContextOf(prefs) : undefined),
    [prefs],
  );
  const today =
    prefs === undefined
      ? undefined
      : localDate(new Date().toISOString(), prefs.timeZone);

  // The tiles, bars and figures cover the filtered trades; no note-only days
  // (a week with a note and no trades has no card).
  const weeks = useMemo(() => {
    if (!set.data || !prefs || !ctx) return undefined;
    const env = {
      timeZone: prefs.timeZone,
      baseCurrency: prefs.baseCurrency,
      ctx,
      weekStart: prefs.weekStart ?? 'sunday',
      noteDates: new Set<string>(),
    };
    return groupWeeks(groupDays(set.data.trades, env), env);
  }, [set.data, prefs, ctx]);

  // R5: the table lists the week's trades under every filter but the date range.
  const rows = useMemo(
    () =>
      set.data && prefs
        ? weekRows(set.data.dayTrades, {
            timeZone: prefs.timeZone,
            baseCurrency: prefs.baseCurrency,
            weekStart: prefs.weekStart ?? 'sunday',
          })
        : new Map<string, WeekRows>(),
    [set.data, prefs],
  );

  // Any failed query ends the skeleton: none of them is optional here.
  const error =
    set.error ??
    tradesQuery.error ??
    flowsQuery.error ??
    accountsQuery.error ??
    strategiesQuery.error ??
    tagsQuery.error ??
    categoriesQuery.error;
  if (error) return <LogLoadError error={error} />;
  const allTrades = tradesQuery.data;
  const flows = flowsQuery.data;
  if (
    !set.data ||
    !weeks ||
    !allTrades ||
    !flows ||
    !prefs ||
    !accounts ||
    !strategies ||
    !tags ||
    !categories ||
    today === undefined
  )
    return <LogSkeleton />;

  const source = figureSourceOf({
    trades: set.data.trades,
    prefs,
    accounts,
    flows,
    allTrades,
    filters: set.data.filters,
    today,
  });

  return (
    <FigureSourceContext.Provider value={source}>
      <WeekList
        weeks={weeks}
        rows={rows}
        filters={filters}
        onFilters={setFilters}
        unitLeftOut={set.data.unitLeftOut}
        noTradesAtAll={allTrades.length === 0}
        aside={aside}
        facts={{ accounts, strategies, tags, categories }}
      />
    </FigureSourceContext.Provider>
  );
}

function WeekList({
  weeks,
  rows,
  filters,
  onFilters,
  unitLeftOut,
  noTradesAtAll,
  aside,
  facts: lists,
}: {
  weeks: WeekGroup[];
  rows: ReadonlyMap<string, WeekRows>;
  filters: GlobalFilters;
  onFilters(next: GlobalFilters): void;
  unitLeftOut: number;
  noTradesAtAll: boolean;
  aside?: React.ReactNode;
  facts: LogLists;
}): React.JSX.Element {
  const prefs = usePrefs().data!;
  const updatePrefs = useUpdatePrefs();
  // The first card starts open and the rest closed (the record, K41); a week
  // here is one the reader has flipped from that.
  // It starts again when the filters change, as the paging does.
  const filterKey = serializeFilters(filters).toString();
  const [flips, setFlips] = useState<{
    key: string;
    weeks: ReadonlySet<string>;
  }>({ key: filterKey, weeks: new Set() });
  const flipped = flips.key === filterKey ? flips.weeks : NONE;
  const paged = usePaged(weeks.length, filters, FIRST, MORE);

  const pending = updatePrefs.isPending
    ? updatePrefs.variables?.weekColumns
    : undefined;
  const columns: ColumnId[] = useMemo(
    () =>
      sanitizeColumns(
        pending ?? prefs.weekColumns,
        WEEK_COLUMNS,
        new Set<string>(WEEK_CHOICES),
      ),
    [pending, prefs.weekColumns],
  );
  const dayColumns = useMemo(
    () => sanitizeDayColumns(prefs.dayColumns),
    [prefs.dayColumns],
  );
  const env = useCellEnv(lists);
  const records = useMemo(() => new Map<string, DayRecord>(), []);

  const toggle = (start: string) => {
    const next = new Set(flipped);
    if (!next.delete(start)) next.add(start);
    setFlips({ key: filterKey, weeks: next });
  };

  return (
    <LogEnvContext.Provider value={{ env, columns, dayColumns, records }}>
      <LogShell
        view="week"
        aside={aside}
        columnsMenu={
          <ColumnsMenu
            choices={WEEK_CHOICES}
            columns={columns}
            defaults={WEEK_COLUMNS}
            onSave={(next) => updatePrefs.mutate({ weekColumns: next })}
          />
        }
      >
        {/* K41, Keel's call (TradeZella unknown): an empty Week view reuses the Day view's empty state. */}
        {weeks.length === 0 ? (
          <LogEmpty
            noun="weeks"
            noTradesAtAll={noTradesAtAll}
            unitLeftOut={unitLeftOut}
            filters={filters}
            onFilters={onFilters}
          />
        ) : (
          <>
            {weeks.slice(0, paged.shown).map((w, i) => (
              <WeekCard
                key={w.start}
                week={w}
                expanded={(i === 0) !== flipped.has(w.start)}
                onToggle={() => toggle(w.start)}
                rows={rows.get(w.start)}
              />
            ))}
            {paged.hasMore ? (
              <ShowMore sentinel={paged.sentinel} onClick={paged.showMore} />
            ) : null}
          </>
        )}
      </LogShell>
    </LogEnvContext.Provider>
  );
}

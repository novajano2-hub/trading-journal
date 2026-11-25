'use client';

import { useMemo, useState } from 'react';
import { groupDays, type DayGroup } from '@/data/day-log';
import {
  advancedFilterCount,
  resolveRange,
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
import {
  DAY_CHOICES,
  DAY_COLUMNS,
  sanitizeDayColumns,
  type ColumnId,
} from '@/data/trade-columns';
import { localDate } from '@/domain/time';
import type { DayRecord } from '@/domain/types';
import { FigureSourceContext } from '@/lib/display';
import { ColumnsMenu } from '../columns-menu';
import { DayCard } from './day-card';
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
  if (error) return <LogLoadError error={error} />;
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
  facts: LogLists;
  records: readonly DayRecord[];
}): React.JSX.Element {
  const prefs = usePrefs().data!;
  const updatePrefs = useUpdatePrefs();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const paged = usePaged(groups.length, filters, FIRST, MORE);

  const pending = updatePrefs.isPending
    ? updatePrefs.variables?.dayColumns
    : undefined;
  const columns: ColumnId[] = useMemo(
    () => sanitizeDayColumns(pending ?? prefs.dayColumns),
    [pending, prefs.dayColumns],
  );
  const env = useCellEnv(lists);
  const byDate = useMemo(
    () => new Map(records.map((r) => [r.id, r])),
    [records],
  );

  const visible = groups.slice(0, paged.shown);
  const toggle = (date: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(date)) next.add(date);
      return next;
    });

  return (
    <LogEnvContext.Provider value={{ env, columns, records: byDate }}>
      <LogShell
        view="day"
        aside={aside}
        columnsMenu={
          <ColumnsMenu
            choices={DAY_CHOICES}
            columns={columns}
            onChange={(next) => updatePrefs.mutate({ dayColumns: next })}
            onReset={() => updatePrefs.mutate({ dayColumns: [...DAY_COLUMNS] })}
          />
        }
      >
        {groups.length === 0 ? (
          <LogEmpty
            noun="days"
            noTradesAtAll={noTradesAtAll}
            unitLeftOut={unitLeftOut}
            filters={filters}
            onFilters={onFilters}
          />
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
            {paged.hasMore ? (
              <ShowMore sentinel={paged.sentinel} onClick={paged.showMore} />
            ) : null}
          </>
        )}
      </LogShell>
    </LogEnvContext.Provider>
  );
}

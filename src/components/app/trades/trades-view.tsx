'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTable, type SortingState } from '@tanstack/react-table';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  DownloadSimple,
  FunnelSimple,
  MagnifyingGlass,
  Plus,
  Table as TableIcon,
  Warning,
  X,
} from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { IconTile } from '@/components/ui/icon-tile';
import { MenuSelect, type MenuSelectOption } from '@/components/ui/menu-select';
import { MetricTip } from '@/components/ui/metric-tip';
import { Segmented } from '@/components/ui/segmented';
import { unitEmptyCopy } from '@/content/display-units';
import type { MetricId } from '@/content/metric-definitions';
import { tradesCsv } from '@/data/csv-export';
import { downloadCsv } from '@/lib/csv';
import { EMPTY_FILTERS, resolveRange, serializeFilters } from '@/data/filters';
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
import {
  COLUMN_LABELS,
  DEFAULT_COLUMNS,
  sanitizeColumns,
  type ColumnId,
} from '@/data/trade-columns';
import { rowFacts, type RowFacts } from '@/data/trade-rows';
import { classify } from '@/domain/metrics/context';
import { runningByExit } from '@/domain/metrics/running';
import { summarize } from '@/domain/metrics/summary';
import { isTradeUnit } from '@/domain/metrics/units';
import { isClosed } from '@/domain/trade-status';
import { localDate } from '@/domain/time';
import type { JournalEntry, Trade } from '@/domain/types';
import {
  meanFigure,
  pctBaseOf,
  sumFigures,
  tradeFigure,
  useDisplay,
} from '@/lib/display';
import { formatCount, plural } from '@/lib/format';
import { docText } from '@/lib/note-text';
import { rangeCaption } from '@/lib/range-label';
import { usePhone } from '@/lib/use-phone';
import { hasActiveFilters } from '../filter-model';
import { CARD } from '../dashboard/shared';
import { ActiveFilters } from './active-filters';
import { BulkBar } from './bulk-bar';
import { PhoneRows } from './phone-rows';
import { SelectBox } from './select-box';
import {
  ALIGN,
  COLUMN_WIDTHS,
  PAD_LEFT,
  buildColumns,
  features,
  type CellEnv,
} from './columns';
import { ColumnsMenu } from './columns-menu';
import { SummaryStrip } from './summary-strip';

/** The rows a page can hold; the first used is the default. */
const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS: MenuSelectOption[] = PAGE_SIZES.map((n) => ({
  value: String(n),
  label: `${n} per page`,
}));

/** The URL's `?per=`: 25, 50 or 100, else the default. */
function perOf(raw: string | null): number {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/** The URL's `?page=`, a 1-based number, as an index; 0 when it is not a positive whole number. */
function pageIndexOf(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 1 ? n - 1 : 0;
}

/** Writes the paging to the address bar in place, as the filters do; the default page and size stay off the URL. */
function writePaging(patch: { per?: number; pageIndex?: number }): void {
  const params = new URLSearchParams(window.location.search);
  if (patch.per !== undefined) {
    if (patch.per === DEFAULT_PAGE_SIZE) params.delete('per');
    else params.set('per', String(patch.per));
  }
  if (patch.pageIndex !== undefined) {
    if (patch.pageIndex <= 0) params.delete('page');
    else params.set('page', String(patch.pageIndex + 1));
  }
  const qs = params.toString();
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (qs ? `?${qs}` : ''),
  );
}
const NEWEST_OPEN: SortingState = [{ id: 'open', desc: true }];

/** A figure and how it reads, as `useDisplay().figure` gives it. */
type Shown = { text: string; label: string };

type Status = 'closed' | 'open';
type Review = 'all' | 'unreviewed' | 'reviewed';

/** The phone's Sort choices: a column and a direction each, offered when the column is shown. */
const PHONE_SORTS: readonly {
  id: ColumnId;
  desc: boolean;
  label: string;
  always?: true;
}[] = [
  { id: 'open', desc: true, label: 'Newest first', always: true },
  { id: 'open', desc: false, label: 'Oldest first' },
  { id: 'net', desc: true, label: 'Net, best first' },
  { id: 'net', desc: false, label: 'Net, worst first' },
  { id: 'realizedR', desc: true, label: 'R, highest first' },
  { id: 'realizedR', desc: false, label: 'R, lowest first' },
  { id: 'instrument', desc: false, label: 'Instrument, A to Z' },
];

const sortKey = (id: string, desc: boolean) => `${id}:${desc ? 'desc' : 'asc'}`;

/** Newest open first: the order the rows keep when no sorted column is shown. */
function byNewest(a: Trade, b: Trade): number {
  return Date.parse(b.openedAt) - Date.parse(a.openedAt) || b.serial - a.serial;
}

/**
 * The lowercased text of each note by note id (one in Trash is left out), built
 * once per change of the journal so a keystroke reads strings, not documents.
 */
function noteIndex(notes: readonly JournalEntry[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of notes) {
    if (n.deletedAt !== undefined) continue;
    const text = docText(n.body).toLowerCase();
    if (text !== '') out.set(n.id, text);
  }
  return out;
}

/** Whether a trade matches the search: symbol, #serial, strategy, tag and note text. */
function matches(
  t: Trade,
  query: string,
  facts: RowFacts,
  noteText: ReadonlyMap<string, string>,
): boolean {
  if (query.startsWith('#')) {
    const serial = query.slice(1);
    return /^\d+$/.test(serial) && t.serial === Number(serial);
  }
  const hay = [
    t.instrument.symbol,
    t.instrument.root,
    t.instrument.underlying ?? '',
    ...facts.strategyNames(t),
    ...facts.tagsOf(t).map((x) => x.name),
    ...facts.mistakesOf(t),
  ];
  return (
    hay.some((h) => h.toLowerCase().includes(query)) ||
    (t.noteId !== undefined &&
      (noteText.get(t.noteId)?.includes(query) ?? false))
  );
}

/** The pages to show as buttons: the first, the last and the current with its neighbours; `null` is a gap. */
function pageButtons(index: number, count: number): (number | null)[] {
  const wanted = [...new Set([0, index - 1, index, index + 1, count - 1])]
    .filter((p) => p >= 0 && p < count)
    .sort((a, b) => a - b);
  const out: (number | null)[] = [];
  wanted.forEach((p, i) => {
    if (i > 0 && p - wanted[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}

function StateBlock({
  icon,
  title,
  body,
  actions,
  role,
}: {
  icon: typeof FunnelSimple;
  title: string;
  body?: string;
  actions?: React.ReactNode;
  role?: 'alert';
}): React.JSX.Element {
  return (
    <div
      role={role}
      className="mx-auto flex w-full max-w-[520px] flex-col items-center px-5 py-16 text-center"
    >
      <IconTile icon={icon} />
      <h2 className="mt-5 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance text-text">
        {title}
      </h2>
      {body ? (
        <p className="mt-2 text-[15px] leading-[1.6] text-pretty text-muted">
          {body}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actions}
        </div>
      ) : null}
    </div>
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
      <div className={`${CARD} h-[480px]`} aria-hidden="true" />
    </div>
  );
}

/** The select column's width in px, as the box is drawn. */
const SELECT_WIDTH = 32;

/** A header's sort button: the column's name, or (beside a metric tip) just the arrow. */
function SortButton({
  label,
  align,
  sorted,
  onClick,
  named = false,
}: {
  label: string;
  align: 'right' | 'center' | undefined;
  sorted: false | 'asc' | 'desc';
  onClick: ((event: unknown) => void) | undefined;
  /** The label is the button's visible text. */
  named?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={named ? undefined : label}
      className={`group/sort inline-flex h-7 items-center gap-1 rounded-chip font-medium text-faint outline-offset-0 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 ${named ? '-mx-1.5 px-1.5' : 'px-1'} ${align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      {named ? label : null}
      <SortMark state={sorted} />
    </button>
  );
}

/** The columns whose header names a metric, and which metric. */
const HEADER_TIPS: Partial<Record<ColumnId, MetricId>> = {
  roi: 'net-roi',
  realizedR: 'realized-r',
};

function SortMark({
  state,
}: {
  state: false | 'asc' | 'desc';
}): React.JSX.Element {
  const Mark = state === 'asc' ? CaretUp : CaretDown;
  return (
    <Mark
      size={11}
      weight="bold"
      aria-hidden="true"
      className={`flex-none transition-opacity duration-200 ${state ? 'text-text' : 'opacity-0 group-hover/sort:opacity-60'}`}
    />
  );
}

/** Saves a CSV as a download, named keel-trades-YYYY-MM-DD.csv. */
const download = (csv: string, day: string): void =>
  downloadCsv(csv, `keel-trades-${day}.csv`);

/**
 * The trade log on the URL's filters. Render inside `<Suspense>`: it reads the
 * search params. The Closed / Open switch writes the `status` filter (closed
 * when it is absent); a summary strip of the closed trades sits above the
 * table, which sorts by any column and pages at 50.
 */
export function TradesView(): React.JSX.Element {
  const { filters, setFilters } = useGlobalFilters();
  // Every status and review state: the switches' counts need both sides of each.
  const set = useTradeSet({
    ...filters,
    status: undefined,
    reviewed: undefined,
  });
  const tradesQuery = useTrades();
  const allTrades = tradesQuery.data;
  const prefs = usePrefs().data;
  const accounts = useAccounts().data;
  const archivedAccountIds = useMemo(
    () =>
      new Set(
        (accounts ?? [])
          .filter((a) => a.status === 'archived')
          .map((a) => a.id),
      ),
    [accounts],
  );
  const flowsQuery = useCashFlows();
  const flows = flowsQuery.data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const journal = useJournal().data;
  const categories = useTagCategories().data;
  const noteText = useMemo(() => noteIndex(journal ?? []), [journal]);
  const updatePrefs = useUpdatePrefs();
  const queryClient = useQueryClient();
  const display = useDisplay();
  const phone = usePhone();

  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>(NEWEST_OPEN);
  // The page and its size live in the URL, so Back brings the same page.
  const urlParams = useSearchParams();
  const pageSize = perOf(urlParams.get('per'));
  const wantedPage = pageIndexOf(urlParams.get('page'));
  const setPageIndex = (pageIndex: number) => writePaging({ pageIndex });
  // The chosen trades belong to the filters they were chosen under: a changed
  // filter or search leaves them behind.
  const selectionKey = `${serializeFilters(filters).toString()}|${search.trim().toLowerCase()}`;
  // A changed filter starts the log again at page 1.
  const filterKey = serializeFilters(filters).toString();
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    writePaging({ pageIndex: 0 });
  }, [filterKey]);
  const [selection, setSelection] = useState<{
    key: string;
    ids: readonly string[];
  }>({ key: '', ids: [] });
  const [result, setResult] = useState<React.ReactNode>(null);

  // A pending save shows at once, as the Display menu's does.
  const pendingColumns = updatePrefs.isPending
    ? updatePrefs.variables?.tradeColumns
    : undefined;
  const columnIds: ColumnId[] = useMemo(
    () => sanitizeColumns(pendingColumns ?? prefs?.tradeColumns),
    [pendingColumns, prefs?.tradeColumns],
  );
  const hideSummary =
    (updatePrefs.isPending
      ? updatePrefs.variables?.hideTradeSummary
      : undefined) ??
    prefs?.hideTradeSummary ??
    false;

  const timeZone = prefs?.timeZone;
  const ctx = useMemo(
    () => (prefs ? metricContextOf(prefs) : undefined),
    [prefs],
  );
  const facts = useMemo(
    () =>
      timeZone && accounts && strategies && tags && categories && ctx
        ? rowFacts({
            timeZone,
            accounts,
            strategies,
            tags,
            categories,
            ctx,
          })
        : undefined,
    [timeZone, accounts, strategies, tags, categories, ctx],
  );

  const status: Status = filters.status ?? 'closed';
  const review: Review =
    filters.reviewed === undefined
      ? 'all'
      : filters.reviewed
        ? 'reviewed'
        : 'unreviewed';

  const model = useMemo(() => {
    const trades = set.data?.trades;
    if (!trades || !facts) return undefined;
    const closed = trades.filter(isClosed);
    const open = trades.filter((t) => t.status === 'open');
    const inStatus = status === 'open' ? open : closed;
    const reviewedCount = inStatus.filter((t) => t.reviewed === true).length;
    const byReview = (list: Trade[]) =>
      filters.reviewed === undefined
        ? list
        : list.filter((t) => (t.reviewed === true) === filters.reviewed);
    const query = search.trim().toLowerCase();
    const inReview = byReview(inStatus);
    const rows = (
      query === ''
        ? inReview
        : inReview.filter((t) => matches(t, query, facts, noteText))
    )
      .slice()
      .sort(byNewest);
    return {
      closedCount: closed.length,
      openCount: open.length,
      reviewedCount,
      unreviewedCount: inStatus.length - reviewedCount,
      /** The strip: closed trades in the filters, the review switch included. */
      stripTrades: byReview(closed),
      rows,
    };
  }, [set.data?.trades, facts, status, filters.reviewed, search, noteText]);

  const rows = model?.rows ?? NO_ROWS;
  const cellEnv: CellEnv | undefined = useMemo(
    () =>
      ctx && timeZone && facts ? { timeZone, ctx, display, facts } : undefined,
    [ctx, timeZone, facts, display],
  );
  const columns = useMemo(
    () => (cellEnv ? buildColumns(columnIds, cellEnv) : []),
    [columnIds, cellEnv],
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageIndex = Math.min(wantedPage, pageCount - 1);
  const pagination = { pageIndex, pageSize };
  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting, pagination },
    onSortingChange: (updater) => {
      setSorting(updater);
      setPageIndex(0);
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function' ? updater(pagination) : updater;
      writePaging({ pageIndex: next.pageIndex });
    },
    autoResetPageIndex: false,
    enableSortingRemoval: false,
    getRowId: (t) => t.id,
  });

  // The strip's trades and what is read off them, once per change of their inputs.
  const displayUnit = prefs?.displayUnit;
  const baseCurrency = prefs?.baseCurrency;
  const strip = useMemo(() => {
    if (!model || !ctx || !timeZone || !displayUnit || !baseCurrency)
      return undefined;
    // The base currency's closed trades, or the first one with any.
    const currencies = [
      ...new Set(model.stripTrades.map((t) => t.pnlCurrency)),
    ];
    const stripCurrency = currencies.includes(baseCurrency)
      ? baseCurrency
      : (currencies[0] ?? baseCurrency);
    const stripTrades = model.stripTrades.filter(
      (t) => t.pnlCurrency === stripCurrency,
    );
    const figures = stripTrades.map((t) => tradeFigure(t, ctx));
    const outcomes = stripTrades.map((t) => classify(t, ctx).outcome);
    // The running line reads the display unit as the figures do; other units read the money.
    const running = runningByExit(
      stripTrades,
      (t) => {
        const f = tradeFigure(t, ctx);
        return isTradeUnit(displayUnit) ? (f[displayUnit] ?? 0) : f.money;
      },
      timeZone,
    );
    return { stripCurrency, stripTrades, figures, outcomes, running };
  }, [model, ctx, timeZone, displayUnit, baseCurrency]);

  // Every read the page waits on: one failing would leave the skeleton up for good.
  const error = set.error ?? tradesQuery.error ?? flowsQuery.error;
  if (error) {
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
  if (
    !model ||
    !allTrades ||
    !prefs ||
    !accounts ||
    !flows ||
    !ctx ||
    !timeZone ||
    !facts ||
    !cellEnv ||
    !strip
  )
    return <Skeleton />;

  if (allTrades.length === 0)
    return (
      <StateBlock
        icon={TableIcon}
        title="No trades yet."
        body="Import a CSV from your broker, or enter a trade by hand."
        actions={
          <>
            <Link href="/app/import" className={buttonClasses('primary')}>
              Import
            </Link>
            <Link href="/app/trades/new" className={buttonClasses('secondary')}>
              Add a trade
            </Link>
          </>
        }
      />
    );

  const today = localDate(new Date().toISOString(), timeZone);
  const range = resolveRange(set.data?.filters.range ?? {}, today);
  const filtered =
    hasActiveFilters(filters) ||
    filters.status !== undefined ||
    filters.reviewed !== undefined ||
    search.trim() !== '';
  const clearFilters = (
    <Button
      onClick={() => {
        setSearch('');
        setFilters(EMPTY_FILTERS);
      }}
    >
      Clear filters
    </Button>
  );
  // The display unit, when it left out some of the trades the filters matched.
  const narrowed =
    (set.data?.unitLeftOut ?? 0) > 0 && isTradeUnit(prefs.displayUnit)
      ? prefs.displayUnit
      : undefined;

  const savePrefs = (patch: Parameters<typeof updatePrefs.mutate>[0]) =>
    updatePrefs.mutate(patch);

  const { stripCurrency, stripTrades, figures, outcomes, running } = strip;
  const summary = summarize(stripTrades, ctx);
  const pctBase = pctBaseOf({
    accounts,
    flows,
    trades: allTrades,
    accountIds: set.data?.filters.accountIds ?? [],
    currency: stripCurrency,
    from: range.from,
    timeZone,
  });
  const basisMoney =
    ctx.pnlBasis === 'gross' ? summary.grossPnl : summary.netPnl;
  const pnlFigure = {
    ...sumFigures(figures, pctBase),
    money: basisMoney,
    pct: pctBase ? basisMoney / pctBase : null,
  };
  const expectancyFigure =
    summary.expectancy === null
      ? null
      : {
          ...meanFigure(figures, pctBase),
          money: summary.expectancy,
          pct: pctBase ? summary.expectancy / pctBase : null,
        };
  const pnl = {
    ...display.figure(pnlFigure, true, stripCurrency),
    cents: basisMoney,
  };
  // The average win and loss: the winners' (losers') mean figure, with the summary's own money.
  const averageOf = (
    outcome: 'win' | 'loss',
    money: number | null,
  ): (Shown & { cents: number }) | null => {
    if (money === null) return null;
    const mean = meanFigure(
      figures.filter((_, i) => outcomes[i] === outcome),
      pctBase,
    );
    return {
      ...display.figure(
        { ...mean, money, pct: pctBase ? money / pctBase : null },
        true,
        stripCurrency,
      ),
      cents: money,
    };
  };
  const avgWin = averageOf('win', summary.avgWin);
  const avgLoss = averageOf('loss', summary.avgLoss);

  const page = table.getRowModel().rows;
  const total = rows.length;
  const from = pageIndex * pageSize + 1;
  const to = Math.min(total, from + page.length - 1);

  const sortOptions: MenuSelectOption[] = PHONE_SORTS.filter(
    (o) => o.always || columnIds.includes(o.id),
  ).map((o) => ({ value: sortKey(o.id, o.desc), label: o.label }));
  const current = sorting[0];
  const sortValue = current ? sortKey(current.id, current.desc) : '';
  // A column sorted at a wider size has no phone choice: say so, rather than name another.
  if (!sortOptions.some((o) => o.value === sortValue))
    sortOptions.unshift({ value: sortValue, label: 'Column order' });

  const chosen = new Set(selection.key === selectionKey ? selection.ids : []);
  const selected = rows.filter((t) => chosen.has(t.id));
  const pageSelected = page.filter((r) => chosen.has(r.original.id)).length;
  const setChosen = (ids: readonly string[]) =>
    setSelection({ key: selectionKey, ids });
  const togglePage = (on: boolean) => {
    const pageIds = page.map((r) => r.original.id);
    setChosen(
      on
        ? [...new Set([...selected.map((t) => t.id), ...pageIds])]
        : selected.map((t) => t.id).filter((id) => !pageIds.includes(id)),
    );
  };
  const toggleRow = (id: string, on: boolean) =>
    setChosen(
      on
        ? [...selected.map((t) => t.id), id]
        : selected.map((t) => t.id).filter((x) => x !== id),
    );

  const exportCsv = (list: readonly Trade[] = rows) =>
    download(
      tradesCsv(list, columnIds, {
        timeZone,
        accounts,
        strategies: strategies ?? [],
        tags: tags ?? [],
        categories: categories ?? [],
        ctx: ctx!,
      }),
      today,
    );

  return (
    <div className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0">
      {hideSummary ? (
        <div className="flex">
          <button
            type="button"
            onClick={() => savePrefs({ hideTradeSummary: false })}
            className="inline-flex h-8 items-center rounded-chip px-2 text-[12.5px] font-semibold text-accent-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
          >
            Show summary
          </button>
        </div>
      ) : (
        <SummaryStrip
          summary={summary}
          basis={ctx.pnlBasis}
          pnl={pnl}
          fees={display.figure(
            {
              money: summary.fees,
              pct: pctBase ? summary.fees / pctBase : null,
            },
            false,
            stripCurrency,
          )}
          expectancy={
            expectancyFigure === null || summary.expectancy === null
              ? null
              : {
                  ...display.figure(expectancyFigure, true, stripCurrency),
                  cents: summary.expectancy,
                }
          }
          avgWin={avgWin}
          avgLoss={avgLoss}
          running={running}
          openCount={model.openCount}
          scope={rangeCaption(range, today)}
          otherCurrencies={model.stripTrades.length - stripTrades.length}
          onHide={() => savePrefs({ hideTradeSummary: true })}
        />
      )}

      <ActiveFilters filters={filters} onChange={setFilters} />

      {result ? (
        <div
          role="status"
          aria-label="Result"
          className="flex items-start gap-3 rounded-control border border-line bg-surface-1 py-2.5 pr-2 pl-4 text-[13.5px] text-text shadow-[var(--shadow-chip)]"
        >
          <p className="min-w-0 flex-1 pt-0.5 text-pretty">{result}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setResult(null)}
            className="grid size-7 flex-none place-items-center rounded-chip text-muted hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <section
        aria-label="Trade log"
        className={`${CARD} min-w-0 overflow-hidden`}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <Segmented<Status>
            label="Status"
            coarseTargets
            value={status}
            options={[
              {
                value: 'closed',
                label: `Closed ${formatCount(model.closedCount)}`,
              },
              { value: 'open', label: `Open ${formatCount(model.openCount)}` },
            ]}
            onChange={(next) => {
              setFilters({
                ...filters,
                status: next === 'closed' ? undefined : next,
              });
            }}
          />
          <Segmented<Review>
            label="Review"
            coarseTargets
            value={review}
            options={[
              { value: 'all', label: 'All' },
              {
                value: 'unreviewed',
                label: `Not reviewed ${formatCount(model.unreviewedCount)}`,
              },
              {
                value: 'reviewed',
                label: `Reviewed ${formatCount(model.reviewedCount)}`,
              },
            ]}
            onChange={(next) =>
              setFilters({
                ...filters,
                reviewed: next === 'all' ? undefined : next === 'reviewed',
              })
            }
          />
          <label className="relative min-w-[140px] flex-1 sm:max-w-[280px]">
            <MagnifyingGlass
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
            />
            <input
              type="search"
              aria-label="Search trades"
              placeholder="Symbol, #serial, strategy, tag"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPageIndex(0);
              }}
              className="h-[34px] w-full rounded-control border border-line bg-surface-1 pr-3 pl-9 text-[13.5px] text-text placeholder:text-faint hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
            />
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {phone ? null : (
              <ColumnsMenu
                columns={columnIds}
                onChange={(next) => savePrefs({ tradeColumns: next })}
                onReset={() =>
                  savePrefs({ tradeColumns: [...DEFAULT_COLUMNS] })
                }
              />
            )}
            <button
              type="button"
              onClick={() => exportCsv()}
              disabled={rows.length === 0}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-control border border-line bg-surface-1 px-3 text-[13.5px] font-medium whitespace-nowrap text-muted shadow-[0_1px_1px_rgb(18_22_51/0.04)] transition-[border-color] duration-200 ease-(--ease-glide) hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 pointer-coarse:h-11"
            >
              <DownloadSimple
                size={16}
                aria-hidden="true"
                className="text-faint"
              />
              Export<span className="max-[1359px]:sr-only"> CSV</span>
            </button>
            <Link
              href="/app/trades/new"
              className={`${buttonClasses('secondary')} gap-1.5`}
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              Add trade
            </Link>
          </div>
        </div>

        {rows.length === 0 ? (
          narrowed && search.trim() === '' ? (
            // The line under the top bar says how many it left out, and goes back to Dollar.
            <StateBlock
              icon={FunnelSimple}
              {...unitEmptyCopy(narrowed, status)}
              actions={filtered ? clearFilters : undefined}
            />
          ) : filtered ? (
            <StateBlock
              icon={FunnelSimple}
              title="No trades match these filters."
              actions={clearFilters}
            />
          ) : (
            <StateBlock
              icon={TableIcon}
              title={`No ${status} trades yet.`}
              body={
                status === 'closed'
                  ? 'Open positions show here once they close.'
                  : 'Every position is closed.'
              }
            />
          )
        ) : (
          <>
            {pageSelected === page.length && total > page.length ? (
              <p
                role="status"
                className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-accent-soft/60 px-5 py-2 text-[13px] text-text"
              >
                {selected.length === total ? (
                  <>
                    All {total} matching trades are selected.
                    <button
                      type="button"
                      onClick={() => setChosen([])}
                      className="font-semibold text-accent-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
                    >
                      Clear selection
                    </button>
                  </>
                ) : (
                  <>
                    All {page.length} trades on this page are selected.
                    <button
                      type="button"
                      onClick={() => setChosen(rows.map((t) => t.id))}
                      className="font-semibold text-accent-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
                    >
                      Select all {total} matching trades
                    </button>
                  </>
                )}
              </p>
            ) : null}
            {phone ? (
              <>
                <div className="flex items-center justify-between gap-2 border-b border-line py-1 pr-4 pl-2">
                  <div className="flex min-h-11 items-center gap-0.5 text-[13px] text-muted">
                    <SelectBox
                      label="Select this page"
                      checked={pageSelected === page.length}
                      indeterminate={pageSelected > 0}
                      onChange={togglePage}
                    />
                    Select page
                  </div>
                  <MenuSelect
                    label="Sort"
                    align="end"
                    value={sortValue}
                    options={sortOptions}
                    onChange={(v) => {
                      const [id, dir] = v.split(':');
                      table.setSorting([{ id: id!, desc: dir === 'desc' }]);
                    }}
                  />
                </div>
                <PhoneRows
                  trades={page.map((r) => r.original)}
                  env={cellEnv}
                  chosen={chosen}
                  onToggle={toggleRow}
                />
              </>
            ) : (
              <div className="relative overflow-x-auto px-3">
                <table
                  aria-label="Trades"
                  style={{
                    minWidth: `${SELECT_WIDTH + columnIds.reduce((n, id) => n + COLUMN_WIDTHS[id], 0)}px`,
                  }}
                  className="w-full table-fixed border-collapse text-[13px] whitespace-nowrap [font-stretch:90%]"
                >
                  <colgroup>
                    <col className="w-8 pointer-coarse:w-11" />
                    {columnIds.map((id) => (
                      <col key={id} style={{ width: COLUMN_WIDTHS[id] }} />
                    ))}
                  </colgroup>
                  <thead>
                    {table.getHeaderGroups().map((group) => (
                      <tr key={group.id}>
                        <th
                          scope="col"
                          className="h-10 w-8 border-b border-line pr-1 text-left align-middle"
                        >
                          <SelectBox
                            label="Select this page"
                            checked={pageSelected === page.length}
                            indeterminate={pageSelected > 0}
                            onChange={togglePage}
                          />
                        </th>
                        {group.headers.map((header) => {
                          const id = header.column.id as ColumnId;
                          const sorted = header.column.getIsSorted();
                          const align = ALIGN[id];
                          const canSort = header.column.getCanSort();
                          return (
                            <th
                              key={header.id}
                              scope="col"
                              aria-sort={
                                canSort
                                  ? sorted === 'asc'
                                    ? 'ascending'
                                    : sorted === 'desc'
                                      ? 'descending'
                                      : 'none'
                                  : undefined
                              }
                              className={`h-10 border-b border-line pr-1.5 align-middle text-xs font-medium text-faint last:pr-0 ${PAD_LEFT.has(id) ? 'pl-4' : ''} ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
                            >
                              {canSort ? (
                                HEADER_TIPS[id] ? (
                                  <span
                                    className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}
                                  >
                                    <MetricTip
                                      id={HEADER_TIPS[id]}
                                      basis={ctx.pnlBasis}
                                      className="text-xs font-medium"
                                    >
                                      {COLUMN_LABELS[id].label}
                                    </MetricTip>
                                    <SortButton
                                      label={`Sort by ${COLUMN_LABELS[id].label}`}
                                      align={align}
                                      sorted={sorted}
                                      onClick={header.column.getToggleSortingHandler()}
                                    />
                                  </span>
                                ) : (
                                  <SortButton
                                    label={COLUMN_LABELS[id].label}
                                    align={align}
                                    sorted={sorted}
                                    onClick={header.column.getToggleSortingHandler()}
                                    named
                                  />
                                )
                              ) : (
                                COLUMN_LABELS[id].label
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {page.map((row) => (
                      <tr
                        key={row.id}
                        aria-selected={chosen.has(row.original.id)}
                        className={`h-[38px] border-t border-line/70 text-text transition-colors duration-200 ease-(--ease-glide) first:border-t-0 ${chosen.has(row.original.id) ? 'bg-accent-soft/70' : 'hover:bg-sunken/60'}`}
                      >
                        <td className="w-8 py-0 pr-1">
                          <SelectBox
                            label={`Select trade ${row.original.serial}`}
                            checked={chosen.has(row.original.id)}
                            onChange={(on) => toggleRow(row.original.id, on)}
                          />
                        </td>
                        {row.getAllCells().map((cell) => {
                          const id = cell.column.id as ColumnId;
                          const align = ALIGN[id];
                          return (
                            <td
                              key={cell.id}
                              className={`overflow-hidden py-1 pr-1.5 last:pr-0 ${PAD_LEFT.has(id) ? 'pl-4' : ''} ${align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : 'text-left'}`}
                            >
                              <table.FlexRender cell={cell} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line px-5 py-3 text-[12.5px] text-faint">
              <p>
                <span className="tabular-nums">
                  {from}-{to} of {total}
                </span>{' '}
                {status} {plural(total, 'trade')}
              </p>
              <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
                <MenuSelect
                  label="Rows per page"
                  align="end"
                  value={String(pageSize)}
                  options={PAGE_SIZE_OPTIONS}
                  onChange={(v) =>
                    writePaging({ per: Number(v), pageIndex: 0 })
                  }
                />
                <PageJump
                  key={pageIndex}
                  pageIndex={pageIndex}
                  pageCount={pageCount}
                  onJump={setPageIndex}
                />
                <nav aria-label="Pages" className="flex items-center gap-0.5">
                  <PageButton
                    label="Previous page"
                    disabled={pageIndex === 0}
                    onClick={() => table.previousPage()}
                  >
                    <CaretLeft size={14} aria-hidden="true" />
                  </PageButton>
                  {pageButtons(pageIndex, pageCount).map((p, i) =>
                    p === null ? (
                      <span
                        key={`gap-${i}`}
                        aria-hidden="true"
                        className="px-1"
                      >
                        ...
                      </span>
                    ) : (
                      <PageButton
                        key={p}
                        label={`Page ${p + 1}`}
                        current={p === pageIndex}
                        onClick={() => setPageIndex(p)}
                      >
                        {p + 1}
                      </PageButton>
                    ),
                  )}
                  <PageButton
                    label="Next page"
                    disabled={pageIndex >= pageCount - 1}
                    onClick={() => table.nextPage()}
                  >
                    <CaretRight size={14} aria-hidden="true" />
                  </PageButton>
                </nav>
              </div>
            </div>
          </>
        )}
      </section>

      {selected.length > 0 ? (
        // In the flow, so the last row is never under it; it sticks to the viewport's foot.
        <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center pt-2">
          <BulkBar
            trades={selected}
            archivedAccountIds={archivedAccountIds}
            strategies={strategies ?? []}
            onClear={() => setChosen([])}
            onExport={() => exportCsv(selected)}
            onResult={setResult}
          />
        </div>
      ) : null}
    </div>
  );
}

const NO_ROWS: Trade[] = [];

/**
 * "Page [n] of N": a number field in the app's field look. Enter or leaving
 * goes to the page (a number past either end lands on the nearest page).
 * Leaving the field puts the current page back, so a typed number never
 * applies twice, as when the next click follows it.
 */
function PageJump({
  pageIndex,
  pageCount,
  onJump,
}: {
  pageIndex: number;
  pageCount: number;
  onJump(index: number): void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(String(pageIndex + 1));
  const go = () => {
    const n = Math.round(Number(draft));
    if (draft.trim() === '' || !Number.isFinite(n)) {
      setDraft(String(pageIndex + 1));
      return;
    }
    const target = Math.min(pageCount, Math.max(1, n)) - 1;
    setDraft(String(target + 1));
    if (target !== pageIndex) onJump(target);
  };
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-faint">
      Page
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={pageCount}
        aria-label="Go to page"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setDraft(String(pageIndex + 1))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') go();
        }}
        className="h-8 w-16 rounded-control border border-line bg-surface-1 px-2 text-center text-[13.5px] font-medium text-text tabular-nums hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
      />
      <span className="tabular-nums">of {pageCount}</span>
    </label>
  );
}

function PageButton({
  label,
  disabled,
  current,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  current?: boolean;
  onClick(): void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-[30px] min-w-[30px] place-items-center rounded-[8px] px-1 text-[13px] font-medium tabular-nums text-muted outline-offset-0 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:min-w-11 ${current ? 'bg-surface-1 font-semibold text-text shadow-[var(--shadow-chip),inset_0_0_0_1px_var(--line)]' : ''}`}
    >
      {children}
    </button>
  );
}

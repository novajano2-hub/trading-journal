'use client';

import { DownloadSimple } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId, useMemo, type ReactNode } from 'react';
import { FigureText } from '@/components/product/figure-text';
import {
  breakdown,
  breakdown2D,
  highlights,
  SYMBOL_KEYS,
  type BreakdownKey,
  type BreakdownOptions,
  type BreakdownRow,
  type CrossMetric,
} from '@/domain/metrics/breakdowns';
import { classify, pnlOf } from '@/domain/metrics/context';
import { seriesUnit, type SeriesMetric } from '@/domain/metrics/series';
import { largestInUnit } from '@/domain/metrics/summary';
import { unitOf } from '@/domain/metrics/units';
import { roundHalfEven } from '@/domain/money';
import { bucketHref, cellHref, type BucketOptions } from '@/data/report-links';
import {
  useAccounts,
  useStrategies,
  useTagCategories,
  useTags,
} from '@/data/query/hooks';
import type { TagCategory } from '@/domain/types';
import { useAddressCopy } from '@/lib/use-address-copy';
import { useDisplay } from '@/lib/display';
import { csvText, decimalOf, downloadCsv } from '@/lib/csv';
import { formatPct, formatQty, plural } from '@/lib/format';
import { CARD, CARD_PAD, CardHeader, signTone } from '../dashboard/shared';
import { ColumnsChooser } from './columns-chooser';
import { CrossAnalysis } from './cross-analysis';
import {
  formatPicks,
  labelOf as metricLabel,
  MetricChips,
  parsePicks,
  type Pick,
} from './metric-chips';
import { ReportChart, useExpandSlot, type ChartSeries } from './report-chart';
import {
  COLUMNS_PARAM,
  formatColumns,
  parseColumns,
  REPORT_COLUMNS,
} from './report-columns';
import { ReportScope } from './report-scope';
import { SubTabs } from './sub-tabs';
import { MenuSelect } from '@/components/ui/menu-select';
import { SummaryTable, type SummaryColumn } from './summary-table';
import { writeParam, type ReportData } from './use-report-data';
import { RatioText } from '../ratio-text';

/** A labelled dropdown: the report's small controls, the app's own menu rather than a native select. */
export function ReportSelect({
  label,
  value,
  onChange,
  options,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  options: readonly { value: string; label: string }[];
  /** The label is for assistive technology only: the button's name still starts with it. */
  hideLabel?: boolean;
}): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted">
      {hideLabel ? null : <span aria-hidden="true">{label}</span>}
      <MenuSelect
        label={label}
        value={value}
        onChange={onChange}
        options={options}
      />
    </span>
  );
}

/**
 * Account names by id. Until the accounts load every account reads "Loading",
 * so a row never flashes a raw id.
 */
export function accountNamesOf(
  accounts: readonly { id: string; name: string }[] | undefined,
  ids: readonly string[],
): Record<string, string> {
  if (accounts === undefined)
    return Object.fromEntries(ids.map((id) => [id, 'Loading']));
  return Object.fromEntries(accounts.map((a) => [a.id, a.name]));
}

/** The names the strategy and tag breakdowns label their rows with. */
export function useNames(): {
  options: BreakdownOptions;
  categories: TagCategory[];
} {
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const categories = useTagCategories().data;
  return useMemo(
    () => ({
      options: {
        strategyNames: Object.fromEntries(
          (strategies ?? []).map((s) => [s.id, s.name]),
        ),
        tagNames: Object.fromEntries((tags ?? []).map((t) => [t.id, t.name])),
        tagCategoryNames: Object.fromEntries(
          (tags ?? []).flatMap((t) => {
            const c = categories?.find((x) => x.id === t.categoryId);
            return c ? [[t.id, c.name]] : [];
          }),
        ),
      },
      categories: categories ?? [],
    }),
    [strategies, tags, categories],
  );
}

const CROSS_DIMS: { key: BreakdownKey; label: string }[] = [
  { key: 'side', label: 'Side' },
  { key: 'symbol', label: 'Symbol' },
  { key: 'weekday', label: 'Weekday' },
  { key: 'month', label: 'Month' },
  { key: 'hour', label: 'Hour' },
  { key: 'duration', label: 'Duration' },
  { key: 'session', label: 'Session' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'tag', label: 'Tag' },
  { key: 'account', label: 'Account' },
  { key: 'instrument', label: 'Instrument' },
  { key: 'entry-price', label: 'Entry price' },
  { key: 'exit-price', label: 'Exit price' },
  { key: 'exit-hour', label: 'Exit hour' },
  { key: 'size', label: 'Position size' },
  { key: 'r', label: 'R-multiple' },
  { key: 'symbol-top', label: 'Top 10 symbols' },
  { key: 'symbol-bottom', label: 'Bottom 10 symbols' },
];

/** Whether two breakdowns file trades the same way: the symbol and its top and bottom 10 are one. */
const sameDimension = (a: BreakdownKey, b: BreakdownKey) =>
  a === b || (SYMBOL_KEYS.includes(a) && SYMBOL_KEYS.includes(b));

const CROSS_METRICS: { value: CrossMetric; label: string }[] = [
  { value: 'net', label: 'Net P&L' },
  { value: 'trades', label: 'Trades' },
  { value: 'win-rate', label: 'Win rate' },
  { value: 'profit-factor', label: 'Profit factor' },
];

/** How a cell shows each metric, and which way it tints. */
function crossText(metric: CrossMetric, v: number): string {
  switch (metric) {
    case 'win-rate':
      return formatPct(v, 1);
    case 'profit-factor':
      return v.toFixed(2);
    default:
      return String(v);
  }
}

const tintOf = (metric: CrossMetric, v: number): number =>
  metric === 'win-rate' ? v - 0.5 : metric === 'profit-factor' ? v - 1 : 0;

/** What a breakdown chart can plot for a bucket, and what each reads from its summary. */
const CHART_METRICS: readonly SeriesMetric[] = [
  'net',
  'win-rate',
  'profit-factor',
  'expectancy',
  'avg-win',
  'avg-loss',
  'trades',
  'fees',
];
/** Breakdowns whose buckets have no order to read along: every bar keeps its label, tilted if need be. */
const UNORDERED: ReadonlySet<BreakdownKey> = new Set([
  'symbol',
  'symbol-top',
  'symbol-bottom',
  'strategy',
  'tag',
  'side',
  'instrument',
  'account',
]);

const DEFAULT_PICKS: readonly Pick[] = [
  { metric: 'net', kind: 'bar', mode: 'period' },
  { metric: 'win-rate', kind: 'line', mode: 'period' },
];

function chartValue(r: BreakdownRow, metric: SeriesMetric): number | null {
  const s = r.summary;
  switch (metric) {
    case 'net':
      return s.closedCount > 0 ? basisNet(r) : null;
    case 'win-rate':
      return s.winRate;
    case 'profit-factor':
      return s.profitFactor;
    case 'expectancy':
      return s.expectancy;
    case 'avg-win':
      return s.avgWin;
    case 'avg-loss':
      return s.avgLoss;
    case 'trades':
      return s.closedCount;
    case 'fees':
      return s.fees;
    default:
      return null;
  }
}

const basisNet = (r: BreakdownRow) =>
  r.summary.basis === 'gross' ? r.summary.grossPnl : r.summary.netPnl;

/** A label of the form "10:00 to 10:15": the first part in ink, the rest quiet. */
function RowName({ text }: { text: string }): React.JSX.Element {
  const at = text.indexOf(' to ');
  if (at === -1) return <b className="font-semibold text-text">{text}</b>;
  return (
    <>
      <b className="font-semibold text-text">{text.slice(0, at)}</b>
      <span className="text-muted">{text.slice(at)}</span>
    </>
  );
}

/** A bucket's name as a link to its trades in the log; plain text where the bucket has no link. */
function BucketName({
  text,
  href,
  count,
}: {
  text: string;
  href: string | undefined;
  count: number;
}): React.JSX.Element {
  if (href === undefined) return <RowName text={text} />;
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={`${text}, open ${count} ${plural(count, 'trade')} in the trade log`}
      className="rounded-chip outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
    >
      <RowName text={text} />
    </Link>
  );
}

/** Rows to show: all, only those with trades, or all between the first and last with trades. */
export type Visible = 'all' | 'traded' | 'ends';

function visibleRows(rows: BreakdownRow[], mode: Visible): BreakdownRow[] {
  if (mode === 'all') return rows;
  if (mode === 'traded') return rows.filter((r) => r.summary.closedCount > 0);
  // The row of trades with no value to bucket by (R without a stop) stays out of the span.
  const apart = (r: BreakdownRow) => r.key === '__none__';
  const traded = rows
    .map((r, i) => (r.summary.closedCount > 0 && !apart(r) ? i : -1))
    .filter((i) => i >= 0);
  const first = traded[0] ?? Infinity;
  const last = traded[traded.length - 1] ?? -Infinity;
  return rows.filter((r, i) =>
    apart(r) ? r.summary.closedCount > 0 : i >= first && i <= last,
  );
}

/** The best four and worst three by net, best first; all of them when seven or fewer. */
function ranked(rows: BreakdownRow[]): BreakdownRow[] {
  const sorted = rows
    .filter((r) => r.summary.closedCount > 0)
    .sort((a, b) => basisNet(b) - basisNet(a));
  return sorted.length <= 7
    ? sorted
    : [...sorted.slice(0, 4), ...sorted.slice(-3)];
}

/**
 * What every breakdown report is made of, after comp 07: a chart of net by
 * bucket with the win rate beneath it, the best and worst buckets beside it, and
 * a sortable table below that "Cross-analyse by" swaps for a matrix against
 * another dimension (`?x=side&xm=net`). The reports differ only in what they
 * break down and the controls they put above (`controls`).
 */
export function BreakdownCards({
  data,
  report,
  by,
  options,
  chartLabel,
  tableName,
  rowTitle,
  plural: plural_,
  title,
  chartTitle,
  caption,
  visible = 'all',
  chartVisible = 'ends',
  labelOf,
  rowAllow,
  controls,
  note,
  columnsBefore,
}: {
  data: ReportData;
  /** Names the export: `keel-{report}-YYYY-MM-DD.csv`. */
  report: string;
  by: BreakdownKey;
  options?: BreakdownOptions;
  /** The chart's accessible name: "Net P&L by symbol". */
  chartLabel: string;
  /** The table's accessible name: "Symbols summary". */
  tableName: string;
  /** The first column's header, and the matrix's corner. */
  rowTitle: string;
  /** The rows in the plural: "Symbols". The matrix is "Symbols by side". */
  plural: string;
  /** The table card's title; the chart card's too, unless `chartTitle` is given. */
  title: string;
  /** The chart card's own title, when it should not repeat the table's. */
  chartTitle?: string;
  /** Beside the chart card's title. */
  caption?: ReactNode;
  visible?: Visible;
  chartVisible?: Visible;
  /** How a row reads in the table and the readout; default its label. */
  labelOf?(row: BreakdownRow): string;
  /** Only rows whose key is in this set (the tag report's category, by tag id). */
  rowAllow?: ReadonlySet<string>;
  /** Above the chart, left. */
  controls?: ReactNode;
  /** Under the table card's header. */
  note?: ReactNode;
  /** A column between the name and Trades: the tag's category. */
  columnsBefore?: SummaryColumn<BreakdownRow>[];
}): React.JSX.Element {
  const { partition: p, ctx, basis, currency } = data;
  // The log lists every currency, so with more than one the link names this one.
  const filters = useMemo(
    () =>
      data.currencies.length > 1
        ? { ...data.filters, currency: data.currency }
        : data.filters,
    [data.filters, data.currencies.length, data.currency],
  );
  const params = useSearchParams();
  const display = useDisplay();
  const chartId = useId();
  const [expandSlot, setExpandSlot] = useExpandSlot();
  const rankId = useId();
  const tableId = useId();
  const cross = CROSS_DIMS.find(
    (d) => d.key === params.get('x') && !sameDimension(d.key, by),
  );
  const metric =
    CROSS_METRICS.find((m) => m.value === params.get('xm'))?.value ?? 'net';
  const accounts = useAccounts().data;
  const merged = useMemo(
    () => ({
      ...ctx,
      accountNames: accountNamesOf(
        accounts,
        p.trades.map((t) => t.accountId),
      ),
      ...options,
    }),
    [ctx, options, accounts, p.trades],
  );
  const describe = labelOf ?? ((r: BreakdownRow) => r.label);
  // A bucket's link adds its filter to the page's, on the date the breakdown buckets by.
  const linkOpts: BucketOptions = {
    ...(options?.timeBasis ? { timeBasis: options.timeBasis } : {}),
    ...(options?.bucketMinutes ? { bucketMinutes: options.bucketMinutes } : {}),
  };
  const hrefOfRow = (r: BreakdownRow) =>
    r.summary.closedCount > 0
      ? bucketHref(filters, by, r.key, linkOpts)
      : undefined;

  const all = useMemo(
    () =>
      breakdown(p.trades, by, merged).filter(
        (r) => !rowAllow || rowAllow.has(r.key),
      ),
    [p.trades, by, merged, rowAllow],
  );
  const chartRows = useMemo(
    () => visibleRows(all, chartVisible),
    [all, chartVisible],
  );
  const tableRows = useMemo(() => visibleRows(all, visible), [all, visible]);
  const best = useMemo(() => ranked(all), [all]);
  const picked = useMemo(() => highlights(all), [all]);
  const largest = Math.max(1, ...best.map((r) => Math.abs(basisNet(r))));

  /** A group of trades in the chosen unit; `money` is the view's own total. */
  const sumOf = (r: BreakdownRow) => display.ofTrades(r.tradeIds, basisNet(r));
  const figureLabel = (r: BreakdownRow) =>
    display.figure(sumOf(r), true, currency).label;
  const bestRow = best[0];
  const worstRow = best.length > 1 ? best[best.length - 1] : undefined;
  const param = params.get('m');
  const fromAddress = useMemo(
    (): Pick[] =>
      // A breakdown has no time to run along: a running mode in the link is dropped.
      parsePicks(param, DEFAULT_PICKS, CHART_METRICS).map((x) => ({
        ...x,
        mode: 'period',
      })),
    [param],
  );
  // The chips change at once and follow the address when it changes, so a
  // second change before the address catches up keeps the first.
  const [picks, setLocalPicks] = useAddressCopy(
    fromAddress,
    JSON.stringify(param),
  );
  const setPicks = (next: Pick[]) => {
    setLocalPicks(next);
    writeParam('m', formatPicks(next));
  };
  // The caller words the label for Net P&L. With Net P&L first it stays, and the other
  // metrics follow at the end; without it the label names what is plotted.
  const metricNames = picks.map((x) => metricLabel(x.metric, basis));
  const netFirst = picks[0]?.metric === 'net';
  const named = netFirst
    ? chartLabel
    : chartLabel.replace(
        /^Net P&L/,
        metricNames.length === 0 ? 'No metric' : metricNames.join(' and '),
      );
  const chartName = [
    `${named}, ${data.caption}.`,
    bestRow ? `Best ${describe(bestRow)} ${figureLabel(bestRow)}` : '',
    worstRow ? `, worst ${describe(worstRow)} ${figureLabel(worstRow)}.` : '',
    netFirst && picks.length > 1
      ? `Also plotted: ${metricNames.slice(1).join(', ')}.`
      : '',
  ]
    .join(' ')
    .replace(' ,', ',')
    .trim();

  const names = new Map(chartRows.map((r) => [r.key, describe(r)]));
  const short = new Map(chartRows.map((r) => [r.key, r.label]));
  const barHref = new Map(chartRows.map((r) => [r.key, hrefOfRow(r)]));
  const tradesIn = new Map(
    chartRows.map((r) => [r.key, r.summary.closedCount]),
  );
  // The readout gives the trades in a bucket even when they are not plotted.
  const extra = picks.some((x) => x.metric === 'trades')
    ? undefined
    : [
        {
          label: 'Trades',
          text: (key: string) => String(tradesIn.get(key) ?? 0),
        },
      ];

  /** The trade behind a bucket's largest win or loss, for the display units. */
  const tradeById = useMemo(
    () => new Map(p.trades.map((t) => [t.id, t])),
    [p.trades],
  );
  /** The trades `classify` calls a win, and those it calls a loss, in each bucket. */
  const outcomes = useMemo(
    () =>
      new Map(
        all.map((r) => {
          const wins: string[] = [];
          const losses: string[] = [];
          for (const id of r.tradeIds) {
            const t = tradeById.get(id);
            if (!t) continue;
            const o = classify(t, merged).outcome;
            if (o === 'win') wins.push(id);
            else if (o === 'loss') losses.push(id);
          }
          return [r.key, { wins, losses }] as const;
        }),
      ),
    [all, tradeById, merged],
  );
  /**
   * A bucket's plotted value: its summary's, or under a unit that narrows the
   * trades the same figure in that unit (`seriesUnit` says which metrics),
   * read as the table beside the chart reads it.
   */
  const plotted = (r: BreakdownRow, metric: SeriesMetric): number | null => {
    const v = chartValue(r, metric);
    const unit = merged.unit;
    if (v === null || !unit || seriesUnit(metric, merged) !== 'tradeunit')
      return v;
    const own = outcomes.get(r.key);
    switch (metric) {
      case 'net':
        return sumOf(r)[unit] ?? null;
      case 'expectancy':
        return display.expectancy(v, r.tradeIds)[unit] ?? null;
      case 'avg-win':
        return display.meanOfTrades(own?.wins ?? [], v)[unit] ?? null;
      case 'avg-loss':
        return display.meanOfTrades(own?.losses ?? [], v)[unit] ?? null;
      default:
        return v;
    }
  };
  // Named buckets are not a sequence: a line across them would join unrelated bars, so rates are markers sized by their trades.
  const series: ChartSeries[] = picks.map((x) => ({
    label: metricLabel(x.metric, basis),
    kind: x.kind === 'bar' ? 'bar' : 'dots',
    counts: chartRows.map((r) => r.summary.closedCount),
    unit: seriesUnit(x.metric, merged),
    points: chartRows.map((r) => ({
      key: r.key,
      value: plotted(r, x.metric),
    })),
  }));
  /** A bucket's average win or loss: the mean in the unit over its winners (or losers). */
  const meanOf = (r: BreakdownRow, outcome: 'win' | 'loss') => {
    const cents = outcome === 'win' ? r.summary.avgWin : r.summary.avgLoss;
    if (cents === null) return null;
    const own = outcomes.get(r.key);
    const ids = (outcome === 'win' ? own?.wins : own?.losses) ?? [];
    const sort = (() => {
      if (!merged.unit) return cents;
      const values = ids.flatMap((id) => {
        const t = tradeById.get(id);
        return t ? (unitOf(t, merged.unit!, basis) ?? []) : [];
      });
      return values.length === 0
        ? cents
        : values.reduce((a, b) => a + b, 0) / values.length;
    })();
    return { cents, ids, sort };
  };
  const meanCell = (r: BreakdownRow, outcome: 'win' | 'loss') => {
    const m = meanOf(r, outcome);
    if (m === null) return none;
    return (
      <span className={signTone(m.cents)}>
        <FigureText
          f={display.figure(
            display.meanOfTrades(m.ids, m.cents),
            true,
            currency,
          )}
        />
      </span>
    );
  };
  const dailyVolume = (r: BreakdownRow) =>
    r.tradingDays > 0 ? Number((r.volume / r.tradingDays).toFixed(2)) : null;
  /**
   * A bucket's largest win or loss: in a unit, the trade largest in it, and
   * the column sorts on its value there; in money, the trade with that amount.
   */
  const largestOf = (
    r: BreakdownRow,
    cents: number | null,
    outcome: 'win' | 'loss',
  ) => {
    if (cents === null) return null;
    const own = r.tradeIds.flatMap((id) => tradeById.get(id) ?? []);
    const inUnit = largestInUnit(own, merged, outcome);
    if (inUnit && merged.unit)
      return {
        trade: inUnit,
        money: pnlOf(inUnit, basis),
        sort: unitOf(inUnit, merged.unit, basis) ?? cents,
      };
    return {
      trade: own.find((t) => pnlOf(t, basis) === cents),
      money: cents,
      sort: cents,
    };
  };
  const largestCell = (
    r: BreakdownRow,
    cents: number | null,
    outcome: 'win' | 'loss',
  ) => {
    const largest = largestOf(r, cents, outcome);
    if (largest === null) return none;
    const { trade, money } = largest;
    const f = trade ? display.ofTrade(trade) : display.ofAll(money);
    return (
      <span className={`font-[550] ${signTone(money)}`}>
        <FigureText f={display.figure({ ...f, money }, true, currency)} />
      </span>
    );
  };

  const none = <span className="text-faint">None</span>;
  const columns: SummaryColumn<BreakdownRow>[] = [
    {
      id: 'name',
      header: rowTitle,
      value: (r) => describe(r),
      cell: (r) => (
        <BucketName
          text={describe(r)}
          href={hrefOfRow(r)}
          count={r.summary.closedCount}
        />
      ),
      descFirst: false,
    },
    ...(columnsBefore ?? []),
    {
      id: 'trades',
      header: 'Trades',
      tip: 'trades',
      align: 'right',
      value: (r) => r.summary.closedCount,
    },
    {
      id: 'win-rate',
      header: 'Win rate',
      tip: 'win-rate',
      align: 'right',
      value: (r) => r.summary.winRate,
      cell: (r) =>
        r.summary.winRate === null ? none : formatPct(r.summary.winRate, 1),
      csv: {
        header: 'Win rate (%)',
        value: (r) =>
          r.summary.winRate === null
            ? null
            : (r.summary.winRate * 100).toFixed(1),
      },
    },
    {
      id: 'net',
      header: `${basis === 'gross' ? 'Gross' : 'Net'} P&L`,
      tip: 'pnl',
      align: 'right',
      value: (r) => (r.summary.closedCount > 0 ? basisNet(r) : null),
      csv: {
        header: `${basis === 'gross' ? 'Gross' : 'Net'} P&L (${currency})`,
        value: (r) =>
          r.summary.closedCount > 0 ? decimalOf(basisNet(r)) : null,
      },
      cell: (r) =>
        r.summary.closedCount === 0 ? (
          none
        ) : (
          <span className={`font-[550] ${signTone(basisNet(r))}`}>
            <FigureText f={display.figure(sumOf(r), true, currency)} />
          </span>
        ),
    },
    {
      id: 'profit-factor',
      header: 'Profit factor',
      tip: 'profit-factor',
      align: 'right',
      value: (r) => r.summary.profitFactor,
      cell: (r) =>
        r.summary.profitFactor === null ? (
          none
        ) : (
          <RatioText value={r.summary.profitFactor} />
        ),
      csv: {
        value: (r) => r.summary.profitFactor?.toFixed(2) ?? null,
      },
    },
    {
      id: 'average',
      header: 'Average',
      tip: 'avg-trade',
      align: 'right',
      value: (r) =>
        r.summary.closedCount > 0
          ? roundHalfEven(basisNet(r) / r.summary.closedCount)
          : null,
      csv: {
        header: `Average (${currency})`,
        value: (r) =>
          r.summary.closedCount > 0
            ? decimalOf(roundHalfEven(basisNet(r) / r.summary.closedCount))
            : null,
      },
      cell: (r) => {
        if (r.summary.closedCount === 0) return none;
        const avg = roundHalfEven(basisNet(r) / r.summary.closedCount);
        return (
          <span className={signTone(avg)}>
            <FigureText
              f={display.figure(
                display.meanOfTrades(r.tradeIds, avg),
                true,
                currency,
              )}
            />
          </span>
        );
      },
    },
    {
      id: 'avg-win',
      header: 'Avg win',
      tip: 'avg-win',
      align: 'right',
      value: (r) => meanOf(r, 'win')?.sort ?? null,
      cell: (r) => meanCell(r, 'win'),
      csv: {
        header: `Average win (${currency})`,
        value: (r) => {
          const c = r.summary.avgWin;
          return c === null ? null : decimalOf(c);
        },
      },
    },
    {
      id: 'avg-loss',
      header: 'Avg loss',
      tip: 'avg-loss',
      align: 'right',
      value: (r) => meanOf(r, 'loss')?.sort ?? null,
      // The most negative first.
      descFirst: false,
      cell: (r) => meanCell(r, 'loss'),
      csv: {
        header: `Average loss (${currency})`,
        value: (r) => {
          const c = r.summary.avgLoss;
          return c === null ? null : decimalOf(c);
        },
      },
    },
    {
      id: 'largest-win',
      header: 'Largest win',
      tip: 'largest-win',
      align: 'right',
      value: (r) => largestOf(r, r.summary.largestWin, 'win')?.sort ?? null,
      cell: (r) => largestCell(r, r.summary.largestWin, 'win'),
      csv: {
        header: `Largest win (${currency})`,
        value: (r) =>
          r.summary.largestWin === null
            ? null
            : decimalOf(r.summary.largestWin),
      },
    },
    {
      id: 'largest-loss',
      header: 'Largest loss',
      tip: 'largest-loss',
      align: 'right',
      value: (r) => largestOf(r, r.summary.largestLoss, 'loss')?.sort ?? null,
      // The most negative first.
      descFirst: false,
      cell: (r) => largestCell(r, r.summary.largestLoss, 'loss'),
      csv: {
        header: `Largest loss (${currency})`,
        value: (r) =>
          r.summary.largestLoss === null
            ? null
            : decimalOf(r.summary.largestLoss),
      },
    },
    {
      id: 'avg-daily-volume',
      header: 'Avg daily vol',
      tip: 'avg-daily-volume',
      align: 'right',
      value: (r) => dailyVolume(r),
      cell: (r) => {
        const v = dailyVolume(r);
        return v === null ? none : formatQty(v);
      },
      csv: { header: 'Average daily volume', value: (r) => dailyVolume(r) },
    },
  ];
  // The name (and the tag's category) always show; the others follow the address.
  const shownIds = useMemo(
    () => parseColumns(params.get(COLUMNS_PARAM)),
    [params],
  );
  const chosen = new Set<string>(shownIds);
  const choosable = new Set<string>(REPORT_COLUMNS.map((c) => c.id));
  const visibleColumns = columns.filter(
    (c) => !choosable.has(c.id) || chosen.has(c.id),
  );

  // One pass serves the metric, the counts and the trades behind each cell.
  const matrix = useMemo(
    () =>
      cross ? breakdown2D(p.trades, merged, by, cross.key, metric) : undefined,
    [cross, p.trades, merged, by, metric],
  );
  const matrixRows = matrix?.rows
    .map((row, i) => ({ ...row, i }))
    .filter((r) => !rowAllow || rowAllow.has(r.key));

  /** The table or the matrix as it shows, with real values: Privacy hides figures on screen, not in a file. */
  const exportCsv = () => {
    let csv: string;
    if (cross && matrix && matrixRows) {
      const text = (v: number | null): string | null =>
        v === null
          ? null
          : metric === 'net'
            ? decimalOf(v)
            : metric === 'win-rate'
              ? (v * 100).toFixed(1)
              : metric === 'profit-factor'
                ? v.toFixed(2)
                : String(v);
      csv = csvText(
        [rowTitle, ...matrix.cols.map((c) => c.label)],
        matrixRows.map((row) => [
          row.label,
          ...matrix.cols.map((_, c) => text(matrix.cells[row.i]?.[c] ?? null)),
        ]),
      );
    } else {
      csv = csvText(
        visibleColumns.map((c) => c.csv?.header ?? c.header),
        tableRows.map((r) =>
          visibleColumns.map((c) =>
            c.csv ? c.csv.value(r) : (c.value(r) ?? null),
          ),
        ),
      );
    }
    downloadCsv(csv, `keel-${report}-${data.today}.csv`);
  };

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section aria-labelledby={chartId} className={`${CARD} ${CARD_PAD}`}>
          <CardHeader
            headingId={chartId}
            title={chartTitle ?? title}
            after={
              caption ? (
                <span className="text-[12.5px] text-faint">{caption}</span>
              ) : undefined
            }
            end={<span ref={setExpandSlot} className="flex" />}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {controls}
            <div className="ml-auto">
              <MetricChips
                picks={picks}
                available={CHART_METRICS}
                basis={basis}
                onChange={setPicks}
              />
            </div>
          </div>
          <div className="mt-3">
            <ReportChart
              expandSlot={expandSlot}
              label={chartName}
              series={series}
              currency={currency}
              height={chartRows.length > 0 ? 230 : undefined}
              rowRatio={0.4}
              tiltLabels={UNORDERED.has(by)}
              xLabel={(key) => short.get(key) ?? key}
              periodLabel={(key) => names.get(key) ?? key}
              extra={extra}
              hrefOf={(key) => barHref.get(key)}
            />
          </div>
        </section>

        <section aria-labelledby={rankId} className={`${CARD} ${CARD_PAD}`}>
          <CardHeader
            headingId={rankId}
            title="Best and worst"
            end={
              <span className="text-[12.5px] text-faint">
                by {basis} P&amp;L
              </span>
            }
          />
          {best.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-faint">
              No closed trades here yet.
            </p>
          ) : (
            <ol aria-label="Best and worst" className="mt-2">
              {best.map((r) => (
                <li
                  key={r.key}
                  className="grid grid-cols-[minmax(6.25rem,8.5rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-line/70 py-2 last:border-b-0"
                >
                  <b className="truncate text-[13.5px] font-semibold text-text">
                    {describe(r)}
                  </b>
                  <span
                    aria-hidden="true"
                    className="h-2 overflow-hidden rounded-full bg-sunken"
                  >
                    <span
                      className={`block h-full rounded-full ${basisNet(r) < 0 ? 'bg-loss-fill' : 'bg-gain-fill'}`}
                      style={{
                        width: `${Math.max(3, (Math.abs(basisNet(r)) / largest) * 100)}%`,
                      }}
                    />
                  </span>
                  <span
                    className={`text-right text-[13.5px] font-semibold tabular-nums ${signTone(basisNet(r))}`}
                  >
                    <FigureText f={display.figure(sumOf(r), true, currency)} />
                  </span>
                  <span className="col-start-2 col-end-4 text-xs text-faint">
                    {r.summary.closedCount}{' '}
                    {plural(r.summary.closedCount, 'trade')},{' '}
                    {r.summary.winRate === null
                      ? 'no decided trades'
                      : `${formatPct(r.summary.winRate, 0)} won`}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {picked.mostActive ? (
            <ul
              aria-label="Highlights"
              className="mt-2 border-t border-line pt-2"
            >
              <li className="flex flex-wrap items-baseline gap-x-2 py-1 text-[13px]">
                <span className="text-faint">Most active</span>
                <b className="font-semibold text-text">
                  {describe(picked.mostActive)}
                </b>
                <span className="text-muted tabular-nums">
                  {picked.mostActive.summary.closedCount}{' '}
                  {plural(picked.mostActive.summary.closedCount, 'trade')}
                </span>
              </li>
              <li className="flex flex-wrap items-baseline gap-x-2 py-1 text-[13px]">
                <span className="text-faint">Best win rate</span>
                {picked.bestWinRate ? (
                  <>
                    <b className="font-semibold text-text">
                      {describe(picked.bestWinRate)}
                    </b>
                    <span className="text-muted tabular-nums">
                      {formatPct(picked.bestWinRate.summary.winRate ?? 0, 0)}{' '}
                      won, {picked.bestWinRate.summary.closedCount}{' '}
                      {plural(picked.bestWinRate.summary.closedCount, 'trade')}
                    </span>
                  </>
                ) : (
                  <span className="text-faint">None</span>
                )}
              </li>
            </ul>
          ) : null}
        </section>
      </div>

      <section
        aria-labelledby={tableId}
        className={`${CARD} ${CARD_PAD} min-w-0`}
      >
        <CardHeader
          headingId={tableId}
          title={cross ? `${rowTitle} by ${cross.label.toLowerCase()}` : title}
          after={
            <span className="text-[12.5px] text-faint">
              {cross
                ? 'Each cell is the trades in both'
                : 'Click a header to sort'}
            </span>
          }
          end={
            <span className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
              {cross ? (
                <ReportSelect
                  label="Cross-analysis metric"
                  value={metric}
                  onChange={(v) => writeParam('xm', v === 'net' ? null : v)}
                  options={CROSS_METRICS}
                  hideLabel
                />
              ) : null}
              <ReportSelect
                label="Cross-analyse by"
                value={cross?.key ?? ''}
                onChange={(v) => writeParam('x', v === '' ? null : v)}
                options={[
                  { value: '', label: 'None' },
                  ...CROSS_DIMS.filter((d) => !sameDimension(d.key, by)).map(
                    (d) => ({
                      value: d.key,
                      label: d.label,
                    }),
                  ),
                ]}
              />
              {cross ? null : (
                <ColumnsChooser
                  shown={shownIds}
                  labelOf={(id, fallback) =>
                    id === 'net'
                      ? `${basis === 'gross' ? 'Gross' : 'Net'} P&L`
                      : fallback
                  }
                  onChange={(next) =>
                    writeParam(COLUMNS_PARAM, formatColumns(next))
                  }
                  onReset={() => writeParam(COLUMNS_PARAM, null)}
                />
              )}
              <button
                type="button"
                onClick={exportCsv}
                disabled={cross ? !matrixRows?.length : tableRows.length === 0}
                className="inline-flex h-[30px] items-center gap-1.5 rounded-control border border-line bg-surface-1 px-3 text-[13.5px] font-medium whitespace-nowrap text-muted shadow-[0_1px_1px_rgb(18_22_51/0.04)] transition-[border-color] duration-200 ease-(--ease-glide) hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 pointer-coarse:h-11"
              >
                <DownloadSimple
                  size={16}
                  aria-hidden="true"
                  className="text-faint"
                />
                Export CSV
              </button>
            </span>
          }
        />
        {note ? <div className="mt-2">{note}</div> : null}
        <div className="mt-2">
          {cross && matrix && matrixRows ? (
            <CrossAnalysis
              label={`${plural_} by ${cross.label.toLowerCase()}`}
              rowTitle={rowTitle}
              rows={matrixRows}
              columns={matrix.cols}
              currency={currency}
              cell={(rowKey, colKey) => {
                const r = matrix.rows.findIndex((x) => x.key === rowKey);
                const c = matrix.cols.findIndex((x) => x.key === colKey);
                const v = matrix.cells[r]?.[c] ?? null;
                if (v === null) return undefined;
                const count = matrix.counts[r]?.[c] ?? 0;
                const tradeIds = matrix.tradeIds[r]?.[c] ?? [];
                const href = cellHref(
                  filters,
                  { by, key: rowKey },
                  { by: cross.key, key: colKey },
                  linkOpts,
                );
                return metric === 'net'
                  ? { value: v, count, tradeIds, ...(href && { href }) }
                  : {
                      value: v,
                      count,
                      ...(metric === 'profit-factor'
                        ? { ratio: true as const }
                        : { text: crossText(metric, v) }),
                      tint: tintOf(metric, v),
                      ...(href && { href }),
                    };
              }}
            />
          ) : (
            <SummaryTable
              key={`${by}-${rowAllow ? [...rowAllow].join() : ''}`}
              label={tableName}
              rows={tableRows}
              columns={visibleColumns}
              basis={basis}
            />
          )}
        </div>
      </section>
    </>
  );
}

/** A plain breakdown report: the cards, scoped to the data. */
function Plain({
  testId,
  ...props
}: { testId: string } & Omit<
  Parameters<typeof BreakdownCards>[0],
  'data'
>): React.JSX.Element {
  return (
    <ReportScope testId={testId}>
      {(data) => <BreakdownCards data={data} {...props} />}
    </ReportScope>
  );
}

type SymbolsTab = 'symbol' | 'instrument' | 'price';
const SYMBOL_TABS: { value: SymbolsTab; label: string }[] = [
  { value: 'symbol', label: 'By symbol' },
  { value: 'instrument', label: 'By instrument' },
  { value: 'price', label: 'By entry price' },
];
type Limit = 'all' | 'top' | 'bottom';
const LIMITS: { value: Limit; label: string }[] = [
  { value: 'all', label: 'All symbols' },
  { value: 'top', label: 'Top 10' },
  { value: 'bottom', label: 'Bottom 10' },
];

/** Symbols' three views, by symbol (limited to the top or bottom 10 by net if asked), by instrument, by entry price. */
function SymbolsBody({ data }: { data: ReportData }): React.JSX.Element {
  const params = useSearchParams();
  const tab =
    SYMBOL_TABS.find((t) => t.value === params.get('view'))?.value ?? 'symbol';
  const limit =
    LIMITS.find((l) => l.value === params.get('lim'))?.value ?? 'all';
  const views = {
    symbol: {
      by:
        limit === 'top'
          ? ('symbol-top' as const)
          : limit === 'bottom'
            ? ('symbol-bottom' as const)
            : ('symbol' as const),
      chartLabel: 'Net P&L by symbol',
      tableName: 'Symbols summary',
      rowTitle: 'Symbol',
      plural: 'Symbols',
      title: 'By symbol',
      caption: undefined,
    },
    instrument: {
      by: 'instrument' as const,
      chartLabel: 'Net P&L by instrument',
      tableName: 'Instruments summary',
      rowTitle: 'Instrument',
      plural: 'Instruments',
      title: 'By instrument',
      caption: 'The asset class: stocks, options, futures, forex, crypto, CFDs',
    },
    price: {
      by: 'entry-price' as const,
      chartLabel: 'Net P&L by entry price',
      tableName: 'Entry prices summary',
      rowTitle: 'Entry price',
      plural: 'Entry prices',
      title: 'By entry price',
      caption: 'Ranges cut to the prices in this set',
    },
  }[tab];
  const controls =
    tab === 'symbol' ? (
      <ReportSelect
        label="Show"
        value={limit}
        onChange={(v) => writeParam('lim', v === 'all' ? null : v)}
        options={LIMITS}
      />
    ) : undefined;
  return (
    <SubTabs
      label="Symbols view"
      param="view"
      options={SYMBOL_TABS}
      value={tab}
    >
      <BreakdownCards
        key={views.by}
        data={data}
        report="symbols"
        by={views.by}
        chartLabel={views.chartLabel}
        tableName={views.tableName}
        rowTitle={views.rowTitle}
        plural={views.plural}
        title={views.title}
        {...(views.caption ? { caption: views.caption } : {})}
        controls={controls}
      />
    </SubTabs>
  );
}

/**
 * Reports, Symbols: every symbol traded, by root; or by instrument (asset
 * class); or by entry-price range. `?view=instrument`, `?view=price`, and for
 * symbols `?lim=top` or `?lim=bottom` for the best or worst ten by net.
 */
export function SymbolsView(): React.JSX.Element {
  return (
    <ReportScope testId="reports-symbols">
      {(data) => <SymbolsBody data={data} />}
    </ReportScope>
  );
}

/** Reports, Strategies: a trade counts under each of its strategies. */
export function StrategiesView(): React.JSX.Element {
  const { options } = useNames();
  return (
    <Plain
      testId="reports-strategies"
      report="strategies"
      by="strategy"
      options={options}
      chartLabel="Net P&L by strategy"
      tableName="Strategies summary"
      rowTitle="Strategy"
      plural="Strategies"
      title="By strategy"
      caption="A trade counts under each of its strategies"
    />
  );
}

/**
 * Reports, Tags: tags grouped by their category, with a select for one category.
 * A trade counts under each of its tags.
 */
export function TagsView(): React.JSX.Element {
  const { options, categories } = useNames();
  const params = useSearchParams();
  const category = categories.find((c) => c.id === params.get('cat'));
  const tags = useTags().data;
  // By tag id: two tags may share a name in different categories.
  const allow = useMemo(
    () =>
      category
        ? new Set(
            (tags ?? [])
              .filter((t) => t.categoryId === category.id)
              .map((t) => t.id),
          )
        : undefined,
    [category, tags],
  );
  return (
    <Plain
      testId="reports-tags"
      report="tags"
      by="tag"
      options={options}
      rowAllow={allow}
      chartLabel="Net P&L by tag"
      tableName="Tags summary"
      rowTitle="Tag"
      plural="Tags"
      title="By tag"
      caption="A trade counts under each of its tags"
      controls={
        <ReportSelect
          label="Category"
          value={category?.id ?? ''}
          onChange={(v) => writeParam('cat', v === '' ? null : v)}
          options={[
            { value: '', label: 'All categories' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      }
      columnsBefore={[
        {
          id: 'category',
          header: 'Category',
          value: (r) => r.group ?? '',
          cell: (r) => r.group ?? <span className="text-faint">None</span>,
          descFirst: false,
        },
      ]}
    />
  );
}

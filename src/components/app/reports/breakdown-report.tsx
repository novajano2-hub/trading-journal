'use client';

import {
  ArrowsLeftRight,
  ChartBar,
  ListNumbers,
  Table,
} from '@phosphor-icons/react/dist/ssr';
import { useSearchParams } from 'next/navigation';
import { useId, useMemo, type ReactNode } from 'react';
import { FigureText } from '@/components/product/figure-text';
import {
  breakdown,
  breakdown2D,
  type BreakdownKey,
  type BreakdownOptions,
  type BreakdownRow,
  type CrossMetric,
} from '@/domain/metrics/breakdowns';
import { roundHalfEven } from '@/domain/money';
import { useStrategies, useTagCategories, useTags } from '@/data/query/hooks';
import type { TagCategory } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { formatPct, plural } from '@/lib/format';
import { CARD, CARD_PAD, CardHeader, signTone } from '../dashboard/shared';
import { CrossAnalysis } from './cross-analysis';
import { ReportChart, type ChartSeries } from './report-chart';
import { ReportScope } from './report-scope';
import { SummaryTable, type SummaryColumn } from './summary-table';
import { writeParam, type ReportData } from './use-report-data';

/** A labelled native select: the report's small controls, readable by every assistive technology. */
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
  /** The label is for assistive technology only. */
  hideLabel?: boolean;
}): React.JSX.Element {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-muted">
      <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-48 cursor-pointer rounded-control border border-line bg-surface-1 px-2 text-[13.5px] font-medium text-text outline-offset-2 hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
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
];

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
  by,
  options,
  chartLabel,
  tableName,
  rowTitle,
  plural: plural_,
  title,
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
  /** The table card's title. */
  title: string;
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
  const params = useSearchParams();
  const display = useDisplay();
  const chartId = useId();
  const rankId = useId();
  const tableId = useId();
  const cross = CROSS_DIMS.find(
    (d) => d.key === params.get('x') && d.key !== by,
  );
  const metric =
    CROSS_METRICS.find((m) => m.value === params.get('xm'))?.value ?? 'net';
  const merged = useMemo(() => ({ ...ctx, ...options }), [ctx, options]);
  const describe = labelOf ?? ((r: BreakdownRow) => r.label);

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
  const largest = Math.max(1, ...best.map((r) => Math.abs(basisNet(r))));

  /** A group of trades in the chosen unit; `money` is the view's own total. */
  const sumOf = (r: BreakdownRow) => display.ofTrades(r.tradeIds, basisNet(r));
  const figureLabel = (r: BreakdownRow) =>
    display.figure(sumOf(r), true, currency).label;
  const bestRow = best[0];
  const worstRow = best.length > 1 ? best[best.length - 1] : undefined;
  const chartName = [
    `${chartLabel}, ${data.caption}.`,
    bestRow ? `Best ${describe(bestRow)} ${figureLabel(bestRow)}` : '',
    worstRow ? `, worst ${describe(worstRow)} ${figureLabel(worstRow)}.` : '',
  ]
    .join(' ')
    .replace(' ,', ',')
    .trim();

  const names = new Map(chartRows.map((r) => [r.key, describe(r)]));
  const short = new Map(chartRows.map((r) => [r.key, r.label]));
  const series: ChartSeries[] = [
    {
      label: `${basis === 'gross' ? 'Gross' : 'Net'} P&L`,
      kind: 'bar',
      unit: 'money',
      points: chartRows.map((r) => ({
        key: r.key,
        value: r.summary.closedCount > 0 ? basisNet(r) : null,
      })),
    },
    {
      label: 'Win rate',
      kind: 'line',
      unit: 'pct',
      points: chartRows.map((r) => ({ key: r.key, value: r.summary.winRate })),
    },
  ];

  const none = <span className="text-faint">None</span>;
  const columns: SummaryColumn<BreakdownRow>[] = [
    {
      id: 'name',
      header: rowTitle,
      value: (r) => describe(r),
      cell: (r) => <RowName text={describe(r)} />,
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
    },
    {
      id: 'net',
      header: `${basis === 'gross' ? 'Gross' : 'Net'} P&L`,
      tip: 'pnl',
      align: 'right',
      value: (r) => (r.summary.closedCount > 0 ? basisNet(r) : null),
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
        r.summary.profitFactor === null
          ? none
          : r.summary.profitFactor.toFixed(2),
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
  ];

  // One pass serves the metric, the counts and the trades behind each cell.
  const matrix = useMemo(
    () =>
      cross ? breakdown2D(p.trades, merged, by, cross.key, metric) : undefined,
    [cross, p.trades, merged, by, metric],
  );
  const matrixRows = matrix?.rows
    .map((row, i) => ({ ...row, i }))
    .filter((r) => !rowAllow || rowAllow.has(r.key));

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section aria-labelledby={chartId} className={`${CARD} ${CARD_PAD}`}>
          <CardHeader
            icon={ChartBar}
            tone="accent"
            headingId={chartId}
            title={title}
            after={
              caption ? (
                <span className="text-[12.5px] text-faint">{caption}</span>
              ) : undefined
            }
          />
          {controls ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {controls}
            </div>
          ) : null}
          <div className="mt-3">
            <ReportChart
              label={chartName}
              series={series}
              currency={currency}
              height={chartRows.length > 0 ? 190 : undefined}
              xLabel={(key) => short.get(key) ?? key}
              periodLabel={(key) => names.get(key) ?? key}
            />
          </div>
        </section>

        <section aria-labelledby={rankId} className={`${CARD} ${CARD_PAD}`}>
          <CardHeader
            icon={ListNumbers}
            tone="neutral"
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
        </section>
      </div>

      <section
        aria-labelledby={tableId}
        className={`${CARD} ${CARD_PAD} min-w-0`}
      >
        <CardHeader
          icon={cross ? ArrowsLeftRight : Table}
          tone="neutral"
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
                  ...CROSS_DIMS.filter((d) => d.key !== by).map((d) => ({
                    value: d.key,
                    label: d.label,
                  })),
                ]}
              />
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
                return metric === 'net'
                  ? { value: v, count, tradeIds }
                  : {
                      value: v,
                      count,
                      text: crossText(metric, v),
                      tint: tintOf(metric, v),
                    };
              }}
            />
          ) : (
            <SummaryTable
              key={`${by}-${rowAllow ? [...rowAllow].join() : ''}`}
              label={tableName}
              rows={tableRows}
              columns={columns}
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

/** Reports, Symbols: every symbol traded, by root. */
export function SymbolsView(): React.JSX.Element {
  return (
    <Plain
      testId="reports-symbols"
      by="symbol"
      chartLabel="Net P&L by symbol"
      tableName="Symbols summary"
      rowTitle="Symbol"
      plural="Symbols"
      title="By symbol"
    />
  );
}

/** Reports, Strategies: a trade counts under each of its strategies. */
export function StrategiesView(): React.JSX.Element {
  const { options } = useNames();
  return (
    <Plain
      testId="reports-strategies"
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

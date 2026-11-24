'use client';

import { MagnifyingGlass, Plus, X } from '@phosphor-icons/react/dist/ssr';
import { format, parseISO } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { Popover } from 'radix-ui';
import { MetricTip } from '@/components/ui/metric-tip';
import { Segmented } from '@/components/ui/segmented';
import type { MetricId } from '@/content/metric-definitions';
import type { PnlBasis } from '@/domain/types';
import {
  SERIES_GROUPS,
  SERIES_META,
  SERIES_METRICS,
  seriesUnit,
  timeSeries,
  type Bucket,
  type SeriesMetric,
  type SeriesPoint,
} from '@/domain/metrics/series';
import { useAddressCopy } from '@/lib/use-address-copy';
import { useDisplay } from '@/lib/display';
import { CARD, CARD_PAD, CardHeader, signTone } from '../dashboard/shared';
import {
  formatPicks,
  labelOf,
  MAX_METRICS,
  modeOf,
  parsePicks,
  type Pick,
} from './metric-chips';
import {
  formatterOf,
  periodText,
  ReportChart,
  useExpandSlot,
  type ChartSeries,
} from './report-chart';
import { ReportScope } from './report-scope';
import { SummaryTable, type SummaryColumn } from './summary-table';
import { writeParam, type ReportData } from './use-report-data';

const BUCKETS: readonly Bucket[] = ['day', 'week', 'month'];
/** The metric each picker row's label defines. */
const TIPS: Record<SeriesMetric, MetricId> = {
  net: 'pnl',
  'cumulative-net': 'cumulative-pnl',
  'avg-daily-net': 'avg-daily-pnl',
  'avg-win': 'avg-win',
  'avg-loss': 'avg-loss',
  'win-loss-ratio': 'avg-win-loss',
  expectancy: 'expectancy',
  'largest-win': 'largest-win',
  'largest-loss': 'largest-loss',
  'profit-factor': 'profit-factor',
  fees: 'fees',
  'avg-planned-r': 'planned-r',
  'avg-realized-r': 'realized-r',
  'max-drawdown': 'max-drawdown',
  'avg-drawdown': 'avg-drawdown',
  'avg-hold-time': 'hold-time',
  'longest-trade': 'longest-trade',
  'avg-day-length': 'avg-day-length',
  'longest-day': 'longest-day',
  trades: 'trades',
  wins: 'winners',
  losses: 'losers',
  breakevens: 'breakevens',
  'open-trades': 'open-trades',
  'long-trades': 'long-trades',
  'short-trades': 'short-trades',
  volume: 'volume',
  'avg-daily-volume': 'avg-daily-volume',
  'win-rate': 'win-rate',
  'long-win-rate': 'long-win-rate',
  'short-win-rate': 'short-win-rate',
  'green-days': 'daily-win-rate',
  'win-streak': 'win-streak',
  'loss-streak': 'loss-streak',
  'green-day-streak': 'green-day-streak',
  'red-day-streak': 'red-day-streak',
  sharpe: 'sharpe',
  sortino: 'sortino',
};

function bucketOf(param: string | null): Bucket {
  return BUCKETS.find((b) => b === param) ?? 'week';
}

/** A period's key in words: a day, "Week of 2 Nov" or a month. */
function periodOf(bucket: Bucket): (key: string) => string {
  return bucket === 'week'
    ? (key) => `Week of ${format(parseISO(key), 'd MMM')}`
    : periodText;
}

/** Every series on the same keys, a gap where a metric has no point. */
function align(all: readonly SeriesPoint[][]): {
  keys: string[];
  aligned: SeriesPoint[][];
} {
  const keys = [...new Set(all.flatMap((s) => s.map((p) => p.key)))].sort();
  return {
    keys,
    aligned: all.map((s) => {
      const byKey = new Map(s.map((p) => [p.key, p.value]));
      return keys.map((key) => ({ key, value: byKey.get(key) ?? null }));
    }),
  };
}

const MODES = [
  { value: 'period', label: 'Period' },
  { value: 'running', label: 'Running' },
] as const;

/** What a plotted metric is called: its name, and "(running)" when it is the running value. */
function seriesLabel(pick: Pick, basis: PnlBasis): string {
  const name = labelOf(pick.metric, basis);
  return modeOf(pick) === 'running' && !SERIES_META[pick.metric].running
    ? `${name} (running)`
    : name;
}

function Body({ data }: { data: ReportData }): React.JSX.Element {
  const { partition: p, ctx, basis, currency } = data;
  const params = useSearchParams();
  const param = params.get('m');
  const fromAddress = useMemo(() => parsePicks(param), [param]);
  // The ticks flip at once and follow the address when it changes, so a
  // second tick before the address catches up keeps the first.
  const [picks, setLocalPicks] = useAddressCopy(
    fromAddress,
    JSON.stringify(param),
  );
  const bucket = bucketOf(params.get('bucket'));
  const display = useDisplay();
  const fmt = formatterOf(display, currency);
  const metricsId = useId();
  const chartId = useId();
  const tableId = useId();
  const [query, setQuery] = useState('');
  const full = picks.length >= MAX_METRICS;
  const [expandSlot, setExpandSlot] = useExpandSlot();

  const setPicks = (next: Pick[]) => {
    setLocalPicks(next);
    writeParam('m', formatPicks(next));
  };
  const toggle = (metric: SeriesMetric, on: boolean) =>
    setPicks(
      on
        ? [...picks, { metric, kind: SERIES_META[metric].kind, mode: 'period' }]
        : picks.filter((x) => x.metric !== metric),
    );
  const change = (pick: Pick, to: Partial<Pick>) =>
    setPicks(picks.map((x) => (x === pick ? { ...x, ...to } : x)));

  const needle = query.trim().toLowerCase();
  const groups = SERIES_GROUPS.map((group) => ({
    group,
    metrics: SERIES_METRICS.filter(
      (m) =>
        SERIES_META[m].group === group &&
        (needle === '' || labelOf(m, basis).toLowerCase().includes(needle)),
    ),
  })).filter((g) => g.metrics.length > 0);

  const { keys, aligned } = useMemo(
    () =>
      align(
        picks.map((x) =>
          timeSeries(p.dayTrades, ctx, x.metric, bucket, {
            mode: modeOf(x),
            balance: { start: p.riskStart, flows: p.riskFlows },
          }),
        ),
      ),
    [picks, p.dayTrades, p.riskStart, p.riskFlows, ctx, bucket],
  );
  const series: ChartSeries[] = picks.map((x, i) => ({
    label: seriesLabel(x, basis),
    kind: x.kind,
    unit: seriesUnit(x.metric, ctx),
    points: aligned[i]!,
  }));
  const period = periodOf(bucket);
  /** Where each metric runs, so the label carries values as well as names. */
  const ranges = series
    .map((x) => {
      const vs = x.points.flatMap((pt) =>
        pt.value === null ? [] : [pt.value],
      );
      if (vs.length === 0) return '';
      const lo = Math.min(...vs);
      const hi = Math.max(...vs);
      return lo === hi
        ? ` ${x.label} is ${fmt.text(x.unit, lo)}.`
        : ` ${x.label} runs from ${fmt.text(x.unit, lo)} to ${fmt.text(x.unit, hi)}.`;
    })
    .join('');

  const rows = useMemo(
    () =>
      keys.map((key, i) => ({
        key,
        values: aligned.map((s) => s[i]!.value),
      })),
    [keys, aligned],
  );
  const columns: SummaryColumn<(typeof rows)[number]>[] = [
    {
      id: 'period',
      header: 'Period',
      value: (r) => r.key,
      cell: (r) => period(r.key),
      descFirst: false,
    },
    ...picks.map((x, i): SummaryColumn<(typeof rows)[number]> => {
      const unit = series[i]!.unit;
      return {
        id: x.metric,
        header: seriesLabel(x, basis),
        tip: TIPS[x.metric],
        align: 'right',
        value: (r) => r.values[i],
        cell: (r) => {
          const v = r.values[i];
          if (v === null || v === undefined)
            return <span className="text-faint">None</span>;
          if (unit === 'money' || unit === 'tradeunit')
            return (
              <span className={`font-[550] ${signTone(v)}`}>
                {fmt.node(unit, v)}
              </span>
            );
          return fmt.node(unit, v);
        },
      };
    }),
  ];

  return (
    <>
      <section aria-labelledby={metricsId} className={`${CARD} ${CARD_PAD}`}>
        <CardHeader
          headingId={metricsId}
          title="Metrics"
          after={
            <span className="text-[12.5px] text-faint">
              {full ? (
                <span id={`${metricsId}-limit`}>Three metrics at most</span>
              ) : (
                'Up to three, each as bars or a line'
              )}
            </span>
          }
          end={
            <Segmented
              label="Group by"
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
              value={bucket}
              onChange={(b) => writeParam('bucket', b)}
              coarseTargets
            />
          }
        />
        {picks.length > 0 ? (
          <ul
            aria-label="Plotted metrics"
            className="mt-3 divide-y divide-line/60 rounded-control border border-line"
          >
            {picks.map((pick) => {
              const label = labelOf(pick.metric, basis);
              return (
                <li
                  key={pick.metric}
                  className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5"
                >
                  <span className="min-w-0 flex-1 text-[13.5px] font-medium text-text">
                    {label}
                  </span>
                  <Segmented
                    label={`${label} chart type`}
                    options={[
                      { value: 'bar', label: 'Bar' },
                      { value: 'line', label: 'Line' },
                    ]}
                    value={pick.kind}
                    onChange={(kind) => change(pick, { kind })}
                    coarseTargets
                  />
                  {SERIES_META[pick.metric].running ? null : (
                    <Segmented
                      label={`${label} plotted`}
                      options={MODES}
                      value={pick.mode}
                      onChange={(mode) => change(pick, { mode })}
                      coarseTargets
                    />
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    onClick={() => toggle(pick.metric, false)}
                    className="inline-grid size-7 cursor-pointer place-items-center rounded-[7px] text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
                  >
                    <X size={13} weight="bold" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="mt-3">
          <Popover.Root>
            <Popover.Trigger
              aria-label="Add metric"
              className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[9px] bg-surface-1 px-2.5 text-[13px] font-medium whitespace-nowrap text-muted shadow-[inset_0_0_0_1px_var(--line-2)] outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              Metric
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={6}
                collisionPadding={12}
                aria-label="Choose metrics"
                className="z-50 flex max-h-[min(72dvh,30rem)] w-[min(calc(100vw-24px),640px)] flex-col rounded-control border border-line bg-surface-1 shadow-[var(--shadow)] outline-none"
              >
                <div className="relative flex-none border-b border-line p-2">
                  <MagnifyingGlass
                    size={15}
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-faint"
                  />
                  <input
                    type="search"
                    aria-label="Search metrics"
                    placeholder="Search metrics"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-9 w-full rounded-control border border-line bg-surface-1 pr-3 pl-9 text-[13.5px] text-text outline-none placeholder:text-faint focus-visible:border-accent/60 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
                  />
                </div>
                <div
                  role="group"
                  aria-label="Metrics"
                  className="min-h-0 flex-1 overflow-y-auto px-3 pb-2"
                >
                  {groups.length === 0 ? (
                    <p
                      role="status"
                      className="py-6 text-center text-[13.5px] text-faint"
                    >
                      {`No metric matches "${query.trim()}"`}
                    </p>
                  ) : null}
                  {groups.map(({ group, metrics }) => (
                    <div
                      key={group}
                      role="group"
                      aria-label={group}
                      className="mt-2"
                    >
                      <h3 className="py-1 text-[12.5px] font-semibold text-muted">
                        {group}
                      </h3>
                      <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                        {metrics.map((metric) => {
                          const pick = picks.find((x) => x.metric === metric);
                          const label = labelOf(metric, basis);
                          const off = pick === undefined && full;
                          return (
                            <div
                              key={metric}
                              className="flex min-h-10 items-center gap-2.5 border-b border-line/60 py-1 pointer-coarse:min-h-11"
                            >
                              <input
                                type="checkbox"
                                checked={pick !== undefined}
                                disabled={off}
                                aria-label={label}
                                aria-describedby={
                                  off ? `${metricsId}-limit` : undefined
                                }
                                onChange={(e) =>
                                  toggle(metric, e.target.checked)
                                }
                                className="size-4 flex-none accent-[var(--accent)]"
                              />
                              <span
                                className={`text-[13.5px] ${off ? 'text-faint' : 'text-text'}`}
                              >
                                <MetricTip id={TIPS[metric]} basis={basis}>
                                  {label}
                                </MetricTip>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </section>

      <section aria-labelledby={chartId} className={`${CARD} ${CARD_PAD}`}>
        <CardHeader
          headingId={chartId}
          title="Over time"
          after={
            <span className="text-[12.5px] text-faint">
              By {bucket}, {data.caption}
            </span>
          }
          end={<span ref={setExpandSlot} className="flex" />}
        />
        <div className="mt-3">
          {picks.length === 0 ? (
            <p className="py-10 text-center text-[13.5px] text-faint">
              Pick a metric to chart it.
            </p>
          ) : (
            <ReportChart
              expandSlot={expandSlot}
              label={`${series.map((s) => s.label).join(', ')} by ${bucket}, ${data.caption}.${ranges}`}
              series={series}
              periodLabel={period}
              currency={currency}
            />
          )}
        </div>
      </section>

      <section aria-labelledby={tableId} className={`${CARD} ${CARD_PAD}`}>
        <CardHeader headingId={tableId} title={`By ${bucket}`} />
        <div className="mt-2">
          <SummaryTable
            key={`${bucket}-${picks.map((x) => `${x.metric}${modeOf(x)}`).join()}`}
            label={`Summary by ${bucket}`}
            rows={rows}
            columns={columns}
            basis={basis}
          />
        </div>
      </section>
    </>
  );
}

/**
 * Reports, Performance: up to three metrics, each as bars or a line, over days,
 * weeks or months, with a sortable table of every period beneath. The choice is
 * in the address bar (`?m=net:bar,win-rate:line&bucket=week`) so it can be
 * linked. Day-level and trade-level figures follow `timeSeries`'s rules.
 * Render inside `<Suspense>`.
 */
export function PerformanceView(): React.JSX.Element {
  return (
    <ReportScope testId="reports-performance">
      {(data) => <Body data={data} />}
    </ReportScope>
  );
}

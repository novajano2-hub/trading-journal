'use client';

import { ChartBar, Sliders, Table } from '@phosphor-icons/react/dist/ssr';
import { format, parseISO } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import { useId, useMemo } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { MetricTip } from '@/components/ui/metric-tip';
import { Segmented } from '@/components/ui/segmented';
import { TaskCheckbox } from '@/components/ui/task-checkbox';
import type { MetricId } from '@/content/metric-definitions';
import {
  type SeriesUnit,
  SERIES_META,
  SERIES_METRICS,
  timeSeries,
  type Bucket,
  type SeriesMetric,
  type SeriesPoint,
} from '@/domain/metrics/series';
import type { PnlBasis } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { formatPct } from '@/lib/format';
import { CARD, CARD_PAD, CardHeader, signTone } from '../dashboard/shared';
import {
  formatPicks,
  labelOf,
  MAX_METRICS,
  parsePicks,
  type Pick,
} from './metric-chips';
import { periodText, ReportChart, type ChartSeries } from './report-chart';
import { ReportScope } from './report-scope';
import { SummaryTable, type SummaryColumn } from './summary-table';
import { writeParam, type ReportData } from './use-report-data';

const BUCKETS: readonly Bucket[] = ['day', 'week', 'month'];
/** The metric each picker row's label defines. */
const TIPS: Record<SeriesMetric, MetricId> = {
  net: 'pnl',
  'cumulative-net': 'cumulative-pnl',
  'win-rate': 'win-rate',
  'profit-factor': 'profit-factor',
  expectancy: 'expectancy',
  'avg-win': 'avg-win',
  'avg-loss': 'avg-loss',
  trades: 'trades',
  fees: 'fees',
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

function Body({ data }: { data: ReportData }): React.JSX.Element {
  const { partition: p, ctx, basis, currency } = data;
  const params = useSearchParams();
  const picks = useMemo(() => parsePicks(params.get('m')), [params]);
  const bucket = bucketOf(params.get('bucket'));
  const display = useDisplay();
  const metricsId = useId();
  const chartId = useId();
  const tableId = useId();
  const full = picks.length >= MAX_METRICS;

  const setPicks = (next: Pick[]) => writeParam('m', formatPicks(next));
  const toggle = (metric: SeriesMetric, on: boolean) =>
    setPicks(
      on
        ? [...picks, { metric, kind: SERIES_META[metric].kind }]
        : picks.filter((x) => x.metric !== metric),
    );

  const { keys, aligned } = useMemo(
    () =>
      align(picks.map((x) => timeSeries(p.dayTrades, ctx, x.metric, bucket))),
    [picks, p.dayTrades, ctx, bucket],
  );
  const series: ChartSeries[] = picks.map((x, i) => ({
    label: labelOf(x.metric, basis),
    kind: x.kind,
    unit: SERIES_META[x.metric].unit,
    points: aligned[i]!,
  }));
  const period = periodOf(bucket);
  const valueText = (unit: SeriesUnit, v: number): string => {
    switch (unit) {
      case 'money':
        return display.cash(v, true, currency).label;
      case 'pct':
        return formatPct(v, 1);
      case 'ratio':
        return v.toFixed(2);
      case 'count':
        return String(Math.round(v));
    }
  };
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
        ? ` ${x.label} is ${valueText(x.unit, lo)}.`
        : ` ${x.label} runs from ${valueText(x.unit, lo)} to ${valueText(x.unit, hi)}.`;
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
      const unit = SERIES_META[x.metric].unit;
      return {
        id: x.metric,
        header: labelOf(x.metric, basis),
        tip: TIPS[x.metric],
        align: 'right',
        value: (r) => r.values[i],
        cell: (r) => {
          const v = r.values[i];
          if (v === null || v === undefined)
            return <span className="text-faint">None</span>;
          switch (unit) {
            case 'money':
              return (
                <span className={`font-[550] ${signTone(v)}`}>
                  <FigureText f={display.cash(v, true, currency)} />
                </span>
              );
            case 'pct':
              return formatPct(v, 1);
            case 'ratio':
              return v.toFixed(2);
            case 'count':
              return String(Math.round(v));
          }
        },
      };
    }),
  ];

  return (
    <>
      <section aria-labelledby={metricsId} className={`${CARD} ${CARD_PAD}`}>
        <CardHeader
          icon={Sliders}
          tone="accent"
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
        <div
          role="group"
          aria-label="Metrics"
          className="mt-3 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3"
        >
          {SERIES_METRICS.map((metric) => {
            const pick = picks.find((x) => x.metric === metric);
            const label = labelOf(metric, basis);
            return (
              <div
                key={metric}
                className="flex min-h-10 items-center gap-2.5 border-b border-line/60 py-1"
              >
                <TaskCheckbox
                  checked={pick !== undefined}
                  disabled={pick === undefined && full}
                  aria-label={label}
                  aria-describedby={
                    pick === undefined && full
                      ? `${metricsId}-limit`
                      : undefined
                  }
                  onCheckedChange={(on) => toggle(metric, on)}
                />
                <span
                  className={`text-[13.5px] ${pick || !full ? 'text-text' : 'text-faint'}`}
                >
                  <MetricTip id={TIPS[metric]} basis={basis}>
                    {label}
                  </MetricTip>
                </span>
                {pick ? (
                  <Segmented
                    className="ml-auto"
                    label={`${label} chart type`}
                    options={[
                      { value: 'bar', label: 'Bar' },
                      { value: 'line', label: 'Line' },
                    ]}
                    value={pick.kind}
                    onChange={(kind) =>
                      setPicks(
                        picks.map((x) => (x === pick ? { ...x, kind } : x)),
                      )
                    }
                    coarseTargets
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby={chartId} className={`${CARD} ${CARD_PAD}`}>
        <CardHeader
          icon={ChartBar}
          tone="accent"
          headingId={chartId}
          title="Over time"
          after={
            <span className="text-[12.5px] text-faint">
              By {bucket}, {data.caption}
            </span>
          }
        />
        <div className="mt-3">
          {picks.length === 0 ? (
            <p className="py-10 text-center text-[13.5px] text-faint">
              Pick a metric to chart it.
            </p>
          ) : (
            <ReportChart
              label={`${series.map((s) => s.label).join(', ')} by ${bucket}, ${data.caption}.${ranges}`}
              series={series}
              periodLabel={period}
              currency={currency}
            />
          )}
        </div>
      </section>

      <section aria-labelledby={tableId} className={`${CARD} ${CARD_PAD}`}>
        <CardHeader
          icon={Table}
          tone="neutral"
          headingId={tableId}
          title={`By ${bucket}`}
        />
        <div className="mt-2">
          <SummaryTable
            key={`${bucket}-${picks.map((x) => x.metric).join()}`}
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

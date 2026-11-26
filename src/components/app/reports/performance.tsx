'use client';

import { Plus } from '@phosphor-icons/react/dist/ssr';
import { format, parseISO } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { Popover } from 'radix-ui';
import { Segmented } from '@/components/ui/segmented';
import {
  SERIES_META,
  seriesUnit,
  timeSeries,
  type Bucket,
  type SeriesMetric,
  type SeriesPoint,
} from '@/domain/metrics/series';
import { useJournal } from '@/data/query/hooks';
import { loggedDates } from '@/domain/metrics/days';
import { useAddressCopy } from '@/lib/use-address-copy';
import { useDisplay } from '@/lib/display';
import { CARD, CARD_PAD, CardHeader, signTone } from '../dashboard/shared';
import {
  formatPicks,
  MAX_METRICS,
  modeOf,
  parsePicks,
  type Pick,
} from './metric-chips';
import {
  align,
  GAP_REASONS,
  METRIC_POPOVER,
  MetricCatalogue,
  PlottedMetrics,
  SERIES_TIPS,
  seriesLabel,
} from './metric-picker';
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
function bucketOf(param: string | null): Bucket {
  return BUCKETS.find((b) => b === param) ?? 'week';
}

/** A period's key in words: a day, "Week of 2 Nov" or a month. */
function periodOf(bucket: Bucket): (key: string) => string {
  return bucket === 'week'
    ? (key) => `Week of ${format(parseISO(key), 'd MMM')}`
    : periodText;
}

type SlotNumber = 1 | 2;

/** What each chart opens on while its address says nothing: the running P&L, and the average green day over the red one. */
const SLOT_DEFAULTS: Record<SlotNumber, readonly Pick[]> = {
  1: [{ metric: 'net', kind: 'bar', mode: 'running' }],
  2: [{ metric: 'avg-daily-win-loss', kind: 'line', mode: 'period' }],
};
/** Chart 1 keeps the first links' names (`m`, `bucket`); chart 2 adds a 2. */
const SLOT_PARAMS: Record<SlotNumber, { picks: string; bucket: string }> = {
  1: { picks: 'm', bucket: 'bucket' },
  2: { picks: 'm2', bucket: 'bucket2' },
};
const OFF_PARAM = 'off';
const NONE: Pick[] = [];

/**
 * `?off=2`: a chart that was removed. Both cannot be off, so the first stays;
 * anything that is not 1 or 2 is ignored.
 */
function parseOff(param: string | null): SlotNumber[] {
  const off = (param ?? '')
    .split(',')
    .filter((x): x is '1' | '2' => x === '1' || x === '2')
    .map((x): SlotNumber => (x === '1' ? 1 : 2));
  return off.includes(1) && off.includes(2) ? [2] : [...new Set(off)];
}

interface Slot {
  n: SlotNumber;
  picks: Pick[];
  setPicks(next: Pick[]): void;
  bucket: Bucket;
  setBucket(next: Bucket): void;
  keys: string[];
  aligned: SeriesPoint[][];
  series: ChartSeries[];
}

/**
 * One chart's choice, read from its own part of the address. The ticks and the
 * grouping flip at once and follow the address when it changes (the batch G
 * pattern), so a second click before the address catches up keeps the first.
 */
function useSlot(data: ReportData, n: SlotNumber, active: boolean): Slot {
  const { partition: p, ctx, basis } = data;
  const params = useSearchParams();
  const names = SLOT_PARAMS[n];
  const picksParam = params.get(names.picks);
  const bucketParam = params.get(names.bucket);
  const fromAddress = useMemo(
    () => parsePicks(picksParam, SLOT_DEFAULTS[n]),
    [picksParam, n],
  );
  const [picks, setLocalPicks] = useAddressCopy(
    fromAddress,
    JSON.stringify(picksParam),
  );
  const [bucket, setLocalBucket] = useAddressCopy(
    bucketOf(bucketParam),
    JSON.stringify(bucketParam),
  );
  // A removed chart plots nothing, so it costs nothing.
  const plotted = active ? picks : NONE;
  // The journal is read only while Logged days is plotted.
  const wantsLogged = plotted.some((x) => x.metric === 'logged-days');
  const entries = useJournal({ enabled: wantsLogged }).data;
  // The days with a daily note, for Logged days; none until the journal loads.
  const noted = useMemo(
    () => (wantsLogged && entries ? loggedDates(entries) : undefined),
    [wantsLogged, entries],
  );
  const { keys, aligned } = useMemo(
    () =>
      align(
        plotted.map((x) =>
          timeSeries(p.dayTrades, ctx, x.metric, bucket, {
            mode: modeOf(x),
            balance: { start: p.riskStart, flows: p.riskFlows },
            ...(noted ? { loggedDates: noted } : {}),
          }),
        ),
      ),
    [plotted, p.dayTrades, p.riskStart, p.riskFlows, ctx, bucket, noted],
  );
  const series: ChartSeries[] = plotted.map((x, i) => ({
    label: seriesLabel(x, basis),
    kind: x.kind,
    unit: seriesUnit(x.metric, ctx),
    points: aligned[i]!,
  }));
  return {
    n,
    picks,
    setPicks(next) {
      setLocalPicks(next);
      writeParam(names.picks, formatPicks(next));
    },
    bucket,
    setBucket(next) {
      setLocalBucket(next);
      writeParam(names.bucket, next);
    },
    keys,
    aligned,
    series,
  };
}

const GHOST =
  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-control px-2 text-[12.5px] font-medium text-muted transition-colors duration-200 ease-(--ease-glide) hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:px-3';

/**
 * One chart slot: its metrics (up to three, each bars or a line, per period or
 * running), its grouping, Expand and Remove, and the chart.
 */
function ChartSlot({
  data,
  slot,
  onRemove,
}: {
  data: ReportData;
  slot: Slot;
  /** Absent for the last chart left, which cannot be removed. */
  onRemove?(): void;
}): React.JSX.Element {
  const { basis, currency } = data;
  const { picks, setPicks, bucket, series } = slot;
  const display = useDisplay();
  const fmt = formatterOf(display, currency);
  const metricsId = useId();
  const chartId = useId();
  const [query, setQuery] = useState('');
  const full = picks.length >= MAX_METRICS;
  const [expandSlot, setExpandSlot] = useExpandSlot();

  const toggle = (metric: SeriesMetric, on: boolean) =>
    setPicks(
      on
        ? [...picks, { metric, kind: SERIES_META[metric].kind, mode: 'period' }]
        : picks.filter((x) => x.metric !== metric),
    );
  const change = (pick: Pick, to: Partial<Pick>) =>
    setPicks(picks.map((x) => (x === pick ? { ...x, ...to } : x)));

  const period = periodOf(bucket);
  const gapNote = (x: ChartSeries, pick: Pick) =>
    `${x.label} ${GAP_REASONS[pick.metric] ?? 'has no value in some periods.'}`;
  const gaps = series.flatMap((x, i) =>
    x.points.some((pt) => pt.value === null) ? [gapNote(x, picks[i]!)] : [],
  );
  const empty =
    series.length > 0 &&
    series.every((x) => x.points.every((pt) => pt.value === null));
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

  return (
    <section
      aria-labelledby={chartId}
      className={`${CARD} ${CARD_PAD} min-w-0`}
    >
      <CardHeader
        headingId={chartId}
        title={`Chart ${slot.n}`}
        after={
          <span className="text-[12.5px] text-faint">
            By {bucket}, {data.caption}
          </span>
        }
        end={
          <>
            <span ref={setExpandSlot} className="flex" />
            {onRemove ? (
              <button
                type="button"
                aria-label={`Remove chart ${slot.n}`}
                onClick={onRemove}
                className={GHOST}
              >
                Remove
              </button>
            ) : null}
          </>
        }
      />
      {picks.length > 0 ? (
        <PlottedMetrics
          picks={picks}
          basis={basis}
          onChange={change}
          onRemove={(metric) => toggle(metric, false)}
        />
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2.5">
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
                className={METRIC_POPOVER}
              >
                <MetricCatalogue
                  picks={picks}
                  basis={basis}
                  query={query}
                  onQuery={setQuery}
                  onToggle={toggle}
                  limitId={`${metricsId}-limit`}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <span className="text-[12.5px] text-faint">
            {full ? (
              <span id={`${metricsId}-limit`}>Three metrics at most</span>
            ) : (
              'Up to three'
            )}
          </span>
        </div>
        <Segmented
          label="Group by"
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          value={bucket}
          onChange={slot.setBucket}
          coarseTargets
        />
      </div>
      <div className="mt-3">
        {picks.length === 0 ? (
          <p className="py-10 text-center text-[13.5px] text-faint">
            Pick a metric to chart it.
          </p>
        ) : empty ? (
          <p
            role="status"
            className="flex min-h-40 items-center justify-center py-10 text-center text-[13.5px] text-faint"
          >
            {gaps.join(' ')}
          </p>
        ) : (
          <>
            <ReportChart
              expandSlot={expandSlot}
              label={`${series.map((s) => s.label).join(', ')} by ${bucket}, ${data.caption}.${ranges}`}
              series={series}
              periodLabel={period}
              currency={currency}
            />
            {gaps.length > 0 ? (
              <p className="mt-2 text-[12.5px] text-faint">{gaps.join(' ')}</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

/** Where a removed chart was: one press brings it back. */
function AddChart({ onAdd }: { onAdd(): void }): React.JSX.Element {
  return (
    <div className="flex min-h-40 min-w-0 items-center justify-center rounded-card border border-dashed border-line-2 p-4">
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[9px] bg-surface-1 px-3 text-[13px] font-medium whitespace-nowrap text-muted shadow-[inset_0_0_0_1px_var(--line-2)] outline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
      >
        <Plus size={14} weight="bold" aria-hidden="true" />
        Add chart
      </button>
    </div>
  );
}

function Body({ data }: { data: ReportData }): React.JSX.Element {
  const { basis } = data;
  const params = useSearchParams();
  const offParam = params.get(OFF_PARAM);
  const [off, setLocalOff] = useAddressCopy(
    parseOff(offParam),
    JSON.stringify(offParam),
  );
  const slots = {
    1: useSlot(data, 1, !off.includes(1)),
    2: useSlot(data, 2, !off.includes(2)),
  };
  const setOff = (next: SlotNumber[]) => {
    setLocalOff(next);
    // A history entry of its own, so Back brings a removed chart back.
    writeParam(OFF_PARAM, next.length === 0 ? null : next.join(','), true);
  };
  const tableId = useId();
  // The table follows the first chart that is still there.
  const lead = off.includes(1) ? slots[2] : slots[1];
  const { picks, bucket, series, keys, aligned } = lead;
  const fmt = formatterOf(useDisplay(), data.currency);
  const period = periodOf(bucket);

  const rows = keys.map((key, i) => ({
    key,
    values: aligned.map((s) => s[i]!.value),
  }));
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
        tip: SERIES_TIPS[x.metric],
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
      <div className="grid gap-4 lg:grid-cols-2">
        {([1, 2] as const).map((n) =>
          off.includes(n) ? (
            <AddChart
              key={n}
              onAdd={() => setOff(off.filter((x) => x !== n))}
            />
          ) : (
            <ChartSlot
              key={n}
              data={data}
              slot={slots[n]}
              onRemove={
                off.length === 0 ? () => setOff([...off, n]) : undefined
              }
            />
          ),
        )}
      </div>

      <section aria-labelledby={tableId} className={`${CARD} ${CARD_PAD}`}>
        <CardHeader
          headingId={tableId}
          title={`By ${bucket}, chart ${lead.n}`}
        />
        <div className="mt-2">
          <SummaryTable
            key={`${lead.n}-${bucket}-${picks.map((x) => `${x.metric}${modeOf(x)}`).join()}`}
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
 * Reports, Performance: two chart slots side by side (stacked below `lg`), each
 * with up to three metrics as bars or a line, per period or running, over days,
 * weeks or months, and under them a sortable table of every period of the
 * first chart. Each slot's choice is in the address bar
 * (`?m=net:bar,win-rate:line&bucket=week` for chart 1, `m2` and `bucket2` for
 * chart 2, `off=2` for a removed chart) so it can be linked. Day-level and
 * trade-level figures follow `timeSeries`'s rules. Render inside `<Suspense>`.
 */
export function PerformanceView(): React.JSX.Element {
  return (
    <ReportScope testId="reports-performance">
      {(data) => <Body data={data} />}
    </ReportScope>
  );
}

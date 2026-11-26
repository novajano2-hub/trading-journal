'use client';

import { MagnifyingGlass, X } from '@phosphor-icons/react/dist/ssr';
import { MetricTip } from '@/components/ui/metric-tip';
import { Segmented } from '@/components/ui/segmented';
import type { MetricId } from '@/content/metric-definitions';
import {
  SERIES_GROUPS,
  SERIES_META,
  SERIES_METRICS,
  type SeriesMetric,
  type SeriesPoint,
} from '@/domain/metrics/series';
import type { PnlBasis } from '@/domain/types';
import { labelOf, MAX_METRICS, modeOf, type Pick } from './metric-chips';

/*
 * What the Performance report and the dashboard's report widget share: the
 * catalogue of metrics a chart can plot, how a picked metric is named, how its
 * series line up, and why a period can have no value.
 */

/** The metric each picker row's label defines. */
export const SERIES_TIPS: Record<SeriesMetric, MetricId> = {
  net: 'pnl',
  'cumulative-net': 'cumulative-pnl',
  'avg-daily-net': 'avg-daily-pnl',
  'avg-daily-win-loss': 'avg-daily-win-loss',
  'avg-win': 'avg-win',
  'avg-loss': 'avg-loss',
  'win-loss-ratio': 'avg-win-loss',
  expectancy: 'expectancy',
  'largest-win': 'largest-win',
  'largest-loss': 'largest-loss',
  'profit-factor': 'profit-factor',
  'avg-trade': 'avg-trade',
  fees: 'fees',
  'red-day-count': 'red-day-count',
  'flat-day-count': 'flat-day-count',
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
  'daily-drawdown': 'daily-drawdown',
  'net-balance': 'account-balance',
  'logged-days': 'logged-days',
  'long-wins': 'long-winners',
  'long-losses': 'long-losers',
  'long-breakevens': 'long-breakevens',
  'long-open': 'long-open-trades',
  'short-wins': 'short-winners',
  'short-losses': 'short-losers',
  'short-breakevens': 'short-breakevens',
  'short-open': 'short-open-trades',
  'win-rate': 'win-rate',
  'long-win-rate': 'long-win-rate',
  'short-win-rate': 'short-win-rate',
  'green-days': 'daily-win-rate',
  'green-day-count': 'green-day-count',
  'win-streak': 'win-streak',
  'loss-streak': 'loss-streak',
  'green-day-streak': 'green-day-streak',
  'red-day-streak': 'red-day-streak',
  sharpe: 'sharpe',
  sortino: 'sortino',
};

/** Every series on the same keys, a gap where a metric has no point. */
export function align(all: readonly SeriesPoint[][]): {
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

/** What a plotted metric is called: its name, and "(running)" when it is the running value. */
export function seriesLabel(pick: Pick, basis: PnlBasis): string {
  const name = labelOf(pick.metric, basis);
  return modeOf(pick) === 'running' && !SERIES_META[pick.metric].running
    ? `${name} (running)`
    : name;
}

/** Why a metric has no value in a period, where it is not simply that nothing happened. */
export const GAP_REASONS: Partial<Record<SeriesMetric, string>> = {
  'avg-daily-win-loss':
    'shows only for periods with both a green and a red day.',
  'net-balance': 'has no value in R, ticks, pips or points.',
  'logged-days': 'waits for your journal to load.',
};

/** The popover that holds the catalogue. */
export const METRIC_POPOVER =
  'z-50 flex max-h-[min(72dvh,30rem)] w-[min(calc(100vw-24px),640px)] flex-col rounded-control border border-line bg-surface-1 shadow-[var(--shadow)] outline-none';

/**
 * The search box and the metrics to tick, by group (the "+ Metric" popover's
 * body). Up to three can be ticked; once three are, the others are disabled and
 * described by the element `limitId` names, which says why.
 */
export function MetricCatalogue({
  picks,
  basis,
  query,
  onQuery,
  onToggle,
  limitId,
}: {
  picks: readonly Pick[];
  basis: PnlBasis;
  query: string;
  onQuery(next: string): void;
  onToggle(metric: SeriesMetric, on: boolean): void;
  /** The id of the text that says three is the most. */
  limitId: string;
}): React.JSX.Element {
  const full = picks.length >= MAX_METRICS;
  const needle = query.trim().toLowerCase();
  const groups = SERIES_GROUPS.map((group) => ({
    group,
    metrics: SERIES_METRICS.filter(
      (m) =>
        SERIES_META[m].group === group &&
        (needle === '' || labelOf(m, basis).toLowerCase().includes(needle)),
    ),
  })).filter((g) => g.metrics.length > 0);
  return (
    <>
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
          onChange={(e) => onQuery(e.target.value)}
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
          <div key={group} role="group" aria-label={group} className="mt-2">
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
                      aria-describedby={off ? limitId : undefined}
                      onChange={(e) => onToggle(metric, e.target.checked)}
                      className="size-4 flex-none accent-[var(--accent)]"
                    />
                    <span
                      className={`text-[13.5px] ${off ? 'text-faint' : 'text-text'}`}
                    >
                      <MetricTip id={SERIES_TIPS[metric]} basis={basis}>
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
    </>
  );
}

const MODES = [
  { value: 'period', label: 'Period' },
  { value: 'running', label: 'Running' },
] as const;

/**
 * The metrics a chart plots, one row each: its name, bars or a line, its
 * value for each period or running (a metric that is a running total already
 * has no choice) and a button to remove it.
 */
export function PlottedMetrics({
  picks,
  basis,
  onChange,
  onRemove,
}: {
  picks: readonly Pick[];
  basis: PnlBasis;
  onChange(pick: Pick, to: Partial<Pick>): void;
  onRemove(metric: SeriesMetric): void;
}): React.JSX.Element {
  return (
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
              onChange={(kind) => onChange(pick, { kind })}
              coarseTargets
            />
            {SERIES_META[pick.metric].running ? null : (
              <Segmented
                label={`${label} plotted`}
                options={MODES}
                value={pick.mode}
                onChange={(mode) => onChange(pick, { mode })}
                coarseTargets
              />
            )}
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => onRemove(pick.metric)}
              className="inline-grid size-7 cursor-pointer place-items-center rounded-[7px] text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
            >
              <X size={13} weight="bold" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

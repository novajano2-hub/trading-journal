'use client';

import { ChartBar, ChartLine, Plus, X } from '@phosphor-icons/react/dist/ssr';
import { DropdownMenu } from 'radix-ui';
import {
  SERIES_META,
  SERIES_METRICS,
  type SeriesMetric,
  type SeriesMode,
} from '@/domain/metrics/series';
import type { PnlBasis } from '@/domain/types';

export const MAX_METRICS = 3;

export interface Pick {
  metric: SeriesMetric;
  kind: 'bar' | 'line';
  /** A value per period, or the running value from the range start. */
  mode: SeriesMode;
}

export const DEFAULT_PICK: Pick = {
  metric: 'net',
  kind: 'bar',
  mode: 'period',
};

/** The mode a pick plots in: a metric that is a running total already has no choice. */
export const modeOf = (pick: Pick): SeriesMode =>
  SERIES_META[pick.metric].running ? 'running' : pick.mode;

export function labelOf(metric: SeriesMetric, basis: PnlBasis): string {
  return metric === 'net'
    ? `${basis === 'gross' ? 'Gross' : 'Net'} P&L`
    : SERIES_META[metric].label;
}

/**
 * `?m=net:bar,win-rate:line:running`: absent is `fallback`, empty is none. At
 * most three, none twice, and only from `allowed`. A kind that is not bar or
 * line is the metric's own; a mode other than `running` is per period.
 */
export function parsePicks(
  param: string | null,
  fallback: readonly Pick[] = [DEFAULT_PICK],
  allowed: readonly SeriesMetric[] = SERIES_METRICS,
): Pick[] {
  if (param === null) return [...fallback];
  const picks: Pick[] = [];
  for (const part of param.split(',')) {
    const [name, kind, mode] = part.split(':');
    const metric = allowed.find((m) => m === name);
    if (!metric || picks.some((p) => p.metric === metric)) continue;
    picks.push({
      metric,
      kind: kind === 'bar' || kind === 'line' ? kind : SERIES_META[metric].kind,
      mode: mode === 'running' ? 'running' : 'period',
    });
  }
  return picks.slice(0, MAX_METRICS);
}

export const formatPicks = (picks: readonly Pick[]): string =>
  picks
    .map(
      (p) => `${p.metric}:${p.kind}${p.mode === 'running' ? ':running' : ''}`,
    )
    .join(',');

const CHIP =
  'inline-flex h-[30px] items-center gap-1.5 rounded-[9px] bg-surface-1 text-[13px] font-medium whitespace-nowrap text-text shadow-[inset_0_0_0_1px_var(--line-2)] pointer-coarse:h-11';
const RING =
  'outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent';

/**
 * The chart's metrics as chips, after comp 07: each shows its metric and whether
 * it is bars or a line (press to switch), with a button to remove it, and
 * "+ Metric" adds one from `available` until there are three.
 */
export function MetricChips({
  picks,
  available,
  basis,
  onChange,
}: {
  picks: readonly Pick[];
  available: readonly SeriesMetric[];
  basis: PnlBasis;
  onChange(next: Pick[]): void;
}): React.JSX.Element {
  const full = picks.length >= MAX_METRICS;
  const rest = available.filter((m) => !picks.some((p) => p.metric === m));
  return (
    <div
      role="group"
      aria-label="Chart metrics"
      className="flex flex-wrap items-center gap-2"
    >
      {picks.map((pick) => {
        const label = labelOf(pick.metric, basis);
        const Mark = pick.kind === 'bar' ? ChartBar : ChartLine;
        return (
          <span key={pick.metric} className={`${CHIP} pr-1 pl-1`}>
            <button
              type="button"
              aria-label={`${label}, ${pick.kind === 'bar' ? 'bars. Switch to a line' : 'line. Switch to bars'}`}
              onClick={() =>
                onChange(
                  picks.map((x) =>
                    x === pick
                      ? { ...x, kind: pick.kind === 'bar' ? 'line' : 'bar' }
                      : x,
                  ),
                )
              }
              className={`inline-flex h-full cursor-pointer items-center gap-1.5 rounded-[7px] pr-1 pl-2 ${RING}`}
            >
              <Mark
                size={14}
                aria-hidden="true"
                className="flex-none text-accent"
              />
              {label}
            </button>
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => onChange(picks.filter((x) => x !== pick))}
              className={`inline-grid size-6 cursor-pointer place-items-center rounded-[6px] text-faint hover:text-text pointer-coarse:size-9 ${RING}`}
            >
              <X size={12} weight="bold" aria-hidden="true" />
            </button>
          </span>
        );
      })}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          disabled={full || rest.length === 0}
          aria-label="Add metric"
          className={`${CHIP} cursor-pointer px-2.5 text-muted disabled:cursor-not-allowed disabled:opacity-50 ${RING}`}
        >
          <Plus size={14} weight="bold" aria-hidden="true" />
          Metric
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            collisionPadding={12}
            aria-label="Add metric"
            className="z-50 min-w-[170px] rounded-control border border-line bg-surface-1 p-1 shadow-[var(--shadow)]"
          >
            {rest.map((metric) => (
              <DropdownMenu.Item
                key={metric}
                onSelect={() =>
                  onChange([
                    ...picks,
                    {
                      metric,
                      kind: SERIES_META[metric].kind,
                      mode: 'period',
                    },
                  ])
                }
                className="flex min-h-9 cursor-pointer items-center rounded-[8px] px-3 py-1.5 text-[13.5px] text-text outline-none select-none data-highlighted:bg-sunken pointer-coarse:min-h-11"
              >
                {labelOf(metric, basis)}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

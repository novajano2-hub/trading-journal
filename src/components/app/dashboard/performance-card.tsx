'use client';

import { useId } from 'react';
import { ChartLineUp } from '@phosphor-icons/react/dist/ssr';
import {
  formatTicker,
  NumberTicker,
  type TickerKind,
} from '@/components/product/number-ticker';
import { Sparkline } from '@/components/product/sparkline';
import { MetricTip } from '@/components/ui/metric-tip';
import { metricDefinition, type MetricId } from '@/content/metric-definitions';
import type { DashboardModel } from '@/data/dashboard';
import type { MetricContext } from '@/domain/metrics/context';
import type { DayStat } from '@/domain/metrics/days';
import { summarize } from '@/domain/metrics/summary';
import { closedInOrder } from '@/domain/trade-status';
import type { Cents, PnlBasis, Trade } from '@/domain/types';
import { leftOutIn, useDisplay, type TickerSpec } from '@/lib/display';
import { plural } from '@/lib/format';
import { CARD, CARD_PAD, CardHeader } from './shared';

/** How each KPI moved through the range, each point over a trailing window. */
export interface KpiTrends {
  /** Closed trades behind each point; 0 when there is no trend. */
  window: number;
  winRate: number[];
  profitFactor: number[];
  expectancy: number[];
}

/** No trend: the range holds no more closed trades than one window. */
export const NO_TRENDS: KpiTrends = {
  window: 0,
  winRate: [],
  profitFactor: [],
  expectancy: [],
};

/** Points in a KPI's trend line, at most. */
const TREND_POINTS = 24;

/** A trend point's window: 20 closed trades, or an eighth of the range when that is more. */
export const trendWindow = (closed: number): number =>
  Math.max(20, Math.ceil(closed / 8));

/**
 * Each KPI over the last `trendWindow` closed trades, at up to 24 evenly
 * spaced trades from the first full window to the last trade, oldest first.
 * A window is not the whole range, so a line need not end on the figure
 * beside it. A range with no more closed trades than one window has no
 * line to draw, so no trend. A KPI with no value in a window (no losses for
 * profit factor) skips that point.
 */
export function kpiTrends(
  trades: readonly Trade[],
  ctx: MetricContext,
  /** Reads a window's expectancy in a display unit; default: the summary's, in cents. */
  expectancyOf?: (window: readonly Trade[]) => number | null,
): KpiTrends {
  const closed = closedInOrder(trades);
  const size = trendWindow(closed.length);
  // How far the last window's end lies past the first's.
  const span = closed.length - size;
  if (span < 1) return NO_TRENDS;
  const points = Math.min(TREND_POINTS, span + 1);
  const trends: KpiTrends = {
    window: size,
    winRate: [],
    profitFactor: [],
    expectancy: [],
  };
  for (let i = 0; i < points; i++) {
    const end = size + Math.round((i * span) / (points - 1));
    const s = summarize(closed.slice(end - size, end), ctx);
    if (s.winRate !== null) trends.winRate.push(s.winRate);
    if (s.profitFactor !== null) trends.profitFactor.push(s.profitFactor);
    const expectancy = expectancyOf
      ? expectancyOf(closed.slice(end - size, end))
      : s.expectancy;
    if (expectancy !== null) trends.expectancy.push(expectancy);
  }
  return trends;
}

/** The equity line's points, and whether each is a trading day's close. */
export interface EquityLine {
  points: Cents[];
  daily: boolean;
}

/**
 * The equity line: the starting balance, then the balance at each trading
 * day's close, so a long range reads as a line rather than one point per
 * trade. `days` must be the same trades on the same basis as `equity`, so
 * the last close is the last balance to the cent. A range of one trading day
 * keeps a point per closed trade, so its line still has a shape.
 */
export function equityLine(
  equity: readonly Cents[],
  days: readonly DayStat[],
): EquityLine {
  if (days.length < 2) return { points: [...equity], daily: false };
  let balance = equity[0] ?? 0;
  const points = [balance];
  for (const d of days) points.push((balance += d.net));
  return { points, daily: true };
}

/**
 * The figure's size: 20px, or smaller when its characters wouldn't fit beside
 * the trend line (a figure is about 0.56em wide), so a long P&L never spills
 * out. A narrow tile drops the trend line and gives the figure its room.
 */
const figureSize = (chars: number) =>
  `min(20px, max(12px, calc((100cqi - var(--trend)) / ${chars} / 0.56)))`;

function Kpi({
  id,
  value,
  kind,
  spec,
  basis,
  currency,
  trend,
  windowSize,
}: {
  id: MetricId;
  value: number | null;
  kind: TickerKind;
  /** A money KPI in the chosen display unit: its number and how it reads. */
  spec?: TickerSpec;
  basis: PnlBasis;
  currency: string;
  trend: readonly number[];
  /** Closed trades behind each trend point. */
  windowSize: number;
}): React.JSX.Element {
  const fmt = (v: number) =>
    spec ? spec.format(v) : formatTicker(kind, v, { digits: 1, currency });
  const shown = spec && value !== null ? spec.value : value;
  const text = shown === null ? 'None yet' : fmt(shown);
  const hasTrend = trend.length >= 2;
  // Says what the line is: a rolling window, not the range's figure beside it.
  const trendLabel = hasTrend
    ? `Rolling ${windowSize}-trade ${metricDefinition(id, basis).label.toLowerCase()}, from ${fmt(trend[0]!)} to ${fmt(trend[trend.length - 1]!)}`
    : undefined;
  return (
    <div
      data-kpi={id}
      className="@container min-w-0 pt-2.5 not-first:border-l not-first:border-line not-first:pl-3.5"
    >
      {/* On touch the label's 44px target overlaps the row's padding instead of growing it. */}
      <div className="text-xs leading-4 text-faint pointer-coarse:-my-3.5">
        <MetricTip id={id} basis={basis} />
      </div>
      <div
        className={`mt-0.5 flex items-end gap-2 ${hasTrend ? '[--trend:60px] @max-[7rem]:[--trend:0px]' : '[--trend:0px]'}`}
      >
        <div
          className="min-w-0 flex-1 leading-[1.25] font-semibold tracking-[-0.03em] whitespace-nowrap"
          style={{ fontSize: figureSize(text.length) }}
        >
          {shown === null ? (
            <span className="font-medium text-faint">None yet</span>
          ) : (
            <NumberTicker
              value={shown}
              kind={kind}
              digits={1}
              currency={currency}
              format={spec?.format}
            />
          )}
        </div>
        {hasTrend ? (
          <Sparkline
            variant="line"
            series={trend}
            label={trendLabel}
            className="mr-1 mb-1 h-6 w-12 flex-none @max-[7rem]:hidden"
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Row 2's Performance card: the P&L on the Gross/Net basis over the equity
 * line from the starting balance through each trading day's close, then win
 * rate, profit factor and expectancy, each with its rolling trend.
 */
export function PerformanceCard({
  performance,
  line,
  trends,
  basis,
  currency,
}: {
  performance: DashboardModel['performance'];
  /** From `equityLine`: what the line draws. The figures come from `performance.equity`. */
  line: EquityLine;
  trends: KpiTrends;
  basis: PnlBasis;
  currency: string;
}): React.JSX.Element {
  const headingId = useId();
  const { equity } = performance;
  const display = useDisplay();
  // A balance is an amount, never a return: dollars, or hidden.
  const balance = (cents: Cents) =>
    display.figure({ money: cents }, false, currency).text;
  const start = balance(equity[0] ?? 0);
  const end = balance(equity[equity.length - 1] ?? 0);
  const pnl = display.ofAll(performance.pnl);
  const pnlTicker = display.ticker(pnl, currency);
  const leftOut = leftOutIn(pnl, display.unit);
  const expectancy =
    performance.expectancy === null
      ? undefined
      : display.ticker(display.meanOfAll(performance.expectancy), currency);

  return (
    <section
      aria-labelledby={headingId}
      className={`${CARD} ${CARD_PAD} flex h-full flex-col`}
    >
      <CardHeader
        icon={ChartLineUp}
        tone="accent"
        headingId={headingId}
        title="Performance"
        end={
          <span className="text-[12.5px] text-faint">
            <MetricTip
              id="equity"
              basis={basis}
              note={
                line.daily
                  ? "The line marks the balance at each trading day's close."
                  : undefined
              }
              className="pointer-coarse:-my-3.5"
            />{' '}
            {/* The line's own label already says this to a screen reader. */}
            <span aria-hidden="true" className="whitespace-nowrap tabular-nums">
              {start} to {end}
            </span>
          </span>
        }
      />
      <div
        data-kpi="pnl"
        data-testid="kpi-pnl"
        className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5"
      >
        {/* The final figure, invisible, holds the width, so the count never pushes the label. */}
        <span className="inline-grid text-[31px] leading-[1.15] font-semibold tracking-[-0.04em] tabular-nums">
          <span
            aria-hidden="true"
            className="invisible col-start-1 row-start-1"
          >
            {pnlTicker.format(pnlTicker.value)}
          </span>
          <NumberTicker
            value={pnlTicker.value}
            kind="money"
            currency={currency}
            format={pnlTicker.format}
            className="col-start-1 row-start-1 min-w-0!"
          />
        </span>
        <span className="text-[12.5px] text-faint">
          <MetricTip id="pnl" basis={basis} />
        </span>
        {leftOut > 0 ? (
          <span className="text-[12.5px] text-faint">
            {leftOut} {plural(leftOut, 'trade')} left out
          </span>
        ) : null}
      </div>
      <Sparkline
        series={line.points}
        label={`Equity, from ${start} to ${end}`}
        className="mt-1.5 mb-2.5"
      />
      <div className="mt-auto grid grid-cols-3 border-t border-line">
        <Kpi
          id="win-rate"
          value={performance.winRate}
          kind="pct"
          basis={basis}
          currency={currency}
          trend={trends.winRate}
          windowSize={trends.window}
        />
        <Kpi
          id="profit-factor"
          value={performance.profitFactor}
          kind="ratio"
          basis={basis}
          currency={currency}
          trend={trends.profitFactor}
          windowSize={trends.window}
        />
        <Kpi
          id="expectancy"
          value={performance.expectancy}
          kind="money"
          spec={expectancy}
          basis={basis}
          currency={currency}
          trend={trends.expectancy}
          windowSize={trends.window}
        />
      </div>
    </section>
  );
}

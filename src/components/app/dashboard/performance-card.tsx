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
import type { MetricId } from '@/content/metric-definitions';
import type { DashboardModel } from '@/data/dashboard';
import type { MetricContext } from '@/domain/metrics/context';
import { summarize } from '@/domain/metrics/summary';
import { closedInOrder } from '@/domain/trade-status';
import type { Cents, PnlBasis, Trade } from '@/domain/types';
import { formatMoney, formatPnl } from '@/lib/format';
import { CARD, CARD_PAD, CardHeader } from './shared';

/** A balance: unsigned, unless it has gone below zero. */
const balance = (cents: Cents, currency: string) =>
  cents < 0 ? formatPnl(cents, currency) : formatMoney(cents, currency);

/** How each KPI moved through the range. */
export interface KpiTrends {
  winRate: number[];
  profitFactor: number[];
  expectancy: number[];
}

/** Trends for a range with no closed trades. */
export const NO_TRENDS: KpiTrends = {
  winRate: [],
  profitFactor: [],
  expectancy: [],
};

/** Points in a KPI's trend line, at most. */
const TREND_POINTS = 24;

/**
 * Each KPI as it stood after evenly spaced closed trades, oldest first, so
 * every trend line ends on the figure beside it. A KPI with no value yet at
 * a point (no losses for profit factor) skips that point.
 */
export function kpiTrends(
  trades: readonly Trade[],
  ctx: MetricContext,
): KpiTrends {
  const closed = closedInOrder(trades);
  const trends: KpiTrends = { winRate: [], profitFactor: [], expectancy: [] };
  const points = Math.min(TREND_POINTS, closed.length);
  if (points < 2) return trends;
  for (let i = 1; i <= points; i++) {
    const s = summarize(
      closed.slice(0, Math.round((i * closed.length) / points)),
      ctx,
    );
    if (s.winRate !== null) trends.winRate.push(s.winRate);
    if (s.profitFactor !== null) trends.profitFactor.push(s.profitFactor);
    if (s.expectancy !== null) trends.expectancy.push(s.expectancy);
  }
  return trends;
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
  basis,
  currency,
  trend,
}: {
  id: MetricId;
  value: number | null;
  kind: TickerKind;
  basis: PnlBasis;
  currency: string;
  trend: readonly number[];
}): React.JSX.Element {
  const text =
    value === null
      ? 'None yet'
      : formatTicker(kind, value, { digits: 1, currency });
  return (
    <div
      data-kpi={id}
      className="@container min-w-0 pt-2.5 not-first:border-l not-first:border-line not-first:pl-3.5"
    >
      {/* On touch the label's 44px target overlaps the row's padding instead of growing it. */}
      <div className="text-xs leading-4 text-faint pointer-coarse:-my-3.5">
        <MetricTip id={id} basis={basis} />
      </div>
      <div className="mt-0.5 flex items-end gap-2 [--trend:60px] @max-[7rem]:[--trend:0px]">
        <div
          className="min-w-0 flex-1 leading-[1.25] font-semibold tracking-[-0.03em] whitespace-nowrap"
          style={{ fontSize: figureSize(text.length) }}
        >
          {value === null ? (
            <span className="font-medium text-faint">None yet</span>
          ) : (
            <NumberTicker
              value={value}
              kind={kind}
              digits={1}
              currency={currency}
            />
          )}
        </div>
        <Sparkline
          variant="line"
          series={trend}
          className="mr-1 mb-1 h-6 w-12 flex-none @max-[7rem]:hidden"
        />
      </div>
    </div>
  );
}

/**
 * Row 2's Performance card: the P&L on the Gross/Net basis over the equity
 * line from the starting balance through each closed trade, then win rate,
 * profit factor and expectancy, each with how it moved through the range.
 */
export function PerformanceCard({
  performance,
  trends,
  basis,
  currency,
}: {
  performance: DashboardModel['performance'];
  trends: KpiTrends;
  basis: PnlBasis;
  currency: string;
}): React.JSX.Element {
  const headingId = useId();
  const { equity } = performance;
  const start = balance(equity[0] ?? 0, currency);
  const end = balance(equity[equity.length - 1] ?? 0, currency);

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
            {formatTicker('money', performance.pnl, { currency })}
          </span>
          <NumberTicker
            value={performance.pnl}
            kind="money"
            currency={currency}
            className="col-start-1 row-start-1 min-w-0!"
          />
        </span>
        <span className="text-[12.5px] text-faint">
          <MetricTip id="pnl" basis={basis} />
        </span>
      </div>
      <Sparkline
        series={equity}
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
        />
        <Kpi
          id="profit-factor"
          value={performance.profitFactor}
          kind="ratio"
          basis={basis}
          currency={currency}
          trend={trends.profitFactor}
        />
        <Kpi
          id="expectancy"
          value={performance.expectancy}
          kind="money"
          basis={basis}
          currency={currency}
          trend={trends.expectancy}
        />
      </div>
    </section>
  );
}

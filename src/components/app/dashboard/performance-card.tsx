'use client';

import { useId } from 'react';
import {
  formatTicker,
  NumberTicker,
  type TickerKind,
} from '@/components/product/number-ticker';
import { Sparkline } from '@/components/product/sparkline';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import type { DashboardModel } from '@/data/dashboard';
import type { Cents, PnlBasis } from '@/domain/types';
import { formatMoney, formatPnl } from '@/lib/format';

/** A balance: unsigned, unless it has gone below zero. */
const balance = (cents: Cents, currency: string) =>
  cents < 0 ? formatPnl(cents, currency) : formatMoney(cents, currency);

/**
 * The figure's size: 22px, or smaller when its characters wouldn't fit the
 * tile (a mono character is 0.6em wide), so a long P&L never spills out.
 */
const figureSize = (chars: number) =>
  `min(22px, max(14px, calc(100cqi / ${chars} / 0.6)))`;

function Kpi({
  id,
  value,
  kind,
  basis,
  currency,
  testId,
}: {
  id: MetricId;
  value: number | null;
  kind: TickerKind;
  basis: PnlBasis;
  currency: string;
  testId?: string;
}): React.JSX.Element {
  const text =
    value === null
      ? 'None yet'
      : formatTicker(kind, value, { digits: 1, currency });
  return (
    <div
      data-kpi={id}
      data-testid={testId}
      className="@container min-w-0 rounded-control bg-sunken px-3 py-2"
    >
      {/* On touch the label's 44px target overlaps the tile's padding instead of growing the tile. */}
      <div className="text-xs leading-4 text-faint pointer-coarse:-my-3.5">
        <MetricTip id={id} basis={basis} />
      </div>
      <div
        className="mt-0.5 leading-[1.25] font-medium tracking-[-0.02em]"
        style={{ fontSize: figureSize(text.length) }}
      >
        {value === null ? (
          <span className="font-mono text-faint">None yet</span>
        ) : (
          <NumberTicker
            value={value}
            kind={kind}
            digits={1}
            currency={currency}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Row 2's Performance card: the four KPIs on the Gross/Net basis, then the
 * equity line from the starting balance through each closed trade.
 */
export function PerformanceCard({
  performance,
  basis,
  currency,
}: {
  performance: DashboardModel['performance'];
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
      className="flex h-full flex-col rounded-card border border-line bg-surface-1 px-5 py-4"
    >
      <h2
        id={headingId}
        className="mb-2.5 text-[14px] leading-snug font-semibold text-text"
      >
        Performance
      </h2>
      <div className="@container">
        <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
          <Kpi
            id="pnl"
            value={performance.pnl}
            kind="money"
            basis={basis}
            currency={currency}
            testId="kpi-pnl"
          />
          <Kpi
            id="win-rate"
            value={performance.winRate}
            kind="pct"
            basis={basis}
            currency={currency}
          />
          <Kpi
            id="profit-factor"
            value={performance.profitFactor}
            kind="ratio"
            basis={basis}
            currency={currency}
          />
          <Kpi
            id="expectancy"
            value={performance.expectancy}
            kind="money"
            basis={basis}
            currency={currency}
          />
        </div>
      </div>
      <Sparkline
        series={equity}
        label={`Equity, from ${start} to ${end}`}
        className="mt-3"
      />
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 text-xs leading-4 text-faint">
        <MetricTip id="equity" basis={basis} />
        {/* The line's own label already says this to a screen reader. */}
        <span aria-hidden="true" className="font-mono tabular-nums">
          {start} to {end}
        </span>
      </div>
    </section>
  );
}

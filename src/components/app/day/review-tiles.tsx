'use client';

import { FigureText } from '@/components/product/figure-text';
import { MetricTip } from '@/components/ui/metric-tip';
import type { DayStats } from '@/data/day-log';
import { formatMinutes } from '@/lib/format';
import { useDisplay } from '@/lib/display';
import type { PnlBasis } from '@/domain/types';
import { CARD } from '../dashboard/shared';

const CELL =
  'min-w-0 px-[18px] first:pl-0 max-sm:px-3 max-sm:first:pl-0 [&+&]:border-l [&+&]:border-line';
const VALUE =
  'mt-0.5 block text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] tabular-nums max-sm:text-[18px]';

/**
 * TradeZella's three tiles, each a label and its value and nothing more
 * (P6A-11): net P&L, win rate, and the session's length. Money goes through
 * the Display, always net and in the base currency, so Privacy masks it.
 */
export function ReviewTiles({
  stats,
  sessionMs,
  currency,
  basis,
}: {
  stats: DayStats | undefined;
  /** The session's length; null when it was never started. */
  sessionMs: number | null;
  currency: string;
  basis: PnlBasis;
}): React.JSX.Element {
  const display = useDisplay();
  const net = stats?.net ?? 0;
  const money = display.cash(net, true, currency);
  const winRate = stats?.winRate ?? null;
  return (
    <section
      aria-label="The day in figures"
      className={`${CARD} grid grid-cols-3 px-5 py-4 max-sm:px-4`}
    >
      <div className={CELL}>
        <MetricTip id="net-pnl" basis="net" className="text-[13px] text-muted">
          Net P&amp;L
        </MetricTip>
        <b
          className={`${VALUE} ${net > 0 ? 'text-gain' : net < 0 ? 'text-loss' : ''}`}
        >
          <FigureText f={money} />
        </b>
      </div>
      <div className={CELL}>
        <MetricTip
          id="win-rate"
          basis={basis}
          className="text-[13px] text-muted"
        >
          Win rate
        </MetricTip>
        <b className={VALUE}>
          {winRate === null ? 'None' : `${(winRate * 100).toFixed(1)}%`}
        </b>
      </div>
      <div className={CELL}>
        <MetricTip
          id="session-length"
          basis={basis}
          className="text-[13px] text-muted"
        >
          Session
        </MetricTip>
        <b className={VALUE}>
          {sessionMs === null ? 'None' : formatMinutes(sessionMs / 60_000)}
        </b>
      </div>
    </section>
  );
}

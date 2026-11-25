'use client';

import { FigureText } from '@/components/product/figure-text';
import { MetricTip } from '@/components/ui/metric-tip';
import type { DayStats } from '@/data/day-log';
import { formatMinutes } from '@/lib/format';
import { useDisplay } from '@/lib/display';
import { CARD } from '../dashboard/shared';
import { useDaySession, useElapsed } from './session-button';

const CELL =
  'min-w-0 px-[18px] first:pl-0 max-sm:px-3 max-sm:first:pl-0 [&+&]:border-l [&+&]:border-line';
const VALUE =
  'mt-0.5 block text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] tabular-nums max-sm:text-[18px]';

/**
 * TradeZella's three tiles, each a label and its value and nothing more
 * (P6A-11): net P&L, win rate (a whole percent: 4 of 7 reads 57%), and the
 * session's length. Money goes through the Display, always net and in the
 * base currency, so Privacy masks it. The page's figures are all net.
 */
export function ReviewTiles({
  date,
  stats,
  currency,
}: {
  date: string;
  stats: DayStats | undefined;
  currency: string;
}): React.JSX.Element {
  const display = useDisplay();
  // Ticking lives here, so the clock re-renders the tiles and nothing else.
  const { today, session } = useDaySession(date);
  const sessionMs = useElapsed(date, today, session);
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
        <MetricTip id="win-rate" basis="net" className="text-[13px] text-muted">
          Win rate
        </MetricTip>
        <b className={VALUE}>
          {winRate === null ? 'None' : `${Math.round(winRate * 100)}%`}
        </b>
      </div>
      <div className={CELL}>
        <MetricTip
          id="session-length"
          basis="net"
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

'use client';

import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import type { DayStats } from '@/data/day-log';
import { usePrefs } from '@/data/query/hooks';
import { isClosed } from '@/domain/trade-status';
import type { Trade } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { signTone } from '../../dashboard/shared';

/** Up to two decimals with trailing zeros dropped: 50%, 48.48%, 57.14% (the record's format). */
const percent = (ratio: number): string =>
  `${Number((ratio * 100).toFixed(2))}%`;

const NONE = <span className="font-medium text-faint">None</span>;

/** A quantity to at most two decimals, grouped. */
const quantity = (n: number): string =>
  n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * The seven day (or week) figures: Trades, Gross P&L, Won / lost, Commissions,
 * then Win rate, Volume, Profit factor. `trades` are the base-currency trades
 * the stats were built from, so a unit other than dollars can read them.
 * Money goes through the display unit (Privacy included); an empty value reads
 * "None". Commissions read as the display's two decimals, where TradeZella
 * trims to one: Keel's call (the unit system formats every amount alike).
 */
export function StatGrid({
  stats,
  trades = [],
}: {
  stats: DayStats;
  trades?: readonly Trade[];
}): React.JSX.Element {
  const display = useDisplay();
  const basis = usePrefs().data?.pnlBasis ?? 'net';
  const closed = trades.filter(isClosed).map((t) => t.id);
  const money = (cents: number | null, signed: boolean) =>
    cents === null
      ? null
      : display.figure(display.ofTrades(closed, cents), signed);

  const gross = money(stats.gross, true);
  const commissions =
    stats.gross === null ? null : display.cash(stats.commissions, false);
  const ratio =
    stats.profitFactor === null ? null : display.ratio(stats.profitFactor, 2);

  const items: {
    id: MetricId;
    label: string;
    value: React.ReactNode;
    sr?: string;
  }[] = [
    { id: 'day-trades', label: 'Trades', value: stats.trades },
    {
      id: 'day-gross',
      label: 'Gross P&L',
      value: gross ? (
        <span className={signTone(stats.gross!)}>{gross.text}</span>
      ) : (
        NONE
      ),
    },
    {
      id: 'day-won-lost',
      label: 'Won / lost',
      value: (
        <>
          {stats.wins} <span className="font-normal text-faint">/</span>{' '}
          {stats.losses}
        </>
      ),
    },
    {
      id: 'day-commissions',
      label: 'Commissions',
      value: commissions ? commissions.text : NONE,
    },
    {
      id: 'day-win-rate',
      label: 'Win rate',
      value: stats.winRate === null ? NONE : percent(stats.winRate),
    },
    { id: 'day-volume', label: 'Volume', value: quantity(stats.volume) },
    {
      id: 'day-profit-factor',
      label: 'Profit factor',
      value: ratio ? ratio.text : NONE,
    },
  ];

  return (
    <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-3 sm:grid-cols-7 sm:divide-x sm:divide-line [&>div]:min-w-0 sm:[&>div:not(:first-child)]:pl-4">
      {items.map((it) => (
        <div key={it.id}>
          <dt className="text-[12.5px] text-faint">
            <MetricTip id={it.id} basis={basis} className="text-[12.5px]">
              {it.label}
            </MetricTip>
          </dt>
          <dd className="m-0 mt-1 text-[15px] font-semibold text-text tabular-nums">
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

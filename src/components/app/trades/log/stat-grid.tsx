'use client';

import { useContext } from 'react';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import type { DayStats } from '@/data/day-log';
import { metricContextOf } from '@/data/metrics';
import { usePrefs } from '@/data/query/hooks';
import { isClosed } from '@/domain/trade-status';
import type { Trade } from '@/domain/types';
import {
  FigureSourceContext,
  sumFigures,
  tradeFigure,
  useDisplay,
} from '@/lib/display';
import { trimmedPercent } from '@/lib/format';
import { signTone } from '../../dashboard/shared';

const NONE = <span className="font-medium text-faint">None</span>;

/** A quantity to at most two decimals, grouped. */
const quantity = (n: number): string =>
  n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * The seven day (or week) figures: Trades, Gross P&L, Won / lost, Commissions,
 * then Win rate, Volume, Profit factor. `trades` are the base-currency trades
 * the stats were built from, so a unit other than dollars can read them.
 * Money goes through the display unit (Privacy included); an empty value reads
 * "None". Number formats follow comp 06: commissions as two-decimal money
 * ($28.50), win rate to one decimal (57.1%).
 */
export function StatGrid({
  stats,
  trades = [],
}: {
  stats: DayStats;
  trades?: readonly Trade[];
}): React.JSX.Element {
  const display = useDisplay();
  const prefs = usePrefs().data;
  const basis = prefs?.pnlBasis ?? 'net';
  const source = useContext(FigureSourceContext);
  const closedTrades = trades.filter(isClosed);
  // Gross is read on the gross basis (R, ticks and the rest differ from net's), whatever basis the view's figures are forced to.
  const ctx = source?.ctx ?? (prefs ? metricContextOf(prefs) : undefined);
  const pctBase = source?.pctBase ?? null;
  const gross =
    stats.gross === null
      ? null
      : display.figure({
          ...sumFigures(
            ctx
              ? closedTrades.map((t) =>
                  tradeFigure(t, { ...ctx, pnlBasis: 'gross' }),
                )
              : [],
            pctBase,
          ),
          money: stats.gross,
          pct: pctBase ? stats.gross / pctBase : null,
        });
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
      value: stats.winRate === null ? NONE : trimmedPercent(stats.winRate),
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

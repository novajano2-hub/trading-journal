'use client';

import type { ReactNode } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { Sparkline } from '@/components/product/sparkline';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import type { Summary } from '@/domain/metrics/summary';
import type { PnlBasis } from '@/domain/types';
import { usePhone } from '@/lib/use-phone';
import { formatPct, formatRatio, plural } from '@/lib/format';
import { CARD, signTone } from '../dashboard/shared';

/** A figure and how it reads, as `useDisplay().figure` gives it. */
type Shown = { text: string; label: string };

function Kpi({
  id,
  basis,
  sub,
  trend,
  children,
}: {
  id: MetricId;
  basis: PnlBasis;
  sub: ReactNode;
  /** A small line beside the label. */
  trend?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-kpi={id}
      className="min-w-0 py-1 not-first:lg:border-l not-first:lg:border-line not-first:lg:pl-5"
    >
      <div className="flex items-center justify-between gap-2 text-[12.5px] leading-4 text-faint pointer-coarse:-my-3">
        <MetricTip id={id} basis={basis} />
        {trend}
      </div>
      <div className="mt-1 text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums">
        {children}
      </div>
      <div className="mt-0.5 text-[12.5px] text-faint">{sub}</div>
    </div>
  );
}

/**
 * Five figures over the closed trades in the filters: how many, the P&L (with
 * its running line by exit date), win rate, profit factor (its second line the
 * average win to loss and both amounts) and expectancy. Money goes through the display unit, so
 * Privacy hides it; the profit factor's words carry no currency sign.
 */
export function SummaryStrip({
  summary,
  basis,
  pnl,
  fees,
  expectancy,
  avgWin,
  avgLoss,
  running,
  openCount,
  scope,
  otherCurrencies,
  onHide,
}: {
  summary: Summary;
  basis: PnlBasis;
  pnl: Shown & { cents: number };
  fees: Shown;
  expectancy: (Shown & { cents: number }) | null;
  /** The average winning and losing trade in the display unit; null without one. */
  avgWin: (Shown & { cents: number }) | null;
  avgLoss: (Shown & { cents: number }) | null;
  /** The running P&L at the close of each exit day, in the display unit's terms, oldest first. */
  running: readonly number[];
  /** Open positions in the filters, which the figures leave out. */
  openCount: number;
  /** The range, "1-20 Nov". */
  scope: string;
  /** Closed trades in a currency other than the strip's, left out of it. */
  otherCurrencies: number;
  onHide(): void;
}): React.JSX.Element {
  const open = openCount;
  // A phone reads net first and leaves expectancy out: four figures in two rows.
  const phone = usePhone();
  const kTrades = (
    <Kpi
      id="trades"
      basis={basis}
      sub={
        open > 0
          ? `closed, ${open} still open`
          : plural(summary.closedCount, 'closed trade')
      }
    >
      {summary.closedCount}
    </Kpi>
  );
  const kPnl = (
    <Kpi
      id="pnl"
      basis={basis}
      trend={
        running.length > 1 ? (
          <Sparkline
            variant="line"
            series={running}
            label={`Running P&L by exit date, over ${running.length} trading days`}
            className="h-4 w-8 flex-none"
          />
        ) : null
      }
      sub={
        <>
          {basis === 'gross' ? 'before ' : 'after '}
          <FigureText f={fees} /> fees
        </>
      }
    >
      <span className={signTone(pnl.cents)}>
        <FigureText f={pnl} />
      </span>
    </Kpi>
  );
  const kWin = (
    <Kpi
      id="win-rate"
      basis={basis}
      sub={`${summary.wins} won, ${summary.breakevens} breakeven, ${summary.losses} lost`}
    >
      {summary.winRate === null ? (
        <span className="text-[15px] font-medium text-faint">None</span>
      ) : (
        formatPct(summary.winRate, 1)
      )}
    </Kpi>
  );
  const kPf = (
    <Kpi
      id="profit-factor"
      basis={basis}
      sub={
        // The sentence "won for every 1 lost" gives way: the card's room goes to the
        // average win to loss, which wraps to a second line holding both amounts.
        <>
          <MetricTip id="avg-win-loss" basis={basis}>
            Avg win/loss
          </MetricTip>{' '}
          {summary.winLossRatio === null ? (
            'None'
          ) : (
            <span className="tabular-nums">
              {formatRatio(summary.winLossRatio)}
            </span>
          )}
          {avgWin !== null && avgLoss !== null ? (
            <span className="block tabular-nums">
              <FigureText f={avgWin} /> / <FigureText f={avgLoss} />
            </span>
          ) : null}
        </>
      }
    >
      {summary.profitFactor === null ? (
        <span className="text-[15px] font-medium text-faint">None</span>
      ) : (
        formatRatio(summary.profitFactor)
      )}
    </Kpi>
  );
  const kExp = (
    <Kpi id="expectancy" basis={basis} sub="per closed trade">
      {expectancy === null ? (
        <span className="text-[15px] font-medium text-faint">None</span>
      ) : (
        <span className={signTone(expectancy.cents)}>
          <FigureText f={expectancy} />
        </span>
      )}
    </Kpi>
  );
  return (
    <section
      aria-label="Summary"
      className={`${CARD} grid grid-cols-2 items-start gap-x-5 gap-y-3 px-5 py-4 sm:grid-cols-3 sm:gap-y-4 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]`}
    >
      {phone ? (
        <>
          {kPnl}
          {kWin}
          {kPf}
          {kTrades}
        </>
      ) : (
        <>
          {kTrades}
          {kPnl}
          {kWin}
          {kPf}
          {kExp}
        </>
      )}
      <div className="col-span-full flex items-start gap-4 border-line text-[12.5px] leading-[1.5] text-faint lg:col-span-1 lg:w-[236px] lg:border-l lg:pl-5">
        <p className="min-w-0 flex-1">
          Figures cover the closed trades in your filters, {scope}.
          {otherCurrencies > 0
            ? ` ${otherCurrencies} ${plural(otherCurrencies, 'trade')} in other currencies ${otherCurrencies === 1 ? 'is' : 'are'} left out.`
            : ''}{' '}
          <button
            type="button"
            onClick={onHide}
            className="-my-1 inline-flex rounded-chip py-1 font-semibold text-accent-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 pointer-coarse:items-center"
          >
            Hide summary
          </button>
        </p>
      </div>
    </section>
  );
}

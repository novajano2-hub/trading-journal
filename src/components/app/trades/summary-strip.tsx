'use client';

import type { ReactNode } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import type { Summary } from '@/domain/metrics/summary';
import type { PnlBasis } from '@/domain/types';
import { formatPct, formatRatio, plural } from '@/lib/format';
import { CARD, signTone } from '../dashboard/shared';

/** A figure and how it reads, as `useDisplay().figure` gives it. */
type Shown = { text: string; label: string };

function Kpi({
  id,
  basis,
  sub,
  children,
}: {
  id: MetricId;
  basis: PnlBasis;
  sub: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-kpi={id}
      className="min-w-0 py-1 not-first:lg:border-l not-first:lg:border-line not-first:lg:pl-5"
    >
      <div className="text-[12.5px] leading-4 text-faint pointer-coarse:-my-3">
        <MetricTip id={id} basis={basis} />
      </div>
      <div className="mt-1 text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums">
        {children}
      </div>
      <div className="mt-0.5 text-[12.5px] text-faint">{sub}</div>
    </div>
  );
}

/**
 * Five figures over the closed trades in the filters: how many, the P&L, win
 * rate, profit factor and expectancy. Money goes through the display unit, so
 * Privacy hides it; the profit factor's words carry no currency sign.
 */
export function SummaryStrip({
  summary,
  basis,
  pnl,
  fees,
  expectancy,
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
  /** Open positions in the filters, which the figures leave out. */
  openCount: number;
  /** The range, "1-20 Nov". */
  scope: string;
  /** Closed trades in a currency other than the strip's, left out of it. */
  otherCurrencies: number;
  onHide(): void;
}): React.JSX.Element {
  const open = openCount;
  return (
    <section
      aria-label="Summary"
      className={`${CARD} grid grid-cols-2 items-start gap-x-5 gap-y-4 px-5 py-4 sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]`}
    >
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
      <Kpi
        id="pnl"
        basis={basis}
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
      <Kpi
        id="win-rate"
        basis={basis}
        sub={`${summary.wins} won, ${summary.losses} lost`}
      >
        {summary.winRate === null ? (
          <span className="text-[15px] font-medium text-faint">None</span>
        ) : (
          formatPct(summary.winRate, 1)
        )}
      </Kpi>
      <Kpi
        id="profit-factor"
        basis={basis}
        sub={
          summary.profitFactor === null
            ? 'needs a losing trade'
            : `${formatRatio(summary.profitFactor)} won for every 1 lost`
        }
      >
        {summary.profitFactor === null ? (
          <span className="text-[15px] font-medium text-faint">None</span>
        ) : (
          formatRatio(summary.profitFactor)
        )}
      </Kpi>
      <Kpi id="expectancy" basis={basis} sub="per closed trade">
        {expectancy === null ? (
          <span className="text-[15px] font-medium text-faint">None</span>
        ) : (
          <span className={signTone(expectancy.cents)}>
            <FigureText f={expectancy} />
          </span>
        )}
      </Kpi>
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

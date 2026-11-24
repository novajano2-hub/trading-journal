'use client';

import { CalendarBlank } from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import { IconTile } from '@/components/ui/icon-tile';
import { MetricTip } from '@/components/ui/metric-tip';
import type { CalendarDay, CalendarSummary } from '@/data/calendar';
import type { MetricContext } from '@/domain/metrics/context';
import Link from 'next/link';
import { formatPct, plural } from '@/lib/format';
import { dayLabel, type FormatMoney } from './month-grid';

const toneInk = (n: number) =>
  n < 0 ? 'text-loss' : n > 0 ? 'text-gain' : 'text-text';

function Row({
  label,
  children,
  small,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  small?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-right">
        <b className="block text-[15px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
          {children}
        </b>
        {small ? (
          <small className="block text-[12px] text-muted">{small}</small>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * The panel when no day is picked and the month has no trades: the month in
 * one place, so the panel is never a lone sentence. `nearby` is the closest
 * month that has trades.
 */
export function MonthPanel({
  headingId,
  monthName,
  summary,
  basis,
  fmt,
  nearby,
  reportHref,
  onGo,
}: {
  headingId: string;
  monthName: string;
  summary: CalendarSummary;
  basis: MetricContext['pnlBasis'];
  fmt: FormatMoney;
  nearby?: { month: string; name: string };
  /** Reports > Overview on this month, under the page's filters. */
  reportHref: string;
  onGo(month: string): void;
}): React.JSX.Element {
  const none = summary.tradingDays === 0;
  const day = (d: CalendarDay | null) =>
    d ? (
      <span className={toneInk(d.net)}>
        <FigureText f={fmt(d.net, d.r, false, d)} />
      </span>
    ) : (
      <span className="text-faint">None</span>
    );
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <IconTile icon={CalendarBlank} tone="accent" />
        <h3
          id={headingId}
          className="text-[15px] font-semibold tracking-[-0.015em] text-text"
        >
          {monthName}
        </h3>
      </div>
      <p className="mt-3 text-[13.5px] leading-snug text-muted">
        {none
          ? `No trades exited in ${monthName}. Days are booked on the date a trade exits.`
          : 'Pick a day to see the trades that exited on it, its figures and its daily note.'}
      </p>
      <dl className="mt-3">
        <Row
          label={<MetricTip id="pnl" basis={basis} />}
          small={`${summary.trades} ${summary.trades === 1 ? 'trade' : 'trades'}`}
        >
          <span className={toneInk(summary.net)}>
            <FigureText f={fmt(summary.net, summary.r, false, summary)} />
          </span>
        </Row>
        <Row
          label={<MetricTip id="trading-days" basis={basis} />}
          small={
            none
              ? 'None this month'
              : `${summary.greenDays} green, ${summary.redDays} red, ${summary.flatDays} flat`
          }
        >
          {summary.tradingDays}
        </Row>
        <Row
          label={<MetricTip id="green-days" basis={basis} />}
          small={`${summary.greenDays} of ${summary.tradingDays} green days`}
        >
          {none
            ? 'None'
            : formatPct(summary.greenDays / summary.tradingDays, 1)}
        </Row>
        <Row
          label={
            <MetricTip id="win-rate" basis={basis}>
              Trade win rate
            </MetricTip>
          }
          small={`${summary.wins} ${plural(summary.wins, 'winner')}, ${summary.losses} ${plural(summary.losses, 'loser')}`}
        >
          {summary.winRate === null ? 'None' : formatPct(summary.winRate, 1)}
        </Row>
        <Row
          label={<MetricTip id="best-day" basis={basis} />}
          small={summary.best ? dayLabel(summary.best.date) : 'No trades'}
        >
          {day(summary.best)}
        </Row>
        <Row
          label={<MetricTip id="worst-day" basis={basis} />}
          small={summary.worst ? dayLabel(summary.worst.date) : 'No trades'}
        >
          {day(summary.worst)}
        </Row>
      </dl>
      <Link
        href={reportHref}
        className="mt-3 inline-flex min-h-8 items-center rounded-chip text-[13px] font-semibold text-accent-ink outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
      >
        Month in Reports
      </Link>
      {none && nearby ? (
        <button
          type="button"
          onClick={() => onGo(nearby.month)}
          className="mt-3 inline-flex min-h-8 items-center rounded-chip text-[13px] font-semibold text-accent-ink outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          Go to {nearby.name}
        </button>
      ) : null}
    </div>
  );
}

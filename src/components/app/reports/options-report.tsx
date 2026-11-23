'use client';

import { useMemo } from 'react';
import { isClosed } from '@/domain/trade-status';
import { plural } from '@/lib/format';
import { BreakdownCards } from './breakdown-report';
import { ReportScope } from './report-scope';
import type { ReportData } from './use-report-data';

function Body({ data }: { data: ReportData }): React.JSX.Element {
  const { options, withExpiry, closed } = useMemo(() => {
    const closed = data.partition.trades.filter(isClosed);
    const options = closed.filter((t) => t.instrument.assetClass === 'option');
    return {
      closed: closed.length,
      options,
      withExpiry: options.filter((t) => t.instrument.expiry).length,
    };
  }, [data.partition.trades]);
  const missing = options.length - withExpiry;
  const note =
    missing === 0 ? undefined : (
      <p className="text-[13px] text-muted">
        {missing} option {plural(missing, 'trade')}{' '}
        {missing === 1 ? 'has' : 'have'} no expiry and{' '}
        {missing === 1 ? 'is' : 'are'} left out.
      </p>
    );
  if (withExpiry === 0)
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center rounded-card border border-line bg-surface-1 px-6 py-10 text-center shadow-[var(--shadow-card)]">
        <h2 className="text-[17px] leading-snug font-semibold tracking-[-0.015em] text-text">
          No option trades in these filters.
        </h2>
        <p className="mt-2 text-[14.5px] leading-[1.6] text-muted">
          This report reads the days left to expiry when an option was opened,
          so it needs options with an expiry.
        </p>
        {note ? <div className="mt-2">{note}</div> : null}
      </div>
    );
  return (
    <BreakdownCards
      data={data}
      report="options"
      by="dte"
      chartLabel="Net P&L by days to expiry"
      tableName="Days to expiry summary"
      rowTitle="Days to expiry"
      plural="Days to expiry"
      title="By days to expiry"
      caption={`Counted from the day each option was opened. ${withExpiry} of ${closed} closed ${plural(closed, 'trade')} are options with an expiry.`}
      note={note}
    />
  );
}

/**
 * Reports, Options: option trades by the days left to expiry when they were
 * opened, in buckets 0, 1, 2-7, 8-30 and 31+. Trades that are not options, and
 * options with no expiry, are left out; the note says how many of the latter.
 * Render inside `<Suspense>`.
 */
export function OptionsView(): React.JSX.Element {
  return (
    <ReportScope testId="reports-options">
      {(data) => <Body data={data} />}
    </ReportScope>
  );
}

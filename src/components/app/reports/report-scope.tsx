'use client';

import {
  ClockCounterClockwise,
  FunnelSimple,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { IconTile } from '@/components/ui/icon-tile';
import { Segmented } from '@/components/ui/segmented';
import { unitEmptyCopy } from '@/content/display-units';
import { StorageUnavailableError } from '@/data/repository';
import { FigureSourceContext } from '@/lib/display';
import { CARD } from '../dashboard/shared';
import { useReportData, type ReportData } from './use-report-data';

function Bar({ className }: { className: string }): React.JSX.Element {
  return <span className={`block rounded-chip bg-sunken ${className}`} />;
}

/** A report's shape while its data loads: no figures. */
export function ReportSkeleton(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading the report"
      className="flex flex-col gap-4"
    >
      <div
        aria-hidden="true"
        className={`${CARD} grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7`}
      >
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="flex h-[78px] flex-col gap-2 p-4">
            <Bar className="h-3 w-16" />
            <Bar className="h-5 w-24" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className={`${CARD} h-[340px]`} />
    </div>
  );
}

export function State({
  icon,
  title,
  body,
  actions,
  role,
}: {
  icon: typeof Warning;
  title: string;
  body?: string;
  actions?: ReactNode;
  role?: 'alert';
}): React.JSX.Element {
  return (
    <div
      role={role}
      className={`${CARD} mx-auto flex w-full max-w-[560px] flex-col items-center px-6 py-10 text-center`}
    >
      <IconTile icon={icon} />
      <h2 className="mt-4 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance text-text">
        {title}
      </h2>
      {body ? (
        <p className="mt-2 text-[14.5px] leading-[1.6] text-pretty text-muted">
          {body}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-5 flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/**
 * What every report opens with: the URL's filters as one currency's metrics, the
 * loading, error and empty states, and the display units' source for the figures
 * under it. `children` runs once the data is ready; with trades in more than one
 * currency a switch picks which one shows, as the Dashboard does.
 */
export function ReportScope({
  testId,
  children,
}: {
  /** On the ready page: tests and the e2e wait for it. */
  testId: string;
  children(data: ReportData): ReactNode;
}): React.JSX.Element {
  const report = useReportData();
  switch (report.state) {
    case 'loading':
      return <ReportSkeleton />;
    case 'error': {
      const storage = report.error instanceof StorageUnavailableError;
      return (
        <State
          role="alert"
          icon={Warning}
          title={
            storage
              ? "Keel can't open storage in this browser, so your workspace can't load."
              : "The report couldn't load."
          }
          body={
            storage
              ? 'Private windows and blocked site data often cause this.'
              : undefined
          }
          actions={
            <Button variant="secondary" onClick={report.retry}>
              Try again
            </Button>
          }
        />
      );
    }
    case 'empty':
      return report.variant === 'no-trades' ? (
        <State
          icon={ClockCounterClockwise}
          title="No trades in this workspace yet."
          body="Import a CSV from your broker, and the reports fill in."
          actions={
            <Link href="/app/import" className={buttonClasses('primary')}>
              Import
            </Link>
          }
        />
      ) : report.unit ? (
        // The line under the top bar says how many it left out, and goes back to Dollar.
        <State icon={FunnelSimple} {...unitEmptyCopy(report.unit)} />
      ) : (
        <State
          icon={report.filtered ? FunnelSimple : ClockCounterClockwise}
          title={
            report.filtered
              ? 'No closed trades in these filters.'
              : 'No closed trades yet.'
          }
          body="Open positions count here once they close."
          actions={
            report.filtered ? (
              <Button onClick={report.clearFilters}>Clear filters</Button>
            ) : undefined
          }
        />
      );
    case 'ready': {
      const { data } = report;
      return (
        <FigureSourceContext.Provider value={data.source}>
          <div data-testid={testId} className="flex min-w-0 flex-col gap-4">
            {data.currencies.length > 1 ? (
              <div className="flex flex-wrap items-center gap-3">
                <Segmented
                  label="Currency"
                  options={data.currencies.map((c) => ({ value: c, label: c }))}
                  value={data.currency}
                  onChange={data.setCurrency}
                />
                <p className="text-[12.5px] text-faint">
                  Each currency is shown on its own. Converting between them
                  waits on exchange rates.
                </p>
              </div>
            ) : null}
            {children(data)}
          </div>
        </FigureSourceContext.Provider>
      );
    }
  }
}

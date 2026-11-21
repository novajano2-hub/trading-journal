// No 'use client': the page prerenders the skeleton as its Suspense fallback.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import {
  ClockCounterClockwise,
  FunnelSimple,
  Tray,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { IconTile } from '@/components/ui/icon-tile';
import { StorageUnavailableError } from '@/data/repository';

const CARD = 'rounded-card border border-line bg-surface-1';

function Bar({ className }: { className: string }): React.JSX.Element {
  return <span className={`block rounded-chip bg-sunken ${className}`} />;
}

/** The Dashboard's shape while its data loads: row 1 and the three cards of row 2, without figures. */
export function DashboardSkeleton(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading your dashboard"
      className="flex flex-col gap-4 p-5"
    >
      <div
        aria-hidden="true"
        className={`${CARD} flex flex-col gap-6 px-5 py-4 lg:min-h-[288px] lg:flex-row lg:gap-7`}
      >
        <div className="flex flex-col justify-center gap-3 border-line max-lg:border-b max-lg:pb-5 lg:w-[290px] lg:flex-none lg:border-r lg:pr-7">
          <Bar className="h-4 w-40" />
          <Bar className="h-11 w-28" />
          <Bar className="h-3.5 w-32" />
          <Bar className="mt-3 h-10 w-full rounded-control" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex h-[38px] items-center gap-4 border-t border-line first:border-t-0"
            >
              <Bar className="h-3.5 w-2/5" />
              <Bar className="ml-auto h-1 w-1/4 max-sm:hidden" />
              <Bar className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`${CARD} flex h-[268px] flex-col gap-4 px-5 py-4`}
          >
            <Bar className="h-4 w-32" />
            <Bar className="h-3.5 w-full" />
            <Bar className="h-3.5 w-4/5" />
            <Bar className="h-3.5 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** One state of the page: a tile, what happened, what to do next. */
function StateBlock({
  icon,
  title,
  body,
  actions,
  role,
}: {
  icon: Icon;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
  role?: 'alert';
}): React.JSX.Element {
  return (
    <div
      role={role}
      className="mx-auto flex w-full max-w-[520px] flex-col items-center px-5 py-20 text-center sm:py-28"
    >
      <IconTile icon={icon} />
      <h2 className="mt-5 text-[16px] leading-snug font-medium text-balance text-text">
        {title}
      </h2>
      {body ? (
        <p className="mt-2 text-[15px] leading-[1.6] text-pretty text-muted">
          {body}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Why there is nothing to show, with the way out:
 * - `no-trades`: the workspace is empty, so Import or open the sample.
 * - `no-matches`: trades exist but the filters exclude every closed one.
 * - `no-closed`: no filters, and every trade is still open.
 */
export function DashboardEmpty({
  variant,
  onClearFilters,
  onOpenSample,
}: {
  variant: 'no-trades' | 'no-matches' | 'no-closed';
  onClearFilters(): void;
  onOpenSample(): void;
}): React.JSX.Element {
  switch (variant) {
    case 'no-trades':
      return (
        <StateBlock
          icon={Tray}
          title="No trades in My workspace yet."
          body="Import a CSV from your broker, or open the sample workspace to look around."
          actions={
            <>
              <Link href="/app/import" className={buttonClasses('primary')}>
                Import
              </Link>
              <Button variant="secondary" onClick={onOpenSample}>
                Open the sample workspace
              </Button>
            </>
          }
        />
      );
    case 'no-matches':
      return (
        <StateBlock
          icon={FunnelSimple}
          title="No trades match these filters."
          actions={<Button onClick={onClearFilters}>Clear filters</Button>}
        />
      );
    case 'no-closed':
      return (
        <StateBlock
          icon={ClockCounterClockwise}
          title="No closed trades yet."
          body="Open positions count here once they close."
        />
      );
  }
}

/**
 * The page failed to load its data. Neutral, never loss red: nothing here is
 * money. Storage that won't open says so plainly.
 */
export function DashboardError({
  error,
  onRetry,
}: {
  error: Error;
  onRetry(): void;
}): React.JSX.Element {
  const storage = error instanceof StorageUnavailableError;
  return (
    <StateBlock
      role="alert"
      icon={Warning}
      title={
        storage
          ? "Keel can't open storage in this browser, so your workspace can't load."
          : "Your dashboard couldn't load."
      }
      body={
        storage
          ? 'Private windows and blocked site data often cause this.'
          : undefined
      }
      actions={
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

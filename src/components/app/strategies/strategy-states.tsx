import Link from 'next/link';
import type { ReactNode } from 'react';
import { ListChecks, Warning } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { StateGlyph } from '@/components/ui/state-glyph';
import { UNIT_SCOPE } from '@/content/display-units';
import type { TradeUnit } from '@/domain/metrics/units';
import { plural } from '@/lib/format';
import { StorageUnavailableError } from '@/data/repository';
import { CARD } from '../dashboard/shared';
import type { HiddenWhy } from './use-strategy-figures';

/** One state of a Strategies page: a tile, what happened, what to do next. */
export function StateBlock({
  visual,
  title,
  body,
  actions,
  role,
}: {
  visual: ReactNode;
  title: string;
  body?: string;
  actions?: ReactNode;
  role?: 'alert';
}): React.JSX.Element {
  return (
    <div
      role={role}
      className="mx-auto flex w-full max-w-[520px] flex-col items-center px-5 py-16 text-center sm:py-24"
    >
      {visual}
      <h2 className="mt-5 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance text-text">
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

export function StrategySkeleton({
  label,
  rows = 3,
}: {
  label: string;
  rows?: number;
}): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className={`${CARD} h-[132px]`} />
      ))}
    </div>
  );
}

/** Failed loads are neutral, never loss red: nothing here is money. */
export function StrategyError({
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
      visual={<StateGlyph icon={Warning} />}
      title={
        storage
          ? "Keel can't open storage in this browser, so your workspace can't load."
          : "Your strategies couldn't load."
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

export function NoStrategy(): React.JSX.Element {
  return (
    <StateBlock
      visual={<StateGlyph icon={ListChecks} />}
      title="That strategy isn't here."
      body="It may have been deleted, or it belongs to another workspace."
      actions={
        <Link href="/app/strategies" className={buttonClasses('secondary')}>
          Back to strategies
        </Link>
      }
    />
  );
}

/** Said where a strategy's figures stand, when some of its trades are in another currency. */
export function LeftOutNote({
  count,
  className = '',
}: {
  count: number;
  className?: string;
}): React.JSX.Element | null {
  if (count <= 0) return null;
  return (
    <p className={`text-[12.5px] leading-[1.45] text-faint ${className}`}>
      {count} {plural(count, 'trade')} in{' '}
      {plural(count, 'another currency', 'other currencies')}{' '}
      {plural(count, 'is', 'are')} left out of these figures.
    </p>
  );
}

/** A failed archive or unarchive: neutral, since nothing here is money. */
export function ArchiveFailed({
  name,
  archiving,
  className = '',
}: {
  name: string;
  archiving: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <p
      role="alert"
      className={`flex items-center gap-1.5 text-[13px] text-text ${className}`}
    >
      <Warning size={14} aria-hidden="true" className="flex-none text-muted" />
      {name} couldn&apos;t be {archiving ? 'archived' : 'unarchived'}. Try
      again.
    </p>
  );
}

/**
 * Said where a strategy has trades but the filters (or the display unit) leave
 * none of them. "Clear filters" shows only when a filter is what hides them.
 */
export function HiddenTrades({
  why,
  unit,
  onClear,
  className = '',
}: {
  why: HiddenWhy;
  unit: TradeUnit | undefined;
  onClear(): void;
  className?: string;
}): React.JSX.Element {
  const text =
    why === 'filters'
      ? "Your filters hide this strategy's trades."
      : why === 'unit' && unit
        ? `${UNIT_SCOPE[unit].name} counts ${UNIT_SCOPE[unit].keeps} only, so none of this strategy's trades show.`
        : "This strategy's trades are in archived accounts. Pick one in the account filter to see them.";
  return (
    <p
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] leading-[1.45] text-muted ${className}`}
    >
      <span>{text}</span>
      {why === 'filters' ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center rounded-chip font-semibold text-accent-ink underline-offset-2 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          Clear filters
        </button>
      ) : null}
    </p>
  );
}

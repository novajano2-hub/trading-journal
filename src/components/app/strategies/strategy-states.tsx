import Link from 'next/link';
import type { ReactNode } from 'react';
import { ListChecks, Warning } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { IconTile } from '@/components/ui/icon-tile';
import { StorageUnavailableError } from '@/data/repository';
import { CARD } from '../dashboard/shared';

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
      visual={<IconTile icon={Warning} />}
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
      visual={<IconTile icon={ListChecks} />}
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

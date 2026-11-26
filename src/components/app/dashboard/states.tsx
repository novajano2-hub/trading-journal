// No 'use client': the page prerenders the skeleton as its Suspense fallback.
import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { Archive, Warning } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { StateGlyph } from '@/components/ui/state-glyph';
import { DEFAULT_TEMPLATE } from '@/domain/dashboard/templates';
import { isWidgetKey, WIDGETS } from '@/domain/dashboard/widgets';
import { StorageUnavailableError } from '@/data/repository';
import { CARD, CARD_PAD } from './shared';
import {
  Bar,
  LowerGrid,
  SkeletonBody,
  UpperStrip,
  WidgetCell,
} from './widgets/layout';

/** A card's header while it loads: the title's place. */
function HeaderBars({ title = 'w-28' }: { title?: string }): React.JSX.Element {
  return (
    <div className="flex h-7 items-center">
      <Bar className={`h-3.5 ${title}`} />
    </div>
  );
}

/**
 * The Dashboard's shape while its data loads: the default template's upper
 * strip and lower grid, in the sizes the widgets take, without figures.
 */
export function DashboardSkeleton(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading your dashboard"
      className="flex flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0"
    >
      <div aria-hidden="true" className="flex flex-col gap-4">
        <UpperStrip>
          {DEFAULT_TEMPLATE.upper.map((ref) => (
            <WidgetCell key={ref.key}>
              <div
                className={`${CARD} flex min-h-32 flex-col px-[18px] pt-4 pb-3.5 max-sm:min-h-0 max-sm:px-3.5`}
              >
                <div className="flex h-[22px] items-center">
                  <Bar className="h-3 w-20" />
                </div>
                <SkeletonBody section="upper" />
              </div>
            </WidgetCell>
          ))}
        </UpperStrip>
        <LowerGrid>
          {DEFAULT_TEMPLATE.lower.map((ref) => {
            const wide =
              isWidgetKey(ref.key) && WIDGETS[ref.key].size === 'wide';
            return (
              <WidgetCell key={ref.key} wide={wide}>
                <div className={`${CARD} ${CARD_PAD} flex flex-col`}>
                  <HeaderBars />
                  <SkeletonBody section="lower" wide={wide} />
                </div>
              </WidgetCell>
            );
          })}
        </LowerGrid>
      </div>
    </div>
  );
}

/** One state of the page: a plain glyph (or a preview), what happened, what to do next. */
function StateBlock({
  visual,
  title,
  body,
  actions,
  role,
}: {
  visual: ReactNode;
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

/**
 * The dashboard before there is anything to show: ghost figures and cards in
 * its own layout, with no numbers, labelled with what will fill them.
 */
function DashboardPreview(): React.JSX.Element {
  const captionId = useId();
  return (
    <figure
      aria-labelledby={captionId}
      className={`${CARD} mb-4 w-full px-5 pt-[18px] pb-2 text-left`}
    >
      <figcaption
        id={captionId}
        className="text-[13.5px] leading-snug font-medium text-text"
      >
        Your figures, charts and calendar will show here.
      </figcaption>
      {/* The lower row fades: the dashboard goes on. */}
      <div
        aria-hidden="true"
        className="mt-3 [mask-image:linear-gradient(to_bottom,black_45%,transparent)]"
      >
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-control border border-line p-3">
              <Bar className="h-2.5 w-2/3" />
              <Bar className="mt-3 h-4 w-3/4" />
              <span className="mt-3 block h-1.5 rounded-[3px] bg-accent-soft" />
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-control border border-line p-3">
              <Bar className="h-2.5 w-1/3" />
              <Bar className="mt-3 h-16 rounded-control" />
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

/**
 * Why there is no dashboard to show, with the way out. Every other kind of
 * nothing (filters that match no trade, only open trades, a unit that keeps
 * none) leaves the widgets on the page, each saying so in its own words.
 * - `no-trades`: the workspace is empty, so Import or open the sample.
 * - `archived`: every account is archived, so their trades are out of view
 *   until one is unarchived or picked in the account filter.
 */
export function DashboardEmpty({
  variant,
  onOpenSample,
}: {
  variant: 'no-trades' | 'archived';
  onOpenSample(): void;
}): React.JSX.Element {
  switch (variant) {
    case 'no-trades':
      return (
        <StateBlock
          visual={<DashboardPreview />}
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
    case 'archived':
      return (
        <StateBlock
          visual={<StateGlyph icon={Archive} />}
          title="Your trades are in archived accounts."
          body="Unarchive an account in Settings to see its trades here, or pick it in the account filter to look at them as they are."
          actions={
            <Link
              href="/app/settings/accounts"
              className={buttonClasses('primary')}
            >
              Open Accounts
            </Link>
          }
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
      visual={<StateGlyph icon={Warning} />}
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

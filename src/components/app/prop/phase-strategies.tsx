'use client';

import { Plus, X } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { Popover } from 'radix-ui';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useStrategies, useUpdateChallenge } from '@/data/query/hooks';
import type { Challenge } from '@/domain/types';
import { CARD, CARD_PAD, CardHeader } from '../dashboard/shared';
import { TipGlyph } from '../dashboard/widgets/frame';
import { StrategyChips } from './strategy-chips';

/**
 * The challenge's strategies (C66): the ones it is traded with, each with a
 * control to detach it, and Attach, the form's multi-select, in a popover. A
 * choice writes `strategyIds` at once. They feed the dashboard's pass rate by
 * strategy and its strategy filter. Nothing is counted here (C73).
 */
export function StrategiesCard({
  challenge: c,
}: {
  challenge: Challenge;
}): React.JSX.Element {
  const headingId = useId();
  const pickerId = useId();
  const strategies = useStrategies().data ?? [];
  const update = useUpdateChallenge();
  const [failed, setFailed] = useState(false);
  const attached = c.strategyIds ?? [];
  const named = attached.flatMap(
    (id) => strategies.find((s) => s.id === id) ?? [],
  );
  // Active strategies, and any attached one that has since been archived, so it can be detached.
  const offered = strategies.filter(
    (s) => s.status === 'active' || attached.includes(s.id),
  );

  async function write(next: string[]) {
    setFailed(false);
    try {
      await update.mutateAsync({ id: c.id, patch: { strategyIds: next } });
    } catch {
      setFailed(true);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className={`${CARD} ${CARD_PAD} flex min-w-0 flex-col`}
    >
      <CardHeader
        headingId={headingId}
        title="Strategies"
        after={
          <TipGlyph id="challenge-strategies" basis="net" name="Strategies" />
        }
        end={
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="secondary" size="sm">
                <Plus size={14} weight="bold" aria-hidden="true" />
                Attach
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                aria-labelledby={pickerId}
                align="end"
                sideOffset={6}
                collisionPadding={12}
                className="z-[60] w-[320px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
              >
                <h3
                  id={pickerId}
                  className="mb-2 text-[13.5px] font-semibold text-text"
                >
                  Attach strategies
                </h3>
                {offered.length === 0 ? (
                  <p className="text-[12.5px] leading-[1.5] text-muted">
                    No strategies yet.{' '}
                    <Link
                      href="/app/strategies"
                      className="font-semibold text-accent-ink hover:underline"
                    >
                      Open Strategies
                    </Link>{' '}
                    to create one, then attach it here.
                  </p>
                ) : (
                  <StrategyChips
                    strategies={offered}
                    selected={attached}
                    disabled={update.isPending}
                    onToggle={(id, on) =>
                      void write(
                        on
                          ? [...attached.filter((x) => x !== id), id]
                          : attached.filter((x) => x !== id),
                      )
                    }
                  />
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        }
      />
      {named.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-muted">No strategy attached.</p>
      ) : (
        <ul aria-label="Attached strategies" className="m-0 mt-2 list-none p-0">
          {named.map((s) => (
            <li
              key={s.id}
              className="flex min-h-11 items-center justify-between gap-3 border-t border-line/70 text-[13.5px] font-semibold first:border-t-0"
            >
              <span className="min-w-0 truncate">{s.name}</span>
              <button
                type="button"
                aria-label={`Detach ${s.name}`}
                disabled={update.isPending}
                onClick={() => void write(attached.filter((x) => x !== s.id))}
                className="inline-grid size-7 flex-none place-items-center rounded-control border border-line text-muted outline-offset-2 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 pointer-coarse:size-11"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {failed ? (
        <p role="alert" className="mt-2 text-[12.5px] text-muted">
          Couldn&apos;t save that. Try again.
        </p>
      ) : null}
    </section>
  );
}

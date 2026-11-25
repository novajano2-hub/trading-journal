'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useStartSession } from '@/data/query/hooks';
import type { DayRecord } from '@/domain/types';
import type { DayMode } from '@/lib/day-routes';
import { formatClock, useElapsed } from './session-button';

const TRACK =
  'rounded-[11px] bg-track p-[3px] shadow-[inset_0_1px_2px_rgb(18_22_51/0.07)] [[data-theme=dark]_&]:shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]';
const STAGE =
  'inline-flex h-7 min-w-[72px] items-center justify-center gap-1.5 rounded-[8px] px-[13px] text-[13.5px] font-medium whitespace-nowrap text-muted no-underline transition-[background-color,color,box-shadow] duration-200 ease-(--ease-glide) outline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';
const ON =
  'bg-surface-1 font-semibold text-text shadow-[var(--shadow-chip)] [[data-theme=dark]_&]:bg-line-2';
const OFF = 'cursor-default text-faint hover:text-faint';

/**
 * Plan, Trade, Import, Review (spec §5.2). Plan, Trade and Review are links
 * that push a history entry and keep the date; Import opens the method
 * picker. Trade, on the routine's today, starts the session (once a day) and
 * shows plan; on any other date it is disabled, with the reason. A future date
 * has no review. `full` spreads it across a phone's width.
 */
export function StageBar({
  date,
  mode,
  today,
  session,
  onImport,
  full = false,
}: {
  date: string;
  mode: DayMode;
  /** The routine's today; undefined until it loads. */
  today: string | undefined;
  session: DayRecord['session'];
  /** Opens the import picker from the Import stage. */
  onImport(from: HTMLElement): void;
  full?: boolean;
}): React.JSX.Element {
  const start = useStartSession();
  const elapsed = useElapsed(date, today, session);
  const isToday = today === date;
  const running = isToday && session !== undefined && session.end === undefined;
  const future = today !== undefined && date > today;
  const item = full ? 'min-w-0 flex-1 px-1.5' : '';
  const stage = (on: boolean) => `${STAGE} ${item} ${on ? ON : ''}`;
  const planHref = `/app/day/${date}/plan`;

  const disabled = (label: string, reason: string): ReactNode => (
    <span
      aria-disabled="true"
      title={reason}
      className={`${STAGE} ${item} ${OFF}`}
    >
      {label}
      <span className="sr-only"> ({reason})</span>
    </span>
  );

  return (
    <nav
      aria-label="Day stages"
      className={`${TRACK} ${full ? 'flex w-full' : 'inline-flex flex-none'}`}
    >
      <Link
        href={planHref}
        aria-current={mode === 'plan' && !running ? 'step' : undefined}
        className={stage(mode === 'plan' && !running)}
      >
        Plan
      </Link>
      {isToday ? (
        <Link
          href={planHref}
          aria-current={mode === 'plan' && running ? 'step' : undefined}
          onClick={() => {
            if (session === undefined && !start.isPending)
              start.mutate({ date });
          }}
          className={stage(mode === 'plan' && running)}
        >
          Trade
          {running ? (
            <span className="font-medium text-muted tabular-nums">
              {formatClock(elapsed ?? 0, false)}
            </span>
          ) : null}
        </Link>
      ) : (
        disabled('Trade', "Trade starts a session, on today's date only.")
      )}
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={(e) => onImport(e.currentTarget)}
        className={stage(false)}
      >
        Import
      </button>
      {future ? (
        disabled('Review', 'Review opens once the day has begun.')
      ) : (
        <Link
          href={`/app/day/${date}/review`}
          aria-current={mode === 'review' ? 'step' : undefined}
          className={stage(mode === 'review')}
        >
          Review
        </Link>
      )}
    </nav>
  );
}

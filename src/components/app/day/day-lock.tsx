'use client';

import { LockSimple } from '@phosphor-icons/react/dist/ssr';
import { useDays, usePrefs } from '@/data/query/hooks';
import { clock } from '@/lib/time-format';

/**
 * Whether a date is finished (K3), and when: its record is stamped or
 * carries a lock. Every editor bound to the date reads this, so the page
 * shows read-only before the repository would refuse the write.
 */
export function useDayFinished(date: string | undefined): {
  finished: boolean;
  /** "16:42" in the profile zone, once known. */
  time: string | undefined;
} {
  const days = useDays().data;
  const timeZone = usePrefs().data?.timeZone;
  const record =
    date === undefined ? undefined : days?.find((d) => d.id === date);
  const at = record?.finishedAt;
  return {
    finished: record !== undefined && (at !== undefined || !!record.locked),
    time:
      at === undefined || timeZone === undefined
        ? undefined
        : clock(at, timeZone, false),
  };
}

/** The line a read-only editor of a finished day carries. */
export function LockLine({
  className = '',
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <p
      role="note"
      className={`flex items-center gap-2 rounded-control bg-sunken px-3 py-2 text-[13.5px] text-muted ${className}`}
    >
      <LockSimple size={16} aria-hidden="true" className="flex-none" />
      This day is closed. Its note is locked.
    </p>
  );
}

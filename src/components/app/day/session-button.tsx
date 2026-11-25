'use client';

import { Play, Stop } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useState } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import { useRoutineToday } from '@/data/query/derived';
import {
  useDays,
  useEndSession,
  usePrefs,
  useStartSession,
} from '@/data/query/hooks';
import { sessionLength } from '@/data/routine';
import type { DayRecord } from '@/domain/types';

/** The day's record session, and whether it is running now: today's, started and not ended. */
export function useDaySession(date: string): {
  today: string | undefined;
  session: DayRecord['session'];
  running: boolean;
  /** The records have loaded, so "no session" is known. */
  ready: boolean;
} {
  const today = useRoutineToday();
  const days = useDays().data;
  const session = days?.find((d) => d.id === date)?.session;
  return {
    today,
    session,
    running:
      date === today && session !== undefined && session.end === undefined,
    ready: days !== undefined,
  };
}

/** `h:mm`, or `h:mm:ss`. */
export function formatClock(ms: number, seconds: boolean): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return seconds ? `${h}:${mm}:${ss}` : `${h}:${mm}`;
}

/** The running session's length in ms, ticking each second while it runs; null when there is none. */
export function useElapsed(
  date: string,
  today: string | undefined,
  session: DayRecord['session'],
): number | null {
  const timeZone = usePrefs().data?.timeZone;
  const [now, setNow] = useState(() => new Date().toISOString());
  const running = session !== undefined && session.end === undefined;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(id);
  }, [running]);
  if (today === undefined || timeZone === undefined) return null;
  return sessionLength(session, date, today, now, timeZone);
}

/**
 * The top bar's session control (K30), on today's page only: "Start session"
 * until the day's one session begins, then "End session" with its clock.
 * Once the session has ended nothing is left to press.
 */
export function SessionButton({
  date,
}: {
  date: string;
}): React.JSX.Element | null {
  const { today, session, running, ready } = useDaySession(date);
  const elapsed = useElapsed(date, today, session);
  const start = useStartSession();
  const end = useEndSession();
  if (!ready || today !== date) return null;
  if (running) {
    return (
      <button
        type="button"
        disabled={end.isPending}
        onClick={() => end.mutate({ date })}
        className={`${buttonClasses('secondary')} flex-none gap-[7px] border-accent pl-3 hover:border-accent max-sm:h-9 max-sm:px-3 max-sm:text-[13px]`}
      >
        <Stop
          size={16}
          aria-hidden="true"
          className="flex-none text-accent-ink"
        />
        <span className="max-sm:sr-only">End session</span>
        <span className="font-semibold tabular-nums">
          {formatClock(elapsed ?? 0, true)}
        </span>
      </button>
    );
  }
  if (session !== undefined) return null;
  return (
    <button
      type="button"
      disabled={start.isPending}
      onClick={() => start.mutate({ date })}
      className={`${buttonClasses('secondary')} flex-none gap-[7px] pl-3 max-sm:h-9 max-sm:px-3 max-sm:text-[13px]`}
    >
      <Play size={16} aria-hidden="true" className="flex-none" />
      Start session
    </button>
  );
}

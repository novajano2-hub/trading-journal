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
  useTracker,
} from '@/data/query/hooks';
import { sessionLength } from '@/data/routine';
import { routineNow } from '@/domain/tracker/defaults';
import type { DayRecord } from '@/domain/types';
import { useDayFinished } from './day-lock';

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

/**
 * The session's length in ms; null until it loads. It ticks each second only
 * for today's running session: any other date's length is fixed.
 */
export function useElapsed(
  date: string,
  today: string | undefined,
  session: DayRecord['session'],
): number | null {
  const timeZone = usePrefs().data?.timeZone;
  const tracker = useTracker().data;
  const [now, setNow] = useState(() => new Date().toISOString());
  const running =
    date === today && session !== undefined && session.end === undefined;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(id);
  }, [running]);
  if (today === undefined || timeZone === undefined || tracker === undefined)
    return null;
  // On the sample the routine's today is its `asOf` day, where the session started (M1).
  return sessionLength(
    session,
    date,
    today,
    routineNow(tracker, now, timeZone),
    timeZone,
  );
}

/** What a refused or failed session write says, beside the control. */
function SaveFailed(): React.JSX.Element {
  return (
    <span
      role="alert"
      className="ml-2 flex-none text-[12.5px] whitespace-nowrap text-loss"
    >
      Couldn&apos;t save
    </span>
  );
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
  const { finished } = useDayFinished(date);
  // A closed day takes no session: the repository refuses both, and ending it
  // closed the one that was running.
  if (!ready || today !== date || finished) return null;
  if (running) {
    return (
      <>
        <button
          type="button"
          disabled={end.isPending}
          onClick={() => end.mutate({ date })}
          className={`${buttonClasses('secondary')} flex-none gap-[7px] border-accent pl-3 hover:border-accent max-lg:px-3 max-sm:h-9 max-sm:text-[13px]`}
        >
          <Stop
            size={16}
            aria-hidden="true"
            className="flex-none text-accent-ink"
          />
          <span className="max-lg:sr-only">End session</span>
          <span className="font-semibold tabular-nums">
            {formatClock(elapsed ?? 0, true)}
          </span>
        </button>
        {end.isError ? <SaveFailed /> : null}
      </>
    );
  }
  if (session !== undefined) return null;
  return (
    <>
      <button
        type="button"
        disabled={start.isPending}
        onClick={() => start.mutate({ date })}
        className={`${buttonClasses('secondary')} flex-none gap-[7px] pl-3 max-lg:px-3 max-sm:h-9 max-sm:text-[13px]`}
      >
        <Play size={16} aria-hidden="true" className="flex-none" />
        <span className="max-lg:sr-only">Start session</span>
      </button>
      {start.isError ? <SaveFailed /> : null}
    </>
  );
}

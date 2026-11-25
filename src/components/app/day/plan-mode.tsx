'use client';

import { Suspense } from 'react';
import { useDayScores } from '@/data/query/derived';
import { useRoutineToday } from '@/data/query/derived';
import { NoteCard } from './note-card';
import { RulesCard } from './rules-card';
import { ScreenshotsCard } from './screenshots-card';

/** Whether the date's rules are finished (a finished day is read-only everywhere). */
function useFinished(date: string): boolean {
  return useDayScores().data?.scoreOn(date).finished ?? false;
}

function Cards({
  date,
  today,
}: {
  date: string;
  today: string | undefined;
}): React.JSX.Element {
  const finished = useFinished(date);
  return (
    <>
      <NoteCard key={date} date={date} readOnly={finished} />
      <div className="flex min-w-0 flex-col gap-4">
        {today !== undefined ? <RulesCard date={date} today={today} /> : null}
        <ScreenshotsCard date={date} readOnly={finished} />
      </div>
    </>
  );
}

/**
 * Plan mode (K27, K28): the day's note with its templates, then the rules
 * and the screenshots beside it (below it on a phone).
 */
export function PlanMode({ date }: { date: string }): React.JSX.Element {
  const today = useRoutineToday();
  return (
    <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_400px] sm:items-start">
      <Suspense fallback={null}>
        <Cards date={date} today={today} />
      </Suspense>
    </div>
  );
}

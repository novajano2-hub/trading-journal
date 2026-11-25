'use client';

import { Suspense } from 'react';
import { useRoutineToday } from '@/data/query/derived';
import { useDayFinished } from './day-lock';
import { NoteCard } from './note-card';
import { RulesCard } from './rules-card';
import { ScreenshotsCard } from './screenshots-card';

function Cards({
  date,
  today,
}: {
  date: string;
  today: string | undefined;
}): React.JSX.Element {
  // The day records alone decide it, as in every other editor, so a closed day is never briefly editable.
  const { finished } = useDayFinished(date);
  return (
    <>
      <NoteCard key={date} date={date} mode="plan" readOnly={finished} />
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
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <Suspense fallback={null}>
        <Cards date={date} today={today} />
      </Suspense>
    </div>
  );
}

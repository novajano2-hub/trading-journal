'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { isRealDate } from '@/components/app/notebook/notebook-model';
import { useRoutineToday } from '@/data/query/derived';
import { dayHref, dayPlanHref, dayQuery, type DayMode } from '@/lib/day-routes';
import { usePhone } from '@/lib/use-phone';
import { BadDate } from './bad-date';
import { useImportPicker } from './import-picker';
import { useDaySession } from './session-button';
import { PlanMode } from './plan-mode';
import { ReviewMode } from './review-mode';
import { StageBar } from './stage-bar';

/**
 * `/app/day/<date>` on its own: K26 sends today and later dates to plan and
 * earlier ones to review, replacing the entry so Back skips it. A bad date
 * gets the plain page.
 */
export function DayRedirect({
  date,
}: {
  date: string;
}): React.JSX.Element | null {
  const today = useRoutineToday();
  const router = useRouter();
  const query = dayQuery(useSearchParams());
  const real = isRealDate(date);
  useEffect(() => {
    if (real && today !== undefined)
      router.replace(dayHref(date, today, query));
  }, [real, today, date, query, router]);
  return real ? null : <BadDate today={today} />;
}

/**
 * One day's page in a mode. The header (date and stages) lives in the top
 * bar; on a phone the stage bar sits at the top of the page. A future date
 * has no review, so its review replaces itself with its plan.
 */
export function DayView({
  date,
  mode,
}: {
  date: string;
  mode: DayMode;
}): React.JSX.Element | null {
  const { today, session } = useDaySession(date);
  const router = useRouter();
  const query = dayQuery(useSearchParams());
  const phone = usePhone();
  const imports = useImportPicker();
  const real = isRealDate(date);
  const future = real && today !== undefined && date > today;
  useEffect(() => {
    if (future && mode === 'review') router.replace(dayPlanHref(date, query));
  }, [future, mode, date, query, router]);

  if (!real) return <BadDate today={today} />;
  if (future && mode === 'review') return null;
  return (
    <div
      className="flex flex-col gap-3.5 px-5 pt-3 pb-8 sm:pt-0"
      data-mode={mode}
    >
      {phone ? (
        <>
          <StageBar
            full
            date={date}
            mode={mode}
            today={today}
            session={session}
            onImport={imports.open}
          />
          {imports.picker}
        </>
      ) : null}
      {mode === 'plan' ? <PlanMode date={date} /> : <ReviewMode date={date} />}
    </div>
  );
}

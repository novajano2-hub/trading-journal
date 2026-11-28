'use client';

import { Suspense } from 'react';
import { useGlobalFilters, useRoutineToday } from '@/data/query/derived';
import { useAccounts, usePrefs } from '@/data/query/hooks';
import { NoteCard } from './note-card';
import { RatingCard } from './rating-card';
import { ReviewTiles } from './review-tiles';
import { ReviewTrades } from './review-trades';
import { RulesCard } from './rules-card';
import { FinishDay } from './finish-day';
import { useDayFinished } from './day-lock';
import { useDayFigures } from './use-day-figures';

/** "all accounts", or the one chosen, or how many. */
function scopeOf(
  chosen: readonly string[],
  names: ReadonlyMap<string, string>,
): string {
  if (chosen.length === 0) return 'all accounts';
  if (chosen.length === 1) return names.get(chosen[0]!) ?? '1 account';
  return `${chosen.length} accounts`;
}

function Cards({ date }: { date: string }): React.JSX.Element | null {
  const { filters } = useGlobalFilters();
  const accounts = useAccounts().data;
  const prefs = usePrefs().data;
  const today = useRoutineToday();
  const { finished } = useDayFinished(date);
  const day = useDayFigures(date);

  if (!day || !prefs || !accounts || today === undefined) return null;
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  return (
    <>
      <div className="flex min-w-0 flex-col gap-4 max-lg:contents">
        <div className="max-lg:order-1">
          <ReviewTiles
            date={date}
            stats={day.stats}
            currency={prefs.baseCurrency}
          />
        </div>
        <div className="max-lg:order-2">
          <ReviewTrades
            trades={day.trades}
            ctx={day.ctx}
            timeZone={prefs.timeZone}
            scope={scopeOf(filters.accountIds, names)}
          />
        </div>
        <div className="max-lg:order-5">
          <NoteCard key={date} date={date} mode="review" readOnly={finished} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4 max-lg:contents">
        <div className="max-lg:order-3">
          <RatingCard date={date} readOnly={finished} />
        </div>
        <div className="max-lg:order-4">
          <RulesCard
            date={date}
            today={today}
            foot={<FinishDay date={date} />}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Review mode (spec 5.2): the day in three figures, its trades, the note
 * beneath them, and the rating and the rules beside. Nothing sits below the
 * note. A finished day is read-only throughout.
 */
export function ReviewMode({ date }: { date: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <Suspense fallback={null}>
        <Cards date={date} />
      </Suspense>
    </div>
  );
}

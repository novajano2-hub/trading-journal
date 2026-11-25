'use client';

import { Suspense, useMemo } from 'react';
import { groupDays, dayOfTrade } from '@/data/day-log';
import type { MetricContext } from '@/domain/metrics/context';
import { selectedAccounts } from '@/data/filters';
import { useGlobalFilters, useRoutineToday } from '@/data/query/derived';
import { useAccounts, usePrefs, useTrades } from '@/data/query/hooks';
import { NoteCard } from './note-card';
import { RatingCard } from './rating-card';
import { ReviewTiles } from './review-tiles';
import { ReviewTrades } from './review-trades';
import { RulesCard } from './rules-card';
import { FinishDay } from './finish-day';
import { useDayFinished } from './day-lock';

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
  const trades = useTrades().data;
  const accounts = useAccounts().data;
  const prefs = usePrefs().data;
  const today = useRoutineToday();
  const { finished } = useDayFinished(date);

  const day = useMemo(() => {
    if (!trades || !accounts || !prefs) return undefined;
    const ids = new Set(selectedAccounts(accounts, filters).map((a) => a.id));
    const own = trades.filter(
      (t) => ids.has(t.accountId) && dayOfTrade(t, prefs.timeZone) === date,
    );
    // The page has no Display menu and every money figure is net, so the
    // outcomes and the win rate classify on net whatever the hidden basis, and
    // no unit narrows the day.
    const ctx: MetricContext = {
      timeZone: prefs.timeZone,
      breakevenRange: prefs.breakevenRange,
      pnlBasis: 'net',
      weekStart: prefs.weekStart ?? 'sunday',
    };
    const group = groupDays(own, {
      timeZone: prefs.timeZone,
      baseCurrency: prefs.baseCurrency,
      ctx,
      weekStart: prefs.weekStart ?? 'sunday',
      noteDates: new Set(),
    })[0];
    return {
      trades: group ? [...group.trades, ...group.otherCurrency] : own,
      stats: group?.stats,
      ctx,
    };
  }, [trades, accounts, prefs, filters, date]);

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

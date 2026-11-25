'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Info, Warning } from '@phosphor-icons/react/dist/ssr';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MetricTip } from '@/components/ui/metric-tip';
import { StateGlyph } from '@/components/ui/state-glyph';
import { resolveRange } from '@/data/filters';
import { useDayScores, useGlobalFilters } from '@/data/query/derived';
import { usePrefs, useSetTick } from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import { versionOn } from '@/domain/tracker/defaults';
import { periodScore, ruleStats, streaks } from '@/domain/tracker/summary';
import { rangeCaption } from '@/lib/range-label';
import { onTradingDate, weekdayOf } from '@/lib/time-format';
import { plural } from '@/lib/format';
import { CARD, CARD_PAD, Caption, CardHeader } from '../dashboard/shared';
import { PlanTheDay } from '../routine/plan-the-day';
import { DayRules } from './day-rules';
import { HeatGrid } from './heat-grid';
import { RulesTable } from './rules-table';
import { ProgressTiles } from './tiles';
import { ProgressSkeleton } from './states';

/** "Tue 24 Nov". */
const dayLabel = (date: string): string =>
  `${weekdayOf(date, 'short')} ${onTradingDate(date, { day: 'numeric', month: 'short' })}`;

/**
 * The progress tracker page: three tiles, today's checklist, the history grid
 * and the rules table. It follows the date range (the score and the rules
 * table) and the global account selection (everything). The streak, today and
 * the grid never read the range (K14). There is no Display menu and no
 * Filters here: money shows through `display.cash`, always net (P6A-03).
 * Render inside `<Suspense>`: it reads the search params.
 */
export function ProgressView(): React.JSX.Element {
  const scores = useDayScores();
  const { filters } = useGlobalFilters();
  const prefs = usePrefs().data;
  const setTick = useSetTick();
  const queryClient = useQueryClient();
  // The grid's paging controls live in the History card's header.
  const [controlsHost, setControlsHost] = useState<HTMLElement | null>(null);

  if (scores.status === 'error') {
    const storage = scores.error instanceof StorageUnavailableError;
    return (
      <div
        role="alert"
        className="mx-auto flex w-full max-w-[520px] flex-col items-center px-5 py-20 text-center sm:py-28"
      >
        <StateGlyph icon={Warning} />
        <h2 className="mt-5 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance">
          {storage
            ? "Keel can't open storage in this browser, so your workspace can't load."
            : "Your progress tracker couldn't load."}
        </h2>
        <div className="mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              if (storage) window.location.reload();
              else void queryClient.resetQueries({ queryKey: ['keel'] });
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }
  const history = scores.data;
  if (!history || !prefs) return <ProgressSkeleton />;

  const { tracker, today, days } = history;
  // Task 9 mounts the Edit rules dialog here.
  const editRules = () => undefined;
  const todayScore = history.scoreOn(today);
  const version =
    versionOn(tracker, today) ?? tracker.versions[tracker.versions.length - 1]!;
  const range = resolveRange(filters.range, today, prefs.weekStart);
  const scoredInRange = days.filter(
    (d) =>
      !d.unscored &&
      d.active > 0 &&
      (range.from === undefined || d.date >= range.from) &&
      (range.to === undefined || d.date <= range.to),
  ).length;
  const rangeText = rangeCaption(range, today);
  const empty = todayScore.active === 0;
  const readOnly = todayScore.finished;

  return (
    <div className="flex flex-col gap-4 px-5 pt-0.5 pb-7">
      <ProgressTiles
        streak={streaks(days, today).current}
        score={periodScore(days, range.from, range.to)}
        rangeText={rangeText}
        met={todayScore.met}
        active={todayScore.active}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        <section
          aria-labelledby="today-title"
          className={`${CARD} ${CARD_PAD} min-w-0 xl:sticky xl:top-[84px] xl:col-start-2 xl:row-span-2 xl:row-start-1`}
        >
          <CardHeader
            headingId="today-title"
            title="Today"
            after={<Caption>{dayLabel(today)}</Caption>}
          />
          {empty ? (
            <p className="mt-3 text-[13.5px] leading-[1.5] text-muted">
              {todayScore.unscored === 'not-trading-day'
                ? "Today isn't a trading day, so it has no rules. Change your trading days, or add rules you tick by hand, in "
                : 'No rules apply today. Turn some on, or add rules you tick by hand, in '}
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={editRules}
                className="rounded-chip font-semibold text-accent-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
              >
                Edit rules
              </button>
              .
            </p>
          ) : (
            <DayRules
              score={todayScore}
              version={version}
              readOnly={readOnly}
              detail="values"
              currency={prefs.baseCurrency}
              onTick={(ruleId, ticked) =>
                setTick.mutate({ date: today, ruleId, ticked })
              }
            />
          )}
          <div className="mt-3 border-t border-line pt-3.5">
            <PlanTheDay wide />
          </div>
        </section>
        <section
          aria-labelledby="history-title"
          className={`${CARD} ${CARD_PAD} min-w-0 xl:col-start-1 xl:row-start-1`}
        >
          <CardHeader
            headingId="history-title"
            title="History"
            after={
              <>
                <MetricTip
                  id="tracker-history"
                  basis="net"
                  className="-ml-1.5 size-[22px] justify-center text-faint hover:text-muted"
                >
                  <Info size={15} aria-hidden="true" />
                  <span className="sr-only">About History</span>
                </MetricTip>
                <span className="text-[12.5px] whitespace-nowrap text-faint max-sm:order-3 max-sm:basis-full">
                  Since {dayLabel(tracker.startedOn)}
                </span>
              </>
            }
            end={
              <span ref={setControlsHost} className="flex items-center gap-2" />
            }
          />
          <HeatGrid
            days={days}
            today={today}
            tracker={tracker}
            weekStart={prefs.weekStart}
            markToday
            paging
            label="Rules met each scored day"
            controlsHost={controlsHost}
          />
        </section>
        <div className="min-w-0 xl:col-start-1 xl:row-start-2">
          <RulesTable
            stats={ruleStats(days, today, range.from, range.to)}
            version={version}
            today={todayScore}
            currency={prefs.baseCurrency}
            caption={`${rangeText}, ${scoredInRange} scored ${plural(scoredInRange, 'day')}`}
            onEdit={editRules}
          />
        </div>
      </div>
    </div>
  );
}

'use client';

import { ArrowRight, Info, ListChecks } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { buttonClasses } from '@/components/ui/button-styles';
import { MetricTip } from '@/components/ui/metric-tip';
import { useDayScores } from '@/data/query/derived';
import { usePrefs } from '@/data/query/hooks';
import { dayHref } from '@/lib/day-routes';
import { navItem, navHref } from '../nav';
import { ProgressBar } from '../progress/progress-bar';
import { HeatGrid } from '../progress/heat-grid';
import { CARD, CARD_PAD, CardHeader, HEADER_LINK } from './shared';

const PROGRESS = navItem('progress');

/**
 * The progress tracker on the Dashboard: the history grid, today's score as
 * "x of y rules met" with a bar (0 of 0 on a non-trading day), a link to the
 * page and a button into today's checklist. Today's square isn't marked and the grid doesn't page: the page
 * has both. Like the page, it follows only the account selection.
 */
export function ProgressCard(): React.JSX.Element {
  const scores = useDayScores();
  const weekStart = usePrefs().data?.weekStart;
  const history = scores.data;
  const today = history?.today;
  const score = history?.scoreOn(history.today);
  // The page opens on the same account selection and range.
  const trackerHref = navHref(PROGRESS, useSearchParams());
  const query = trackerHref.includes('?')
    ? trackerHref.slice(trackerHref.indexOf('?'))
    : '';

  return (
    <section
      data-widget="progress"
      aria-labelledby="progress-card-title"
      className={`${CARD} ${CARD_PAD} min-w-0`}
    >
      <CardHeader
        headingId="progress-card-title"
        title="Progress tracker"
        after={
          <MetricTip
            id="tracker-card"
            basis="net"
            className="-ml-1.5 size-[22px] justify-center text-faint hover:text-muted"
          >
            <Info size={15} aria-hidden="true" />
            <span className="sr-only">About the progress tracker</span>
          </MetricTip>
        }
        end={
          <Link href={trackerHref} className={`${HEADER_LINK} gap-1.5`}>
            Open tracker
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        }
      />
      {scores.status === 'error' ? (
        <p role="alert" className="mt-3 text-[13.5px] text-muted">
          Your progress tracker couldn&apos;t load.
        </p>
      ) : !history || !today || !score ? (
        <div aria-hidden="true" className="mt-2">
          <span className="block h-3 w-12 rounded-chip bg-sunken" />
          <span className="mt-2 block h-6 w-28 rounded-chip bg-sunken" />
          <span className="mt-4 block h-[118px] w-full rounded-control bg-sunken" />
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <span className="text-[12.5px] text-faint">Today</span>
              <p className="mt-0.5 text-[22px] leading-[1.25] font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums">
                {score.met}{' '}
                <span className="text-[13.5px] font-medium tracking-normal text-faint">
                  of
                </span>{' '}
                {score.active}{' '}
                <span className="ml-0.5 text-[13.5px] font-medium tracking-normal text-muted">
                  rules met
                </span>
              </p>
            </div>
            <Link
              href={`${dayHref(today, today)}${query}`}
              className={`${buttonClasses('secondary', 'sm')} flex-none gap-1.5`}
            >
              <ListChecks size={16} aria-hidden="true" />
              Today&apos;s checklist
            </Link>
          </div>
          <ProgressBar
            role="progressbar"
            aria-label="Rules met today"
            aria-valuemin={0}
            aria-valuemax={score.active}
            aria-valuenow={score.met}
            percent={score.active > 0 ? (score.met / score.active) * 100 : 0}
            className="mt-2.5"
          />
          <div className="mt-4">
            <HeatGrid
              days={history.days}
              today={today}
              tracker={history.tracker}
              weekStart={weekStart}
              markToday={false}
              paging={false}
              compact
              label="Rules met each scored day"
            />
          </div>
        </>
      )}
    </section>
  );
}

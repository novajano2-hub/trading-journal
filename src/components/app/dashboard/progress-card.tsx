'use client';

import { ArrowRight, Info, ListChecks } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button-styles';
import { MetricTip } from '@/components/ui/metric-tip';
import { useDayScores } from '@/data/query/derived';
import { usePrefs } from '@/data/query/hooks';
import { dayHref } from '@/lib/day-routes';
import { HeatGrid } from '../progress/heat-grid';
import { CARD, CARD_PAD, CardHeader, HEADER_LINK } from './shared';

/**
 * The progress tracker on the Dashboard: the history grid, today's score as
 * "x of y rules met" with a bar, a link to the page and a button into today's
 * checklist. Today's square isn't marked and the grid doesn't page: the page
 * has both. Like the page, it follows only the account selection.
 */
export function ProgressCard(): React.JSX.Element {
  const scores = useDayScores();
  const weekStart = usePrefs().data?.weekStart;
  const history = scores.data;
  const today = history?.today;
  const score = history?.scoreOn(history.today);

  return (
    <section
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
          <Link href="/app/progress" className={`${HEADER_LINK} gap-1.5`}>
            Open tracker
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        }
      />
      {scores.status === 'error' ? (
        <p role="alert" className="mt-3 text-[13.5px] text-muted">
          Your progress tracker couldn&apos;t load.
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <span className="text-[12.5px] text-faint">Today</span>
              <p className="mt-0.5 text-[22px] leading-[1.25] font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums">
                {score === undefined ? (
                  <span className="text-faint">None</span>
                ) : score.active === 0 ? (
                  <span className="text-[13.5px] font-medium tracking-normal text-muted">
                    No rules apply
                  </span>
                ) : (
                  <>
                    {score.met}{' '}
                    <span className="text-[13.5px] font-medium tracking-normal text-faint">
                      of
                    </span>{' '}
                    {score.active}{' '}
                    <span className="ml-0.5 text-[13.5px] font-medium tracking-normal text-muted">
                      rules met
                    </span>
                  </>
                )}
              </p>
            </div>
            {today ? (
              <Link
                href={dayHref(today, today)}
                className={`${buttonClasses('secondary', 'sm')} flex-none gap-1.5`}
              >
                <ListChecks size={16} aria-hidden="true" />
                Today&apos;s checklist
              </Link>
            ) : null}
          </div>
          <div
            role="progressbar"
            aria-label="Rules met today"
            aria-valuemin={0}
            aria-valuemax={score?.active ?? 0}
            aria-valuenow={score?.met ?? 0}
            className="relative mt-2.5 h-1.5 overflow-hidden rounded-[3px] bg-accent-soft [[data-theme=dark]_&]:bg-line"
          >
            <i
              className="absolute inset-y-0 left-0 rounded-[3px] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_78%,#fff),var(--accent))]"
              style={{
                width: `${score && score.active > 0 ? (score.met / score.active) * 100 : 0}%`,
              }}
            />
          </div>
          {history && today ? (
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
          ) : null}
        </>
      )}
    </section>
  );
}

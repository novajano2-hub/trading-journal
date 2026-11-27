'use client';

import { CaretLeft, CaretRight } from '@phosphor-icons/react/dist/ssr';
import { useSearchParams } from 'next/navigation';
import { useId, useMemo } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { calendarYear } from '@/data/calendar';
import { parseFilters, queryString, serializeFilters } from '@/data/filters';
import { useDisplay } from '@/lib/display';
import { CARD, CARD_PAD, CardHeader, signTone } from '../dashboard/shared';
import { monthFormat } from '../calendar/month-format';
import { YearGrid } from '../calendar/year-grid';
import { ReportScope } from './report-scope';
import { writeParam, type ReportData } from './use-report-data';

const STEP =
  'inline-flex size-[30px] items-center justify-center rounded-[8px] border border-line bg-surface-1 text-text outline-offset-2 transition-colors duration-200 ease-(--ease-glide) hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11';

function Body({ data }: { data: ReportData }): React.JSX.Element {
  const params = useSearchParams();
  const display = useDisplay();
  const headingId = useId();
  const { partition: p, ctx, currency } = data;
  const thisYear = Number(data.today.slice(0, 4));
  const asked = Number(params.get('year'));
  const year =
    Number.isInteger(asked) && asked >= 1970 && asked <= 2200
      ? asked
      : thisYear;
  // Day figures: every filter but the date, the exits clipped to the date range.
  const months = useMemo(
    () => calendarYear(p.dayTrades, year, ctx),
    [p.dayTrades, year, ctx],
  );
  const net = months.reduce((n, m) => n + m.net, 0);
  // The year's R and units, summed as each month's are: a unit no month has stays empty.
  const sum = (u: 'r' | 'ticks' | 'pips' | 'points') => {
    const have = months.flatMap((m) => m[u] ?? []);
    return have.length === 0 ? null : have.reduce((a, b) => a + b, 0);
  };
  const pctBase = data.source.pctBase;
  // Each month and the year read in the display unit, as the Calendar's do.
  const fmt = monthFormat(display, pctBase, currency);
  const traded = months.reduce(
    (n, m) => n + m.days.filter((d) => d.trades > 0).length,
    0,
  );
  // A month opens the Calendar on the same filters.
  // With trades in several currencies it opens on the one this year reads.
  const links = serializeFilters(parseFilters(params));
  if (data.currencies.length > 1) links.set('cur', currency);
  const filterQuery = queryString(links);
  const go = (to: number) =>
    writeParam('year', to === thisYear ? null : String(to));

  return (
    <section aria-labelledby={headingId} className={`${CARD} ${CARD_PAD}`}>
      <CardHeader
        headingId={headingId}
        title={String(year)}
        after={
          <span className="text-[12.5px] text-faint">
            {traded} trading {traded === 1 ? 'day' : 'days'}, net{' '}
            <b className={`font-semibold ${signTone(net)}`}>
              <FigureText
                f={fmt(net, sum('r'), false, {
                  ticks: sum('ticks'),
                  pips: sum('pips'),
                  points: sum('points'),
                })}
              />
            </b>
          </span>
        }
        end={
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => go(year - 1)}
              className={STEP}
            >
              <CaretLeft size={14} weight="bold" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next year"
              onClick={() => go(year + 1)}
              className={STEP}
            >
              <CaretRight size={14} weight="bold" aria-hidden="true" />
            </button>
          </span>
        }
      />
      <div className="mt-4">
        <YearGrid
          year={year}
          months={months}
          fmt={fmt}
          hrefFor={(month) =>
            `/app/calendar?month=${month}${filterQuery ? `&${filterQuery}` : ''}`
          }
        />
      </div>
    </section>
  );
}

/**
 * Reports, Calendar: the twelve months of a year, a square per trading day in
 * its tone and each month's net, stepping a year at a time (`?year=`). It is
 * the Calendar's own year grid on the same day figures; a month opens the
 * Calendar on it with the filters carried. Render inside `<Suspense>`.
 */
export function CalendarReportView(): React.JSX.Element {
  return (
    <ReportScope testId="reports-calendar">
      {(data) => <Body data={data} />}
    </ReportScope>
  );
}

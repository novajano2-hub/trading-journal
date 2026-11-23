'use client';

import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react/dist/ssr';
import { useSearchParams } from 'next/navigation';
import { useId, useMemo } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { calendarYear } from '@/data/calendar';
import { parseFilters, queryString, serializeFilters } from '@/data/filters';
import { useDisplay } from '@/lib/display';
import { CARD, CARD_PAD, CardHeader, signTone } from '../dashboard/shared';
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
  const traded = months.reduce(
    (n, m) => n + m.days.filter((d) => d.trades > 0).length,
    0,
  );
  // A month opens the Calendar on the same filters.
  const filterQuery = queryString(serializeFilters(parseFilters(params)));
  const go = (to: number) =>
    writeParam('year', to === thisYear ? null : String(to));

  return (
    <section aria-labelledby={headingId} className={`${CARD} ${CARD_PAD}`}>
      <CardHeader
        icon={CalendarBlank}
        tone="accent"
        headingId={headingId}
        title={String(year)}
        after={
          <span className="text-[12.5px] text-faint">
            {traded} trading {traded === 1 ? 'day' : 'days'}, net{' '}
            <b className={`font-semibold ${signTone(net)}`}>
              <FigureText f={display.cash(net, true, currency)} />
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
          fmt={(money) => display.cash(money, true, currency)}
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

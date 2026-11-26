'use client';

import Link from 'next/link';
import { FigureText } from '@/components/product/figure-text';
import type { calendarYear } from '@/data/calendar';
import { useDisplay } from '@/lib/display';
import { weekIndex } from '@/data/calendar';
import { usePrefs } from '@/data/query/hooks';
import { onTradingDate } from '@/lib/time-format';
import type { FormatMoney } from './month-grid';

const SQUARE = {
  gain: 'bg-gain-fill',
  loss: 'bg-loss-fill',
  flat: 'bg-accent/45',
  none: 'bg-sunken',
} as const;

/**
 * Twelve small months of one year: a square per day in its tone (empty days
 * quiet) and the month's net. Each month links to that month on the Calendar.
 * `fmt` is the view's figure; alone it reads the display unit with no
 * percentage base.
 */
export function YearGrid({
  year,
  months,
  fmt,
  hrefFor = (month) => `/app/calendar?month=${month}`,
  dense = false,
}: {
  year: number;
  months: ReturnType<typeof calendarYear>;
  fmt?: FormatMoney;
  hrefFor?: (month: string) => string;
  /**
   * For a card of its own (the dashboard's year widget): the months answer to
   * the width of their card, three across below 40rem and four from there,
   * tightly packed on a phone, rather than to the screen's.
   */
  dense?: boolean;
}): React.JSX.Element {
  const display = useDisplay();
  const weekStart = usePrefs().data?.weekStart;
  const figure: FormatMoney =
    fmt ??
    ((money, r, compact, units) =>
      display.figure(
        {
          money,
          r: r ?? null,
          ticks: units?.ticks ?? null,
          pips: units?.pips ?? null,
          points: units?.points ?? null,
        },
        true,
        undefined,
        compact,
      ));
  const list = (
    <ol
      aria-label={`${year} by month`}
      className={
        dense
          ? 'grid grid-cols-3 gap-2 @[40rem]:grid-cols-4 @[40rem]:gap-3'
          : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      }
    >
      {months.map((m) => {
        const traded = m.days.filter((d) => d.trades > 0).length;
        const lead = weekIndex(`${m.month}-01`, weekStart);
        return (
          <li key={m.month} data-testid="year-month">
            <Link
              href={hrefFor(m.month)}
              className={`block rounded-card border border-line bg-surface-1 shadow-[var(--shadow-card)] outline-offset-2 transition-colors duration-200 ease-(--ease-glide) hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent ${dense ? 'p-2 @[40rem]:p-3' : 'p-3.5'}`}
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-1.5">
                <span className="text-[14px] font-semibold text-text">
                  {onTradingDate(`${m.month}-01`, { month: 'long' }, 'en-US')}
                </span>
                <b
                  className={`text-[13.5px] font-semibold tabular-nums ${traded === 0 ? 'text-faint' : m.net < 0 ? 'text-loss' : m.net > 0 ? 'text-gain' : 'text-text'}`}
                >
                  <FigureText f={figure(m.net, m.r, false, m)} />
                </b>
              </span>
              <span
                aria-hidden="true"
                className="mt-2.5 grid grid-cols-7 gap-[3px]"
              >
                {Array.from({ length: lead }, (_, i) => (
                  <i key={`pad-${i}`} className="aspect-square" />
                ))}
                {m.days.map((d) => (
                  <i
                    key={d.date}
                    className={`aspect-square rounded-[3px] ${SQUARE[d.tone]}`}
                  />
                ))}
              </span>
              <span className="mt-2 block text-[12px] text-muted">
                {traded === 0
                  ? 'No trades'
                  : `${traded} trading ${traded === 1 ? 'day' : 'days'}`}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
  return dense ? <div className="@container">{list}</div> : list;
}

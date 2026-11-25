'use client';

import { CaretDown, CaretRight } from '@phosphor-icons/react/dist/ssr';
import { useId, useRef, useState } from 'react';
import { MorphDialog } from '@/components/ui/morph-dialog';
import type { DayGroup, WeekGroup } from '@/data/day-log';
import type { Trade } from '@/domain/types';
import { isClosed } from '@/domain/trade-status';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { CARD, CARD_PAD, signTone } from '../../dashboard/shared';
import { DayFigures, DayTables } from './day-card';
import { dayLabel, weekLabel } from '@/lib/day-label';
import { useLogEnv } from './log-env';
import { LogTable } from './log-table';
import { StatGrid } from './stat-grid';
import { WeekBars } from './week-bars';
import { WeekTiles } from './week-tiles';

/** A day's card body in a dialog: the chart, the figures and the day's table with the Day view's columns. No Review link: the record shows none. */
function DayDialog({
  day,
  date,
  opener,
  onClose,
}: {
  day: DayGroup | undefined;
  date: string | undefined;
  opener: React.RefObject<HTMLElement | null>;
  onClose(): void;
}): React.JSX.Element {
  const { columns, dayColumns } = useLogEnv();
  const display = useDisplay();
  const label = date ? dayLabel(date) : '';
  // The tile's count: base-currency trades, with other currencies listed apart.
  const total = day ? day.trades.length : 0;
  const other = day ? day.otherCurrency.length : 0;
  const count = `${total} ${plural(total, 'trade')}${other > 0 ? `, ${other} in other currencies, listed apart` : ''}`;
  const net =
    day && day.stats.net !== null
      ? display.figure(
          display.ofTrades(
            day.trades.filter(isClosed).map((t) => t.id),
            day.stats.net,
          ),
        )
      : null;
  return (
    <MorphDialog
      open={day !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      origin={opener}
      returnFocus={opener}
      title={label}
      size="sheet"
      description={
        net ? (
          <>
            <span className={signTone(day!.stats.net!)}>{net.text}</span> net,{' '}
            {count}
          </>
        ) : (
          count
        )
      }
    >
      {day && date ? (
        <div className="pb-2">
          <DayFigures group={day} date={label} />
          <DayTables group={day} date={label} columns={dayColumns ?? columns} />
        </div>
      ) : null}
    </MorphDialog>
  );
}

/**
 * One week of the trade log: a header (chevron, the span, the week's net after
 * costs), seven day tiles, the daily bars and the seven figures; expanded, the
 * week's trades as a table (the Day column first by default) with other
 * currencies apart. The chevron shows or hides the table only. `rows` are the
 * table's trades (the week under every filter but the date range, R5); they
 * default to the week's own.
 */
export function WeekCard({
  week,
  expanded,
  onToggle,
  rows,
}: {
  week: WeekGroup;
  expanded: boolean;
  onToggle(): void;
  rows?: { trades: readonly Trade[]; otherCurrency: readonly Trade[] };
}): React.JSX.Element {
  const { env, columns } = useLogEnv();
  const display = useDisplay();
  const heading = useId();
  const panel = useId();
  const opener = useRef<HTMLElement | null>(null);
  const [openDate, setOpenDate] = useState<string>();
  const span = weekLabel(week.start, week.end);

  const hasTrades = week.trades.length > 0;
  const net =
    week.stats.net === null
      ? null
      : display.figure(
          display.ofTrades(
            week.trades.filter(isClosed).map((t) => t.id),
            week.stats.net,
          ),
        );
  const tradeRows = rows?.trades ?? week.trades;
  const otherRows = rows?.otherCurrency ?? week.otherCurrency;
  const openDay = openDate
    ? (week.days.find((d) => d?.date === openDate) ?? undefined)
    : undefined;

  return (
    <article aria-labelledby={heading} className={`${CARD} ${CARD_PAD}`}>
      <header className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-0.5">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panel}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${span}`}
          onClick={onToggle}
          className="-ml-1.5 grid size-7 flex-none place-items-center rounded-chip text-muted outline-offset-0 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
        >
          {expanded ? (
            <CaretDown size={14} weight="bold" aria-hidden="true" />
          ) : (
            <CaretRight size={14} weight="bold" aria-hidden="true" />
          )}
        </button>
        <h2
          id={heading}
          className="text-[15px] font-semibold tracking-[-0.015em] whitespace-nowrap text-text"
        >
          {span}
        </h2>
        <b
          className={`text-[15px] font-semibold whitespace-nowrap tabular-nums ${net === null ? 'text-faint' : signTone(week.stats.net!)}`}
        >
          <span className="sr-only">Net P&amp;L </span>
          {net ? net.text : 'None'}
        </b>
      </header>

      <WeekTiles
        week={week}
        onOpen={(date, el) => {
          opener.current = el;
          setOpenDate(date);
        }}
      />
      <WeekBars week={week} />
      {hasTrades ? (
        <StatGrid stats={week.stats} trades={week.trades} />
      ) : (
        // Keel's call (TradeZella unknown): a week with only other-currency trades
        // has no figures (they sum the base currency), only this line and the apart list, as its day card reads.
        <p className="mt-2 text-[13px] text-muted">
          {week.otherCurrency.length}{' '}
          {plural(week.otherCurrency.length, 'trade')} in other currencies,
          listed apart and left out of the figures.
        </p>
      )}
      <div id={panel} hidden={!expanded}>
        {expanded ? (
          <div className="mt-3.5 border-t border-line">
            {tradeRows.length > 0 ? (
              <LogTable
                trades={tradeRows}
                columns={columns}
                env={env}
                label={`Trades in ${span}`}
              />
            ) : null}
            {otherRows.length > 0 ? (
              <div className={tradeRows.length > 0 ? 'mt-4' : ''}>
                <p className="py-2 text-[12.5px] text-faint">
                  In other currencies, listed apart and left out of the figures
                  above.
                </p>
                <LogTable
                  trades={otherRows}
                  columns={columns}
                  env={env}
                  label={`Trades in other currencies in ${span}`}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <DayDialog
        day={openDay}
        date={openDate}
        opener={opener}
        onClose={() => setOpenDate(undefined)}
      />
    </article>
  );
}

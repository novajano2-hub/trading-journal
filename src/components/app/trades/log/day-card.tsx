'use client';

import {
  CaretDown,
  CaretRight,
  ClipboardText,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId } from 'react';
import { daySpan, type DayGroup } from '@/data/day-log';
import { useSetMood } from '@/data/query/hooks';
import { isClosed } from '@/domain/trade-status';
import type { ColumnId } from '@/data/trade-columns';
import type { DayRecord } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { formatInstrument, plural } from '@/lib/format';
import { CARD, CARD_PAD, signTone } from '../../dashboard/shared';
import { MoodControl } from '../../routine/mood-control';
import { usePhone } from '@/lib/use-phone';
import { dayLabel } from '@/lib/day-label';
import { dayQuery, dayReviewHref } from '@/lib/day-routes';
import { IntradayChart } from './intraday-chart';
import { useLogEnv } from './log-env';
import { LogTable } from './log-table';
import { StatGrid } from './stat-grid';

/**
 * R9: Mood shows only on a day logged through Plan the day: its record holds a
 * note stamp, a session, a tick, a rating, a finish or a mood.
 */
export function isLoggedDay(r: DayRecord | undefined): r is DayRecord {
  return (
    r !== undefined &&
    (r.noteStartedAt !== undefined ||
      r.session !== undefined ||
      Object.keys(r.ticks ?? {}).length > 0 ||
      r.rating !== undefined ||
      r.finishedAt !== undefined ||
      r.mood !== undefined)
  );
}

/** A quick action in the card's header: Review, and the note action. */
export const QUICK =
  'inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-muted no-underline outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

/**
 * A day's running-net chart and its seven figures (the card's body above the
 * table). A day with only other-currency trades has no chart or figures.
 */
export function DayFigures({
  group,
  date,
}: {
  group: DayGroup;
  date: string;
}): React.JSX.Element {
  const { env } = useLogEnv();
  const byId = new Map(group.trades.map((t) => [t.id, t]));
  const nameOf = (id: string) => {
    const t = byId.get(id);
    return t
      ? formatInstrument(t.instrument, t.openedAt, env.timeZone).name
      : id;
  };
  // The enlarged chart's span is Keel's call (see `daySpan`).
  const span = daySpan(group.trades, group.date, env.timeZone);

  const hasTrades = group.trades.length > 0;
  return (
    <>
      {/* Keel's call (TradeZella unknown): a day whose trades are all open has no chart, as nothing has closed to plot. */}
      {hasTrades && group.series.length > 0 ? (
        <div className="my-3.5">
          <IntradayChart
            series={group.series}
            label={date}
            span={span}
            nameOf={nameOf}
          />
        </div>
      ) : null}
      {hasTrades ? (
        <div className={group.series.length > 0 ? '' : 'mt-3.5'}>
          <StatGrid stats={group.stats} trades={group.trades} />
        </div>
      ) : (
        // Keel's call (TradeZella unknown): a day with only other-currency trades
        // has no chart or figures (they sum the base currency), only this line and the apart list.
        <p className="mt-2 text-[13px] text-muted">
          {group.otherCurrency.length}{' '}
          {plural(group.otherCurrency.length, 'trade')} in other currencies,
          listed apart and left out of the figures.
        </p>
      )}
    </>
  );
}

/** A day's trades as a table, then its other-currency trades apart. */
export function DayTables({
  group,
  date,
  columns,
}: {
  group: DayGroup;
  date: string;
  columns: readonly ColumnId[];
}): React.JSX.Element {
  const { env } = useLogEnv();
  const hasTrades = group.trades.length > 0;
  return (
    <div className="mt-3.5 border-t border-line">
      {hasTrades ? (
        <LogTable
          trades={group.trades}
          columns={columns}
          env={env}
          label={`Trades on ${date}`}
        />
      ) : null}
      {group.otherCurrency.length > 0 ? (
        <div className={hasTrades ? 'mt-4' : ''}>
          <p className="py-2 text-[12.5px] text-faint">
            In other currencies, listed apart and left out of the figures above.
          </p>
          <LogTable
            trades={group.otherCurrency}
            columns={columns}
            env={env}
            label={`Trades in other currencies on ${date}`}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One day of the trade log: a header (chevron, date, the net after costs,
 * Mood, Review and a slot for the note action), the running-net chart and the
 * seven figures, and, expanded, the day's trades as a table. Every card starts
 * collapsed (the record's rule). A day with a note and no trades reads $0.00
 * with a no-trades line; one with trades none of which closed reads None and
 * has no chart.
 */
export function DayCard({
  group,
  expanded,
  onToggle,
  noteAction,
}: {
  group: DayGroup;
  expanded: boolean;
  onToggle(): void;
  /** Where Add note or View note goes (the note dialog fills it). */
  noteAction?: React.ReactNode;
}): React.JSX.Element {
  const { env, columns, records } = useLogEnv();
  const display = useDisplay();
  const phone = usePhone();
  const setMood = useSetMood();
  const query = dayQuery(useSearchParams());
  const heading = useId();
  const panel = useId();
  const date = dayLabel(group.date);
  // Below sm the header drops the year ("Tue 24 Nov", as comp 06 at 390 shows).
  const headerDate = phone ? dayLabel(group.date, false) : date;
  const record = records.get(group.date);

  const noteOnly =
    group.trades.length === 0 && group.otherCurrency.length === 0;
  const closedIds = group.trades.filter(isClosed).map((t) => t.id);
  const net =
    group.stats.net === null
      ? null
      : display.figure(display.ofTrades(closedIds, group.stats.net));
  const zero = display.cash(0, false);

  const mood = isLoggedDay(record) ? (
    <MoodControl
      compact={phone}
      value={record.mood?.value}
      note={record.mood?.note}
      readOnly={record.finishedAt !== undefined || record.locked !== undefined}
      onChange={(next) => setMood.mutate({ date: group.date, mood: next })}
    />
  ) : null;

  const toggleName = `${expanded ? 'Collapse' : 'Expand'} ${date}`;

  return (
    <article aria-labelledby={heading} className={`${CARD} ${CARD_PAD}`}>
      {/* The actions wrap onto their own line when a phone's header is too narrow
          for them (Task 16 adds a 44px note glyph to the three here). */}
      <header className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1">
        {/* The record's source (inv-2 052) shows the chevron on a note-only card too. */}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panel}
          aria-label={toggleName}
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
          {headerDate}
        </h2>
        <b
          className={`text-[15px] font-semibold whitespace-nowrap tabular-nums ${net === null ? 'text-faint' : signTone(group.stats.net!)}`}
        >
          <span className="sr-only">Net P&amp;L </span>
          {net ? net.text : noteOnly ? zero.text : 'None'}
        </b>
        <div className="ml-auto flex items-center gap-0.5 max-sm:-mr-2.5">
          {mood}
          {/* K40, Keel's call (TradeZella unknown): the quick actions are Mood, Review and the note action. */}
          {/* The record's source (inv-2 052) shows no review icon on a note-only card. */}
          {noteOnly ? null : (
            <Link
              href={dayReviewHref(group.date, query)}
              aria-label={phone ? `Review ${date}` : undefined}
              className={phone ? `${QUICK} w-11 justify-center px-0` : QUICK}
            >
              <ClipboardText size={phone ? 20 : 16} aria-hidden="true" />
              {phone ? null : 'Review'}
            </Link>
          )}
          {noteAction}
        </div>
      </header>
      {setMood.isError ? (
        <p role="alert" className="mt-2 text-[13px] text-loss">
          Couldn&apos;t save that mood. Try again.
        </p>
      ) : null}

      {noteOnly ? (
        <>
          <p className="mt-1.5 text-[13.5px] text-muted">No trades this day.</p>
          <div id={panel} hidden={!expanded}>
            {/* Keel's call (TradeZella unknown): what expanding a note-only card reveals. It is the trade table's area with no rows. */}
            {expanded ? (
              <div className="mt-3.5 border-t border-line">
                <LogTable
                  trades={[]}
                  columns={columns}
                  env={env}
                  label={`Trades on ${date}`}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <DayFigures group={group} date={date} />
          <div id={panel} hidden={!expanded}>
            {expanded ? (
              <DayTables group={group} date={date} columns={columns} />
            ) : null}
          </div>
        </>
      )}
    </article>
  );
}

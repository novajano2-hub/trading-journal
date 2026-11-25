'use client';

import {
  CaretDown,
  CaretRight,
  ClipboardText,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useId } from 'react';
import type { DayGroup } from '@/data/day-log';
import { useSetMood } from '@/data/query/hooks';
import { isClosed } from '@/domain/trade-status';
import type { DayRecord } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { formatInstrument, plural } from '@/lib/format';
import { CARD, CARD_PAD, signTone } from '../../dashboard/shared';
import { MoodControl } from '../../routine/mood-control';
import { usePhone } from '@/lib/use-phone';
import { dayLabel } from './day-label';
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

const QUICK =
  'inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-muted no-underline outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

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
  const heading = useId();
  const panel = useId();
  const date = dayLabel(group.date);
  const record = records.get(group.date);

  const noteOnly =
    group.trades.length === 0 && group.otherCurrency.length === 0;
  const closedIds = group.trades.filter(isClosed).map((t) => t.id);
  const net =
    group.stats.net === null
      ? null
      : display.figure(display.ofTrades(closedIds, group.stats.net));
  const zero = display.cash(0, false);

  const byId = new Map(group.trades.map((t) => [t.id, t]));
  const nameOf = (id: string) => {
    const t = byId.get(id);
    return t
      ? formatInstrument(t.instrument, t.openedAt, env.timeZone).name
      : id;
  };
  const closed = group.trades.filter(isClosed);
  const span =
    closed.length === 0
      ? undefined
      : {
          from: new Date(
            Math.min(...closed.map((t) => Date.parse(t.openedAt))),
          ).toISOString(),
          to: new Date(
            Math.max(...closed.map((t) => Date.parse(t.closedAt))),
          ).toISOString(),
        };

  const mood = isLoggedDay(record) ? (
    <MoodControl
      compact={phone}
      value={record.mood?.value}
      note={record.mood?.note}
      readOnly={record.finishedAt !== undefined || record.locked !== undefined}
      onChange={(next) => setMood.mutate({ date: group.date, mood: next })}
    />
  ) : null;

  const hasTrades = group.trades.length > 0;
  const toggleName = `${expanded ? 'Collapse' : 'Expand'} ${date}`;

  return (
    <article aria-labelledby={heading} className={`${CARD} ${CARD_PAD}`}>
      <header className="flex min-h-9 items-center gap-2.5">
        {noteOnly ? null : (
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
        )}
        <h2
          id={heading}
          className="text-[15px] font-semibold tracking-[-0.015em] whitespace-nowrap text-text"
        >
          {date}
        </h2>
        <b
          className={`text-[15px] font-semibold whitespace-nowrap tabular-nums ${net === null ? 'text-faint' : signTone(group.stats.net!)}`}
        >
          <span className="sr-only">Net P&amp;L </span>
          {net ? net.text : noteOnly ? zero.text : 'None'}
        </b>
        <div className="ml-auto flex items-center gap-0.5 max-sm:-mr-2.5">
          {mood}
          {noteOnly ? null : (
            <Link
              href={`/app/day/${group.date}/review`}
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

      {noteOnly ? (
        <p className="mt-1.5 text-[13.5px] text-muted">No trades this day.</p>
      ) : (
        <>
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
            <p className="mt-2 text-[13px] text-muted">
              {group.otherCurrency.length}{' '}
              {plural(group.otherCurrency.length, 'trade')} in other currencies,
              listed apart and left out of the figures.
            </p>
          )}
          <div id={panel} hidden={!expanded}>
            {expanded ? (
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
                      In other currencies, listed apart and left out of the
                      figures above.
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
            ) : null}
          </div>
        </>
      )}
    </article>
  );
}

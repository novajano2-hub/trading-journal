'use client';

import { CaretDown, Pulse } from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import { usePatterns } from '@/data/query/hooks';
import { plural } from '@/lib/format';
import { signTone } from '../dashboard/shared';
import { QUICK } from '../quick-action';
import { Count, PatternsPopover, type PatternsFace } from './patterns-button';

const DESKTOP = `${QUICK} group cursor-pointer data-[state=open]:bg-sunken data-[state=open]:text-text aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted`;
// A glyph with a count badge at its corner, as the phone's other quick actions are glyphs.
const GLYPH = `${QUICK} relative w-11 cursor-pointer justify-center px-0 aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted`;

const REASON = 'No patterns on this day.';

/** What the popover's head says of the day: its net after costs, from the display, with the sign's tone. */
export interface DayPatternsNet {
  figure: { text: string; label: string };
  cents: number;
}

/**
 * The day's patterns control (spec §5.5; TradeZella's day popup, help
 * 5829446): a Patterns count in the day's quick actions that opens the date, the
 * day's net, its trade count and the patterns that fired on the day. The patterns
 * are the day's own (`byDay`), read over every trade of the workspace; `net` and
 * `trades` are the view's figures for the day. Below `sm` it is a glyph with the
 * count and the popover a sheet. With none it is disabled, with its reason.
 */
export function DayPatterns({
  date,
  label,
  net,
  trades,
  align = 'end',
}: {
  /** The day's local date, YYYY-MM-DD: its key in the patterns. */
  date: string;
  /** The date as the view writes it ("Tue 24 Nov"). */
  label: string;
  net: DayPatternsNet | null;
  trades: number;
  /** The popover's edge on the trigger's: the day card's actions sit at the card's end, the day page's at the bar's start. */
  align?: 'start' | 'end';
}): React.JSX.Element {
  const patterns = usePatterns().data;
  // Still read: no count. Read: this day's patterns, none when it fired none.
  const hits =
    patterns === undefined ? undefined : (patterns.byDay.get(date) ?? []);
  const summary = (
    <div className="flex-none px-4 pt-3 pb-2.5">
      <div className="flex items-baseline gap-2.5">
        <b className="text-[15px] font-semibold tracking-[-0.015em] text-text">
          {label}
        </b>
        {net ? (
          <span
            className={`text-[13.5px] font-semibold tabular-nums ${signTone(net.cents)}`}
          >
            <FigureText f={net.figure} />
          </span>
        ) : null}
        <span className="ml-auto text-[12.5px] text-faint tabular-nums">
          {trades} {plural(trades, 'trade')}
        </span>
      </div>
      {/* The net and count are the view's accounts; the patterns are not. */}
      <p className="mt-0.5 text-[12px] leading-[1.4] text-faint">
        Patterns are read across all your accounts.
      </p>
    </div>
  );
  const face = (count: number | undefined, phone: boolean): PatternsFace =>
    phone
      ? {
          className: GLYPH,
          children: (
            <>
              <Pulse size={20} aria-hidden="true" />
              {count ? (
                <Count
                  n={count}
                  className="pointer-events-none absolute top-1 right-0.5 h-4 min-w-4 px-1 text-[11px]"
                />
              ) : null}
            </>
          ),
        }
      : {
          className: DESKTOP,
          children: (
            <>
              Patterns
              {count === undefined ? null : (
                <Count
                  n={count}
                  className="group-data-[state=open]:bg-surface-1"
                />
              )}
              <CaretDown
                size={12}
                weight="bold"
                aria-hidden="true"
                className="flex-none text-faint"
              />
            </>
          ),
        };
  return (
    <PatternsPopover
      hits={hits}
      face={face}
      panelLabel={`Patterns on ${label}`}
      reason={REASON}
      head={summary}
      sheetHead={summary}
      width={400}
      sideOffset={4}
      align={align}
    />
  );
}

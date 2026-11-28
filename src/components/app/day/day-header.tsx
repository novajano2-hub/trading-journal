'use client';

import { CaretDown, LockSimple } from '@phosphor-icons/react/dist/ssr';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Popover } from 'radix-ui';
import { usePrefs } from '@/data/query/hooks';
import { useDisplay } from '@/lib/display';
import type { DayMode } from '@/lib/day-routes';
import { dayHref, dayQuery } from '@/lib/day-routes';
import { dayLabel } from '@/lib/time-format';
import { useBelowLg } from '@/lib/use-phone';
import { Chip } from '@/components/ui/chip';
import { MonthPicker } from '../routine/month-picker';
import { DayPatterns } from '../trades/day-patterns';
import { useDayFinished } from './day-lock';
import { useDayFigures } from './use-day-figures';
import { useDaySession } from './session-button';
import { StageBar } from './stage-bar';

const PANEL =
  'z-50 w-[296px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
const TITLE =
  'text-[24px] leading-[1.2] font-[650] tracking-[-0.035em] whitespace-nowrap max-sm:text-[20px]';

/** The day's Patterns control (spec §5.5), after the date: its net is the page's own, net after costs in the base currency. */
function PatternsControl({
  date,
  label,
}: {
  date: string;
  label: string;
}): React.JSX.Element {
  const display = useDisplay();
  const day = useDayFigures(date);
  const currency = usePrefs().data?.baseCurrency;
  // No net when the scoped accounts have no base-currency trade (or none closed) that day, as the day card has none:
  // the day's patterns read every account, so a $0.00 here would sit above real patterns.
  const net = day?.stats?.net ?? null;
  return (
    <DayPatterns
      date={date}
      label={label}
      net={
        net === null
          ? null
          : { figure: display.cash(net, true, currency), cents: net }
      }
      trades={day?.stats?.trades ?? 0}
      align="start"
    />
  );
}

/**
 * The day page's place in the top bar (K25): the date, the Patterns control,
 * then from `sm` the stage bar. In plan the date is a plain label; in review it is a popover of
 * months that opens any day's page. Below `lg` the stage bar moves under the
 * bar (`DayView`).
 */
export function DayHeader({
  date,
  mode,
  onImport,
}: {
  date: string;
  mode: DayMode;
  onImport(from: HTMLElement): void;
}): React.JSX.Element {
  const { today, session } = useDaySession(date);
  const stacked = useBelowLg();
  const weekStart = usePrefs().data?.weekStart;
  const router = useRouter();
  const query = dayQuery(useSearchParams());
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(date.slice(0, 7));
  // "Tue 24 Nov", with the year when it isn't today's.
  const label =
    today !== undefined && today.slice(0, 4) !== date.slice(0, 4)
      ? `${dayLabel(date)} ${date.slice(0, 4)}`
      : dayLabel(date);
  const closed = useDayFinished(date);

  return (
    <>
      {mode === 'review' && today !== undefined ? (
        <h1 className={`${TITLE} flex-none sm:mr-1`}>
          <Popover.Root
            open={open}
            onOpenChange={(next) => {
              // Each opening starts on the shown date's month.
              if (next) setMonth(date.slice(0, 7));
              setOpen(next);
            }}
          >
            <Popover.Trigger
              aria-label={`${label}, change date`}
              className="-mx-2 inline-flex items-center gap-1.5 rounded-control px-2 py-1 transition-colors duration-200 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
            >
              {label}
              <CaretDown
                size={14}
                weight="bold"
                aria-hidden="true"
                className="flex-none text-faint"
              />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                aria-label="Change date"
                align="start"
                sideOffset={6}
                collisionPadding={12}
                className={PANEL}
              >
                <MonthPicker
                  month={month}
                  onMonth={setMonth}
                  today={today}
                  selected={date}
                  weekStart={weekStart ?? 'sunday'}
                  label="Pick a day"
                  onPick={(picked) => {
                    setOpen(false);
                    router.push(dayHref(picked, today, query));
                  }}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </h1>
      ) : (
        <h1 className={`${TITLE} flex-none sm:mr-1`}>{label}</h1>
      )}
      {closed.finished ? (
        <Chip className="mr-2 flex-none">
          <LockSimple size={13} aria-hidden="true" />
          Closed
        </Chip>
      ) : null}
      <PatternsControl date={date} label={label} />
      {stacked ? null : (
        <StageBar
          date={date}
          mode={mode}
          today={today}
          session={session}
          onImport={onImport}
        />
      )}
    </>
  );
}

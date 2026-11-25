'use client';

import { CalendarCheck } from '@phosphor-icons/react/dist/ssr';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Popover } from 'radix-ui';
import { buttonClasses } from '@/components/ui/button-styles';
import { usePrefs } from '@/data/query/hooks';
import { useRoutineToday } from '@/data/query/derived';
import { dayHref } from '@/lib/day-routes';
import { MonthPicker } from './month-picker';

const PANEL =
  'z-50 w-[296px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';

/** The shared start-my-day popover: pick a date, and land on its day page (today and later plan, earlier review). */
export function PlanTheDay({
  label = 'Plan the day',
  wide = false,
}: {
  label?: string;
  /** Full width, as in a card's footer. */
  wide?: boolean;
}): React.JSX.Element {
  const today = useRoutineToday();
  const weekStart = usePrefs().data?.weekStart;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<string | undefined>(undefined);

  // In the top bar it is icon-only below 1800, where the bar is tight: the
  // label stays for screen readers, and a tooltip names it.
  const look = wide
    ? `${buttonClasses('secondary')} w-full gap-[7px] pr-[15px] pl-3`
    : `${buttonClasses('secondary')} gap-[7px] pr-[15px] pl-3 max-[1799px]:w-[34px] max-[1799px]:px-0 max-[1799px]:pointer-coarse:w-11`;
  const text = (
    <span className={wide ? undefined : 'max-[1799px]:sr-only'}>{label}</span>
  );
  const tip = wide ? undefined : label;
  if (today === undefined) {
    return (
      <button
        type="button"
        disabled
        aria-haspopup="dialog"
        title={tip}
        className={look}
      >
        <CalendarCheck size={16} aria-hidden="true" className="flex-none" />
        {text}
      </button>
    );
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        // Each opening starts on today's month.
        if (next) setMonth(today.slice(0, 7));
        setOpen(next);
      }}
    >
      <Popover.Trigger title={tip} className={look}>
        <CalendarCheck size={16} aria-hidden="true" className="flex-none" />
        {text}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label={label}
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={PANEL}
        >
          <MonthPicker
            month={month ?? today.slice(0, 7)}
            onMonth={setMonth}
            today={today}
            weekStart={weekStart ?? 'sunday'}
            label="Pick a day"
            onPick={(date) => {
              setOpen(false);
              router.push(dayHref(date, today));
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

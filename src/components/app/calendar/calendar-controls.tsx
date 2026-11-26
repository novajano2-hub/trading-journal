'use client';

import { SlidersHorizontal, X } from '@phosphor-icons/react/dist/ssr';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog, Popover } from 'radix-ui';
import { TaskCheckbox } from '@/components/ui/task-checkbox';
import type { CalendarStat } from '@/domain/types';
import { enter, exit } from '@/lib/motion';
import { STAT_LABELS } from './month-grid';

/*
 * What the Calendar page and the dashboard's calendar widgets share: the
 * month's buttons, the Stats shown menu (the cell stats are one pref) and the
 * sheet a day's panel opens in below `xl`.
 */

const STAT_ORDER: readonly CalendarStat[] = [
  'net',
  'trades',
  'winRate',
  'rating',
  'r',
  'fees',
  'ticks',
  'pips',
  'points',
];

export const ICON_BUTTON =
  'inline-grid size-[30px] place-items-center rounded-[8px] border border-line bg-surface-1 text-muted outline-offset-2 transition-colors duration-200 ease-(--ease-glide) hover:border-accent/35 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11';
export const TEXT_BUTTON =
  'inline-flex h-[30px] items-center gap-1.5 rounded-[8px] border border-line bg-surface-1 px-3 text-[13px] font-medium text-text outline-offset-2 transition-colors duration-200 ease-(--ease-glide) hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

export function StatsMenu({
  stats,
  onChange,
}: {
  stats: readonly CalendarStat[];
  onChange(next: CalendarStat[]): void;
}): React.JSX.Element {
  return (
    <Popover.Root>
      <Popover.Trigger className={TEXT_BUTTON}>
        <SlidersHorizontal
          size={15}
          aria-hidden="true"
          className="text-faint"
        />
        Stats shown
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] w-[240px] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <p className="text-[12.5px] leading-snug text-muted">
            Any figures in each day, stacked in the order you tick them. The
            first one leads.
          </p>
          <ul aria-label="Stats shown" className="mt-2 flex flex-col gap-0.5">
            {STAT_ORDER.map((key) => {
              const on = stats.includes(key);
              return (
                <li key={key} className="flex min-h-9 items-center">
                  <TaskCheckbox
                    checked={on}
                    disabled={on && stats.length === 1}
                    onCheckedChange={(next) =>
                      onChange(
                        next ? [...stats, key] : stats.filter((s) => s !== key),
                      )
                    }
                  >
                    {STAT_LABELS[key]}
                  </TaskCheckbox>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The day panel below `xl`: a sheet rising from the bottom edge. */
export function DaySheet({
  open,
  onClose,
  titleId,
  children,
}: {
  open: boolean;
  onClose(): void;
  titleId: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-veil"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: enter }}
                exit={{ opacity: 0, transition: exit }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-labelledby={titleId}
              aria-describedby={undefined}
              onOpenAutoFocus={(e) => {
                // Land on the day's heading, which names the sheet: the close
                // button is a tab away and never wears the ring on opening.
                const heading = document.getElementById(titleId);
                if (heading) {
                  e.preventDefault();
                  heading.focus();
                }
              }}
            >
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-[20px] border border-b-0 border-line bg-surface-1 px-5 pt-4 pb-6 shadow-[var(--shadow)] outline-none"
                initial={reduced ? { opacity: 0 } : { y: '100%' }}
                animate={{
                  ...(reduced ? { opacity: 1 } : { y: 0 }),
                  transition: enter,
                }}
                exit={{
                  ...(reduced ? { opacity: 0 } : { y: '100%' }),
                  transition: exit,
                }}
              >
                <Dialog.Close
                  aria-label="Close day"
                  className="absolute top-2.5 right-2.5 inline-grid size-11 place-items-center rounded-control text-muted outline-offset-2 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <X size={18} aria-hidden="true" />
                </Dialog.Close>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

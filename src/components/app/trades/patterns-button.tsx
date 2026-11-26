'use client';

import { CaretDown, X } from '@phosphor-icons/react/dist/ssr';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog, Popover } from 'radix-ui';
import { useId, useRef, useState, type ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import type { PatternHit } from '@/domain/patterns';
import { enter, exit } from '@/lib/motion';
import { plural } from '@/lib/format';
import { usePhone } from '@/lib/use-phone';
import { PatternList } from './pattern-text';

const BUTTON = `${buttonClasses('secondary', 'sm')} gap-1.5 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:border-faint aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:hover:border-line-2`;

const PANEL =
  'z-50 flex max-h-[min(560px,var(--radix-popover-content-available-height))] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) flex-col overflow-hidden rounded-[12px] border border-line bg-surface-1 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';

/** What a popover's trigger looks like: its class, its content and, for a glyph, its accessible name. */
export interface PatternsFace {
  className: string;
  children: ReactNode;
  label?: string;
}

/**
 * The popover every patterns control opens (spec §5.5): the patterns that
 * fired, one row each with the tone word and a sentence with the figures,
 * under `head` and, below `sm`, as a sheet from the bottom edge with a Close
 * button (and `sheetHead` under its title). With none the trigger is disabled
 * with `reason`, keeping its tab stop; while `hits` is `undefined` (still being
 * read) it waits, with no count. `face` draws the trigger for the count and for
 * a phone.
 */
export function PatternsPopover({
  hits,
  face,
  panelLabel,
  reason,
  head,
  sheetHead,
  width = 380,
  sideOffset = 8,
  align = 'end',
}: {
  hits: readonly PatternHit[] | undefined;
  face(count: number | undefined, phone: boolean): PatternsFace;
  /** Names the open panel for assistive technology. */
  panelLabel: string;
  /** Why the trigger is disabled. */
  reason: string;
  /** Above the list in the popover. */
  head: ReactNode;
  /** Under the sheet's title bar, above the list. */
  sheetHead?: ReactNode;
  width?: number;
  sideOffset?: number;
  /** Which edge of the trigger the popover lines up with: its right edge by default, its left where the trigger sits at the start of a bar. */
  align?: 'start' | 'end';
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const phone = usePhone();
  const reduced = useReducedMotion();
  const noteId = useId();
  // The first thing to take focus is the panel or its heading, not a name's tip, which would open at once.
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const count = hits?.length;
  const look = face(count, phone);

  if (hits === undefined || hits.length === 0) {
    // Kept in the tab order and describing itself, like the filter chips with nothing to filter.
    return (
      <>
        <button
          type="button"
          aria-disabled="true"
          aria-busy={hits === undefined ? 'true' : undefined}
          aria-haspopup="dialog"
          aria-describedby={noteId}
          aria-label={look.label}
          title={reason}
          className={look.className}
        >
          {look.children}
        </button>
        <span id={noteId} hidden>
          {reason}
        </span>
      </>
    );
  }

  if (!phone) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger aria-label={look.label} className={look.className}>
          {look.children}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            ref={panel}
            tabIndex={-1}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              panel.current?.focus();
            }}
            aria-label={panelLabel}
            align={align}
            sideOffset={sideOffset}
            collisionPadding={12}
            className={PANEL}
            style={{ width }}
          >
            {head}
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-line/70">
              <PatternList hits={hits} />
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  const rise = reduced
    ? { initial: { opacity: 0 }, shown: { opacity: 1 }, gone: { opacity: 0 } }
    : { initial: { y: '100%' }, shown: { y: 0 }, gone: { y: '100%' } };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={look.label}
        className={look.className}
        aria-haspopup="dialog"
      >
        {look.children}
      </Dialog.Trigger>
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
              aria-describedby={undefined}
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                heading.current?.focus();
              }}
            >
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[16px] border-t border-line bg-surface-1 text-text shadow-[var(--shadow)] outline-none"
                initial={rise.initial}
                animate={{ ...rise.shown, transition: enter }}
                exit={{ ...rise.gone, transition: exit }}
              >
                <div className="flex flex-none items-center justify-between border-b border-line py-1 pr-2 pl-4">
                  <Dialog.Title
                    ref={heading}
                    tabIndex={-1}
                    className="text-[15px] font-semibold outline-none!"
                  >
                    Patterns
                  </Dialog.Title>
                  <Dialog.Close
                    aria-label="Close"
                    className="inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-text"
                  >
                    <X size={18} aria-hidden="true" />
                  </Dialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(10px+env(safe-area-inset-bottom))]">
                  {sheetHead}
                  <div className={sheetHead ? 'border-t border-line/70' : ''}>
                    <PatternList hits={hits} />
                  </div>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/**
 * The trade page's Patterns button (spec §5.5): a count of the patterns that
 * fired on the trade and, opened, a popover that lists each with its tone
 * word and a sentence with the figures; below `sm` the popover is a sheet from
 * the bottom edge. With none it reads 0 and is disabled, and says why; while
 * `hits` is `undefined` (still being read) it waits, with no count.
 */
export function PatternsButton({
  hits,
}: {
  hits: readonly PatternHit[] | undefined;
}): React.JSX.Element {
  return (
    <PatternsPopover
      hits={hits}
      panelLabel="Patterns on this trade"
      reason="No patterns on this trade."
      face={(count) => ({
        className: BUTTON,
        children: (
          <>
            Patterns
            {count === undefined ? null : <Count n={count} />}
            <CaretDown
              size={11}
              weight="bold"
              aria-hidden="true"
              className="flex-none text-faint"
            />
          </>
        ),
      })}
      head={
        <div className="flex flex-none items-baseline gap-2 px-4 pt-3 pb-2">
          <b className="text-[15px] font-semibold tracking-[-0.015em]">
            {hits?.length} {plural(hits?.length ?? 0, 'pattern')}
          </b>
          <span className="text-[12.5px] text-faint">
            read from this trade&apos;s fills
          </span>
        </div>
      }
    />
  );
}

/** The count in a small round chip, as the comp draws it. */
export function Count({
  n,
  className = '',
}: {
  n: number;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={`inline-grid h-[18px] min-w-[18px] flex-none place-items-center rounded-full bg-sunken px-[5px] text-[12px] font-semibold text-text tabular-nums ${className}`}
    >
      {n}
    </span>
  );
}

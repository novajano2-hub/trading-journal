'use client';

import { CaretDown, X } from '@phosphor-icons/react/dist/ssr';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog, Popover } from 'radix-ui';
import { useId, useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import type { PatternHit } from '@/domain/patterns';
import { enter, exit } from '@/lib/motion';
import { plural } from '@/lib/format';
import { usePhone } from '@/lib/use-phone';
import { PatternList } from './pattern-text';

const REASON = 'No patterns on this trade.';

const BUTTON = `${buttonClasses('secondary', 'sm')} gap-1.5 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:border-faint aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:hover:border-line-2`;

const PANEL =
  'z-50 flex max-h-[min(560px,var(--radix-popover-content-available-height))] w-[380px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) flex-col overflow-hidden rounded-[12px] border border-line bg-surface-1 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';

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
  const [open, setOpen] = useState(false);
  const phone = usePhone();
  const reduced = useReducedMotion();
  const noteId = useId();
  // The first thing to take focus is the panel or its heading, not a name's tip, which would open at once.
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const count = hits?.length;

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
          title={REASON}
          className={BUTTON}
        >
          Patterns
          {count === undefined ? null : <Count n={count} />}
          <CaretDown
            size={11}
            weight="bold"
            aria-hidden="true"
            className="flex-none text-faint"
          />
        </button>
        <span id={noteId} hidden>
          {REASON}
        </span>
      </>
    );
  }

  const face = (
    <>
      Patterns
      <Count n={hits.length} />
      <CaretDown
        size={11}
        weight="bold"
        aria-hidden="true"
        className="flex-none text-faint"
      />
    </>
  );

  if (!phone) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger className={BUTTON}>{face}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            ref={panel}
            tabIndex={-1}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              panel.current?.focus();
            }}
            aria-label="Patterns on this trade"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            className={PANEL}
          >
            <div className="flex flex-none items-baseline gap-2 px-4 pt-3 pb-2">
              <b className="text-[15px] font-semibold tracking-[-0.015em]">
                {hits.length} {plural(hits.length, 'pattern')}
              </b>
              <span className="text-[12.5px] text-faint">
                read from this trade&apos;s fills
              </span>
            </div>
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
      <Dialog.Trigger className={BUTTON} aria-haspopup="dialog">
        {face}
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
                  <PatternList hits={hits} />
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** The count in a small round chip, as the comp draws it. */
function Count({ n }: { n: number }): React.JSX.Element {
  return (
    <span className="inline-grid h-[18px] min-w-[18px] flex-none place-items-center rounded-full bg-sunken px-[5px] text-[12px] font-semibold text-text tabular-nums">
      {n}
    </span>
  );
}

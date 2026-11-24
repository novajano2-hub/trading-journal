'use client';

import { List, X } from '@phosphor-icons/react/dist/ssr';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { useEffect, useState, type ReactNode } from 'react';
import { BrandMark } from '@/components/site/brand-mark';
import { useActiveWorkspace } from '@/data/query/hooks';
import { enter, exit } from '@/lib/motion';
import { WithDashboardHref } from './dashboard-link';
import { CurrentSidebarNav, SwitcherSlot } from './sidebar';

const ICON_BUTTON =
  'inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-control text-text transition-colors duration-200 ease-(--ease-glide) hover:bg-surface-1';

/**
 * From `sm` to `lg`, the sidebar as a sheet from the left, on the same canvas.
 * (Below `sm` the tab bar and its More sheet navigate instead.) It traps
 * focus, closes on
 * Escape, the veil, a link, any route change or a workspace switch, and hands
 * focus back to its trigger.
 */
export function MobileNav({
  switcher,
}: {
  switcher?: ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const workspace = useActiveWorkspace().data?.id;
  const [seen, setSeen] = useState({ pathname, workspace });
  // A route change or a workspace switch, however it happened, closes the
  // sheet. The workspace first loading is neither.
  const moved = seen.pathname !== pathname;
  const switched =
    workspace !== undefined &&
    seen.workspace !== undefined &&
    workspace !== seen.workspace;
  const learned = workspace !== undefined && seen.workspace === undefined;
  if (moved || switched || learned) {
    setSeen({ pathname, workspace: workspace ?? seen.workspace });
    if (moved || switched) setOpen(false);
  }

  // Leaving the drawer's widths hides the trigger: close the sheet with it.
  useEffect(() => {
    const drawer = matchMedia('(min-width: 640px) and (max-width: 1023.98px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (!e.matches) setOpen(false);
    };
    drawer.addEventListener('change', onChange);
    return () => drawer.removeEventListener('change', onChange);
  }, []);

  const close = () => setOpen(false);
  const slide = reduced
    ? { initial: { opacity: 0 }, shown: { opacity: 1 }, gone: { opacity: 0 } }
    : { initial: { x: '-100%' }, shown: { x: 0 }, gone: { x: '-100%' } };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Open navigation"
        className={`${ICON_BUTTON} -ml-2.5 max-sm:hidden lg:hidden`}
      >
        <List size={20} aria-hidden="true" />
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
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[calc(100vw-48px)] flex-col overflow-y-auto bg-bg pt-2 pr-3.5 pb-[18px] pl-[18px] shadow-[var(--shadow)] outline-none"
                initial={slide.initial}
                animate={{ ...slide.shown, transition: enter }}
                exit={{ ...slide.gone, transition: exit }}
              >
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                {/* Both controls here leave the sheet: the wordmark goes to the Dashboard, filters kept. */}
                <div className="flex items-center justify-between">
                  <WithDashboardHref>
                    {(href) => (
                      <BrandMark
                        href={href}
                        onClick={close}
                        className="h-11 rounded-control px-1.5"
                      />
                    )}
                  </WithDashboardHref>
                  <Dialog.Close
                    aria-label="Close navigation"
                    className={`${ICON_BUTTON} -mr-1`}
                  >
                    <X size={20} aria-hidden="true" />
                  </Dialog.Close>
                </div>
                <SwitcherSlot switcher={switcher} />
                <CurrentSidebarNav onNavigate={close} />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

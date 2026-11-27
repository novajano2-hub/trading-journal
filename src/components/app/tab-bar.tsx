'use client';

import { DotsThreeOutline, X } from '@phosphor-icons/react/dist/ssr';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Dialog } from 'radix-ui';
import {
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useActiveWorkspace } from '@/data/query/hooks';
import { enter, exit } from '@/lib/motion';
import { AppearanceControl } from './appearance';
import {
  APP_NAV,
  activeItem,
  navHref,
  navItem,
  type AppModuleId,
  type NavItem,
} from './nav';
import { SwitcherSlot } from './sidebar';

/** The four modules a phone reaches in one tap; the rest are under More. */
export const TAB_IDS: readonly AppModuleId[] = [
  'dashboard',
  'trades',
  'calendar',
  'reports',
];

/** What More holds, in order: the other modules, then Settings. */
export const MORE_IDS: readonly AppModuleId[] = [
  'home',
  'progress',
  'strategies',
  'notebook',
  'import',
  'prop-firms',
  'settings',
];

const NO_PARAMS = new URLSearchParams();

/**
 * A tab: a plain glyph over a short label, 56px tall, no pill behind it. The
 * current one is in accent ink, its glyph filled.
 */
const TAB =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] leading-none font-medium no-underline outline-offset-[-4px] select-none';

function TabGlyph({
  item,
  current,
}: {
  item: NavItem;
  current: boolean;
}): React.JSX.Element {
  const Glyph = item.icon;
  return (
    <Glyph size={22} weight={current ? 'fill' : 'regular'} aria-hidden="true" />
  );
}

function Tabs({
  pathname,
  params,
  more,
}: {
  pathname: string;
  params: Pick<URLSearchParams, 'get' | 'getAll'>;
  more: ReactNode;
}): React.JSX.Element {
  const activeId = activeItem(pathname)?.id;
  return (
    <ul className="flex">
      {TAB_IDS.map((id) => {
        const item = navItem(id);
        const current = id === activeId;
        return (
          <li key={id} className="flex flex-1">
            <Link
              href={navHref(item, params)}
              aria-current={current ? 'page' : undefined}
              className={`${TAB} ${current ? 'font-semibold text-accent-ink' : 'text-faint hover:text-text'}`}
            >
              <TabGlyph item={item} current={current} />
              {item.label}
            </Link>
          </li>
        );
      })}
      <li className="flex flex-1">{more}</li>
    </ul>
  );
}

function TabsFromUrl({ more }: { more: ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const params = useSearchParams();
  return <Tabs pathname={pathname} params={params} more={more} />;
}

/** A row in the More sheet: a plain glyph and the module's name, 48px. */
function MoreRow({
  item,
  current,
  params,
  onNavigate,
}: {
  item: NavItem;
  current: boolean;
  params: Pick<URLSearchParams, 'get' | 'getAll'>;
  onNavigate(): void;
}): React.JSX.Element {
  const Glyph = item.icon;
  const quiet = item.group === 'not-live';
  return (
    <li>
      <Link
        href={navHref(item, params)}
        aria-current={current ? 'page' : undefined}
        onClick={onNavigate}
        className={`flex min-h-12 items-center gap-3.5 rounded-control px-3 text-[15px] no-underline active:bg-sunken ${
          current
            ? 'font-semibold text-accent-ink'
            : quiet
              ? 'font-medium text-faint'
              : 'font-medium text-text'
        }`}
      >
        <Glyph
          size={20}
          aria-hidden="true"
          className={`flex-none ${current ? '' : quiet ? 'opacity-70' : 'text-muted'}`}
        />
        {item.label}
      </Link>
    </li>
  );
}

function MoreLinks({
  pathname,
  params,
  onNavigate,
}: {
  pathname: string;
  params: Pick<URLSearchParams, 'get' | 'getAll'>;
  onNavigate(): void;
}): React.JSX.Element {
  const notLiveId = useId();
  const activeId = activeItem(pathname)?.id;
  const row = (item: NavItem) => (
    <MoreRow
      key={item.id}
      item={item}
      current={item.id === activeId}
      params={params}
      onNavigate={onNavigate}
    />
  );
  return (
    <nav aria-label="More" className="flex flex-col">
      <ul className="flex flex-col">
        {MORE_IDS.map((id) => row(navItem(id)))}
      </ul>
      <p
        id={notLiveId}
        className="mx-3 mt-4 mb-1 text-[12.5px] font-medium text-faint"
      >
        Not live yet
      </p>
      <ul aria-labelledby={notLiveId} className="flex flex-col">
        {APP_NAV.filter((i) => i.group === 'not-live').map(row)}
      </ul>
    </nav>
  );
}

function MoreLinksFromUrl({
  onNavigate,
}: {
  onNavigate(): void;
}): React.JSX.Element {
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <MoreLinks pathname={pathname} params={params} onNavigate={onNavigate} />
  );
}

/**
 * The More tab and its sheet from the bottom edge: the workspace and account
 * switcher, the other modules and Settings, the "Not live yet" group, and
 * Appearance. It traps focus, closes on Escape, the veil, a link, any route
 * change or a workspace switch, and hands focus back to the tab.
 */
export function MoreSheet({
  switcher,
}: {
  switcher?: ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
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

  // Crossing into the wider layout hides the tab bar: close the sheet with it.
  useEffect(() => {
    const sm = matchMedia('(min-width: 640px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    sm.addEventListener('change', onChange);
    return () => sm.removeEventListener('change', onChange);
  }, []);

  const close = () => setOpen(false);
  // More is current where the page is one of its modules.
  const id = activeItem(pathname)?.id;
  const current = id !== undefined && !TAB_IDS.includes(id);
  const rise = reduced
    ? { initial: { opacity: 0 }, shown: { opacity: 1 }, gone: { opacity: 0 } }
    : { initial: { y: '100%' }, shown: { y: 0 }, gone: { y: '100%' } };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-haspopup="dialog"
        className={`${TAB} cursor-pointer ${current ? 'font-semibold text-accent-ink' : 'text-faint hover:text-text'}`}
      >
        <DotsThreeOutline
          size={22}
          weight={current ? 'fill' : 'regular'}
          aria-hidden="true"
        />
        More
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
                // The heading names the sheet; its first row is a keystroke away.
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
                <div className="flex flex-none items-center justify-between py-1 pr-2 pl-5">
                  <Dialog.Title
                    ref={heading}
                    tabIndex={-1}
                    className="text-[15px] font-semibold outline-none!"
                  >
                    More
                  </Dialog.Title>
                  <Dialog.Close
                    aria-label="Close"
                    className="inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-text"
                  >
                    <X size={18} aria-hidden="true" />
                  </Dialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[calc(16px+env(safe-area-inset-bottom))]">
                  <div className="px-3 [&>div]:mt-1">
                    <SwitcherSlot switcher={switcher} />
                  </div>
                  <Suspense
                    fallback={
                      <MoreLinks
                        pathname={pathname}
                        params={NO_PARAMS}
                        onNavigate={close}
                      />
                    }
                  >
                    <MoreLinksFromUrl onNavigate={close} />
                  </Suspense>
                  <div className="mx-3 mt-4 flex min-h-12 items-center justify-between gap-4 border-t border-line pt-4">
                    <span
                      aria-hidden="true"
                      className="text-[15px] font-medium text-text"
                    >
                      Appearance
                    </span>
                    <AppearanceControl />
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
 * Below `sm`, the app's navigation: a bar fixed to the bottom edge holding
 * Dashboard, Trades, Calendar, Reports and More. Each tab is a plain glyph
 * over its label, at least 44px; the current one is in accent ink. It keeps
 * clear of the home indicator (`env(safe-area-inset-bottom)`), and the page
 * keeps clear of it (`--tab-bar`).
 */
export function TabBar({
  switcher,
}: {
  switcher?: ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const more = <MoreSheet switcher={switcher} />;
  return (
    <nav
      aria-label="Main"
      data-print="hide"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <Suspense
        fallback={<Tabs pathname={pathname} params={NO_PARAMS} more={more} />}
      >
        <TabsFromUrl more={more} />
      </Suspense>
    </nav>
  );
}

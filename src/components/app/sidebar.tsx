'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Plus } from '@phosphor-icons/react/dist/ssr';
import { Suspense, useId, type ReactNode } from 'react';
import { BrandMark } from '@/components/site/brand-mark';
import { RAISED } from '@/components/ui/button-styles';
import { WithDashboardHref } from './dashboard-link';
import {
  APP_NAV,
  activeItem,
  dayPageDate,
  isHomePage,
  navHref,
  type NavItem,
} from './nav';
import { RailTip, RailTips } from './rail-tip';
import { SidebarToggle } from './sidebar-toggle';
import { useSidebarState } from './use-sidebar-state';

const NO_PARAMS = new URLSearchParams();

const ROW =
  'flex h-[34px] items-center gap-[11px] rounded-[9px] px-2.5 text-[13.5px] no-underline transition-[background-color,color,box-shadow] duration-200 ease-(--ease-glide) pointer-coarse:h-11';

/**
 * Three looks, by state: the current module is a white pill on the canvas,
 * its glyph in accent ink; the others sit in muted ink and lift on
 * hover; a module that isn't live is quieter still, its glyph faded.
 */
function NavRow({
  item,
  current,
  params,
  onNavigate,
  rail = false,
}: {
  item: NavItem;
  current: boolean;
  params: URLSearchParams;
  onNavigate?(): void;
  /** Its glyph alone, named by its label. */
  rail?: boolean;
}): React.JSX.Element {
  const quiet = item.group === 'not-live';
  const Glyph = item.icon;
  const look = current
    ? 'bg-surface-1 font-semibold text-text shadow-[var(--shadow-chip)]'
    : quiet
      ? 'font-medium text-faint hover:bg-surface-1/60 hover:text-muted'
      : 'font-medium text-muted hover:bg-surface-1/60 hover:text-text';
  const link = (
    <Link
      href={navHref(item, params)}
      aria-current={current ? 'page' : undefined}
      aria-label={rail ? item.label : undefined}
      onClick={onNavigate}
      className={`${ROW} ${look}${rail ? ' w-10 justify-center px-0 pointer-coarse:w-11' : ''}`}
    >
      <Glyph
        size={18}
        aria-hidden="true"
        data-look={current ? 'current' : quiet ? 'not-live' : 'module'}
        className={`flex-none ${current ? 'text-accent-ink' : quiet ? 'opacity-70' : ''}`}
      />
      {rail ? null : <span className="min-w-0 truncate">{item.label}</span>}
    </Link>
  );
  return <li>{rail ? <RailTip label={item.label}>{link}</RailTip> : link}</li>;
}

/**
 * The app's module links: modules, a quieter "Not live yet" group, then
 * Settings at the foot. As a `rail` they are glyphs alone, the quiet group set
 * off by a rule.
 */
export function SidebarNav({
  pathname,
  params,
  onNavigate,
  rail = false,
}: {
  pathname: string;
  params: URLSearchParams;
  onNavigate?(): void;
  rail?: boolean;
}): React.JSX.Element {
  const notLiveLabel = useId();
  const activeId = activeItem(pathname)?.id;
  const rows = (group: NavItem['group']) =>
    APP_NAV.filter((i) => i.group === group).map((item) => (
      <NavRow
        key={item.id}
        item={item}
        current={item.id === activeId}
        params={params}
        onNavigate={onNavigate}
        rail={rail}
      />
    ));

  const nav = (
    <nav
      aria-label="App"
      className={`flex flex-1 flex-col${rail ? ' items-center' : ''}`}
    >
      <ul className="flex flex-col gap-0.5">{rows('modules')}</ul>
      {rail ? (
        <span
          aria-hidden="true"
          className="mx-auto my-3.5 block h-px w-5 flex-none bg-line-2"
        />
      ) : (
        <p
          id={notLiveLabel}
          className="mx-2.5 mt-[18px] mb-1.5 text-[12.5px] font-medium text-faint"
        >
          Not live yet
        </p>
      )}
      <ul
        aria-labelledby={rail ? undefined : notLiveLabel}
        aria-label={rail ? 'Not live yet' : undefined}
        className="flex flex-col gap-0.5"
      >
        {rows('not-live')}
      </ul>
      <ul className="mt-auto flex flex-col gap-0.5 pt-5">{rows('settings')}</ul>
    </nav>
  );
  return rail ? <RailTips>{nav}</RailTips> : nav;
}

function NavFromUrl({
  onNavigate,
  rail,
}: {
  onNavigate?(): void;
  rail?: boolean;
}): React.JSX.Element {
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <SidebarNav
      pathname={pathname}
      params={params}
      onNavigate={onNavigate}
      rail={rail}
    />
  );
}

/**
 * `SidebarNav` on the current URL. The search params sit behind Suspense so
 * the shell still prerenders: until they arrive, the links carry no filters.
 */
export function CurrentSidebarNav({
  onNavigate,
  rail,
}: {
  onNavigate?(): void;
  rail?: boolean;
}): React.JSX.Element {
  const pathname = usePathname();
  return (
    <Suspense
      fallback={
        <SidebarNav
          pathname={pathname}
          params={NO_PARAMS}
          onNavigate={onNavigate}
          rail={rail}
        />
      }
    >
      <NavFromUrl onNavigate={onNavigate} rail={rail} />
    </Suspense>
  );
}

/** The switcher's card, empty: its place while the workspace is unknown. */
export function SwitcherPlaceholder(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="h-[52px] rounded-[12px] border border-line bg-surface-1/50"
    />
  );
}

/**
 * The account switcher's place. It reads the URL, so it sits behind Suspense
 * with an inert box of the same size while prerendered.
 */
export function SwitcherSlot({
  switcher,
}: {
  switcher?: ReactNode;
}): React.JSX.Element | null {
  if (!switcher) return null;
  return (
    <div className="mt-[18px] mb-[18px]">
      <Suspense fallback={<SwitcherPlaceholder />}>{switcher}</Suspense>
    </div>
  );
}

/**
 * The sidebar as a 68px icon rail (comp 10; 6A's slim rail, comps 04 and 05):
 * the mark, the toggle, add trade, the workspace as an icon, then the modules,
 * the quiet group after a rule and Settings at the foot, each glyph named by a
 * tooltip. A day page shows it whatever the choice and has no `toggle`.
 */
function Rail({
  switcher,
  toggle,
}: {
  switcher?: ReactNode;
  /** Expands the sidebar; the rail has no toggle without it. */
  toggle?(): void;
}): React.JSX.Element {
  return (
    <RailTips>
      <aside
        aria-label="Sidebar"
        data-pinned=""
        className="sticky top-0 hidden h-dvh w-[68px] flex-none flex-col items-center overflow-y-auto px-2 pt-5 pb-[18px] lg:flex"
      >
        <WithDashboardHref>
          {(href) => (
            <BrandMark
              compact
              href={href}
              className="h-8 self-center rounded-control pointer-coarse:h-11"
            />
          )}
        </WithDashboardHref>
        {toggle ? (
          <SidebarToggle
            collapsed
            onToggle={toggle}
            className="mt-3 flex-none"
          />
        ) : null}
        <RailTip label="Add trade">
          <Link
            href="/app/trades/new"
            aria-label="Add trade"
            className={`${toggle ? 'mt-2.5' : 'mt-[18px]'} grid size-9 flex-none place-items-center rounded-[10px] no-underline ${RAISED} pointer-coarse:size-11`}
          >
            <Plus size={16} weight="bold" aria-hidden="true" />
          </Link>
        </RailTip>
        <div className="mt-3 mb-4">
          {switcher ? (
            <Suspense
              fallback={
                <div
                  aria-hidden="true"
                  className="size-10 rounded-[12px] border border-line bg-surface-1/50"
                />
              }
            >
              {switcher}
            </Suspense>
          ) : null}
        </div>
        <CurrentSidebarNav rail />
      </aside>
    </RailTips>
  );
}

/**
 * The desktop column, from `lg` up: the full sidebar, or the rail when the
 * choice is collapsed and on every day page (with `railSwitcher`). On Home a
 * collapsed sidebar is gone altogether and the page centres (the top bar keeps
 * the way back). From `sm` to `lg` `MobileNav` carries the same links; below
 * `sm` the tab bar does, and neither has the toggle.
 */
export function Sidebar({
  switcher,
  railSwitcher,
}: {
  switcher?: ReactNode;
  railSwitcher?: ReactNode;
}): React.JSX.Element | null {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarState();
  if (dayPageDate(pathname) !== undefined)
    return <Rail switcher={railSwitcher} />;
  if (collapsed && isHomePage(pathname)) return null;
  if (collapsed) return <Rail switcher={railSwitcher} toggle={toggle} />;
  return (
    // On the canvas, no rule beside it. The right padding holds a focus ring
    // and the active pill's shadow inside the scroller; the page's own 20px
    // gutter makes up the rest of the space before the cards.
    <aside
      aria-label="Sidebar"
      data-pinned=""
      className="sticky top-0 hidden h-dvh w-[220px] flex-none flex-col overflow-y-auto pt-5 pr-1.5 pb-[18px] pl-[18px] lg:flex"
    >
      {/* The wordmark goes to the Dashboard, filters kept; the toggle is at the head's far end. */}
      <div className="flex items-center justify-between pr-1.5">
        <WithDashboardHref>
          {(href) => (
            <BrandMark
              href={href}
              className="h-8 self-start rounded-control px-1.5 pointer-coarse:h-11"
            />
          )}
        </WithDashboardHref>
        <RailTips>
          <SidebarToggle collapsed={false} onToggle={toggle} />
        </RailTips>
      </div>
      <SwitcherSlot switcher={switcher} />
      <CurrentSidebarNav />
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useId, type ReactNode } from 'react';
import { BrandMark } from '@/components/site/brand-mark';
import { WithDashboardHref } from './dashboard-link';
import { APP_NAV, activeItem, navHref, type NavItem } from './nav';

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
}: {
  item: NavItem;
  current: boolean;
  params: URLSearchParams;
  onNavigate?(): void;
}): React.JSX.Element {
  const quiet = item.group === 'not-live';
  const Glyph = item.icon;
  const look = current
    ? 'bg-surface-1 font-semibold text-text shadow-[var(--shadow-chip)]'
    : quiet
      ? 'font-medium text-faint hover:bg-surface-1/60 hover:text-muted'
      : 'font-medium text-muted hover:bg-surface-1/60 hover:text-text';
  return (
    <li>
      <Link
        href={navHref(item, params)}
        aria-current={current ? 'page' : undefined}
        onClick={onNavigate}
        className={`${ROW} ${look}`}
      >
        <Glyph
          size={18}
          aria-hidden="true"
          data-look={current ? 'current' : quiet ? 'not-live' : 'module'}
          className={`flex-none ${current ? 'text-accent-ink' : quiet ? 'opacity-70' : ''}`}
        />
        <span className="min-w-0 truncate">{item.label}</span>
      </Link>
    </li>
  );
}

/** The app's module links: modules, a quieter "Not live yet" group, then Settings at the foot. */
export function SidebarNav({
  pathname,
  params,
  onNavigate,
}: {
  pathname: string;
  params: URLSearchParams;
  onNavigate?(): void;
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
      />
    ));

  return (
    <nav aria-label="App" className="flex flex-1 flex-col">
      <ul className="flex flex-col gap-0.5">{rows('modules')}</ul>
      <p
        id={notLiveLabel}
        className="mx-2.5 mt-[18px] mb-1.5 text-[12.5px] font-medium text-faint"
      >
        Not live yet
      </p>
      <ul aria-labelledby={notLiveLabel} className="flex flex-col gap-0.5">
        {rows('not-live')}
      </ul>
      <ul className="mt-auto flex flex-col gap-0.5 pt-5">{rows('settings')}</ul>
    </nav>
  );
}

function NavFromUrl({
  onNavigate,
}: {
  onNavigate?(): void;
}): React.JSX.Element {
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <SidebarNav pathname={pathname} params={params} onNavigate={onNavigate} />
  );
}

/**
 * `SidebarNav` on the current URL. The search params sit behind Suspense so
 * the shell still prerenders: until they arrive, the links carry no filters.
 */
export function CurrentSidebarNav({
  onNavigate,
}: {
  onNavigate?(): void;
}): React.JSX.Element {
  const pathname = usePathname();
  return (
    <Suspense
      fallback={
        <SidebarNav
          pathname={pathname}
          params={NO_PARAMS}
          onNavigate={onNavigate}
        />
      }
    >
      <NavFromUrl onNavigate={onNavigate} />
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

/** The desktop column, from `lg` up. Below that, `MobileNav` carries the same links. */
export function Sidebar({
  switcher,
}: {
  switcher?: ReactNode;
}): React.JSX.Element {
  return (
    // On the canvas, no rule beside it. The right padding holds a focus ring
    // and the active pill's shadow inside the scroller; the page's own 20px
    // gutter makes up the rest of the space before the cards.
    <div className="sticky top-0 hidden h-dvh w-[220px] flex-none flex-col overflow-y-auto pt-5 pr-1.5 pb-[18px] pl-[18px] lg:flex">
      {/* The wordmark goes to the Dashboard, filters kept. */}
      <WithDashboardHref>
        {(href) => (
          <BrandMark
            href={href}
            className="h-8 self-start rounded-control px-1.5 pointer-coarse:h-11"
          />
        )}
      </WithDashboardHref>
      <SwitcherSlot switcher={switcher} />
      <CurrentSidebarNav />
    </div>
  );
}

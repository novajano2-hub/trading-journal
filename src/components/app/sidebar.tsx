'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useId, type ReactNode } from 'react';
import { BrandMark } from '@/components/site/brand-mark';
import { IconTile } from '@/components/ui/icon-tile';
import { APP_NAV, activeItem, navHref, type NavItem } from './nav';

const NO_PARAMS = new URLSearchParams();

const ROW =
  'flex h-10 items-center gap-2.5 rounded-control p-1 pr-2 text-[13.5px] no-underline transition-colors duration-120 pointer-coarse:h-11';

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
  const look = current
    ? 'bg-accent-soft font-medium text-accent-ink'
    : quiet
      ? 'text-faint hover:bg-bg hover:text-muted'
      : 'text-muted hover:bg-bg hover:text-text';
  return (
    <li>
      <Link
        href={navHref(item, params)}
        aria-current={current ? 'page' : undefined}
        onClick={onNavigate}
        className={`${ROW} ${look}`}
      >
        <IconTile
          icon={item.icon}
          tone={current ? 'accent' : quiet ? 'faint' : 'neutral'}
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
  const notLiveHeading = useId();
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
      <h2
        id={notLiveHeading}
        className="px-1 pt-5 pb-1.5 text-[12px] font-normal text-faint"
      >
        Not live yet
      </h2>
      <ul aria-labelledby={notLiveHeading} className="flex flex-col gap-0.5">
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
    <div className="mb-3.5">
      <Suspense
        fallback={
          <div
            aria-hidden="true"
            className="h-12 rounded-control border border-line"
          />
        }
      >
        {switcher}
      </Suspense>
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
    <div className="sticky top-0 hidden h-dvh w-[220px] flex-none flex-col overflow-y-auto border-r border-line bg-surface-1 px-3 py-4 lg:flex">
      <BrandMark
        href="/app/dashboard"
        className="mb-3 h-10 self-start rounded-control px-2 pointer-coarse:h-11"
      />
      <SwitcherSlot switcher={switcher} />
      <CurrentSidebarNav />
    </div>
  );
}

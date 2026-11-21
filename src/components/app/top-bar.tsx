'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UploadSimple } from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { pageTitle } from './nav';

/**
 * The 56px bar over every app page: the page title, the filter chips, then
 * search, the sample label, Gross/Net, Import and the theme.
 * - Below 1440px the chips take their own row: beside the sidebar, real
 *   labels don't fit on one line any narrower. Where even that row is too
 *   short, they scroll sideways.
 * - Below `lg` the drawer trigger (`menu`) leads the bar.
 * - Below `sm` the sample label and Gross/Net take a row of their own above
 *   the chips, and the bar scrolls away with the page rather than holding
 *   three rows over it.
 */
export function TopBar({
  menu,
  filters,
  search,
  basis,
  label,
}: {
  menu?: ReactNode;
  filters?: ReactNode;
  search?: ReactNode;
  basis?: ReactNode;
  label?: ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-2 border-b border-line bg-surface-1 px-5 max-sm:static min-[1440px]:flex-nowrap">
      {menu}
      <h1 className="flex h-14 min-w-0 flex-1 items-center text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] min-[1440px]:mr-2 min-[1440px]:flex-none">
        <span className="truncate">{pageTitle(pathname)}</span>
      </h1>
      {filters ? (
        // The chips scroll inside their own group; this only places it.
        <div className="order-last flex w-full min-w-0 items-center pb-3 min-[1440px]:order-none min-[1440px]:w-auto min-[1440px]:flex-1 min-[1440px]:pb-0">
          {filters}
        </div>
      ) : null}
      {/* Below sm this wrapper steps aside, so its items join the bar's own rows. */}
      <div className="contents sm:ml-auto sm:flex sm:h-14 sm:flex-none sm:items-center sm:gap-2">
        {search}
        {label || basis ? (
          <div className="flex items-center gap-2 max-sm:order-1 max-sm:w-full max-sm:pb-2">
            {label}
            <div className="flex max-sm:ml-auto">{basis}</div>
          </div>
        ) : null}
        {/* Import's own page needs no link to itself. */}
        {pathname === '/app/import' ? null : (
          <Link
            href="/app/import"
            aria-label="Import"
            className={`${buttonClasses('primary', 'sm')} flex-none pointer-coarse:h-11 max-sm:w-[38px] max-sm:px-0 max-sm:pointer-coarse:w-11`}
          >
            <UploadSimple size={18} aria-hidden="true" className="sm:hidden" />
            <span className="max-sm:hidden">Import</span>
          </Link>
        )}
        <ThemeToggle className="flex-none" />
      </div>
    </header>
  );
}

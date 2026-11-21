'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UploadSimple } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { pageTitle } from './nav';

/**
 * The 56px bar over every app page: the page title, then the slots, then
 * Import and the theme. Below `lg` the drawer trigger (`menu`) leads it and
 * the filters drop to a second row that scrolls sideways.
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
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-2 border-b border-line bg-surface-1 px-5 lg:flex-nowrap">
      {menu}
      <h1 className="flex h-14 min-w-0 flex-1 items-center text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] lg:mr-2 lg:flex-none">
        <span className="truncate">{pageTitle(pathname)}</span>
      </h1>
      {filters ? (
        // Padded inside the scroller so focus rings are not clipped.
        <div className="order-last -mx-1 -mt-1.5 flex w-[calc(100%+8px)] min-w-0 items-center gap-2 overflow-x-auto px-1 pt-1.5 pb-3 lg:order-none lg:mx-0 lg:my-0 lg:w-auto lg:flex-1 lg:py-1.5">
          {filters}
        </div>
      ) : null}
      <div className="ml-auto flex h-14 flex-none items-center gap-2">
        {search}
        {label}
        {basis}
        <Link
          href="/app/import"
          aria-label="Import"
          className={`${buttonClasses('primary', 'sm')} pointer-coarse:h-11 max-sm:w-[38px] max-sm:px-0 max-sm:pointer-coarse:w-11`}
        >
          <UploadSimple size={18} aria-hidden="true" className="sm:hidden" />
          <span className="max-sm:hidden">Import</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}

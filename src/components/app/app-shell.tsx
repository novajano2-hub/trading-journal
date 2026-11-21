'use client';

import { Suspense, type ReactNode } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react/dist/ssr';
import { EMPTY_FILTERS } from '@/data/filters';
import { AccountSwitcher } from './account-switcher';
import { AppSearch } from './app-search';
import { BasisSwitch } from './basis-switch';
import { FilterBar, FilterBarView } from './filter-bar';
import { MobileNav } from './mobile-nav';
import { SampleLabel } from './sample-label';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

/** The chips as prerendered, before the URL is read: all unset and inert. */
const FILTERS_FALLBACK = (
  <FilterBarView
    filters={EMPTY_FILTERS}
    options={{ symbols: [], strategies: [], tags: [] }}
    today=""
    onChange={() => {}}
    disabled
  />
);

/** The search before the URL is read: its resting icon (34px, 40px on a phone), inert, holding the bar's place. */
function SearchFallback(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[34px] flex-none items-center justify-center rounded-control border border-line bg-surface-1 text-muted pointer-coarse:size-11 max-sm:size-10 max-sm:pointer-coarse:size-11"
    >
      <MagnifyingGlass size={18} />
    </span>
  );
}

/** Every /app page: the sidebar (a drawer below `lg`), the top bar, then the page. */
export function AppShell({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-1">
      <a
        href="#content"
        className="sr-only rounded-control bg-surface-1 text-[15px] font-medium text-text focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:border focus:border-line focus:px-4 focus:py-2.5 focus:shadow-[var(--shadow-chip)]"
      >
        Skip to content
      </a>
      <Sidebar switcher={<AccountSwitcher />} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          menu={<MobileNav switcher={<AccountSwitcher />} />}
          filters={
            <Suspense fallback={FILTERS_FALLBACK}>
              <FilterBar />
            </Suspense>
          }
          search={
            <Suspense fallback={<SearchFallback />}>
              <AppSearch />
            </Suspense>
          }
          basis={<BasisSwitch />}
          label={<SampleLabel />}
        />
        <main
          id="content"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

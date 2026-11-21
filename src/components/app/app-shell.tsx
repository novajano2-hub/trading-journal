'use client';

import type { ReactNode } from 'react';
import { MobileNav } from './mobile-nav';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

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
        className="sr-only rounded-control bg-surface-1 text-[15px] font-medium text-text focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:border focus:border-line-2 focus:px-4 focus:py-2.5"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar menu={<MobileNav />} />
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

'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, type ComponentProps, type ReactNode } from 'react';
import { navHref, navItem } from './nav';

const DASHBOARD = navItem('dashboard');

type HrefChildren = { children(href: string): ReactNode };

function FilteredHref({ children }: HrefChildren): ReactNode {
  return children(navHref(DASHBOARD, useSearchParams()));
}

/**
 * Hands `children` the Dashboard's href carrying the URL's filters, as the
 * sidebar's Dashboard link does. The params sit behind Suspense so the page
 * still prerenders: until they arrive, the plain href.
 */
export function WithDashboardHref({ children }: HrefChildren): ReactNode {
  return (
    <Suspense fallback={children(DASHBOARD.href)}>
      <FilteredHref>{children}</FilteredHref>
    </Suspense>
  );
}

/** A link back to the Dashboard that keeps the URL's filters. */
export function DashboardLink(
  props: Omit<ComponentProps<typeof Link>, 'href'>,
): React.JSX.Element {
  return (
    <WithDashboardHref>
      {(href) => <Link href={href} {...props} />}
    </WithDashboardHref>
  );
}

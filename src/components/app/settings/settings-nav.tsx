'use client';

import {
  Bank,
  ClockCounterClockwise,
  SlidersHorizontal,
  Tag,
  User,
} from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export const SETTINGS_NAV: readonly {
  label: string;
  href: `/app/settings/${string}`;
  icon: Icon;
}[] = [
  { label: 'Profile', href: '/app/settings/profile', icon: User },
  { label: 'Accounts', href: '/app/settings/accounts', icon: Bank },
  { label: 'Trading', href: '/app/settings/trading', icon: SlidersHorizontal },
  { label: 'Tags', href: '/app/settings/tags', icon: Tag },
  {
    label: 'Logs',
    href: '/app/settings/import-history',
    icon: ClockCounterClockwise,
  },
];

/** Whether `pathname` is the section's page (a trailing slash allowed). */
export function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname === `${href}/`;
}

/**
 * The settings sections: a card down the left from `lg`, a row of pills that
 * scrolls sideways below it.
 */
export function SettingsNav(): React.JSX.Element {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  // Below lg the pills scroll: an edge fade says there are more to the right.
  const [more, setMore] = useState(false);
  const measure = () => {
    const el = ref.current;
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return (
    <div className="relative">
      <nav
        ref={ref}
        onScroll={measure}
        aria-label="Settings"
        className="flex gap-1 overflow-x-auto rounded-card border border-line bg-surface-1 p-2.5 shadow-[var(--shadow-card)] [scrollbar-width:none] lg:flex-col lg:overflow-visible"
      >
        {SETTINGS_NAV.map(({ label, href, icon: Glyph }) => {
          const current = isCurrent(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? 'page' : undefined}
              className={`flex h-9 flex-none items-center gap-2.5 rounded-[9px] px-2.5 text-[14px] font-medium no-underline outline-offset-0 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 ${
                current
                  ? 'bg-sunken font-semibold text-text'
                  : 'text-muted hover:bg-sunken hover:text-text'
              }`}
            >
              <Glyph
                size={16}
                aria-hidden="true"
                className={current ? 'text-accent-ink' : ''}
              />
              {label}
            </Link>
          );
        })}
      </nav>
      <span
        aria-hidden="true"
        data-edge-fade=""
        data-visible={more ? 'true' : 'false'}
        className="pointer-events-none absolute inset-y-px right-px w-12 rounded-r-card bg-gradient-to-l from-surface-1 to-transparent data-[visible=false]:hidden lg:hidden"
      />
    </div>
  );
}

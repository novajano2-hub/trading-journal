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
import { Fragment, useEffect, useRef, useState } from 'react';
import { useBelowLg } from '@/lib/use-phone';
import { RailTip, RailTips } from '../rail-tip';

export interface SettingsPage {
  label: string;
  href: `/app/settings/${string}`;
  icon: Icon;
}

/**
 * The sections in their groups, a divider between groups (C48): Profile, then
 * Accounts, Trading, Tags and Logs. A new section goes into its group in
 * place, in the order it reads (Plan 6B's Notebook sits between Tags and Logs).
 */
export const SETTINGS_NAV: readonly (readonly SettingsPage[])[] = [
  [{ label: 'Profile', href: '/app/settings/profile', icon: User }],
  [
    { label: 'Accounts', href: '/app/settings/accounts', icon: Bank },
    {
      label: 'Trading',
      href: '/app/settings/trading',
      icon: SlidersHorizontal,
    },
    { label: 'Tags', href: '/app/settings/tags', icon: Tag },
    {
      label: 'Logs',
      href: '/app/settings/import-history',
      icon: ClockCounterClockwise,
    },
  ],
];

/** Whether `pathname` is the section's page (a trailing slash allowed). */
export function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname === `${href}/`;
}

/** Between two groups: a hairline across the column, standing upright in the pill row. */
const DIVIDER =
  'mx-0.5 my-[7px] h-[22px] w-px flex-none bg-line lg:mx-1.5 lg:my-1 lg:h-px lg:w-auto';

/**
 * The settings sections in their groups: a card down the left from `lg`, a row
 * of pills that scrolls sideways below it. `collapsed` (the sidebar's own
 * choice, C47) folds the card to a column of icons from `lg`, each named by a
 * tooltip and for assistive tech, the dividers kept; below `lg` the row never
 * collapses and keeps its words.
 */
export function SettingsNav({
  collapsed = false,
}: {
  collapsed?: boolean;
}): React.JSX.Element {
  const pathname = usePathname();
  const belowLg = useBelowLg();
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
  // The icons are named where the words are gone: not in the labelled row below lg.
  const tips = collapsed && !belowLg;
  return (
    <div className="relative">
      <nav
        ref={ref}
        onScroll={measure}
        aria-label="Settings"
        className={`overflow-x-auto rounded-card border border-line bg-surface-1 p-2.5 shadow-[var(--shadow-card)] [scrollbar-width:none] lg:overflow-visible ${collapsed ? 'lg:p-2 lg:pointer-coarse:p-1.5' : 'lg:p-2'}`}
      >
        <RailTips>
          <ul className="flex w-max min-w-full gap-1 lg:w-auto lg:flex-col">
            {SETTINGS_NAV.map((group, i) => (
              <Fragment key={group[0]?.href ?? i}>
                {i > 0 ? <li aria-hidden="true" className={DIVIDER} /> : null}
                {group.map(({ label, href, icon: Glyph }) => {
                  const current = isCurrent(pathname, href);
                  const link = (
                    <Link
                      href={href}
                      aria-current={current ? 'page' : undefined}
                      className={`flex h-9 flex-none items-center gap-2.5 rounded-[9px] px-2.5 text-[14px] font-medium no-underline outline-offset-0 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 ${
                        collapsed
                          ? 'lg:w-[42px] lg:justify-center lg:gap-0 lg:px-0 lg:pointer-coarse:w-11'
                          : ''
                      } ${
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
                      <span className={collapsed ? 'lg:sr-only' : undefined}>
                        {label}
                      </span>
                    </Link>
                  );
                  return (
                    <li key={href}>
                      {tips ? <RailTip label={label}>{link}</RailTip> : link}
                    </li>
                  );
                })}
              </Fragment>
            ))}
          </ul>
        </RailTips>
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

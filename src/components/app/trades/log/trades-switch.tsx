'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { parseFilters, serializeFilters } from '@/data/filters';

const VIEWS = [
  { view: 'day', label: 'Day', href: '/app/trades/day' },
  { view: 'week', label: 'Week', href: '/app/trades/week' },
  { view: 'all', label: 'All', href: '/app/trades' },
] as const;

/**
 * Day, Week and All: links, each keeping every filter in the address (and
 * nothing else, so a page number never follows to a view that has none). Below
 * `sm` the switch fills the row. Render inside `<Suspense>`.
 */
export function TradesSwitch({
  view,
}: {
  view: 'day' | 'week' | 'all';
}): React.JSX.Element {
  const params = useSearchParams();
  const query = serializeFilters(parseFilters(params)).toString();
  return (
    <nav
      aria-label="Trade views"
      className="inline-flex rounded-[11px] bg-track p-[3px] shadow-[inset_0_1px_2px_rgb(18_22_51/0.07)] max-sm:flex max-sm:w-full [[data-theme=dark]_&]:shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]"
    >
      {VIEWS.map((v) => {
        const current = v.view === view;
        return (
          <Link
            key={v.view}
            href={query ? `${v.href}?${query}` : v.href}
            aria-current={current ? 'page' : undefined}
            className={`inline-flex h-7 min-w-16 items-center justify-center rounded-[8px] px-[13px] text-[13.5px] no-underline transition-[background-color,color,box-shadow] duration-200 ease-(--ease-glide) outline-offset-0 focus-visible:outline-2 focus-visible:outline-accent max-sm:flex-1 pointer-coarse:min-h-11 ${current ? 'bg-surface-1 font-semibold text-text shadow-[var(--shadow-chip)] [[data-theme=dark]_&]:bg-line-2' : 'font-medium text-muted hover:text-text'}`}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UploadSimple } from '@phosphor-icons/react/dist/ssr';
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { pageTitle } from './nav';

/**
 * Where the chips sit from `sm` up: beside the title, or on a row of their
 * own. `unknown` is the prerendered guess, until the bar is measured: beside
 * the title from `xl`, where chips at rest fit.
 */
type ChipsFit = 'unknown' | 'inline' | 'wrapped';

const FIT: Record<
  'bar' | 'title' | 'chips' | 'breaker',
  Record<ChipsFit, string>
> = {
  bar: {
    unknown: 'sm:flex-wrap xl:flex-nowrap',
    inline: 'sm:flex-nowrap',
    wrapped: 'sm:flex-wrap',
  },
  title: {
    unknown: 'sm:flex-1 xl:mr-2 xl:flex-none',
    inline: 'sm:mr-2 sm:flex-none',
    wrapped: 'sm:flex-1',
  },
  chips: {
    unknown: 'sm:order-7 sm:pb-3 xl:order-1 xl:pb-0',
    inline: 'sm:order-1',
    wrapped: 'sm:order-7 sm:pb-3',
  },
  breaker: {
    unknown: 'sm:block xl:hidden',
    inline: '',
    wrapped: 'sm:block',
  },
};

/** The bar's gap (gap-x-2), and the title's margin beside the chips (mr-2). */
const GAP = 8;
const TITLE_MARGIN = 8;

type Ref = RefObject<HTMLElement | null>;

/**
 * Whether the chips fit beside the title, measured from `sm` up. The chips'
 * box is as wide as they need, up to the space it has, so it reads the same
 * either way: narrower than the room beside the title means they fit there.
 */
function useChipsFit({
  bar,
  title,
  tail,
  controls,
  chips,
}: {
  bar: Ref;
  /** The title's text, sized to its words. */
  title: Ref;
  /** The first control on the right. */
  tail: Ref;
  /** The sample label and Gross/Net, which come and go. */
  controls: Ref;
  chips: Ref;
}): ChipsFit {
  const [fit, setFit] = useState<ChipsFit>('unknown');
  useLayoutEffect(() => {
    const sm = matchMedia('(min-width: 640px)');
    const measure = () => {
      const t = title.current;
      const r = tail.current;
      const c = chips.current;
      if (!sm.matches || !t || !r || !c) return;
      const room =
        r.getBoundingClientRect().left -
        t.getBoundingClientRect().left -
        t.scrollWidth -
        TITLE_MARGIN -
        2 * GAP;
      const next: ChipsFit =
        c.getBoundingClientRect().width < room - 0.5 ? 'inline' : 'wrapped';
      setFit((f) => (f === next ? f : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    // The bar resizes with the window; the rest with their words.
    const observer = new ResizeObserver(measure);
    for (const el of [bar, title, controls, chips])
      if (el.current) observer.observe(el.current);
    return () => observer.disconnect();
  }, [bar, title, tail, controls, chips]);
  return fit;
}

/**
 * The bar over every app page: the page title, the filter chips, then
 * search, the sample label, Gross/Net, Import and the theme.
 * - From `sm` up it is one sticky bar, 56px while the chips fit beside the
 *   title. Where they don't, measured, they take a row of their own, and
 *   where even that row is too short they scroll sideways.
 * - Below `lg` the drawer trigger (`menu`) leads the bar.
 * - Below `sm` the first row (menu, title, search, Import, theme) holds still
 *   at the top; the sample label, Gross/Net and the chips scroll away under it.
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
  const bar = useRef<HTMLElement>(null);
  const title = useRef<HTMLSpanElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const fit = useChipsFit({ bar, title, tail, controls, chips });

  return (
    <header
      ref={bar}
      data-chips={filters ? fit : undefined}
      className={`z-30 border-b border-line bg-surface-1 px-5 max-sm:pt-14 sm:sticky sm:top-0 sm:flex sm:items-center sm:gap-x-2 ${FIT.bar[fit]}`}
    >
      {/* Below sm this row is pinned to the top; from sm its items join the bar's. */}
      <div className="flex h-14 items-center gap-2 max-sm:fixed max-sm:inset-x-0 max-sm:top-0 max-sm:z-30 max-sm:border-b max-sm:border-line max-sm:bg-surface-1 max-sm:px-5 sm:contents">
        {menu}
        <h1
          className={`flex h-14 min-w-0 flex-1 items-center text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] max-sm:h-auto ${FIT.title[fit]}`}
        >
          <span ref={title} className="truncate">
            {pageTitle(pathname)}
          </span>
        </h1>
        <div
          ref={tail}
          className="flex flex-none items-center sm:order-2 sm:ml-auto"
        >
          {search}
        </div>
        {/* Import's own page needs no link to itself. */}
        {pathname === '/app/import' ? null : (
          <Link
            href="/app/import"
            aria-label="Import"
            className={`${buttonClasses('primary', 'sm')} flex-none pointer-coarse:h-11 max-sm:w-[38px] max-sm:px-0 max-sm:pointer-coarse:w-11 sm:order-4`}
          >
            <UploadSimple size={18} aria-hidden="true" className="sm:hidden" />
            <span className="max-sm:hidden">Import</span>
          </Link>
        )}
        <ThemeToggle className="flex-none sm:order-5" />
      </div>
      {label || basis ? (
        <div
          ref={controls}
          className="flex items-center gap-2 max-sm:pt-2.5 max-sm:pb-2 sm:order-3 sm:flex-none"
        >
          {label}
          <div className="flex max-sm:ml-auto">{basis}</div>
        </div>
      ) : null}
      {filters ? (
        <>
          {/* A line break before chips on their own row. */}
          <div
            aria-hidden="true"
            className={`hidden basis-full sm:order-6 ${FIT.breaker[fit]}`}
          />
          {/* The chips scroll inside their own group; this only places it. */}
          <div
            ref={chips}
            className={`flex min-w-0 flex-initial items-center max-sm:pb-3 ${FIT.chips[fit]}`}
          >
            {filters}
          </div>
        </>
      ) : null}
    </header>
  );
}

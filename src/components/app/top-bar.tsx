'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CaretRight, UploadSimple } from '@phosphor-icons/react/dist/ssr';
import {
  Suspense,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { RAISED } from '@/components/ui/button-styles';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useTrade } from '@/data/query/hooks';
import { filtersApply, pageTitle, tradePageId } from './nav';

/**
 * Where the chips sit from `sm` up: beside the title, or with the controls on
 * a row under it. `unknown` is the prerendered guess, until the bar is
 * measured: beside the title from `xl`, where chips at rest fit.
 */
type ChipsFit = 'unknown' | 'inline' | 'wrapped';

const FIT: Record<'bar' | 'title' | 'breaker', Record<ChipsFit, string>> = {
  bar: {
    unknown: 'sm:flex-wrap sm:pb-3 xl:flex-nowrap xl:pb-0',
    inline: 'sm:flex-nowrap',
    wrapped: 'sm:flex-wrap sm:pb-3',
  },
  title: {
    unknown: 'sm:h-14 xl:mr-3 xl:h-[68px] xl:flex-none',
    inline: 'sm:mr-3 sm:flex-none',
    wrapped: 'sm:h-14',
  },
  breaker: {
    unknown: 'sm:block xl:hidden',
    inline: '',
    wrapped: 'sm:block',
  },
};

/** The bar's gap (gap-x-2), and the title's margin beside the chips (mr-3). */
const GAP = 8;
const TITLE_MARGIN = 12;

/**
 * Import, the bar's one primary: 34px, its glyph leading. On a phone it is
 * the glyph alone, 40px square.
 */
const IMPORT = `inline-flex h-[34px] flex-none items-center justify-center gap-[7px] rounded-control pr-[15px] pl-3 text-[13.5px] font-semibold whitespace-nowrap no-underline select-none ${RAISED} pointer-coarse:h-11 max-sm:size-10 max-sm:p-0 max-sm:pointer-coarse:size-11`;

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
  /** The sample label and the Display menu, which come and go. */
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

/** "Trades" as the way back to the log, with the filters it was left with. */
function BackToTrades(): React.JSX.Element {
  const search = useSearchParams().toString();
  return (
    <Link
      href={`/app/trades${search ? `?${search}` : ''}`}
      className="rounded-chip text-faint no-underline outline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
    >
      Trades
    </Link>
  );
}

/** The trade's number after the caret; nothing until it loads or when it isn't there. */
function TradeNumber({ id }: { id: string }): React.JSX.Element | null {
  const trade = useTrade(id);
  if (!trade.data) return null;
  return (
    <>
      <CaretRight
        size={16}
        aria-hidden="true"
        className="mx-1 flex-none text-faint"
      />
      <span>
        <span className="sr-only">Trade </span>
        {trade.data.serial}
      </span>
    </>
  );
}

/**
 * The bar over every app page, on the canvas with no rule under it. Its
 * source order is its reading order at every
 * width, so Tab follows what the eye does: the menu (below `lg`), the page
 * title, the filter chips, then search, the sample label, the Display menu, Import
 * and the theme. Nothing is reordered by CSS.
 * - From `sm` up it is one sticky bar, 68px while the chips fit beside the
 *   title. Where they don't, measured, the title keeps the first row and the
 *   chips lead a second one, the controls after them; where even that row is
 *   too short the chips scroll sideways.
 * - Below `sm` the first row (menu and title) holds still at the top; the
 *   chips, then search and the controls, scroll away under it.
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
  const tradeId = tradePageId(pathname);
  const measured = useChipsFit({ bar, title, tail, controls, chips });
  // The chips show only where the filters drive the page. A trade page's bar
  // carries none (its Previous and Next keep the URL's), nor does Import; those
  // are laid out as the chips-beside-the-title case.
  const showFilters = filters && filtersApply(pathname);
  const fit = showFilters ? measured : 'inline';

  return (
    <header
      ref={bar}
      data-chips={showFilters ? fit : undefined}
      className={`z-30 bg-bg px-5 max-sm:pt-14 sm:sticky sm:top-0 sm:flex sm:items-center sm:gap-x-2 ${FIT.bar[fit]}`}
    >
      {/* Below sm this row is pinned to the top; from sm its items join the bar's. */}
      <div className="flex h-14 items-center gap-2 max-sm:fixed max-sm:inset-x-0 max-sm:top-0 max-sm:z-30 max-sm:border-b max-sm:border-line max-sm:bg-bg max-sm:px-5 sm:contents">
        {menu}
        <h1
          className={`flex h-[68px] min-w-0 flex-1 items-center text-[24px] leading-[1.2] font-[650] tracking-[-0.035em] max-sm:h-auto max-sm:text-[20px] ${FIT.title[fit]}`}
        >
          <span
            ref={title}
            className={tradeId === undefined ? 'truncate' : 'flex items-center'}
          >
            {tradeId === undefined ? (
              pageTitle(pathname)
            ) : (
              <>
                <Suspense fallback={<span>Trades</span>}>
                  <BackToTrades />
                </Suspense>
                <TradeNumber id={tradeId} />
              </>
            )}
          </span>
        </h1>
      </div>
      {showFilters ? (
        <>
          {/* Ends the title's row when the chips lead the next. */}
          <div
            aria-hidden="true"
            className={`hidden basis-full ${FIT.breaker[fit]}`}
          />
          {/* As wide as the chips need, up to the room left; they scroll inside their own group. */}
          <div
            ref={chips}
            className="flex max-w-max min-w-0 grow basis-0 items-center max-sm:pt-3"
          >
            {filters}
          </div>
        </>
      ) : null}
      {/* Below sm the last row; from sm its items join the bar's, at its end. */}
      <div className="flex items-center gap-2.5 max-sm:pt-2.5 max-sm:pb-3 sm:contents">
        {/* Search starts the controls: at the bar's end from sm, the row's start below. */}
        <div
          ref={tail}
          className="flex flex-none items-center max-sm:mr-auto sm:ml-auto"
        >
          {search}
        </div>
        {label || basis ? (
          <div ref={controls} className="flex flex-none items-center gap-2">
            {label}
            <div className="flex">{basis}</div>
          </div>
        ) : null}
        {/* Import's own page needs no link to itself. */}
        {pathname === '/app/import' ? null : (
          <Link href="/app/import" aria-label="Import" className={IMPORT}>
            <UploadSimple
              size={16}
              aria-hidden="true"
              className="flex-none max-sm:size-[18px]"
            />
            <span className="max-sm:hidden">Import</span>
          </Link>
        )}
        {/* The bar's last control: Keel has no signed-in person, so no avatar. */}
        <ThemeToggle className="flex-none max-sm:size-10 max-sm:pointer-coarse:size-11" />
      </div>
    </header>
  );
}

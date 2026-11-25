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
import { DayHeader } from './day/day-header';
import { useImportPicker } from './day/import-picker';
import { SessionButton } from './day/session-button';
import { isRealDate } from './notebook/notebook-model';
import { PlanTheDay } from './routine/plan-the-day';
import { useStrategy, useTrade } from '@/data/query/hooks';
import {
  dayPageDate,
  filtersApply,
  hidesDisplayMenu,
  isComparePage,
  pageTitle,
  strategyEditId,
  strategyPageId,
  tradePageId,
} from './nav';

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
 * Import, the bar's one primary: 34px, its glyph leading. A phone reaches it
 * from More (and from the empty states), so the bar leaves it out there.
 */
const IMPORT = `inline-flex h-[34px] flex-none items-center justify-center gap-[7px] rounded-control pr-[15px] pl-3 text-[13.5px] font-semibold whitespace-nowrap no-underline select-none ${RAISED} pointer-coarse:h-11 max-sm:hidden`;

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

const CRUMB_LINK =
  'rounded-chip text-faint no-underline outline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent';

const Caret = (): React.JSX.Element => (
  <CaretRight
    size={16}
    aria-hidden="true"
    className="mx-1 flex-none text-faint"
  />
);

/**
 * "Strategies > name", and "> Edit" on the editor. The name is the page's own
 * title on the detail page and a way back to it on the editor; nothing shows
 * until the strategy loads.
 */
function StrategyCrumb({
  id,
  edit,
}: {
  id: string;
  edit: boolean;
}): React.JSX.Element {
  const strategy = useStrategy(id);
  const name = strategy.data?.name;
  return (
    <>
      <Link href="/app/strategies" className={CRUMB_LINK}>
        Strategies
      </Link>
      {name ? (
        <>
          <Caret />
          {edit ? (
            <Link
              href={`/app/strategies/${encodeURIComponent(id)}`}
              className={`${CRUMB_LINK} truncate`}
            >
              {name}
            </Link>
          ) : (
            <span className="truncate">{name}</span>
          )}
          {edit ? (
            <>
              <Caret />
              <span>Edit</span>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/**
 * The bar over every app page, on the canvas with no rule under it. Its
 * source order is its reading order at every width, so Tab follows what the
 * eye does: the menu (`sm` to `lg`), the page title, the filter chips, then
 * search, the sample label, the Display menu and Import. Nothing is
 * reordered by CSS.
 * - From `sm` up it is one sticky bar, 68px while the chips fit beside the
 *   title. Where they don't, measured, the title keeps the first row and the
 *   chips lead a second one, the controls after them; where even that row is
 *   too short the chips scroll sideways.
 * - Below `sm` it is one 56px row pinned to the top: the title (with a quiet
 *   "Sample" badge in the sample workspace) on the left, plain icon buttons
 *   for Filters (where the page has them), search and Display on the right.
 *   The tab bar at the foot does the navigating.
 */
export function TopBar({
  menu,
  filters,
  search,
  basis,
  label,
  badge,
}: {
  menu?: ReactNode;
  filters?: ReactNode;
  search?: ReactNode;
  basis?: ReactNode;
  /** The sample label among the controls, from `sm`. */
  label?: ReactNode;
  /** The sample badge beside the title, below `sm`. */
  badge?: ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const bar = useRef<HTMLElement>(null);
  const title = useRef<HTMLSpanElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const tradeId = tradePageId(pathname);
  const strategyId = strategyPageId(pathname);
  const editingId = strategyEditId(pathname);
  const crumbed =
    tradeId !== undefined ||
    strategyId !== undefined ||
    editingId !== undefined;
  const rawDate = dayPageDate(pathname);
  // A day page with a bad date keeps the plain bar; its page says why.
  const dayDate =
    rawDate !== undefined && isRealDate(rawDate) ? rawDate : undefined;
  const imports = useImportPicker();
  const measured = useChipsFit({ bar, title, tail, controls, chips });
  // The chips show only where the filters drive the page. A trade page's bar
  // carries none (its Previous and Next keep the URL's), nor does Import; those
  // are laid out as the chips-beside-the-title case.
  const showFilters = filters && filtersApply(pathname);
  const fit = showFilters ? measured : 'inline';

  return (
    <>
      <header
        ref={bar}
        data-chips={showFilters ? fit : undefined}
        className={`sticky top-0 z-30 flex items-center bg-bg px-5 max-sm:h-14 max-sm:border-b max-sm:border-line sm:gap-x-2 ${dayDate !== undefined ? 'sm:h-[68px]' : ''} ${FIT.bar[fit]}`}
      >
        {/* Below sm the title and its badge take the room the icons leave; from sm its items join the bar's. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:contents">
          {menu}
          {dayDate !== undefined ? (
            <DayHeader
              date={dayDate}
              mode={pathname.endsWith('/review') ? 'review' : 'plan'}
              onImport={imports.open}
            />
          ) : (
            <h1
              className={`flex h-[68px] min-w-0 flex-1 items-center text-[24px] leading-[1.2] font-[650] tracking-[-0.035em] max-sm:h-auto max-sm:flex-initial max-sm:text-[20px] ${FIT.title[fit]}`}
            >
              <span
                ref={title}
                className={
                  crumbed
                    ? 'flex min-w-0 items-center whitespace-nowrap'
                    : 'truncate'
                }
              >
                {tradeId !== undefined ? (
                  <>
                    <Suspense fallback={<span>Trades</span>}>
                      <BackToTrades />
                    </Suspense>
                    <TradeNumber id={tradeId} />
                  </>
                ) : strategyId !== undefined || editingId !== undefined ? (
                  <StrategyCrumb
                    id={(strategyId ?? editingId)!}
                    edit={editingId !== undefined}
                  />
                ) : (
                  pageTitle(pathname)
                )}
              </span>
            </h1>
          )}
          {badge}
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
              className="flex max-w-max min-w-0 grow basis-0 items-center max-sm:flex-none max-sm:grow-0 max-sm:basis-auto"
            >
              {filters}
            </div>
          </>
        ) : null}
        {isComparePage(pathname) ? (
          <p className="flex-none text-[13px] text-faint max-sm:hidden">
            Each group has its own filters
          </p>
        ) : null}
        {/* Below sm the icons at the row's end; from sm its items join the bar's, at its end. */}
        <div className="flex flex-none items-center max-sm:-mr-2.5 sm:contents">
          {/* Search starts the controls at the bar's end. */}
          <div ref={tail} className="flex flex-none items-center sm:ml-auto">
            {search}
          </div>
          {label || basis ? (
            <div ref={controls} className="flex flex-none items-center gap-2">
              {label}
              {/* The tracker has no unit menu: money there is net, in its currency. */}
              {hidesDisplayMenu(pathname) ? null : (
                <div className="flex">{basis}</div>
              )}
            </div>
          ) : null}
          {/* The start-my-day popover, before Import, on the Dashboard and Trades only. */}
          {pathname === '/app/dashboard' || pathname === '/app/trades' ? (
            <div className="flex flex-none max-sm:hidden">
              <PlanTheDay />
            </div>
          ) : null}
          {/* The day's one session, on today's plan page (K30); review has none. */}
          {dayDate !== undefined && !pathname.endsWith('/review') ? (
            <div className="flex flex-none max-sm:ml-1">
              <SessionButton date={dayDate} />
            </div>
          ) : null}
          {/* Import's own page needs no link to itself; a day page opens the method picker instead. The bar's last control: Keel has no signed-in person, so no avatar. */}
          {dayDate !== undefined ? (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={(e) => imports.open(e.currentTarget)}
              className={IMPORT}
            >
              <UploadSimple
                size={16}
                aria-hidden="true"
                className="flex-none"
              />
              Import
            </button>
          ) : pathname === '/app/import' ? null : (
            <Link href="/app/import" className={IMPORT}>
              <UploadSimple
                size={16}
                aria-hidden="true"
                className="flex-none"
              />
              Import
            </Link>
          )}
        </div>
      </header>
      {imports.picker}
      {/* On a phone the note sits under the bar. */}
      {isComparePage(pathname) ? (
        <p className="px-5 pt-3 text-[13px] text-faint sm:hidden">
          Each group has its own filters
        </p>
      ) : null}
    </>
  );
}

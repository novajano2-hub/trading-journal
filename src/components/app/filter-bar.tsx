'use client';

import { CalendarBlank } from '@phosphor-icons/react/dist/ssr';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { EMPTY_FILTERS, type GlobalFilters } from '@/data/filters';
import {
  usePrefs,
  useStrategies,
  useTagCategories,
  useTags,
  useTrades,
} from '@/data/query/hooks';
import { localDate } from '@/domain/time';
import { rangeChipLabel } from '@/lib/range-label';
import { FilterChip, RadioRows } from './filter-chip';
import {
  chipLabel,
  datesOf,
  hasActiveFilters,
  switchWorkspaceFilters,
  type FilterOptions,
} from './filter-model';
import {
  DateBody,
  SIDE_OPTIONS,
  StrategyBody,
  SymbolBody,
  TagBody,
} from './filter-popovers';
import { MoreFilters } from './more-filters';
import { symbolOptions } from './search';
import { useShownFilters } from './use-shown-filters';

const NO_OPTIONS: FilterOptions = {
  symbols: [],
  strategies: [],
  tags: [],
  categories: [],
};

/**
 * How far each edge fade reaches into a row that scrolls. The end's is the
 * longer, so a chip cut there reads as going on, not as clipped.
 */
const FADE = { start: '32px', end: '56px' };

/** Whether the scroller has more past its start and its end. */
function useScrollEdges(
  scroller: RefObject<HTMLElement | null>,
  row: RefObject<HTMLElement | null>,
): { start: boolean; end: boolean } {
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((e) =>
        e.start === start && e.end === end ? e : { start, end },
      );
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    // The scroller resizes with the bar; the row inside resizes with its labels.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(el);
    if (row.current) observer?.observe(row.current);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [scroller, row]);
  return edges;
}

function fadeMask({ start, end }: { start: boolean; end: boolean }) {
  if (!start && !end) return undefined;
  const from = start ? `transparent, black ${FADE.start}` : 'black';
  const to = end ? `black calc(100% - ${FADE.end}), transparent` : 'black';
  return `linear-gradient(to right, ${from}, ${to})`;
}

/**
 * The top bar's filter chips: date, symbol, side, strategy and tags, then
 * "More filters" (which stays put after them, as "Clear filters" does) and "Clear filters" while any filter is set. The chips scroll sideways when the
 * bar is too narrow, fading at an edge with more past it; "Clear filters"
 * stays put after them. On a phone, with nothing after them, the row runs to
 * the screen's edge and fades out there, as a row that scrolls does. Every
 * choice calls `onChange` with the whole next filter set. In a workspace with no trades at all the chips stay in the tab
 * order but open nothing; a filter that matches nothing leaves them live.
 */
export function FilterBarView({
  filters: f,
  options,
  today,
  onChange,
  disabled = false,
  noTrades = false,
}: {
  filters: GlobalFilters;
  options: FilterOptions;
  /** The trader's local date, YYYY-MM-DD; empty while unknown. */
  today: string;
  onChange(next: GlobalFilters): void;
  /** The Suspense fallback: same chips, inert. */
  disabled?: boolean;
  /** The workspace has no trades to filter. */
  noTrades?: boolean;
}): React.JSX.Element {
  const noteId = useId();
  const unavailableNote = noTrades ? noteId : undefined;
  const first = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(scroller, row);
  const names = useMemo(
    () => ({
      strategies: new Map(options.strategies.map((s) => [s.id, s.name])),
      tags: new Map(options.tags.map((t) => [t.id, t.name])),
    }),
    [options.strategies, options.tags],
  );
  const range = f.range;
  const dateActive =
    'preset' in range || range.from !== undefined || range.to !== undefined;
  const symbol = chipLabel('symbol', f, names);
  const side = chipLabel('side', f, names);
  const strategy = chipLabel('strategy', f, names);
  const tag = chipLabel('tag', f, names);
  const cleared = !hasActiveFilters(f);

  return (
    <div
      role="group"
      aria-label="Filters"
      className="flex min-w-0 items-center gap-2"
    >
      {/*
        Padded past a focus ring's 2px and 3px offset, and pulled back by as
        much, so rings show whole. On a phone with no "Clear filters" it also
        reaches through the bar's 20px gutter to the screen's edge, padded by
        as much, so the last chip still stops at the gutter.
      */}
      <div
        ref={scroller}
        style={{ maskImage: fadeMask(edges) }}
        className={`-m-1.5 min-w-0 scroll-pl-8 scroll-pr-14 overflow-x-auto p-1.5 ${cleared ? 'max-sm:-mr-5 max-sm:pr-5' : ''}`}
      >
        <div
          ref={row}
          // Chrome leaves a partly hidden chip where it is on focus: bring it
          // in, clear of the fade (the scroll padding).
          onFocus={(e) =>
            e.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }
          className="flex w-max items-center gap-1"
        >
          <FilterChip
            label={rangeChipLabel(f.range, datesOf(f.range, today))}
            title="Date"
            active={dateActive}
            disabled={disabled}
            unavailableNote={unavailableNote}
            onClear={() => onChange({ ...f, range: {} })}
            triggerRef={first}
            wide
            icon={CalendarBlank}
            alwaysSet
          >
            {(close) => (
              <DateBody
                range={f.range}
                today={today}
                onChange={(range) => onChange({ ...f, range })}
                close={close}
              />
            )}
          </FilterChip>
          <FilterChip
            label={symbol.text}
            title="Symbol"
            active={symbol.active}
            disabled={disabled}
            unavailableNote={unavailableNote}
            onClear={() => onChange({ ...f, symbols: [] })}
          >
            {() => (
              <SymbolBody
                symbols={options.symbols}
                selected={f.symbols}
                onChange={(symbols) => onChange({ ...f, symbols })}
              />
            )}
          </FilterChip>
          <FilterChip
            label={side.text}
            title="Side"
            active={side.active}
            disabled={disabled}
            unavailableNote={unavailableNote}
            onClear={() => onChange({ ...f, side: undefined })}
          >
            {() => (
              <RadioRows
                legend="Side"
                options={SIDE_OPTIONS}
                value={f.side ?? 'both'}
                onChange={(v) =>
                  onChange({ ...f, side: v === 'both' ? undefined : v })
                }
              />
            )}
          </FilterChip>
          <FilterChip
            label={strategy.text}
            title="Strategy"
            active={strategy.active}
            disabled={disabled}
            unavailableNote={unavailableNote}
            onClear={() => onChange({ ...f, strategyIds: [] })}
          >
            {() => (
              <StrategyBody
                strategies={options.strategies}
                selected={f.strategyIds}
                onChange={(strategyIds) => onChange({ ...f, strategyIds })}
              />
            )}
          </FilterChip>
          <FilterChip
            label={tag.text}
            title="Tags"
            active={tag.active}
            disabled={disabled}
            unavailableNote={unavailableNote}
            onClear={() => onChange({ ...f, tagIds: [] })}
          >
            {() => (
              <TagBody
                tags={options.tags}
                categories={options.categories}
                selected={f.tagIds}
                onChange={(tagIds) => onChange({ ...f, tagIds })}
              />
            )}
          </FilterChip>
        </div>
      </div>
      <MoreFilters
        filters={f}
        options={options}
        onChange={onChange}
        disabled={disabled}
        unavailableNote={unavailableNote}
      />
      {noTrades ? (
        <span id={noteId} hidden>
          No trades to filter yet.
        </span>
      ) : null}
      {cleared ? null : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(EMPTY_FILTERS);
            first.current?.focus();
          }}
          // ml makes up the 6px the scroller's margin takes from the gap.
          className="ml-1.5 h-8 flex-none rounded-control px-2.5 text-[13px] font-semibold whitespace-nowrap text-accent-ink transition-colors duration-200 enabled:hover:bg-surface-1 pointer-coarse:h-11"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

/**
 * The chips on the URL's filters. Render inside `<Suspense>`: it reads the
 * search params. The chips show the cleaned filters, so a stale link's
 * unknown ids never appear; until the workspace loads they are inert and show
 * only the parts that hold no ids.
 */
export function FilterBar(): React.JSX.Element {
  const { filters, shown, setFilters } = useShownFilters();
  const trades = useTrades().data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const categories = useTagCategories().data;
  const timeZone = usePrefs().data?.timeZone;
  const options = useMemo<FilterOptions>(
    () => ({
      symbols: symbolOptions(trades),
      strategies: strategies ?? [],
      tags: tags ?? [],
      categories: categories ?? [],
    }),
    [trades, strategies, tags, categories],
  );

  if (!shown || timeZone === undefined) {
    return (
      <FilterBarView
        filters={switchWorkspaceFilters(filters)}
        options={NO_OPTIONS}
        today=""
        onChange={setFilters}
        disabled
      />
    );
  }
  return (
    <FilterBarView
      filters={shown}
      options={options}
      today={localDate(new Date().toISOString(), timeZone)}
      onChange={setFilters}
      noTrades={trades?.length === 0}
    />
  );
}

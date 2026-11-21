'use client';

import { Popover } from 'radix-ui';
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import {
  DATE_PRESETS,
  EMPTY_FILTERS,
  resolveRange,
  serializeFilters,
  type DatePreset,
  type DateRange,
  type GlobalFilters,
} from '@/data/filters';
import { useGlobalFilters, useTradeSet } from '@/data/query/derived';
import {
  usePrefs,
  useStrategies,
  useTags,
  useTrades,
} from '@/data/query/hooks';
import { localDate } from '@/domain/time';
import type { Strategy, Tag, TagCategory } from '@/domain/types';
import { PRESET_LABELS, rangeChipLabel } from '@/lib/range-label';
import {
  chipLabel,
  hasActiveFilters,
  switchWorkspaceFilters,
  toggleId,
  type FilterOptions,
} from './filter-model';

const NO_OPTIONS: FilterOptions = { symbols: [], strategies: [], tags: [] };

const CHIP =
  'inline-flex h-[30px] max-w-48 flex-none items-center rounded-chip border px-[9px] text-[12.5px] whitespace-nowrap transition-colors duration-120 pointer-coarse:h-11 pointer-coarse:px-3';
const CHIP_IDLE =
  'border-line bg-surface-1 text-muted enabled:hover:border-line-2 enabled:hover:text-text data-[state=open]:border-line-2 data-[state=open]:text-text';
const CHIP_ON = 'border-accent-soft bg-accent-soft text-accent-ink';

const PANEL =
  'z-50 flex max-h-[min(600px,var(--radix-popover-content-available-height))] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) flex-col rounded-control border border-line-2 bg-surface-1 text-text shadow-[var(--shadow-chip)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';

const ROW =
  'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-chip px-2 py-1 text-sm text-text hover:bg-sunken pointer-coarse:min-h-11';
const BOX = 'size-4 flex-none cursor-pointer accent-accent';
const GROUP_LABEL = 'px-2 pt-2 pb-1 text-xs text-faint';
const FIELD =
  'h-9 w-full min-w-0 rounded-control border border-line-2 bg-surface-1 px-2 text-text pointer-coarse:h-11';

function Empty({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="px-2 py-2 text-[13px] text-muted">{children}</p>;
}

/**
 * One chip and its popover. Enter or Space opens it, Escape closes it, and
 * focus goes back to the chip. While `disabled` it is the same chip, inert.
 */
function FilterChip({
  label,
  title,
  active,
  disabled,
  onClear,
  triggerRef,
  wide = false,
  children,
}: {
  label: string;
  /** The popover's name, and the chip's description while it shows a value. */
  title: string;
  active: boolean;
  disabled?: boolean;
  onClear(): void;
  triggerRef?: Ref<HTMLButtonElement>;
  /** Room for a pair of date fields side by side. */
  wide?: boolean;
  children(close: () => void): ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const look = `${CHIP} ${active ? CHIP_ON : CHIP_IDLE}`;
  const text = <span className="min-w-0 truncate">{label}</span>;

  // Going inert closes the popover, so it doesn't reopen by itself later.
  if (disabled && open) setOpen(false);
  if (disabled) {
    return (
      <button type="button" disabled aria-haspopup="dialog" className={look}>
        {text}
      </button>
    );
  }

  const close = () => setOpen(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        ref={triggerRef}
        aria-describedby={active ? descId : undefined}
        className={look}
      >
        {text}
      </Popover.Trigger>
      {active ? (
        <span id={descId} hidden>
          {title}
        </span>
      ) : null}
      <Popover.Portal>
        <Popover.Content
          ref={panel}
          aria-label={title}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => {
            // A single choice opens on the chosen option, as a radio group does.
            const chosen = panel.current?.querySelector<HTMLInputElement>(
              'input[type="radio"]:checked',
            );
            if (chosen) {
              e.preventDefault();
              chosen.focus();
            }
          }}
          className={`${PANEL} ${wide ? 'w-[300px]' : 'w-64'}`}
        >
          <div className="min-h-0 overflow-y-auto p-1.5">{children(close)}</div>
          <div className="flex flex-none justify-end border-t border-line p-1.5">
            <button
              type="button"
              disabled={!active}
              onClick={() => {
                onClear();
                close();
              }}
              className="h-8 rounded-chip px-2.5 text-[13px] font-medium text-muted transition-colors duration-120 enabled:hover:bg-sunken enabled:hover:text-text disabled:opacity-50 pointer-coarse:h-11"
            >
              Clear
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function RadioRows<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange(value: T): void;
}): React.JSX.Element {
  const name = useId();
  return (
    <fieldset className="flex flex-col">
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={ROW}>
          <input
            type="radio"
            name={name}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            className={BOX}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

function CheckRows({
  legend,
  legendVisible = false,
  items,
  selected,
  onToggle,
}: {
  legend: string;
  legendVisible?: boolean;
  items: readonly { id: string; label: ReactNode }[];
  selected: readonly string[];
  onToggle(id: string): void;
}): React.JSX.Element {
  return (
    <fieldset className="flex flex-col">
      <legend className={legendVisible ? GROUP_LABEL : 'sr-only'}>
        {legend}
      </legend>
      {items.map((item) => (
        <label key={item.id} className={ROW}>
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            onChange={() => onToggle(item.id)}
            className={BOX}
          />
          {item.label}
        </label>
      ))}
    </fieldset>
  );
}

type RangeChoice = DatePreset | 'all';

const RANGE_OPTIONS: readonly { value: RangeChoice; label: string }[] = [
  ...DATE_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] })),
  { value: 'all', label: 'All time' },
];

/** The range's dates, once there is a today to resolve a preset against. */
function datesOf(
  range: DateRange,
  today: string,
): { from?: string; to?: string } {
  if (!('preset' in range)) return range;
  return today === '' ? {} : resolveRange(range, today);
}

/** From and To as typed; either may be empty, and a reversed pair is swapped. */
function customRange(from: string, to: string): DateRange {
  const [a, b] =
    from !== '' && to !== '' && from > to ? [to, from] : [from, to];
  return { ...(a !== '' ? { from: a } : {}), ...(b !== '' ? { to: b } : {}) };
}

function DateBody({
  range,
  today,
  onChange,
  close,
}: {
  range: DateRange;
  today: string;
  onChange(range: DateRange): void;
  close(): void;
}): React.JSX.Element {
  const choice: RangeChoice | undefined =
    'preset' in range
      ? range.preset
      : range.from === undefined && range.to === undefined
        ? 'all'
        : undefined;
  const dates = datesOf(range, today);
  const shown = `${dates.from ?? ''}/${dates.to ?? ''}`;
  const [from, setFrom] = useState(dates.from ?? '');
  const [to, setTo] = useState(dates.to ?? '');
  // The pair follows the range in force, so a preset shows the dates it covers.
  const [synced, setSynced] = useState(shown);
  if (synced !== shown) {
    setSynced(shown);
    setFrom(dates.from ?? '');
    setTo(dates.to ?? '');
  }

  return (
    <>
      <RadioRows
        legend="Date range"
        options={RANGE_OPTIONS}
        value={choice}
        onChange={(v) => onChange(v === 'all' ? {} : { preset: v })}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onChange(customRange(from, to));
          close();
        }}
        className="mt-1.5 border-t border-line px-2 pt-1 pb-1.5"
      >
        <fieldset>
          <legend className="pt-2 pb-2 text-xs text-faint">Custom</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={`${FIELD} font-mono text-[12.5px]`}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={`${FIELD} font-mono text-[12.5px]`}
              />
            </label>
          </div>
        </fieldset>
        <button
          type="submit"
          className={`${buttonClasses('primary', 'sm')} mt-2.5 w-full text-[13px] pointer-coarse:h-11`}
        >
          Apply
        </button>
      </form>
    </>
  );
}

function SymbolBody({
  symbols,
  selected,
  onChange,
}: {
  symbols: readonly string[];
  selected: readonly string[];
  onChange(symbols: string[]): void;
}): React.JSX.Element {
  // A linked symbol the workspace doesn't trade still lists, so it can be unchecked.
  const all = useMemo(
    () => [...new Set([...symbols, ...selected])].sort(),
    [symbols, selected],
  );
  const [query, setQuery] = useState('');
  const needle = query.trim().toUpperCase();
  const shown = needle === '' ? all : all.filter((s) => s.includes(needle));

  if (all.length === 0) return <Empty>No symbols yet.</Empty>;
  return (
    <>
      {all.length > 8 ? (
        <input
          type="search"
          aria-label="Filter symbols"
          placeholder="Filter symbols"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${FIELD} mb-1.5 px-2.5 text-sm placeholder:text-faint`}
        />
      ) : null}
      {shown.length === 0 ? (
        <Empty>No symbols match.</Empty>
      ) : (
        <CheckRows
          legend="Symbols"
          items={shown.map((s) => ({
            id: s,
            label: <span className="font-mono text-[12.5px]">{s}</span>,
          }))}
          selected={selected}
          onToggle={(s) => onChange(toggleId(selected, s))}
        />
      )}
    </>
  );
}

function StrategyBody({
  strategies,
  selected,
  onChange,
}: {
  strategies: readonly Strategy[];
  selected: readonly string[];
  onChange(ids: string[]): void;
}): React.JSX.Element {
  if (strategies.length === 0) return <Empty>No strategies yet.</Empty>;
  const ordered = [...strategies].sort(
    (a, b) => Number(a.status === 'archived') - Number(b.status === 'archived'),
  );
  return (
    <CheckRows
      legend="Strategies"
      items={ordered.map((s) => ({
        id: s.id,
        label:
          s.status === 'archived' ? (
            <span>
              {s.name} <span className="text-faint">(archived)</span>
            </span>
          ) : (
            s.name
          ),
      }))}
      selected={selected}
      onToggle={(id) => onChange(toggleId(selected, id))}
    />
  );
}

const TAG_GROUPS: readonly { category: TagCategory; label: string }[] = [
  { category: 'setup', label: 'Setups' },
  { category: 'mistake', label: 'Mistakes' },
  { category: 'emotion', label: 'Emotions' },
  { category: 'custom', label: 'Custom' },
];

function TagBody({
  tags,
  selected,
  onChange,
}: {
  tags: readonly Tag[];
  selected: readonly string[];
  onChange(ids: string[]): void;
}): React.JSX.Element {
  if (tags.length === 0) return <Empty>No tags yet.</Empty>;
  return (
    <div className="flex flex-col gap-1">
      {TAG_GROUPS.map(({ category, label }) => {
        const inGroup = tags.filter((t) => t.category === category);
        if (inGroup.length === 0) return null;
        return (
          <CheckRows
            key={category}
            legend={label}
            legendVisible
            items={inGroup.map((t) => ({ id: t.id, label: t.name }))}
            selected={selected}
            onToggle={(id) => onChange(toggleId(selected, id))}
          />
        );
      })}
    </div>
  );
}

const SIDE_OPTIONS = [
  { value: 'both', label: 'Both' },
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
] as const;

/**
 * The top bar's filter chips: date, symbol, side, strategy and tags, then
 * "Clear filters" while any filter is set. Every choice calls `onChange` with
 * the whole next filter set.
 */
export function FilterBarView({
  filters: f,
  options,
  today,
  onChange,
  disabled = false,
}: {
  filters: GlobalFilters;
  options: FilterOptions;
  /** The trader's local date, YYYY-MM-DD; empty while unknown. */
  today: string;
  onChange(next: GlobalFilters): void;
  /** The Suspense fallback: same chips, inert. */
  disabled?: boolean;
}): React.JSX.Element {
  const first = useRef<HTMLButtonElement>(null);
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

  return (
    <div
      role="group"
      aria-label="Filters"
      className="flex flex-none items-center gap-2"
    >
      <FilterChip
        label={rangeChipLabel(f.range, datesOf(f.range, today))}
        title="Date"
        active={dateActive}
        disabled={disabled}
        onClear={() => onChange({ ...f, range: {} })}
        triggerRef={first}
        wide
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
        onClear={() => onChange({ ...f, tagIds: [] })}
      >
        {() => (
          <TagBody
            tags={options.tags}
            selected={f.tagIds}
            onChange={(tagIds) => onChange({ ...f, tagIds })}
          />
        )}
      </FilterChip>
      {hasActiveFilters(f) ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(EMPTY_FILTERS);
            first.current?.focus();
          }}
          className="h-[30px] flex-none rounded-chip px-2 text-[12.5px] font-medium whitespace-nowrap text-muted transition-colors duration-120 enabled:hover:bg-sunken enabled:hover:text-text pointer-coarse:h-11"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

/**
 * The URL's filters for a control to show and write. Render inside
 * `<Suspense>`: it reads the search params.
 *
 * - `filters`: the URL's, cleaned of unknown ids once the workspace's lists load.
 * - `shown`: the cleaned set from `useTradeSet`, so a stale link's unknown ids
 *   never show; `undefined` until the workspace loads. A write shows here at
 *   once: Next applies `history.replaceState` in a transition, and until it
 *   lands a controlled checkbox would flick back.
 */
export function useShownFilters(): {
  filters: GlobalFilters;
  shown: GlobalFilters | undefined;
  setFilters(next: GlobalFilters): void;
} {
  const { filters, setFilters } = useGlobalFilters();
  const clean = useTradeSet(filters).data?.filters;
  const urlKey = serializeFilters(filters).toString();
  const [written, setWritten] = useState<{
    next: GlobalFilters;
    over: string;
  } | null>(null);
  // Any change to the URL, the write landing or another, supersedes it.
  if (written !== null && written.over !== urlKey) setWritten(null);
  const write = useCallback(
    (next: GlobalFilters) => {
      setWritten({ next, over: urlKey });
      setFilters(next);
    },
    [urlKey, setFilters],
  );
  const shown =
    clean === undefined
      ? undefined
      : written?.over === urlKey
        ? written.next
        : clean;
  return { filters, shown, setFilters: write };
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
  const timeZone = usePrefs().data?.timeZone;
  const options = useMemo<FilterOptions>(
    () => ({
      symbols: [
        ...new Set((trades ?? []).map((t) => t.instrument.root)),
      ].sort(),
      strategies: strategies ?? [],
      tags: tags ?? [],
    }),
    [trades, strategies, tags],
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
    />
  );
}

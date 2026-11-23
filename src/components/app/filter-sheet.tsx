'use client';

import { CaretDown, Funnel, X } from '@phosphor-icons/react/dist/ssr';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog } from 'radix-ui';
import { useId, useRef, useState, type ReactNode } from 'react';
import { RAISED } from '@/components/ui/button-styles';
import { Chip } from '@/components/ui/chip';
import { EMPTY_FILTERS, type GlobalFilters } from '@/data/filters';
import { enter, exit } from '@/lib/motion';
import { rangeChipLabel } from '@/lib/range-label';
import { RadioRows } from './filter-chip';
import {
  activeFilterCount,
  chipLabel,
  datesOf,
  hasActiveFilters,
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

const BUTTON =
  'inline-flex h-11 flex-none cursor-pointer items-center gap-2 rounded-control border border-line bg-surface-1 px-3.5 text-[13.5px] font-semibold text-text shadow-[var(--shadow-chip)] transition-[border-color] duration-200 ease-(--ease-glide) enabled:hover:border-accent/35 data-[state=open]:border-accent/35 disabled:cursor-default';

type Key = 'date' | 'symbol' | 'side' | 'strategy' | 'tags';

/** One row of the sheet: its name, what it is set to, and, opened, its choices. */
function Row({
  title,
  value,
  set,
  open,
  onToggle,
  onClear,
  children,
}: {
  title: string;
  value: string;
  set: boolean;
  open: boolean;
  onToggle(): void;
  /** Absent for a row whose own choices include the way back (the date's All time, the side's Both). */
  onClear?: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const panel = useId();
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={onToggle}
        className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 text-left hover:bg-sunken"
      >
        <span className="w-[72px] flex-none text-[14px] font-semibold text-text">
          {title}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[13.5px] ${set ? 'font-semibold text-text' : 'text-faint'}`}
        >
          {value}
        </span>
        <CaretDown
          size={14}
          aria-hidden="true"
          className={`flex-none text-faint transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div id={panel} hidden={!open} className="px-1.5 pb-2">
        {open ? (
          <>
            {children}
            {onClear && set ? (
              <button
                type="button"
                onClick={onClear}
                className="mt-1 ml-2 inline-flex h-8 cursor-pointer items-center rounded-[8px] px-2.5 text-[13px] font-semibold text-accent-ink hover:bg-accent-soft pointer-coarse:h-11"
              >
                Clear {title.toLowerCase()}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Below `sm` the chips are one "Filters (n)" button. It opens a sheet from the
 * bottom edge holding the same controls as the chips' popovers, one row each
 * showing what it is set to, and the More filters entry. A choice applies at
 * once, as in a popover. Focus returns to the button when the sheet closes.
 */
export function FilterSheet({
  filters: f,
  options,
  today,
  onChange,
  disabled = false,
  noTrades = false,
}: {
  filters: GlobalFilters;
  options: FilterOptions;
  today: string;
  onChange(next: GlobalFilters): void;
  disabled?: boolean;
  noTrades?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<Key | null>(null);
  const reduced = useReducedMotion();
  const noteId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const count = activeFilterCount(f);
  const name = count > 0 ? `Filters, ${count} active` : 'Filters';
  const face = (
    <>
      <Funnel
        size={16}
        aria-hidden="true"
        className="flex-none text-accent-ink"
      />
      <span>Filters</span>
      {count > 0 ? (
        <Chip
          tone="accent"
          className="h-[18px] min-w-[18px] justify-center px-1 text-[11px]"
        >
          {count}
        </Chip>
      ) : null}
    </>
  );

  if (disabled || noTrades) {
    return (
      <>
        <button
          type="button"
          disabled={disabled}
          aria-disabled={noTrades ? 'true' : undefined}
          aria-describedby={noTrades ? noteId : undefined}
          aria-label={name}
          className={`${BUTTON} ${noTrades ? 'border-dashed border-line-2 bg-transparent text-faint shadow-none' : ''}`}
        >
          {face}
        </button>
        {noTrades ? (
          <span id={noteId} hidden>
            No trades to filter yet.
          </span>
        ) : null}
      </>
    );
  }

  const names = {
    strategies: new Map(options.strategies.map((s) => [s.id, s.name])),
    tags: new Map(options.tags.map((t) => [t.id, t.name])),
  };
  const symbol = chipLabel('symbol', f, names);
  const side = chipLabel('side', f, names);
  const strategy = chipLabel('strategy', f, names);
  const tag = chipLabel('tag', f, names);
  const range = f.range;
  const dateSet =
    'preset' in range || range.from !== undefined || range.to !== undefined;
  const toggle = (key: Key) => setRow((r) => (r === key ? null : key));

  const rise = reduced
    ? { initial: { opacity: 0 }, shown: { opacity: 1 }, gone: { opacity: 0 } }
    : { initial: { y: '100%' }, shown: { y: 0 }, gone: { y: '100%' } };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setRow(null);
      }}
    >
      <Dialog.Trigger
        aria-label={name}
        aria-haspopup="dialog"
        className={BUTTON}
      >
        {face}
      </Dialog.Trigger>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-veil"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: enter }}
                exit={{ opacity: 0, transition: exit }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-describedby={undefined}
              onOpenAutoFocus={(e) => {
                // The heading names the sheet; the first row is a keystroke away.
                e.preventDefault();
                heading.current?.focus();
              }}
            >
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[16px] border-t border-line bg-surface-1 text-text shadow-[var(--shadow)] outline-none"
                initial={rise.initial}
                animate={{ ...rise.shown, transition: enter }}
                exit={{ ...rise.gone, transition: exit }}
              >
                <div className="flex flex-none items-center justify-between border-b border-line py-1 pr-2 pl-4">
                  <Dialog.Title
                    ref={heading}
                    tabIndex={-1}
                    className="text-[15px] font-semibold outline-none"
                  >
                    Filters
                  </Dialog.Title>
                  <Dialog.Close
                    aria-label="Close"
                    className="inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-text"
                  >
                    <X size={18} aria-hidden="true" />
                  </Dialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                  <Row
                    title="Date"
                    value={rangeChipLabel(f.range, datesOf(f.range, today))}
                    set={dateSet}
                    open={row === 'date'}
                    onToggle={() => toggle('date')}
                  >
                    <DateBody
                      range={f.range}
                      today={today}
                      onChange={(r) => onChange({ ...f, range: r })}
                      close={() => setRow(null)}
                    />
                  </Row>
                  <Row
                    title="Symbol"
                    value={symbol.active ? symbol.text : 'Any'}
                    set={symbol.active}
                    open={row === 'symbol'}
                    onToggle={() => toggle('symbol')}
                    onClear={() => onChange({ ...f, symbols: [] })}
                  >
                    <SymbolBody
                      symbols={options.symbols}
                      selected={f.symbols}
                      onChange={(symbols) => onChange({ ...f, symbols })}
                    />
                  </Row>
                  <Row
                    title="Side"
                    value={side.active ? side.text : 'Both'}
                    set={side.active}
                    open={row === 'side'}
                    onToggle={() => toggle('side')}
                  >
                    <RadioRows
                      legend="Side"
                      options={SIDE_OPTIONS}
                      value={f.side ?? 'both'}
                      onChange={(v) =>
                        onChange({ ...f, side: v === 'both' ? undefined : v })
                      }
                    />
                  </Row>
                  <Row
                    title="Strategy"
                    value={strategy.active ? strategy.text : 'Any'}
                    set={strategy.active}
                    open={row === 'strategy'}
                    onToggle={() => toggle('strategy')}
                    onClear={() => onChange({ ...f, strategyIds: [] })}
                  >
                    <StrategyBody
                      strategies={options.strategies}
                      selected={f.strategyIds}
                      onChange={(strategyIds) =>
                        onChange({ ...f, strategyIds })
                      }
                    />
                  </Row>
                  <Row
                    title="Tags"
                    value={tag.active ? tag.text : 'Any'}
                    set={tag.active}
                    open={row === 'tags'}
                    onToggle={() => toggle('tags')}
                    onClear={() => onChange({ ...f, tagIds: [] })}
                  >
                    <TagBody
                      tags={options.tags}
                      categories={options.categories}
                      selected={f.tagIds}
                      onChange={(tagIds) => onChange({ ...f, tagIds })}
                    />
                  </Row>
                  <div className="pt-1">
                    <MoreFilters
                      row
                      filters={f}
                      options={options}
                      onChange={onChange}
                    />
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2 border-t border-line px-4 py-3">
                  {hasActiveFilters(f) ? (
                    <button
                      type="button"
                      onClick={() => onChange(EMPTY_FILTERS)}
                      className="-ml-2 mr-auto inline-flex h-11 cursor-pointer items-center rounded-[8px] px-2.5 text-[13.5px] font-semibold text-accent-ink hover:bg-accent-soft"
                    >
                      Clear filters
                    </button>
                  ) : null}
                  <Dialog.Close
                    className={`ml-auto inline-flex h-11 cursor-pointer items-center justify-center rounded-control px-[18px] text-[13.5px] font-semibold select-none ${RAISED}`}
                  >
                    Done
                  </Dialog.Close>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

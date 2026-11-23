'use client';

import {
  CaretRight,
  Plus,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react/dist/ssr';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog, Popover } from 'radix-ui';
import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { RAISED } from '@/components/ui/button-styles';
import { Chip } from '@/components/ui/chip';
import { Segmented } from '@/components/ui/segmented';
import {
  advancedFilterCount,
  EMPTY_FILTERS,
  type GlobalFilters,
  type NumRange,
  type Outcome,
  type Rating,
  type TimeWindow,
} from '@/data/filters';
import { enter, exit } from '@/lib/motion';
import { FIELD } from './filter-chip';
import type { FilterOptions } from './filter-model';
import { toggleId } from './filter-model';

const MD = '(min-width: 768px)';

/** Whether the viewport is `md` or wider. Prerenders as wide; the closed button looks the same either way. */
function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = matchMedia(MD);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () => matchMedia(MD).matches,
    () => true,
  );
}

const WEEKDAYS = [
  [1, 'Mon', 'Monday'],
  [2, 'Tue', 'Tuesday'],
  [3, 'Wed', 'Wednesday'],
  [4, 'Thu', 'Thursday'],
  [5, 'Fri', 'Friday'],
  [6, 'Sat', 'Saturday'],
  [7, 'Sun', 'Sunday'],
] as const;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const OUTCOME_ITEMS: readonly { id: Outcome; label: string }[] = [
  { id: 'win', label: 'Wins' },
  { id: 'loss', label: 'Losses' },
  { id: 'breakeven', label: 'Breakeven' },
];

const TOGGLE =
  'relative inline-flex h-8 cursor-pointer items-center rounded-full border border-line bg-surface-1 px-3 text-[13px] font-medium whitespace-nowrap text-muted transition-[background-color,border-color,color] duration-200 ease-(--ease-glide) select-none hover:border-line-2 has-[:checked]:border-accent/35 has-[:checked]:bg-accent-soft has-[:checked]:font-semibold has-[:checked]:text-accent-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent pointer-coarse:h-11 pointer-coarse:px-4';
const LEGEND = 'mb-1.5 text-[12px] font-medium text-faint';
const HEADING = 'text-[14px] font-semibold text-text';
const GHOST =
  'inline-flex h-8 flex-none cursor-pointer items-center justify-center gap-1 rounded-[8px] px-2.5 text-[13px] font-semibold text-accent-ink transition-colors duration-200 hover:bg-accent-soft pointer-coarse:h-11';

/** Any number of choices, as pills over native checkboxes. */
function Toggles({
  legend,
  items,
  selected,
  onToggle,
}: {
  legend: string;
  items: readonly {
    id: string;
    label: ReactNode;
    /** The accessible name when the words shown are short. */
    name?: string;
  }[];
  selected: readonly string[];
  onToggle(id: string): void;
}): React.JSX.Element {
  return (
    <fieldset className="min-w-0">
      <legend className={LEGEND}>{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <label key={item.id} className={TOGGLE}>
            <input
              type="checkbox"
              aria-label={item.name}
              checked={selected.includes(item.id)}
              onChange={() => onToggle(item.id)}
              className="sr-only"
            />
            {item.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** One choice or none ("Any"), as a segmented control under a visible name. */
function Choice<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange(value: T | undefined): void;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <p aria-hidden="true" className={LEGEND}>
        {legend}
      </p>
      <Segmented<T | 'any'>
        label={legend}
        coarseTargets
        options={[{ value: 'any', label: 'Any' }, ...options]}
        value={value ?? 'any'}
        onChange={(v) => onChange(v === 'any' ? undefined : v)}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 py-4">
      <h3 id={id} className={HEADING}>
        {title}
      </h3>
      {children}
    </section>
  );
}

const TIME_FIELD = `${FIELD} w-28 flex-none font-mono text-[13px]`;

/** Windows of the local day, each a pair of time fields. A window may leave one end open or run past midnight. */
function WindowsField({
  legend,
  windows,
  onChange,
}: {
  legend: string;
  windows: readonly TimeWindow[];
  onChange(next: TimeWindow[]): void;
}): React.JSX.Element {
  const set = (i: number, patch: Partial<Record<'from' | 'to', string>>) =>
    onChange(
      windows.map((w, at) => {
        if (at !== i) return w;
        const next = { ...w, ...patch };
        return {
          ...(next.from ? { from: next.from } : {}),
          ...(next.to ? { to: next.to } : {}),
        };
      }),
    );
  return (
    <fieldset className="min-w-0">
      <legend className={LEGEND}>{legend}</legend>
      <div className="flex flex-col gap-2">
        {windows.map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="time"
              aria-label={`${legend} window ${i + 1}, from`}
              value={w.from ?? ''}
              onChange={(e) => set(i, { from: e.target.value })}
              className={TIME_FIELD}
            />
            <span aria-hidden="true" className="text-[13px] text-faint">
              to
            </span>
            <input
              type="time"
              aria-label={`${legend} window ${i + 1}, to`}
              value={w.to ?? ''}
              onChange={(e) => set(i, { to: e.target.value })}
              className={TIME_FIELD}
            />
            <button
              type="button"
              aria-label={`Remove ${legend.toLowerCase()} window ${i + 1}`}
              onClick={() => onChange(windows.filter((_, at) => at !== i))}
              className="inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-[8px] text-muted transition-colors duration-200 hover:bg-sunken hover:text-text pointer-coarse:size-11"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...windows, {}])}
          className={`${GHOST} -ml-2.5 self-start`}
        >
          <Plus size={13} weight="bold" aria-hidden="true" />
          Add window
        </button>
      </div>
    </fieldset>
  );
}

/** What a number field holds while it is typed: blank, or a number. Anything else is not yet a value. */
function parseBound(text: string): number | undefined | 'invalid' {
  const t = text.trim();
  if (t === '') return undefined;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : 'invalid';
}

function boundText(n: number | undefined): string {
  return n === undefined ? '' : String(n);
}

/** A Min and a Max. Text that is not a number yet (a lone "-") waits; it is not written. */
function RangeField({
  legend,
  unit,
  range,
  onChange,
}: {
  legend: string;
  unit?: string;
  range: NumRange | undefined;
  onChange(next: NumRange | undefined): void;
}): React.JSX.Element {
  const [min, setMin] = useState(boundText(range?.min));
  const [max, setMax] = useState(boundText(range?.max));
  // Reset or any outside change shows here; the text typed so far stays while it matches.
  const [seen, setSeen] = useState(range);
  if (seen !== range) {
    setSeen(range);
    if (parseBound(min) !== range?.min) setMin(boundText(range?.min));
    if (parseBound(max) !== range?.max) setMax(boundText(range?.max));
  }
  const commit = (lo: string, hi: string) => {
    const a = parseBound(lo);
    const b = parseBound(hi);
    if (a === 'invalid' || b === 'invalid') return;
    onChange(
      a === undefined && b === undefined
        ? undefined
        : {
            ...(a !== undefined ? { min: a } : {}),
            ...(b !== undefined ? { max: b } : {}),
          },
    );
  };
  const field = (
    label: string,
    text: string,
    set: (v: string) => void,
    other: (v: string) => [string, string],
  ) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-muted">
      {label}
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${legend}, ${label.toLowerCase()}${unit ? ` (${unit})` : ''}`}
        aria-invalid={parseBound(text) === 'invalid' || undefined}
        value={text}
        onChange={(e) => {
          set(e.target.value);
          commit(...other(e.target.value));
        }}
        className={`${FIELD} font-mono text-[13px] aria-invalid:border-loss`}
      />
    </label>
  );
  return (
    <fieldset className="min-w-0">
      <legend className={LEGEND}>
        {legend}
        {unit ? <span className="font-normal"> ({unit})</span> : null}
      </legend>
      <div className="flex gap-2">
        {field('Min', min, setMin, (v) => [v, max])}
        {field('Max', max, setMax, (v) => [min, v])}
      </div>
    </fieldset>
  );
}

/** `list` with `n` added or removed, ascending. */
function toggleNumber(list: readonly number[], n: number): number[] {
  const out = new Set(list);
  if (out.has(n)) out.delete(n);
  else out.add(n);
  return [...out].sort((a, b) => a - b);
}

/** The panel's fields back to nothing; the date, accounts, symbols, side and tag chips are kept. */
function resetDraft(f: GlobalFilters): GlobalFilters {
  return {
    ...EMPTY_FILTERS,
    range: f.range,
    accountIds: f.accountIds,
    symbols: f.symbols,
    tagIds: f.tagIds,
    ...(f.side ? { side: f.side } : {}),
  };
}

/** The draft as it is written: no empty windows. */
function tidy(f: GlobalFilters): GlobalFilters {
  const real = (w: TimeWindow) => w.from !== undefined || w.to !== undefined;
  return {
    ...f,
    entryWindows: f.entryWindows.filter(real),
    exitWindows: f.exitWindows.filter(real),
  };
}

/**
 * The panel's fields over a draft of the filters. Nothing is written until
 * Apply; Cancel and Escape drop the draft, and Reset empties it.
 */
function Panel({
  filters,
  options,
  onApply,
  onClose,
}: {
  filters: GlobalFilters;
  options: FilterOptions;
  onApply(next: GlobalFilters): void;
  onClose(): void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(filters);
  // Bumped by Reset so the number fields drop what they were typing.
  const [round, setRound] = useState(0);
  const patch = (p: Partial<GlobalFilters>) =>
    setDraft((d) => ({ ...d, ...p }));
  const strategyItems = [...options.strategies]
    .sort(
      (a, b) =>
        Number(a.status === 'archived') - Number(b.status === 'archived'),
    )
    .map((s) => ({
      id: s.id,
      label: s.status === 'archived' ? `${s.name} (archived)` : s.name,
    }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply(tidy(draft));
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto px-4">
        <Section title="General">
          <Toggles
            legend="Outcome"
            items={OUTCOME_ITEMS}
            selected={draft.outcomes}
            onToggle={(id) =>
              patch({ outcomes: toggleId(draft.outcomes, id) as Outcome[] })
            }
          />
          <div className="flex flex-wrap gap-x-5 gap-y-4">
            <Choice
              legend="Status"
              options={[
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
              ]}
              value={draft.status}
              onChange={(status) => patch({ status })}
            />
            <Choice
              legend="Holding"
              options={[
                { value: 'intraday', label: 'Intraday' },
                { value: 'multiday', label: 'Multiday' },
              ]}
              value={draft.holding}
              onChange={(holding) => patch({ holding })}
            />
            <Choice
              legend="Reviewed"
              options={[
                { value: 'yes', label: 'Reviewed' },
                { value: 'no', label: 'Not reviewed' },
              ]}
              value={
                draft.reviewed === undefined
                  ? undefined
                  : draft.reviewed
                    ? 'yes'
                    : 'no'
              }
              onChange={(v) =>
                patch({ reviewed: v === undefined ? undefined : v === 'yes' })
              }
            />
          </div>
          <Toggles
            legend="Rating"
            items={[1, 2, 3, 4, 5].map((n) => ({
              id: String(n),
              label: String(n),
              name: n === 1 ? '1 star' : `${n} stars`,
            }))}
            selected={draft.ratings.map(String)}
            onToggle={(id) =>
              patch({
                ratings: toggleNumber(draft.ratings, Number(id)) as Rating[],
              })
            }
          />
          {options.symbols.length > 0 ? (
            <Toggles
              legend="Exclude symbols"
              items={options.symbols.map((s) => ({
                id: s,
                label: <span className="font-mono text-[12.5px]">{s}</span>,
                name: s,
              }))}
              selected={draft.excludeSymbols}
              onToggle={(id) =>
                patch({ excludeSymbols: toggleId(draft.excludeSymbols, id) })
              }
            />
          ) : null}
        </Section>

        <Section title="Day and time">
          <Toggles
            legend="Weekday"
            items={WEEKDAYS.map(([n, short, name]) => ({
              id: String(n),
              label: short,
              name,
            }))}
            selected={draft.weekdays.map(String)}
            onToggle={(id) =>
              patch({ weekdays: toggleNumber(draft.weekdays, Number(id)) })
            }
          />
          <Toggles
            legend="Month"
            items={MONTHS.map((name, i) => ({
              id: String(i + 1),
              label: name.slice(0, 3),
              name,
            }))}
            selected={draft.months.map(String)}
            onToggle={(id) =>
              patch({ months: toggleNumber(draft.months, Number(id)) })
            }
          />
          <WindowsField
            legend="Entry time"
            windows={draft.entryWindows}
            onChange={(entryWindows) => patch({ entryWindows })}
          />
          <WindowsField
            legend="Exit time"
            windows={draft.exitWindows}
            onChange={(exitWindows) => patch({ exitWindows })}
          />
          <RangeField
            key={`dur${round}`}
            legend="Duration"
            unit="minutes"
            range={draft.duration}
            onChange={(duration) => patch({ duration })}
          />
        </Section>

        <Section title="Strategy">
          {strategyItems.length > 0 ? (
            <>
              <Toggles
                legend="Include"
                items={strategyItems}
                selected={draft.strategyIds}
                onToggle={(id) =>
                  patch({ strategyIds: toggleId(draft.strategyIds, id) })
                }
              />
              <Toggles
                legend="Exclude"
                items={strategyItems}
                selected={draft.excludeStrategyIds}
                onToggle={(id) =>
                  patch({
                    excludeStrategyIds: toggleId(draft.excludeStrategyIds, id),
                  })
                }
              />
            </>
          ) : (
            <p className="text-[13px] text-muted">No strategies yet.</p>
          )}
          <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
            <div className="min-w-0">
              <p aria-hidden="true" className={LEGEND}>
                Trade must have
              </p>
              <Segmented
                label="Strategy match"
                coarseTargets
                options={[
                  { value: 'any', label: 'Any selected' },
                  { value: 'all', label: 'All selected' },
                ]}
                value={draft.strategyMatch}
                onChange={(strategyMatch) => patch({ strategyMatch })}
              />
            </div>
            <label className={TOGGLE}>
              <input
                type="checkbox"
                checked={draft.noStrategy}
                onChange={(e) => patch({ noStrategy: e.target.checked })}
                className="sr-only"
              />
              No strategy
            </label>
          </div>
        </Section>

        <Section title="Tags">
          {options.tags.length === 0 ? (
            <p className="text-[13px] text-muted">No tags yet.</p>
          ) : (
            options.categories.map((category) => {
              const inGroup = options.tags.filter(
                (t) => t.categoryId === category.id,
              );
              if (inGroup.length === 0) return null;
              return (
                <Toggles
                  key={category.id}
                  legend={`Exclude, ${category.name}`}
                  items={inGroup.map((t) => ({ id: t.id, label: t.name }))}
                  selected={draft.excludeTagIds}
                  onToggle={(id) =>
                    patch({ excludeTagIds: toggleId(draft.excludeTagIds, id) })
                  }
                />
              );
            })
          )}
          <div className="min-w-0">
            <p aria-hidden="true" className={LEGEND}>
              Trade must have
            </p>
            <Segmented
              label="Tag match"
              coarseTargets
              options={[
                { value: 'any', label: 'Any selected' },
                { value: 'all', label: 'All selected' },
              ]}
              value={draft.tagMatch}
              onChange={(tagMatch) => patch({ tagMatch })}
            />
          </div>
        </Section>

        <Section title="Ranges">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <RangeField
              key={`ep${round}`}
              legend="Entry price"
              range={draft.entryPrice}
              onChange={(entryPrice) => patch({ entryPrice })}
            />
            <RangeField
              key={`xp${round}`}
              legend="Exit price"
              range={draft.exitPrice}
              onChange={(exitPrice) => patch({ exitPrice })}
            />
            <RangeField
              key={`size${round}`}
              legend="Size"
              unit="largest position"
              range={draft.size}
              onChange={(size) => patch({ size })}
            />
            <RangeField
              key={`r${round}`}
              legend="Realized R"
              range={draft.r}
              onChange={(r) => patch({ r })}
            />
          </div>
        </Section>
      </div>
      <div className="flex flex-none items-center gap-2 border-t border-line px-4 py-3">
        <button
          type="button"
          onClick={() => {
            setDraft(resetDraft(draft));
            setRound((n) => n + 1);
          }}
          className={`${GHOST} -ml-2.5 mr-auto`}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 cursor-pointer items-center justify-center rounded-control border border-line-2 bg-surface-1 px-4 text-[13.5px] font-semibold text-text transition-colors duration-200 select-none hover:border-faint pointer-coarse:h-11"
        >
          Cancel
        </button>
        <button
          type="submit"
          className={`inline-flex h-9 cursor-pointer items-center justify-center rounded-control px-[18px] text-[13.5px] font-semibold select-none ${RAISED} pointer-coarse:h-11`}
        >
          Apply
        </button>
      </div>
    </form>
  );
}

/**
 * An icon in a chip's box. The top bar's chips fit beside the title at 1280px
 * by a few pixels, so this one carries no words: its name is for assistive
 * tech and the tooltip, and the count sits on its corner, outside its width.
 */
const TRIGGER =
  'relative -ml-1 inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-control border border-line bg-surface-1 text-muted shadow-[var(--shadow-chip)] transition-[border-color,color] duration-200 ease-(--ease-glide) enabled:hover:border-accent/35 enabled:hover:text-text data-[state=open]:border-accent/35 data-[state=open]:text-text disabled:cursor-default pointer-coarse:size-11';

/** In the phone's Filters sheet it is a full row, named in words, like the sheet's other rows. */
const ROW_TRIGGER =
  'flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-[10px] px-3 text-left text-[14px] font-semibold text-text hover:bg-sunken data-[state=open]:bg-sunken pointer-coarse:min-h-12';

function RowFace({ count }: { count: number }): React.JSX.Element {
  return (
    <>
      <SlidersHorizontal
        size={16}
        aria-hidden="true"
        className="flex-none text-accent-ink"
      />
      <span className="min-w-0 flex-1">More filters</span>
      {count > 0 ? (
        <Chip
          tone="accent"
          className="h-[18px] min-w-[18px] justify-center px-1 text-[11px]"
        >
          {count}
        </Chip>
      ) : null}
      <CaretRight
        size={14}
        aria-hidden="true"
        className="flex-none text-faint"
      />
    </>
  );
}

function TriggerFace({ count }: { count: number }): React.JSX.Element {
  return (
    <>
      <SlidersHorizontal
        size={16}
        aria-hidden="true"
        className="flex-none text-accent-ink"
      />
      {count > 0 ? (
        <Chip
          tone="accent"
          className="absolute -top-2 -right-2 h-[18px] min-w-[18px] justify-center px-1 text-[11px] ring-2 ring-bg"
        >
          {count}
        </Chip>
      ) : null}
    </>
  );
}

const PANEL =
  'z-50 flex max-h-[min(680px,var(--radix-popover-content-available-height))] w-[440px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) flex-col overflow-hidden rounded-[12px] border border-line bg-surface-1 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';

/**
 * The "More filters" button and its panel: a popover from `md`, a sheet from
 * the bottom below it. Both are dialogs that hold focus. The count on the
 * button is how many of the panel's fields are in use; the panel edits a
 * draft until Apply.
 */
export function MoreFilters({
  filters,
  options,
  onChange,
  disabled = false,
  unavailableNote,
  row = false,
}: {
  filters: GlobalFilters;
  options: FilterOptions;
  onChange(next: GlobalFilters): void;
  /** A full-width row in the phone's Filters sheet, not the bar's icon. Always the bottom sheet. */
  row?: boolean;
  /** The Suspense fallback: the same button, inert. */
  disabled?: boolean;
  /** The id of a note saying why there is nothing to filter; the button keeps its tab stop and opens nothing. */
  unavailableNote?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const wide = useWide() && !row;
  const reduced = useReducedMotion();
  const count = advancedFilterCount(filters);
  const label = count > 0 ? `More filters, ${count} active` : 'More filters';
  const inert = disabled || unavailableNote !== undefined;

  // Going inert closes the panel, so it doesn't reopen by itself later.
  if (inert && open) setOpen(false);

  if (inert) {
    return (
      <button
        type="button"
        disabled={disabled}
        aria-disabled={unavailableNote ? 'true' : undefined}
        aria-describedby={unavailableNote}
        aria-haspopup="dialog"
        aria-label={label}
        title="More filters"
        className={`${row ? ROW_TRIGGER : TRIGGER} ${unavailableNote ? 'cursor-default border-dashed border-line-2 bg-transparent text-faint shadow-none' : ''}`}
      >
        {row ? <RowFace count={count} /> : <TriggerFace count={count} />}
      </button>
    );
  }

  const close = () => setOpen(false);
  const apply = (next: GlobalFilters) => {
    onChange(next);
    close();
  };
  const panel = (
    <Panel
      filters={filters}
      options={options}
      onApply={apply}
      onClose={close}
    />
  );

  if (wide) {
    return (
      <Popover.Root modal open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label={label}
          title="More filters"
          className={TRIGGER}
        >
          <TriggerFace count={count} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            aria-label="More filters"
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className={PANEL}
          >
            {panel}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  const rise = reduced
    ? { initial: { opacity: 0 }, shown: { opacity: 1 }, gone: { opacity: 0 } }
    : { initial: { y: '100%' }, shown: { y: 0 }, gone: { y: '100%' } };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={label}
        title={row ? undefined : 'More filters'}
        className={row ? ROW_TRIGGER : TRIGGER}
      >
        {row ? <RowFace count={count} /> : <TriggerFace count={count} />}
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
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[16px] border-t border-line bg-surface-1 text-text shadow-[var(--shadow)] outline-none"
                initial={rise.initial}
                animate={{ ...rise.shown, transition: enter }}
                exit={{ ...rise.gone, transition: exit }}
              >
                <div className="flex flex-none items-center justify-between border-b border-line py-1 pr-2 pl-4">
                  <Dialog.Title className="text-[15px] font-semibold">
                    More filters
                  </Dialog.Title>
                  <Dialog.Close
                    aria-label="Close"
                    className="inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-text"
                  >
                    <X size={18} aria-hidden="true" />
                  </Dialog.Close>
                </div>
                {panel}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

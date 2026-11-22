'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { RAISED } from '@/components/ui/button-styles';
import { DATE_PRESETS, type DatePreset, type DateRange } from '@/data/filters';
import type { Strategy, Tag, TagCategory } from '@/domain/types';
import { PRESET_LABELS } from '@/lib/range-label';
import { CheckRows, FIELD, RadioRows } from './filter-chip';
import { customRange, datesOf, toggleId } from './filter-model';

function Empty({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="px-2 py-2 text-[13px] text-muted">{children}</p>;
}

type RangeChoice = DatePreset | 'all';

const RANGE_OPTIONS: readonly { value: RangeChoice; label: string }[] = [
  ...DATE_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] })),
  { value: 'all', label: 'All time' },
];

export const SIDE_OPTIONS = [
  { value: 'both', label: 'Both' },
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
] as const;

/** The presets and All time apply at once; a custom From/To pair applies with Apply. */
export function DateBody({
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
          <legend className="pt-2 pb-2 text-[12px] font-medium text-faint">
            Custom
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1 text-[12px] text-muted">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={`${FIELD} font-mono text-[13px]`}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-[12px] text-muted">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={`${FIELD} font-mono text-[13px]`}
              />
            </label>
          </div>
        </fieldset>
        <button
          type="submit"
          className={`mt-2.5 inline-flex h-9 w-full items-center justify-center rounded-control text-[13.5px] font-semibold select-none ${RAISED} pointer-coarse:h-11`}
        >
          Apply
        </button>
      </form>
    </>
  );
}

/** The workspace's symbol roots, with a filter box past eight. */
export function SymbolBody({
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
          className={`${FIELD} mb-1.5 px-2.5 text-[13.5px] placeholder:text-faint`}
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

/** Strategies, archived ones last and marked. */
export function StrategyBody({
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

/** Tags grouped by category, in the categories' order. */
export function TagBody({
  tags,
  categories,
  selected,
  onChange,
}: {
  tags: readonly Tag[];
  categories: readonly TagCategory[];
  selected: readonly string[];
  onChange(ids: string[]): void;
}): React.JSX.Element {
  if (tags.length === 0) return <Empty>No tags yet.</Empty>;
  return (
    <div className="flex flex-col gap-1">
      {categories.map((category) => {
        const inGroup = tags.filter((t) => t.categoryId === category.id);
        if (inGroup.length === 0) return null;
        return (
          <CheckRows
            key={category.id}
            legend={category.name}
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

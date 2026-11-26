'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  EMPTY_FILTERS,
  parseFilters,
  serializeFilters,
  type DateRange,
} from '@/data/filters';
import { usePrefs } from '@/data/query/hooks';
import type { PropFilters } from '@/domain/prop/finance';
import { localDate } from '@/domain/time';
import { datesOf } from '../filter-model';
import {
  NO_SELECTION,
  parseSelection,
  propFilters,
  selectionCount,
  setSelection,
  type PropSelection,
} from './prop-filter-params';

const RANGE_PARAMS = ['range', 'from', 'to'] as const;

/** Changes the address bar's parameters in place, as the other filters do. */
function write(change: (params: URLSearchParams) => void): void {
  const params = new URLSearchParams(window.location.search);
  change(params);
  const qs = params.toString();
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (qs ? `?${qs}` : ''),
  );
}

export interface PropFilterState {
  /** The six filters. */
  selection: PropSelection;
  /** The global date range as the address holds it (a preset or two dates). */
  range: DateRange;
  /** The range's own dates, resolved against today. */
  dates: { from?: string; to?: string };
  /** Everything the finance functions filter by: the six filters and the resolved range. */
  filters: PropFilters;
  /** How many of the six are set. */
  selected: number;
  /** Whether the date range narrows anything. */
  dateSet: boolean;
  /** Whether anything narrows the page: a filter or the range. */
  any: boolean;
  /** The local date today, in the profile zone; empty until the profile loads. */
  today: string;
  setSelection(next: PropSelection): void;
  setRange(next: DateRange): void;
  /** Drops every filter and the range. */
  clear(): void;
}

/**
 * The prop pages' filters, kept in the address (C37): the six filters under
 * their own names and the global date range under the trade filters' (`range`,
 * or `from` and `to`), which the date chip writes. Render inside
 * `<Suspense>`: it reads the search params.
 */
export function usePropFilters(): PropFilterState {
  const params = useSearchParams();
  const prefs = usePrefs().data;
  const search = params.toString();
  const selection = useMemo(
    () => parseSelection(new URLSearchParams(search)),
    [search],
  );
  const range = useMemo(
    () => parseFilters(new URLSearchParams(search)).range,
    [search],
  );
  const timeZone = prefs?.timeZone;
  const weekStart = prefs?.weekStart;
  const today =
    timeZone === undefined ? '' : localDate(new Date().toISOString(), timeZone);
  const dates = useMemo(
    () => datesOf(range, today, weekStart),
    [range, today, weekStart],
  );
  const filters = useMemo(
    () => propFilters(selection, dates),
    [selection, dates],
  );
  const dateSet =
    'preset' in range || range.from !== undefined || range.to !== undefined;
  const selected = selectionCount(selection);

  const setRange = useCallback(
    (next: DateRange) =>
      write((p) => {
        for (const key of RANGE_PARAMS) p.delete(key);
        serializeFilters({ ...EMPTY_FILTERS, range: next }).forEach(
          (value, key) => p.set(key, value),
        );
      }),
    [],
  );
  const set = useCallback(
    (next: PropSelection) => write((p) => setSelection(p, next)),
    [],
  );
  const clear = useCallback(
    () =>
      write((p) => {
        for (const key of RANGE_PARAMS) p.delete(key);
        setSelection(p, NO_SELECTION);
      }),
    [],
  );

  return {
    selection,
    range,
    dates,
    filters,
    selected,
    dateSet,
    any: selected > 0 || dateSet,
    today,
    setSelection: set,
    setRange,
    clear,
  };
}

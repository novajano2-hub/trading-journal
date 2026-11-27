'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
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

/** What the caller has just written and the address has not yet shown. */
interface Pending {
  /** The address React was rendering when it wrote. */
  over: string;
  selection?: PropSelection;
  range?: DateRange;
}

/**
 * The prop pages' filters, kept in the address (C37): the six filters under
 * their own names and the global date range under the trade filters' (`range`,
 * or `from` and `to`), which the date chip writes. Render inside
 * `<Suspense>`: it reads the search params.
 *
 * A write shows in what this returns at once. Next applies
 * `history.replaceState` in a transition, and until that lands a controlled
 * checkbox would flick back; the write stands only while React still renders
 * the address it replaced, so the address landing, a back or forward, or
 * another write ends it.
 */
export function usePropFilters(): PropFilterState {
  const params = useSearchParams();
  const prefs = usePrefs().data;
  const search = params.toString();
  const [pending, setPending] = useState<Pending | null>(null);
  if (pending !== null && pending.over !== search) setPending(null);
  const urlSelection = useMemo(
    () => parseSelection(new URLSearchParams(search)),
    [search],
  );
  const urlRange = useMemo(
    () => parseFilters(new URLSearchParams(search)).range,
    [search],
  );
  const selection = pending?.selection ?? urlSelection;
  const range = pending?.range ?? urlRange;
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

  const remember = useCallback(
    (change: Partial<Pending>) =>
      setPending((p) => ({
        ...(p?.over === search ? p : { over: search }),
        ...change,
      })),
    [search],
  );
  const setRange = useCallback(
    (next: DateRange) => {
      remember({ range: next });
      write((p) => {
        for (const key of RANGE_PARAMS) p.delete(key);
        serializeFilters({ ...EMPTY_FILTERS, range: next }).forEach(
          (value, key) => p.set(key, value),
        );
      });
    },
    [remember],
  );
  const set = useCallback(
    (next: PropSelection) => {
      remember({ selection: next });
      write((p) => setSelection(p, next));
    },
    [remember],
  );
  const clear = useCallback(() => {
    remember({ selection: NO_SELECTION, range: {} });
    write((p) => {
      for (const key of RANGE_PARAMS) p.delete(key);
      setSelection(p, NO_SELECTION);
    });
  }, [remember]);

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

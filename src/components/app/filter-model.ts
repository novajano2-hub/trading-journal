// No 'use client': plain rules for the filter chips and the account switcher.
import {
  advancedFilterCount,
  EMPTY_FILTERS,
  resolveRange,
  type DateRange,
  type GlobalFilters,
} from '@/data/filters';
import type { Account, Strategy, Tag, TagCategory } from '@/domain/types';
import { plural } from '@/lib/format';

/** The top bar's chips other than the date. Accounts live in the sidebar switcher. */
export type ChipDimension = 'symbol' | 'side' | 'strategy' | 'tag';

/** What the chip popovers offer: the workspace's symbol roots, strategies, tags and the categories they sit in. */
export interface FilterOptions {
  symbols: string[];
  strategies: Strategy[];
  tags: Tag[];
  categories: TagCategory[];
}

/** `list` with `id` added or removed, sorted ascending. */
export function toggleId(list: readonly string[], id: string): string[] {
  const ids = new Set(list);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return [...ids].sort();
}

/** One name for a single id; a count for two or more. */
function named(
  ids: readonly string[],
  names: ReadonlyMap<string, string>,
  one: string,
  many: string,
): string {
  const only = ids.length === 1 ? names.get(ids[0]!) : undefined;
  return only ?? `${ids.length} ${plural(ids.length, one, many)}`;
}

/** A chip's text: its dimension's name while unset, else what it holds. */
export function chipLabel(
  dim: ChipDimension,
  f: GlobalFilters,
  names: {
    strategies: ReadonlyMap<string, string>;
    tags: ReadonlyMap<string, string>;
  },
): { text: string; active: boolean } {
  switch (dim) {
    case 'symbol':
      if (f.symbols.length === 0) return { text: 'Symbol', active: false };
      return {
        text:
          f.symbols.length <= 2
            ? f.symbols.join(', ')
            : `${f.symbols.length} ${plural(f.symbols.length, 'symbol')}`,
        active: true,
      };
    case 'side':
      if (f.side === undefined) return { text: 'Side', active: false };
      return { text: f.side === 'long' ? 'Long' : 'Short', active: true };
    case 'strategy':
      if (f.strategyIds.length === 0)
        return { text: 'Strategy', active: false };
      return {
        text: named(f.strategyIds, names.strategies, 'strategy', 'strategies'),
        active: true,
      };
    case 'tag':
      if (f.tagIds.length === 0) return { text: 'Tags', active: false };
      return { text: named(f.tagIds, names.tags, 'tag', 'tags'), active: true };
  }
}

/** True when any filter is set, the date range and accounts included. */
export function hasActiveFilters(f: GlobalFilters): boolean {
  const range = f.range;
  return (
    'preset' in range ||
    range.from !== undefined ||
    range.to !== undefined ||
    f.accountIds.length > 0 ||
    f.symbols.length > 0 ||
    f.side !== undefined ||
    f.strategyIds.length > 0 ||
    f.tagIds.length > 0 ||
    advancedFilterCount(f) > 0
  );
}

/**
 * How many filters are in use: each of the date, symbol, side, strategy and
 * tags chips that is set, plus the fields "More filters" holds. The sheet
 * button's count; accounts belong to the switcher and are not counted.
 */
export function activeFilterCount(f: GlobalFilters): number {
  const r = f.range;
  const date = 'preset' in r || r.from !== undefined || r.to !== undefined;
  return (
    [
      date,
      f.symbols.length > 0,
      f.side !== undefined,
      f.strategyIds.length > 0,
      f.tagIds.length > 0,
    ].filter(Boolean).length + advancedFilterCount(f)
  );
}

/** Ids never cross workspaces: drop accounts, strategies and tags (included or excluded); keep the rest. */
export function switchWorkspaceFilters(f: GlobalFilters): GlobalFilters {
  return {
    ...f,
    accountIds: [],
    strategyIds: [],
    tagIds: [],
    excludeStrategyIds: [],
    excludeTagIds: [],
  };
}

/** The switcher's second line: "All accounts", the one account's name, or a count. */
export function accountSummary(
  accounts: readonly Account[],
  f: GlobalFilters,
): string {
  if (f.accountIds.length === 0) return 'All accounts';
  return named(
    f.accountIds,
    new Map(accounts.map((a) => [a.id, a.name])),
    'account',
    'accounts',
  );
}

/** The range's dates. A preset resolves against `today`, and to none while `today` is unknown (empty). */
export function datesOf(
  range: DateRange,
  today: string,
): { from?: string; to?: string } {
  if (!('preset' in range)) return range;
  return today === '' ? {} : resolveRange(range, today);
}

/** A custom range from the From and To fields: either may be empty, and a reversed pair is swapped. */
export function customRange(from: string, to: string): DateRange {
  const [a, b] =
    from !== '' && to !== '' && from > to ? [to, from] : [from, to];
  return { ...(a !== '' ? { from: a } : {}), ...(b !== '' ? { to: b } : {}) };
}

/**
 * The filters in `f` that a group's chip row (date, symbol, side, strategy,
 * tags, outcome, account) has no chip for, by name: Compare's groups can
 * inherit these from the other reports.
 */
export function unshownFilters(f: GlobalFilters): string[] {
  const set: [boolean, string][] = [
    [f.excludeSymbols.length > 0, 'Excluded symbols'],
    [f.excludeStrategyIds.length > 0, 'Excluded strategies'],
    [f.noStrategy, 'No strategy'],
    [f.excludeTagIds.length > 0, 'Excluded tags'],
    [f.status !== undefined, 'Status'],
    [f.holding !== undefined, 'Holding'],
    [f.reviewed !== undefined, 'Reviewed'],
    [f.ratings.length > 0, 'Ratings'],
    [f.weekdays.length > 0, 'Weekdays'],
    [f.months.length > 0, 'Months'],
    [f.entryWindows.length > 0, 'Entry times'],
    [f.exitWindows.length > 0, 'Exit times'],
    [f.duration !== undefined, 'Duration'],
    [f.entryPrice !== undefined, 'Entry price'],
    [f.exitPrice !== undefined, 'Exit price'],
    [f.size !== undefined, 'Size'],
    [f.r !== undefined, 'R'],
    [f.strategyMatch === 'all', 'Strategies, all'],
    [f.tagMatch === 'all', 'Tags, all'],
  ];
  return set.filter(([on]) => on).map(([, name]) => name);
}

/** `f` with every filter `unshownFilters` names cleared; the rest is kept. */
export function withoutUnshown(f: GlobalFilters): GlobalFilters {
  return {
    ...EMPTY_FILTERS,
    range: f.range,
    accountIds: f.accountIds,
    symbols: f.symbols,
    side: f.side,
    strategyIds: f.strategyIds,
    tagIds: f.tagIds,
    outcomes: f.outcomes,
  };
}

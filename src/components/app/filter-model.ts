// No 'use client': plain rules for the filter chips and the account switcher.
import type { GlobalFilters } from '@/data/filters';
import type { Account, Strategy, Tag } from '@/domain/types';

/** The top bar's chips other than the date. Accounts live in the sidebar switcher. */
export type ChipDimension = 'symbol' | 'side' | 'strategy' | 'tag';

/** What the chip popovers offer: the workspace's symbol roots, strategies and tags. */
export interface FilterOptions {
  symbols: string[];
  strategies: Strategy[];
  tags: Tag[];
}

/** `list` with `id` added or removed, sorted ascending. */
export function toggleId(list: readonly string[], id: string): string[] {
  const ids = new Set(list);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return [...ids].sort();
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** One name for a single id; a count for two or more. */
function named(
  ids: readonly string[],
  names: ReadonlyMap<string, string>,
  one: string,
  many: string,
): string {
  const only = ids.length === 1 ? names.get(ids[0]!) : undefined;
  return only ?? plural(ids.length, one, many);
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
            : plural(f.symbols.length, 'symbol', 'symbols'),
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
    f.tagIds.length > 0
  );
}

/** Ids never cross workspaces: drop accounts, strategies and tags; keep date, symbol and side. */
export function switchWorkspaceFilters(f: GlobalFilters): GlobalFilters {
  return { ...f, accountIds: [], strategyIds: [], tagIds: [] };
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

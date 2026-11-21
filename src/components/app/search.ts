import type { Strategy, Tag, TagCategory } from '@/domain/types';
import { APP_NAV, type AppModuleId } from './nav';

export type SearchResult =
  | { kind: 'module'; id: AppModuleId; label: string }
  | { kind: 'symbol'; value: string; label: string }
  | { kind: 'strategy'; id: string; label: string }
  | { kind: 'tag'; id: string; label: string; category: TagCategory };

export const MAX_RESULTS = 8;

/**
 * What the top-bar search finds for `query`: modules by the start of any word,
 * symbols by prefix, strategies and tags by substring. Case-insensitive, in
 * that order, capped at `MAX_RESULTS`.
 */
export function searchApp(
  query: string,
  src: {
    symbols: readonly string[];
    strategies: readonly Strategy[];
    tags: readonly Tag[];
  },
): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const out: SearchResult[] = [];
  for (const item of APP_NAV) {
    if (
      item.label
        .toLowerCase()
        .split(/\s+/)
        .some((w) => w.startsWith(q))
    )
      out.push({ kind: 'module', id: item.id, label: item.label });
  }
  for (const s of src.symbols) {
    if (s.toLowerCase().startsWith(q))
      out.push({ kind: 'symbol', value: s, label: s });
  }
  for (const s of src.strategies) {
    if (s.name.toLowerCase().includes(q))
      out.push({ kind: 'strategy', id: s.id, label: s.name });
  }
  for (const t of src.tags) {
    if (t.name.toLowerCase().includes(q))
      out.push({ kind: 'tag', id: t.id, label: t.name, category: t.category });
  }
  return out.slice(0, MAX_RESULTS);
}

/** ⌘K on macOS, Ctrl+K elsewhere. */
export function isSearchShortcut(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  platform: 'mac' | 'other',
): boolean {
  if (e.key.toLowerCase() !== 'k' || e.altKey || e.shiftKey) return false;
  return platform === 'mac' ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

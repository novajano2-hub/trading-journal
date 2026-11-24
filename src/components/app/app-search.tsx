'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExpandingSearch } from '@/components/ui/expanding-search';
import { serializeFilters } from '@/data/filters';
import { useGlobalFilters } from '@/data/query/derived';
import {
  useStrategies,
  useTagCategories,
  useTags,
  useTrades,
} from '@/data/query/hooks';
import { useHydrated } from '@/lib/use-hydrated';
import { activeItem, navHref, navItem } from './nav';
import { toggleId } from './filter-model';
import {
  isSearchShortcut,
  searchApp,
  symbolOptions,
  type SearchResult,
} from './search';

const DETAIL = { module: 'Module', symbol: 'Symbol', strategy: 'Strategy' };

function keyOf(r: SearchResult): string {
  return r.kind === 'symbol' ? `symbol:${r.value}` : `${r.kind}:${r.id}`;
}

/** Whether keys typed here are text for something else, so ⌘K must leave it be. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/**
 * The top bar's search over modules, symbols, strategies and tags, and its
 * ⌘K / Ctrl+K shortcut. Render inside `<Suspense>`: it reads the search params.
 */
export function AppSearch(): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { filters, setFilters } = useGlobalFilters();
  const trades = useTrades().data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const categories = useTagCategories().data;
  const hydrated = useHydrated();
  const platform =
    hydrated && /mac|iphone|ipad/i.test(navigator.platform) ? 'mac' : 'other';
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const viaShortcut = useRef(false);

  // Focus goes back only to where the shortcut came from: any other focus on
  // the field, or its losing focus, forgets that place.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const forget = () => {
      returnTo.current = null;
    };
    const onFocus = () => {
      if (!viaShortcut.current) forget();
    };
    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', forget);
    return () => {
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', forget);
    };
  }, []);

  const symbols = useMemo(() => symbolOptions(trades), [trades]);
  const found = useMemo(
    () =>
      searchApp(query, {
        symbols,
        strategies: strategies ?? [],
        tags: tags ?? [],
        categories: categories ?? [],
      }),
    [query, symbols, strategies, tags, categories],
  );
  const results = useMemo(
    () =>
      found.map((r) => ({
        id: keyOf(r),
        label: r.label,
        // A tag reads as its category, e.g. "Mistakes".
        detail: r.kind === 'tag' ? r.category || 'Tag' : DETAIL[r.kind],
      })),
    [found],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isSearchShortcut(e, platform)) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      returnTo.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      viaShortcut.current = true;
      input.current?.focus();
      viaShortcut.current = false;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [platform]);

  function close() {
    const back = returnTo.current;
    returnTo.current = null;
    if (back?.isConnected && back !== document.body && back !== input.current)
      back.focus();
    else input.current?.blur();
  }

  function select(id: string) {
    const r = found.find((x) => keyOf(x) === id);
    if (!r) return;
    if (r.kind === 'module') {
      router.push(navHref(navItem(r.id), params));
    } else {
      const next =
        r.kind === 'symbol'
          ? { ...filters, symbols: toggleOn(filters.symbols, r.value) }
          : r.kind === 'strategy'
            ? { ...filters, strategyIds: toggleOn(filters.strategyIds, r.id) }
            : { ...filters, tagIds: toggleOn(filters.tagIds, r.id) };
      if (activeItem(pathname)?.filterScoped) setFilters(next);
      else router.push(`/app/dashboard?${serializeFilters(next).toString()}`);
    }
    setQuery('');
    close();
  }

  return (
    <ExpandingSearch
      label="Search"
      placeholder="Search Keel"
      shortcutHint={!hydrated ? null : platform === 'mac' ? '⌘K' : 'Ctrl K'}
      query={query}
      onQueryChange={setQuery}
      results={results}
      onSelect={select}
      onClose={close}
      inputRef={input}
    />
  );
}

/** The list with `id` in it, once. */
function toggleOn(list: readonly string[], id: string): string[] {
  return list.includes(id) ? [...list] : toggleId(list, id);
}

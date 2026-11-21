'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  parseFilters,
  serializeFilters,
  type GlobalFilters,
} from '@/data/filters';
import { useGlobalFilters, useTradeSet } from '@/data/query/derived';

/** A route and its filters, normalised the way the URL holds them. */
function keyOf(pathname: string, search: URLSearchParams): string {
  return `${pathname}?${serializeFilters(parseFilters(search)).toString()}`;
}

/** The address bar now. `replaceState` and back or forward change it at once, before React hears. */
function liveKey(): string {
  return keyOf(
    window.location.pathname,
    new URLSearchParams(window.location.search),
  );
}

interface Written {
  next: GlobalFilters;
  /** What the write put in the address bar. */
  target: string;
  /** The URL React was rendering when it wrote. */
  over: string;
}

/**
 * The URL's filters for a control to show and write. Render inside
 * `<Suspense>`: it reads the search params.
 *
 * - `filters`: the URL's, cleaned of unknown ids once the workspace's lists load.
 * - `shown`: the cleaned set from `useTradeSet`, so a stale link's unknown ids
 *   never show; `undefined` until the workspace loads.
 *
 * A write shows in `shown` at once. Next applies `history.replaceState` in a
 * transition, and until that lands a controlled checkbox would flick back. The
 * write stands only while React still renders the URL it replaced and the
 * address bar still holds exactly what it wrote, so a back or forward, another
 * write, or its own landing ends it.
 */
export function useShownFilters(): {
  filters: GlobalFilters;
  shown: GlobalFilters | undefined;
  setFilters(next: GlobalFilters): void;
} {
  const { filters, setFilters } = useGlobalFilters();
  const pathname = usePathname();
  const clean = useTradeSet(filters).data?.filters;
  const urlKey = keyOf(pathname, serializeFilters(filters));
  const [written, setWritten] = useState<Written | null>(null);
  const standing =
    written !== null && written.over === urlKey && written.target === liveKey();
  if (written !== null && !standing) setWritten(null);

  const write = useCallback(
    (next: GlobalFilters) => {
      setWritten({
        next,
        target: keyOf(pathname, serializeFilters(next)),
        over: urlKey,
      });
      setFilters(next);
    },
    [pathname, urlKey, setFilters],
  );
  const shown =
    clean === undefined ? undefined : standing ? written.next : clean;
  return { filters, shown, setFilters: write };
}

// Test-only: a `next/navigation` stand-in for component tests, shared so every
// test reads the URL the same way. Mock with
//   vi.mock('next/navigation', () => import('./__fixtures__/navigation'));
// It reads `window.location`, and, as Next does, re-renders its readers after
// `history.replaceState` or `history.pushState`. Next delivers those in a
// transition: `deferNavigation` holds them back the same way until
// `commitNavigation` (call it inside `act`).
import { useMemo, useSyncExternalStore } from 'react';

let committed = {
  pathname: window.location.pathname,
  search: window.location.search,
};
let deferred = false;
const listeners = new Set<() => void>();

function commit(): void {
  committed = {
    pathname: window.location.pathname,
    search: window.location.search,
  };
  for (const listener of listeners) listener();
}

for (const method of ['replaceState', 'pushState'] as const) {
  const original = window.history[method].bind(window.history);
  window.history[method] = (...args: Parameters<History['replaceState']>) => {
    original(...args);
    if (!deferred) commit();
  };
}

/** From now on, history changes reach React only at `commitNavigation`. */
export function deferNavigation(): void {
  deferred = true;
}

/** Hands React the URL as it is now, and stops deferring. */
export function commitNavigation(): void {
  deferred = false;
  commit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => committed;

export function useSearchParams(): URLSearchParams {
  const { search } = useSyncExternalStore(subscribe, snapshot);
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, snapshot).pathname;
}

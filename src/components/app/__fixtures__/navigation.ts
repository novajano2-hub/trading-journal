// Test-only: a `next/navigation` stand-in for component tests, shared so every
// test reads the URL the same way. Mock with
//   vi.mock('next/navigation', () => import('./__fixtures__/navigation'));
// It reads `window.location`, and, as Next does, re-renders its readers after
// `history.replaceState` or `history.pushState`.
import { useMemo, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

for (const method of ['replaceState', 'pushState'] as const) {
  const original = window.history[method].bind(window.history);
  window.history[method] = (...args: Parameters<History['replaceState']>) => {
    original(...args);
    for (const listener of listeners) listener();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

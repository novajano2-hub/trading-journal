'use client';

import { useSyncExternalStore } from 'react';

const SM = '(min-width: 640px)';
const LG = '(min-width: 1024px)';

/**
 * Whether the viewport is below `sm` (640px): a phone. Prerenders as wide, so
 * the server and the first client render agree; a phone then switches over.
 */
export function usePhone(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = matchMedia(SM);
      query.addEventListener?.('change', notify);
      return () => query.removeEventListener?.('change', notify);
    },
    () => !matchMedia(SM).matches,
    () => false,
  );
}

/**
 * Whether the viewport is below `lg` (1024px). The day page's top bar has no
 * room for its stage bar there, so the stage bar takes a row of its own, as on
 * a phone. Prerenders as wide, like `usePhone`.
 */
export function useBelowLg(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = matchMedia(LG);
      query.addEventListener?.('change', notify);
      return () => query.removeEventListener?.('change', notify);
    },
    () => !matchMedia(LG).matches,
    () => false,
  );
}

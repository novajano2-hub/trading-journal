'use client';

import { useSyncExternalStore } from 'react';

const SM = '(min-width: 640px)';

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

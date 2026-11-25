'use client';

import { useSyncExternalStore } from 'react';

const XL = '(min-width: 1280px)';

/**
 * Whether the viewport is `xl` (1280px) or wider, where the Day and Week
 * views have room for their calendar column. Like `usePhone` it reads the
 * media query; unlike it, it prerenders as narrow, so a column that is only
 * built where it shows is not built on the server.
 */
export function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = matchMedia(XL);
      query.addEventListener?.('change', notify);
      return () => query.removeEventListener?.('change', notify);
    },
    () => matchMedia(XL).matches,
    () => false,
  );
}

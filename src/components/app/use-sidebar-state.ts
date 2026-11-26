'use client';

import { usePrefs, useSetSidebar } from '@/data/query/hooks';

/**
 * The sidebar's state, kept in the prefs (C47). It reads as expanded until the
 * prefs load, so the first paint is the full sidebar; `toggle` shows the other
 * state at once and saves it.
 */
export function useSidebarState(): { collapsed: boolean; toggle(): void } {
  const collapsed = usePrefs().data?.sidebar === 'collapsed';
  const { mutate } = useSetSidebar();
  return {
    collapsed,
    toggle: () => mutate(collapsed ? 'expanded' : 'collapsed'),
  };
}

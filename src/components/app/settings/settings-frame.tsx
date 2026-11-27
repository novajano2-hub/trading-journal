'use client';

import { useSidebarState } from '../use-sidebar-state';
import { SettingsNav } from './settings-nav';

/**
 * Settings: the sections down the left (a row under `lg`), the open one beside
 * them. The menu collapses to a 60px icon column with the sidebar (the same
 * `UserPrefs.sidebar` choice, from `lg`) and the page takes the room. Below
 * `lg` the row is as it was.
 */
export function SettingsFrame({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const { collapsed } = useSidebarState();
  return (
    <div
      data-collapsed={collapsed}
      className={`grid grid-cols-[minmax(0,1fr)] items-start gap-4 px-5 pt-1 pb-16 lg:pt-0 ${collapsed ? 'lg:grid-cols-[60px_minmax(0,1fr)]' : 'lg:grid-cols-[180px_minmax(0,1fr)]'}`}
    >
      <SettingsNav collapsed={collapsed} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        {children}
      </div>
    </div>
  );
}

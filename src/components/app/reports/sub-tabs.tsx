'use client';

import { useId, type ReactNode } from 'react';
import { ScrollFade } from '@/components/ui/scroll-fade';
import { panelId, Tabs, tabId, type TabOption } from '@/components/ui/tabs';
import { writeParam } from './use-report-data';

/**
 * The tabs inside one report (Day & time's Weekday, Month, Time of day,
 * Duration). The choice is written to `?param=` so it can be linked, and the
 * panel under them holds `children`.
 */
export function SubTabs<T extends string>({
  label,
  param,
  options,
  value,
  children,
}: {
  label: string;
  param: string;
  options: readonly TabOption<T>[];
  value: T;
  children: ReactNode;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ScrollFade tone="bg" className="pb-1 [scrollbar-width:none]">
        <Tabs
          id={id}
          label={label}
          options={options}
          value={value}
          onChange={(v) => writeParam(param, v)}
          coarseTargets
        />
      </ScrollFade>
      <div
        role="tabpanel"
        id={panelId(id)}
        aria-labelledby={tabId(id, value)}
        className="flex min-w-0 flex-col gap-4"
      >
        {children}
      </div>
    </div>
  );
}

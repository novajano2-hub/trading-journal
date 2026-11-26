'use client';

import { useCallback } from 'react';
import { usePrefs, useUpdatePrefs } from '@/data/query/hooks';
import { setWidgetSettings } from '@/domain/dashboard/templates';
import type { WidgetKey, WidgetSettings } from '@/domain/types';

/**
 * Saves a change to one widget's settings on the template in use (the
 * scatter's Entry or Exit), through the prefs. With no template saved yet the
 * default one is saved with the change. It writes straight to the template:
 * the draft an edit mode holds is for the edit mode's own controls.
 */
export function useSetWidgetSetting(
  key: WidgetKey,
): (patch: WidgetSettings) => void {
  const prefs = usePrefs().data;
  const update = useUpdatePrefs();
  const { mutate } = update;
  return useCallback(
    (patch) => {
      if (!prefs) return;
      mutate({ dashboards: setWidgetSettings(prefs, key, patch) });
    },
    [prefs, key, mutate],
  );
}

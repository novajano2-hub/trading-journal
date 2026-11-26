'use client';

import { useCallback, useContext } from 'react';
import { useChangeDashboards } from '@/data/query/hooks';
import { setWidgetSettings } from '@/domain/dashboard/templates';
import type { WidgetKey, WidgetSettings } from '@/domain/types';
import { WidgetTemplateContext } from './context';

/**
 * Saves a change to one widget's settings on the template the page draws (the
 * scatter's Entry or Exit, the challenge shown, the report's metrics), through
 * the prefs. The write rebuilds the `dashboards` pref from what is stored when
 * it lands (C70), so a template saved in another tab is kept and so is the
 * one it put in use. It writes straight to the template: the draft an edit
 * mode holds is for the edit mode's own controls.
 */
export function useSetWidgetSetting(
  key: WidgetKey,
): (patch: WidgetSettings) => void {
  const templateId = useContext(WidgetTemplateContext) ?? undefined;
  const { mutate } = useChangeDashboards();
  return useCallback(
    (patch) => {
      mutate((current) => setWidgetSettings(current, key, patch, templateId));
    },
    [key, templateId, mutate],
  );
}

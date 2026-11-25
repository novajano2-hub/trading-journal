'use client';

import { useCallback, useState } from 'react';
import { isOnboarded } from '@/data/onboarding';
import { usePrefs } from '@/data/query/hooks';
import { PreferencesDialog } from '../welcome/preferences-dialog';
import { ZoneNotice } from '../welcome/zone-notice';
import { HomeView } from './home-view';

/**
 * The Home page. Until the first run is saved, Home shows as an empty My
 * workspace and the required preferences dialog opens over it. That holds
 * through the save too, until the prefs and the active workspace have both
 * refetched, so the sample's Home never shows on the way. The time-zone
 * notice's state lives here, above the dialog, because the dialog unmounts
 * once the save settles; this component keeps its place across the gate's two
 * states, so the notice outlives it.
 */
export function HomeScreen(): React.JSX.Element {
  const prefs = usePrefs();
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const closeNotice = useCallback(() => setNotice(null), []);
  const needsSetup = prefs.data !== undefined && !isOnboarded(prefs.data);
  const firstRun = needsSetup || saving;
  return (
    <>
      <HomeView firstRun={firstRun} />
      {firstRun ? (
        <PreferencesDialog onSaving={setSaving} onSaved={setNotice} />
      ) : null}
      <ZoneNotice zone={notice} onClose={closeNotice} />
    </>
  );
}

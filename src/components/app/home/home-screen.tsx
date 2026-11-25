'use client';

import { useCallback, useState } from 'react';
import { isOnboarded } from '@/data/onboarding';
import { usePrefs } from '@/data/query/hooks';
import { PreferencesDialog } from '../welcome/preferences-dialog';
import { ZoneNotice } from '../welcome/zone-notice';
import { HomeView } from './home-view';

/**
 * The Home page. Until the first run is saved, Home holds as a skeleton and
 * the required preferences dialog opens over it. The time-zone notice's state
 * lives here, above the dialog, because the dialog unmounts the moment the
 * prefs refetch with the flag set; this component keeps its place across the
 * gate's two states, so the notice outlives it.
 */
export function HomeScreen(): React.JSX.Element {
  const prefs = usePrefs();
  const [notice, setNotice] = useState<string | null>(null);
  const closeNotice = useCallback(() => setNotice(null), []);
  const needsSetup = prefs.data !== undefined && !isOnboarded(prefs.data);
  return (
    <>
      <HomeView skeleton={needsSetup} />
      {needsSetup ? <PreferencesDialog onSaved={setNotice} /> : null}
      {notice ? <ZoneNotice zone={notice} onClose={closeNotice} /> : null}
    </>
  );
}

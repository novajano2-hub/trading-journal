'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isOnboarded } from '@/data/onboarding';
import { usePrefs } from '@/data/query/hooks';
import { readFirstRun } from './welcome/survey-model';

/** The one /app route that shows while the first run is unsaved: Home, with its dialog. */
const HOME = '/app/home';
const WELCOME = '/app/welcome';

type Where = 'wait' | 'pass' | { replace: string };

/**
 * Where a visitor belongs, from the prefs read and this browser session's
 * survey (K55, K56). Onboarded passes (the welcome pages send them to /app, so
 * a second `complete` can't happen); not onboarded with no finished survey
 * belongs at the welcome; with a finished survey, at Home and its dialog.
 */
function decide(
  prefs: ReturnType<typeof usePrefs>,
  pathname: string,
  onWelcomePages: boolean,
): Where {
  // Keel's call (TradeZella unknown): if the prefs can't be read, don't trap the user:
  // the page shows, and the app shell already reports storage errors.
  if (prefs.isError) return 'pass';
  if (!prefs.data) return 'wait';
  if (isOnboarded(prefs.data))
    return onWelcomePages ? { replace: '/app' } : 'pass';
  if (!readFirstRun().finished)
    return onWelcomePages ? 'pass' : { replace: WELCOME };
  return pathname === HOME ? 'pass' : { replace: HOME };
}

function useDecision(pathname: string, onWelcomePages: boolean): Where {
  const router = useRouter();
  const where = decide(usePrefs(), pathname, onWelcomePages);
  const target = typeof where === 'object' ? where.replace : undefined;
  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);
  return where;
}

/**
 * The first-run gate over every /app route, the sample workspace link
 * included (U1, K56). It renders nothing until the prefs load, so nothing
 * flashes. Both states return the same element so the page under it keeps
 * its place when the first run is saved.
 */
export function FirstRunGate({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element | null {
  const where = useDecision(usePathname(), false);
  return where === 'pass' ? <>{children}</> : null;
}

/**
 * The same gate for the welcome pages. A user who is already onboarded is sent
 * to /app, so a second `complete` can't happen; one whose survey is done goes
 * to Home and its dialog. Keel's call (TradeZella unknown): both are replaced.
 */
export function WelcomeGuard({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element | null {
  const where = useDecision('/app/welcome', true);
  return where === 'pass' ? <>{children}</> : null;
}

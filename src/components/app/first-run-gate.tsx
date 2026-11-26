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

/**
 * What the app shows while the prefs load (M2): a quiet page, in place of a
 * blank app. The layout puts it inside the shell, so the chrome is there.
 */
export function GateLoading(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading Keel"
      className="flex flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0"
    >
      <div aria-hidden="true" className="flex flex-col gap-4">
        <span className="block h-7 w-48 rounded-chip bg-sunken" />
        <span className="block h-[220px] rounded-[14px] bg-sunken/70" />
        <span className="block h-[160px] rounded-[14px] bg-sunken/70" />
      </div>
    </div>
  );
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
 * included (U1, K56). While the prefs load it shows `fallback` (the shell
 * around a skeleton), never a blank app; a visitor being sent elsewhere sees
 * nothing. The fallback and the page are the same element type at the same
 * place, so the shell keeps its place when the prefs arrive.
 */
export function FirstRunGate({
  children,
  fallback = <GateLoading />,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}): React.JSX.Element | null {
  const where = useDecision(usePathname(), false);
  if (where === 'pass') return <>{children}</>;
  return where === 'wait' ? <>{fallback}</> : null;
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

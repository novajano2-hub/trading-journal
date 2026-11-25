'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { gettingStarted } from '@/data/getting-started';
import { useAccounts, useChallenges, useTrades } from '@/data/query/hooks';

/**
 * `/app` (K56): Home while the checklist is incomplete, the Dashboard once it
 * is complete, for the active workspace. It renders nothing, so there is no
 * flash, until accounts, challenges and trades have loaded.
 */
export function AppLanding(): null {
  const router = useRouter();
  const accounts = useAccounts();
  const challenges = useChallenges();
  const trades = useTrades();
  const failed = accounts.isError || challenges.isError || trades.isError;
  const target =
    accounts.data && challenges.data && trades.data
      ? gettingStarted(accounts.data, challenges.data, trades.data).done === 3
        ? '/app/dashboard'
        : '/app/home'
      : // Keel's call: a failed read goes to Home, which shows the error and a retry.
        failed
        ? '/app/home'
        : undefined;
  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);
  return null;
}

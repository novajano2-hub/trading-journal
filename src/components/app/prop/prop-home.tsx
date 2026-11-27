'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  useActiveWorkspace,
  useChallenges,
  useFinishPropStart,
  usePrefs,
  usePropTxns,
} from '@/data/query/hooks';
import { StrategyError, StrategySkeleton } from '../strategies/strategy-states';
import { PropDashboard } from './prop-dashboard';
import { PropFirstRun, type RunEnd } from './prop-first-run';
import { PropTabs } from './prop-tabs';

/** Where a workspace's run stands for this visit. */
interface Run {
  workspaceId: string;
  /** The run is over, or was never to be shown: the dashboard is the page. */
  over: boolean;
  /** The trader ended it with Add active accounts: New challenge opens over the dashboard. */
  addAccounts: boolean;
}

/**
 * The Dashboard route's content: the first run (C71) on the first visit to a
 * workspace with no challenge and no transaction whose run is not done, the
 * tabs and the dashboard otherwise. Whether the run shows is decided once per
 * workspace as its data first arrives, and then held: the rows the run adds
 * must not swap it for the dashboard under the trader. It ends only when the
 * trader ends it, and once its end is stored (or once any challenge or
 * transaction exists) it never shows again. Home's `?new=challenge` is a
 * request for the form itself, so it skips the run. Render inside
 * `<Suspense>`: it reads the address.
 */
export function PropHome(): React.JSX.Element {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const workspace = useActiveWorkspace();
  const prefs = usePrefs();
  const challenges = useChallenges();
  const txns = usePropTxns();
  const finish = useFinishPropStart();
  const [run, setRun] = useState<Run | null>(null);

  const error =
    workspace.error ?? prefs.error ?? challenges.error ?? txns.error;
  if (error)
    return (
      <StrategyError
        error={error}
        title="The prop page couldn't load."
        onRetry={() => void queryClient.resetQueries({ queryKey: ['keel'] })}
      />
    );
  const workspaceId = workspace.data?.id;
  if (!workspaceId || !prefs.data || !challenges.data || !txns.data)
    return <StrategySkeleton label="Loading your challenges" />;

  if (run?.workspaceId !== workspaceId) {
    // First sight of this workspace: decide once (adjusting state while rendering).
    setRun({
      workspaceId,
      over:
        prefs.data.propStart?.[workspaceId]?.done === true ||
        challenges.data.length > 0 ||
        txns.data.length > 0 ||
        params.get('new') === 'challenge',
      addAccounts: false,
    });
    return <StrategySkeleton label="Loading your challenges" />;
  }

  if (run.over)
    return (
      <PropTabs active="dashboard" openChallenge={run.addAccounts}>
        <PropDashboard />
      </PropTabs>
    );

  const end = async ({ answer, addAccounts }: RunEnd): Promise<void> => {
    await finish.mutateAsync({
      workspaceId,
      ...(answer !== undefined && { answer }),
    });
    setRun({ workspaceId, over: true, addAccounts });
  };
  return <PropFirstRun prefs={prefs.data} txns={txns.data} onEnd={end} />;
}

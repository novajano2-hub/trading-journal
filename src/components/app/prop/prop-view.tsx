'use client';

import { Bank, Plus, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StateGlyph } from '@/components/ui/state-glyph';
import { Segmented } from '@/components/ui/segmented';
import { metricContextOf } from '@/data/metrics';
import {
  useAccounts,
  useCashFlows,
  useChallenges,
  usePrefs,
  useTrades,
  useUpdateChallenge,
} from '@/data/query/hooks';
import type { ChallengePatch } from '@/data/repository';
import { checkChallenge, urgencyOf } from '@/domain/prop/challenge';
import { localDate } from '@/domain/time';
import type { Challenge, Trade } from '@/domain/types';
import { FigureSourceContext } from '@/lib/display';
import {
  StateBlock,
  StrategyError,
  StrategySkeleton,
} from '../strategies/strategy-states';
import { ChallengeCard, shownPhase } from './challenge-card';
import { ChallengeForm } from './challenge-form';
import { MarkBreached } from './mark-breached';

type Filter = 'all' | Challenge['phase'];
const NO_TRADES: ReadonlyMap<string, Trade> = new Map();

const NewButton = ({ onClick }: { onClick(): void }) => (
  <Button onClick={onClick}>
    <Plus size={16} weight="bold" aria-hidden="true" />
    New challenge
  </Button>
);

/** The Prop firms page: each challenge against its rules, on closed trades and net P&L. */
export function PropView(): React.JSX.Element {
  const queryClient = useQueryClient();
  const challenges = useChallenges();
  const accounts = useAccounts();
  const trades = useTrades();
  const flows = useCashFlows();
  const prefs = usePrefs();
  const update = useUpdateChallenge();
  const [filter, setFilter] = useState<Filter>('all');
  // The tabs' New challenge button opens its own form; this one is for Edit
  // and for the empty state's button.
  const [editing, setEditing] = useState<Challenge | 'new' | null>(null);
  const [breaching, setBreaching] = useState<Challenge | null>(null);
  const error =
    challenges.error ??
    accounts.error ??
    trades.error ??
    flows.error ??
    prefs.error;

  const today = prefs.data
    ? localDate(new Date().toISOString(), prefs.data.timeZone)
    : null;
  const rows = useMemo(() => {
    if (
      !challenges.data ||
      !accounts.data ||
      !trades.data ||
      !flows.data ||
      !prefs.data ||
      !today
    )
      return undefined;
    const ctx = metricContextOf(prefs.data);
    return challenges.data
      .map((c) => ({
        c,
        check: checkChallenge(
          c,
          accounts.data,
          trades.data,
          ctx,
          today,
          flows.data,
        ),
        ctx,
      }))
      .sort((a, b) => urgencyOf(a.c, a.check) - urgencyOf(b.c, b.check));
  }, [
    challenges.data,
    accounts.data,
    trades.data,
    flows.data,
    prefs.data,
    today,
  ]);

  if (error)
    return (
      <StrategyError
        error={error}
        onRetry={() => void queryClient.resetQueries({ queryKey: ['keel'] })}
      />
    );
  if (!rows || !today)
    return <StrategySkeleton label="Loading your challenges" />;

  if (rows.length === 0)
    return (
      <>
        <StateBlock
          visual={<StateGlyph icon={ShieldCheck} />}
          title="No challenges yet."
          body="A challenge is a prop firm's evaluation steps and its funded phase. Add the firm's limits and Keel tracks each account against them."
          actions={<NewButton onClick={() => setEditing('new')} />}
        />
        {editing ? <ChallengeForm onClose={() => setEditing(null)} /> : null}
      </>
    );

  const breachingRow = breaching
    ? rows.find((r) => r.c.id === breaching.id)
    : undefined;
  const count = (f: Filter) =>
    f === 'all' ? rows.length : rows.filter((r) => r.c.phase === f).length;
  const shown = rows.filter((r) => filter === 'all' || r.c.phase === filter);

  return (
    <div className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented<Filter>
          label="Phase"
          value={filter}
          onChange={setFilter}
          coarseTargets
          options={[
            { value: 'all', label: `All ${count('all')}` },
            { value: 'evaluation', label: `Evaluation ${count('evaluation')}` },
            { value: 'funded', label: `Funded ${count('funded')}` },
          ]}
        />
        <span className="text-[12.5px] text-faint">
          Each account against its own rules, on closed trades and net P&amp;L.
          Most urgent first.
        </span>
        <span className="ml-auto flex items-center gap-3">
          <Link
            href="/app/settings/accounts"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          >
            <Bank size={16} aria-hidden="true" />
            Manage accounts
          </Link>
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="px-1 py-8 text-center text-[14.5px] text-muted">
          {filter === 'funded'
            ? 'No challenge is in its funded phase yet.'
            : 'No challenge is in evaluation.'}
        </p>
      ) : (
        shown.map(({ c, check, ctx }) => {
          const start = shownPhase(c, check)?.account?.startingBalance ?? null;
          return (
            <FigureSourceContext.Provider
              key={c.id}
              value={{ tradesById: NO_TRADES, ctx, pctBase: start }}
            >
              <ChallengeCard
                challenge={c}
                check={check}
                today={today}
                saving={update.isPending && update.variables?.id === c.id}
                saveFailed={update.isError && update.variables?.id === c.id}
                onEdit={() => setEditing(c)}
                onSave={(patch: ChallengePatch) =>
                  update.mutate({ id: c.id, patch })
                }
                onMarkBreached={() => setBreaching(c)}
              />
            </FigureSourceContext.Provider>
          );
        })
      )}

      {breachingRow ? (
        <MarkBreached
          key={breachingRow.c.id}
          challenge={breachingRow.c}
          check={breachingRow.check}
          today={today}
          onClose={() => setBreaching(null)}
        />
      ) : null}
      {editing ? (
        <ChallengeForm
          key={editing === 'new' ? 'new' : editing.id}
          challenge={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

'use client';

import {
  ArrowSquareOut,
  ArrowUpRight,
  ListBullets,
  PencilSimple,
  Prohibit,
  ShieldCheck,
  SquaresFour,
  Trash,
} from '@phosphor-icons/react/dist/ssr';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  useId,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { CARD } from '@/components/app/dashboard/shared';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { writeParam } from '@/components/app/reports/use-report-data';
import {
  RowMenu,
  type MenuAction,
} from '@/components/app/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { StateGlyph } from '@/components/ui/state-glyph';
import { panelId, Tabs, tabId } from '@/components/ui/tabs';
import { metricContextOf } from '@/data/metrics';
import {
  useAccounts,
  useCashFlows,
  useChallenges,
  usePrefs,
  useRemoveChallenge,
  useTrades,
  useUpdateChallenge,
  useUpdatePrefs,
} from '@/data/query/hooks';
import { checkChallenge, urgencyOf } from '@/domain/prop/challenge';
import { accountsGroup, type AccountsGroup } from '@/domain/prop/finance';
import { localDate } from '@/domain/time';
import type { Challenge, Trade } from '@/domain/types';
import { FigureSourceContext } from '@/lib/display';
import { usePhone } from '@/lib/use-phone';
import {
  StateBlock,
  StrategyError,
  StrategySkeleton,
} from '../strategies/strategy-states';
import {
  AccountsRows,
  AccountsTable,
  detailsHref,
  type AccountRow,
} from './accounts-list';
import { phaseName, shownPhase } from './challenge-card';
import { ChallengeForm } from './challenge-form';
import { MarkBreached } from './mark-breached';
import { PropView } from './prop-view';

const NO_TRADES: ReadonlyMap<string, Trade> = new Map();

const GROUPS: readonly { value: AccountsGroup; label: string }[] = [
  { value: 'evaluations', label: 'Evaluations' },
  { value: 'funded', label: 'Funded' },
  { value: 'breached', label: 'Breached' },
];

const EMPTY: Record<AccountsGroup, string> = {
  evaluations: 'No challenge is in evaluation.',
  funded: 'No challenge is funded yet.',
  breached: 'No challenge has breached.',
};

const LAYOUTS = [
  {
    value: 'list',
    label: 'List',
    icon: <ListBullets size={15} aria-hidden="true" />,
  },
  {
    value: 'grid',
    label: 'Grid',
    icon: <SquaresFour size={15} aria-hidden="true" />,
  },
] as const;

/**
 * Where focus goes back to when a dialog opened from a row's menu closes: that
 * row's menu button, else the chosen sub-tab (the row has left the tab).
 */
function focusAfter(challengeId: string | null): RefObject<HTMLElement | null> {
  return {
    get current() {
      return (
        document.querySelector<HTMLElement>(
          `[data-menu-of="${challengeId}"] button[aria-haspopup="menu"]`,
        ) ??
        document.querySelector<HTMLElement>(
          '[role="tab"][aria-selected="true"]',
        )
      );
    },
  };
}

/**
 * The Accounts tab: each challenge by where it stands, as Evaluations, Funded
 * or Breached with their counts (C62), in a List or a Grid that is remembered
 * (C63). A row's menu views its details, moves it to funded (after a
 * confirmation), marks it breached (asking why), edits it or deletes it
 * (confirmed). Each account is read against its own rules, on closed trades
 * and net P&L, the most urgent first.
 */
export function AccountsTab(): React.JSX.Element {
  const id = useId();
  const queryClient = useQueryClient();
  const challenges = useChallenges();
  const accounts = useAccounts();
  const trades = useTrades();
  const flows = useCashFlows();
  const prefs = usePrefs();
  const updatePrefs = useUpdatePrefs();
  const update = useUpdateChallenge();
  const remove = useRemoveChallenge();
  const params = useSearchParams();
  const phone = usePhone();
  const [editing, setEditing] = useState<Challenge | 'new' | null>(null);
  const [breaching, setBreaching] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const error =
    challenges.error ??
    accounts.error ??
    trades.error ??
    flows.error ??
    prefs.error;

  const today = prefs.data
    ? localDate(new Date().toISOString(), prefs.data.timeZone)
    : null;
  const loaded = useMemo(() => {
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
    const rows: AccountRow[] = challenges.data
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
      }))
      .sort((a, b) => urgencyOf(a.c, a.check) - urgencyOf(b.c, b.check));
    return { rows, ctx };
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
  if (!loaded || !today || !accounts.data)
    return <StrategySkeleton label="Loading your challenges" />;
  const { rows, ctx } = loaded;

  if (rows.length === 0)
    return (
      <>
        <StateBlock
          visual={<StateGlyph icon={ShieldCheck} />}
          title="No challenges yet."
          body="A challenge is a prop firm's evaluation steps and its funded phase. Add the firm's limits and Keel tracks each account against them."
          actions={
            <Button onClick={() => setEditing('new')}>New challenge</Button>
          }
        />
        {editing ? <ChallengeForm onClose={() => setEditing(null)} /> : null}
      </>
    );

  const layout = prefs.data?.propLayout ?? 'list';
  const tabParam = params.get('tab');
  const group: AccountsGroup =
    tabParam === 'funded' || tabParam === 'breached' ? tabParam : 'evaluations';
  const count = (g: AccountsGroup) =>
    rows.filter((r) => accountsGroup(r.c) === g).length;
  const shown = rows.filter((r) => accountsGroup(r.c) === group);
  const rowOf = (challengeId: string | null) =>
    challengeId === null ? undefined : rows.find((r) => r.c.id === challengeId);
  const breachingRow = rowOf(breaching);
  const movingRow = rowOf(moving);
  const deletingRow = rowOf(deleting);

  /** The row's menu. Pass or breach only apply while the challenge is open; a breach is final. */
  const actionsOf = ({ c }: AccountRow): MenuAction[] => {
    const open = c.status !== 'breached';
    return [
      {
        label: 'View details',
        href: detailsHref(c.id),
        icon: <ArrowSquareOut size={16} />,
      },
      ...(open && c.phase === 'evaluation'
        ? [
            {
              label: 'Move to funded',
              icon: <ArrowUpRight size={16} weight="bold" />,
              onSelect: () => setMoving(c.id),
            },
          ]
        : []),
      ...(open
        ? [
            {
              label: 'Mark as breached',
              icon: <Prohibit size={16} />,
              onSelect: () => setBreaching(c.id),
            },
          ]
        : []),
      {
        label: 'Edit',
        icon: <PencilSimple size={16} />,
        onSelect: () => setEditing(c),
      },
      {
        label: 'Delete',
        icon: <Trash size={16} />,
        danger: true,
        separated: true,
        onSelect: () => setDeleting(c.id),
      },
    ];
  };
  const menuFor = (row: AccountRow): ReactNode => (
    <RowMenu label={`Actions for ${row.c.name}`} actions={actionsOf(row)} />
  );

  const empty = (
    <p className="px-1 pt-6 pb-4 text-center text-[14px] text-muted">
      {EMPTY[group]}
    </p>
  );
  const panel = (children: ReactNode) => (
    <div
      role="tabpanel"
      id={panelId(id)}
      aria-labelledby={tabId(id, group)}
      className="min-w-0"
    >
      {children}
    </div>
  );

  return (
    // Prop figures are money, net, in the account's currency, whatever the
    // display menu says (C72): no percent base, so only Privacy changes them.
    <FigureSourceContext.Provider
      value={{ tradesById: NO_TRADES, ctx, pctBase: null }}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <div className={`${CARD} px-5 pt-[18px] pb-4`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
            <Tabs
              id={id}
              label="Challenges"
              value={group}
              options={GROUPS.map((g) => ({ ...g, count: count(g.value) }))}
              onChange={(v) =>
                writeParam('tab', v === 'evaluations' ? null : v)
              }
              coarseTargets
            />
            <Segmented<'list' | 'grid'>
              label="Layout"
              value={layout}
              options={LAYOUTS}
              coarseTargets
              className="ml-auto"
              onChange={(next) => updatePrefs.mutate({ propLayout: next })}
            />
          </div>
          {layout === 'list' || shown.length === 0
            ? panel(
                shown.length === 0 ? (
                  empty
                ) : phone ? (
                  <AccountsRows
                    rows={shown}
                    accounts={accounts.data}
                    menuFor={menuFor}
                  />
                ) : (
                  <AccountsTable
                    rows={shown}
                    accounts={accounts.data}
                    menuFor={menuFor}
                  />
                ),
              )
            : null}
        </div>
        {layout === 'grid' && shown.length > 0
          ? panel(
              <PropView
                rows={shown}
                menuFor={menuFor}
                onEdit={({ c }) => setEditing(c)}
                onMarkBreached={({ c }) => setBreaching(c.id)}
                onMoveToFunded={({ c }) => setMoving(c.id)}
              />,
            )
          : null}
      </div>

      {breachingRow ? (
        <MarkBreached
          key={breachingRow.c.id}
          challenge={breachingRow.c}
          check={breachingRow.check}
          today={today}
          returnFocus={focusAfter(breachingRow.c.id)}
          onClose={() => setBreaching(null)}
        />
      ) : null}
      <ConfirmDialog
        open={movingRow !== undefined}
        title={`Move ${movingRow?.c.name ?? 'this challenge'} to funded?`}
        body={`${
          movingRow
            ? phaseName(
                movingRow.c,
                shownPhase(movingRow.c, movingRow.check)?.step ?? 'step-1',
              )
            : 'The evaluation'
        } passes and its results stay viewable. The challenge moves to its funded phase.`}
        confirmLabel="Move to funded"
        onConfirm={async () => {
          if (movingRow)
            await update.mutateAsync({
              id: movingRow.c.id,
              patch: { status: 'active', phase: 'funded' },
            });
        }}
        onClose={() => setMoving(null)}
      />
      <ConfirmDialog
        open={deletingRow !== undefined}
        title={`Delete ${deletingRow?.c.name ?? 'this challenge'}?`}
        body="Its accounts and their trades stay. Only the challenge, its status and its fees are removed."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (deletingRow) await remove.mutateAsync(deletingRow.c.id);
        }}
        onClose={() => setDeleting(null)}
      />
      {editing ? (
        <ChallengeForm
          key={editing === 'new' ? 'new' : editing.id}
          challenge={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </FigureSourceContext.Provider>
  );
}

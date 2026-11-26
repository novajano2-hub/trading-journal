'use client';

import {
  ArrowSquareOut,
  ArrowUpRight,
  Funnel,
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
  useRef,
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
  useUpdatePrefs,
} from '@/data/query/hooks';
import { checkChallenge, urgencyOf } from '@/domain/prop/challenge';
import {
  accountsGroup,
  filterChallenges,
  firstTradeDays,
  startedOn,
  type AccountsGroup,
} from '@/domain/prop/finance';
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
import { ChallengeForm } from './challenge-form';
import { MarkBreached } from './mark-breached';
import { MoveToFunded } from './move-to-funded';
import { PropView } from './prop-view';
import { usePropFilters } from './use-prop-filters';

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
  const remove = useRemoveChallenge();
  const params = useSearchParams();
  const filters = usePropFilters();
  const phone = usePhone();
  const [editing, setEditing] = useState<Challenge | 'new' | null>(null);
  const [breaching, setBreaching] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // A dialog opened from a row's menu hands focus back to that row's menu
  // button, else (the row has left the tab) to the chosen sub-tab.
  const lastRow = useRef<string | null>(null);
  const returnFocus = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return (
          document.querySelector<HTMLElement>(
            `[data-menu-of="${lastRow.current}"] button[aria-haspopup="menu"]`,
          ) ??
          document.querySelector<HTMLElement>(
            '[role="tab"][aria-selected="true"]',
          )
        );
      },
    }),
    [],
  );
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
    // The day each account first traded, for a challenge with no start date.
    const firstTrade = firstTradeDays(trades.data, prefs.data.timeZone);
    // The date range and the six filters narrow the challenges (C37); a size
    // is read on the base currency's accounts, as the dashboard reads it.
    const own = accounts.data.filter(
      (a) => a.currency === prefs.data!.baseCurrency,
    );
    const kept = new Set(
      filterChallenges(challenges.data, own, filters.filters).map((c) => c.id),
    );
    const rows: AccountRow[] = challenges.data
      .filter((c) => kept.has(c.id))
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
        started: startedOn(c, firstTrade),
      }))
      .sort((a, b) => urgencyOf(a.c, a.check) - urgencyOf(b.c, b.check));
    return { rows, ctx, total: challenges.data.length };
  }, [
    challenges.data,
    accounts.data,
    trades.data,
    flows.data,
    prefs.data,
    today,
    filters.filters,
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
  const { rows, ctx, total } = loaded;

  if (total > 0 && rows.length === 0)
    return (
      <StateBlock
        visual={<StateGlyph icon={Funnel} />}
        title="No challenges match these filters."
        actions={
          <Button variant="secondary" onClick={filters.clear}>
            Clear filters
          </Button>
        }
      />
    );
  if (total === 0)
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
  const startMoving = (id: string) => {
    lastRow.current = id;
    setMoving(id);
  };
  const startBreaching = (id: string) => {
    lastRow.current = id;
    setBreaching(id);
  };
  const startDeleting = (id: string) => {
    lastRow.current = id;
    setDeleting(id);
  };
  const startEditing = (c: Challenge) => {
    lastRow.current = c.id;
    setEditing(c);
  };
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
              onSelect: () => startMoving(c.id),
            },
          ]
        : []),
      ...(open
        ? [
            {
              label: 'Mark as breached',
              icon: <Prohibit size={16} />,
              onSelect: () => startBreaching(c.id),
            },
          ]
        : []),
      {
        label: 'Edit',
        icon: <PencilSimple size={16} />,
        onSelect: () => startEditing(c),
      },
      {
        label: 'Delete',
        icon: <Trash size={16} />,
        separated: true,
        onSelect: () => startDeleting(c.id),
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
                onEdit={({ c }) => startEditing(c)}
                onMarkBreached={({ c }) => startBreaching(c.id)}
                onMoveToFunded={({ c }) => startMoving(c.id)}
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
          returnFocus={returnFocus}
          onClose={() => setBreaching(null)}
        />
      ) : null}
      <MoveToFunded
        row={movingRow}
        today={today}
        returnFocus={returnFocus}
        onClose={() => setMoving(null)}
      />
      <ConfirmDialog
        open={deletingRow !== undefined}
        title={`Delete ${deletingRow?.c.name ?? 'this challenge'}?`}
        body="Its accounts and their trades stay. Only the challenge, its status and its fees are removed."
        confirmLabel="Delete"
        danger
        returnFocus={returnFocus}
        onConfirm={async () => {
          if (deletingRow) await remove.mutateAsync(deletingRow.c.id);
        }}
        onClose={() => setDeleting(null)}
      />
      {editing ? (
        <ChallengeForm
          key={editing === 'new' ? 'new' : editing.id}
          challenge={editing === 'new' ? undefined : editing}
          returnFocus={returnFocus}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </FigureSourceContext.Provider>
  );
}

'use client';

import {
  ArrowUpRight,
  CaretLeft,
  PencilSimple,
  Prohibit,
  ShieldCheck,
  Trash,
} from '@phosphor-icons/react/dist/ssr';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type RefObject } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { writeParam } from '@/components/app/reports/use-report-data';
import { FigureText } from '@/components/product/figure-text';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { StateGlyph } from '@/components/ui/state-glyph';
import { metricContextOf } from '@/data/metrics';
import {
  useAccounts,
  useCashFlows,
  useChallenges,
  usePrefs,
  useRemoveChallenge,
  useStrategies,
  useTrades,
} from '@/data/query/hooks';
import type { MetricContext } from '@/domain/metrics/context';
import { checkChallenge, type ChallengeCheck } from '@/domain/prop/challenge';
import {
  accountsGroup,
  accountSize,
  CHALLENGE_TYPE_LABELS,
  challengeType,
  firstTradeDays,
  startedOn,
} from '@/domain/prop/finance';
import {
  accountTrades,
  phaseStates,
  phaseStats,
  phaseTradesOf,
  type PhaseState,
} from '@/domain/prop/phase';
import { localDate } from '@/domain/time';
import type {
  Account,
  CashFlow,
  Challenge,
  ChallengeStep,
  Trade,
} from '@/domain/types';
import { FigureSourceContext, useDisplay } from '@/lib/display';
import { usePhone } from '@/lib/use-phone';
import {
  StateBlock,
  StrategyError,
  StrategySkeleton,
} from '../strategies/strategy-states';
import {
  BreachLine,
  challengeChip,
  dateLabel,
  shownPhase,
  StatusChip,
} from './challenge-card';
import { ChallengeForm } from './challenge-form';
import { MarkBreached } from './mark-breached';
import { MoveToFunded } from './move-to-funded';
import { BalanceCard } from './phase-balance';
import { RulesCard, StatsCard, TradesCard } from './phase-panels';
import { StrategiesCard } from './phase-strategies';

const NO_TRADES: ReadonlyMap<string, Trade> = new Map();
const ACCOUNTS_HREF = '/app/prop-firms/accounts';

const TAB_NAME: Record<ChallengeStep, string> = {
  'step-1': 'Step 1',
  'step-2': 'Step 2',
  funded: 'Funded',
};
const STATE_WORD: Record<PhaseState, string> = {
  passed: 'Passed',
  active: 'Active',
  breached: 'Breached',
  'not-started': 'Not started',
};

const TAB =
  'inline-flex h-10 flex-none items-center gap-1.5 border-b-2 px-3.5 text-[13.5px] whitespace-nowrap no-underline outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

/** The address of a challenge's details with the phase it shows. */
const phaseHref = (id: string, step: ChallengeStep): string =>
  `${ACCOUNTS_HREF}/${encodeURIComponent(id)}?phase=${step}`;

/**
 * Where focus goes back to when a dialog opened from one of the page's
 * buttons closes: that button, found by its `data-return` mark when focus is
 * asked for (the dialogs only have a button to return to on the page).
 */
const focusBack = (mark: string): RefObject<HTMLElement | null> => ({
  get current() {
    return document.querySelector<HTMLElement>(`[data-return="${mark}"]`);
  },
});
const RETURN = {
  edit: focusBack('edit'),
  delete: focusBack('delete'),
  breach: focusBack('breach'),
  fund: focusBack('fund'),
};

/** The plain page for an id that is no challenge here: a link back to Accounts. */
function NoChallenge(): React.JSX.Element {
  return (
    <StateBlock
      visual={<StateGlyph icon={ShieldCheck} />}
      title="That challenge isn't here."
      body="It may have been deleted, or it belongs to another workspace."
      actions={
        <Link href={ACCOUNTS_HREF} className={buttonClasses('secondary')}>
          Back to accounts
        </Link>
      }
    />
  );
}

/**
 * A challenge's details (comp 06): its head with Edit and Delete, a tab for
 * each phase with its state, and under the phase shown its balance by day,
 * hour or trade (C65), its rules from the rule check, five figures, its
 * trades with Import into the account, and the challenge's strategies, which
 * can be attached and detached (C66). Move to funded and Mark as breached sit
 * on the current phase of an open challenge, asking as the Accounts tab's row
 * menu does; a breached challenge has neither and no way back. The phase shown
 * is in the address (`?phase=`), else the current one. Money is net, in the
 * account's own currency, whatever the display menu says (C72). Render inside
 * `<Suspense>`: it reads the address.
 */
export function ChallengeDetails({ id }: { id: string }): React.JSX.Element {
  const queryClient = useQueryClient();
  const challenges = useChallenges();
  const accounts = useAccounts();
  const trades = useTrades();
  const flows = useCashFlows();
  const prefs = usePrefs();
  const strategies = useStrategies();
  // Between a confirmed delete and the move to Accounts the challenge is gone:
  // that is not the "isn't here" page.
  const [leaving, setLeaving] = useState(false);
  const error =
    challenges.error ??
    accounts.error ??
    trades.error ??
    flows.error ??
    prefs.error ??
    strategies.error;

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
    const c = challenges.data.find((x) => x.id === id);
    if (!c) return { ctx, row: null };
    return {
      ctx,
      row: {
        c,
        check: checkChallenge(
          c,
          accounts.data,
          trades.data,
          ctx,
          today,
          flows.data,
        ),
        started: startedOn(c, firstTradeDays(trades.data, prefs.data.timeZone)),
      },
    };
  }, [
    id,
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
        title="This challenge couldn't load."
        onRetry={() => void queryClient.resetQueries({ queryKey: ['keel'] })}
      />
    );
  if (!loaded || !today || !accounts.data || !trades.data || !flows.data)
    return <StrategySkeleton label="Loading the challenge" rows={3} />;
  if (loaded.row === null)
    return leaving ? (
      <StrategySkeleton label="Leaving the challenge" rows={1} />
    ) : (
      <NoChallenge />
    );
  return (
    <DetailsBody
      {...loaded.row}
      ctx={loaded.ctx}
      today={today}
      timeZone={prefs.data!.timeZone}
      accounts={accounts.data}
      trades={trades.data}
      flows={flows.data}
      onLeaving={setLeaving}
    />
  );
}

/** The page of a challenge that is there: the phase shown, its figures, and the dialogs. */
function DetailsBody({
  c,
  check,
  started,
  ctx,
  today,
  timeZone,
  accounts,
  trades,
  flows,
  onLeaving,
}: {
  c: Challenge;
  check: ChallengeCheck;
  started: string | null;
  ctx: MetricContext;
  today: string;
  timeZone: string;
  accounts: readonly Account[];
  trades: readonly Trade[];
  flows: readonly CashFlow[];
  onLeaving(leaving: boolean): void;
}): React.JSX.Element {
  const remove = useRemoveChallenge();
  const params = useSearchParams();
  const router = useRouter();
  const phone = usePhone();
  const [editing, setEditing] = useState(false);
  const [breaching, setBreaching] = useState(false);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const type = challengeType(c);
  // A challenge that went straight to funded never had an evaluation to show.
  const steps: ChallengeStep[] =
    type === 's2f' ? ['funded'] : c.phases.map((p) => p.step);
  const current = shownPhase(c, check)?.step ?? steps[steps.length - 1]!;
  const asked = params.get('phase');
  const step =
    steps.find((s) => s === asked) ??
    (steps.includes(current) ? current : steps[steps.length - 1]!);
  const phase = check.phases.find((p) => p.step === step);
  const startDate = c.phases.find((p) => p.step === step)?.startDate;
  const account = phase?.account;
  const states = phaseStates(c, check, current);
  const label = TAB_NAME[step];
  const open = c.status !== 'breached';
  const onCurrent = step === current;
  const chip = challengeChip(c, check);
  // The challenge's size is its first linked account's, in that account's currency (C31).
  const sizeAccount = c.phases
    .map((p) => accounts.find((a) => a.id === p.accountId))
    .find((a) => a !== undefined);
  // What the phase's account holds, and the part of it from the phase's start.
  const own = useMemo(
    () => (account ? accountTrades(account, trades) : []),
    [account, trades],
  );
  const phaseTrades = useMemo(
    () => phaseTradesOf(startDate, own, timeZone),
    [startDate, own, timeZone],
  );
  const stats = useMemo(() => phaseStats(phaseTrades, ctx), [phaseTrades, ctx]);

  return (
    // Money here is net, in the account's currency, whatever the display menu
    // says (C72): no percent base, so only Privacy changes it.
    <FigureSourceContext.Provider
      value={{ tradesById: NO_TRADES, ctx, pctBase: null }}
    >
      <div className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0">
        <div>
          <Link
            href={`${ACCOUNTS_HREF}${
              accountsGroup(c) === 'evaluations'
                ? ''
                : `?tab=${accountsGroup(c)}`
            }`}
            className="inline-flex min-h-6 items-center gap-1 rounded-chip text-[13px] font-semibold text-accent-ink no-underline outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          >
            <CaretLeft size={13} weight="bold" aria-hidden="true" />
            Accounts
          </Link>
        </div>

        <Head
          c={c}
          chip={
            <span data-status="" className="inline-flex">
              <StatusChip
                kind={
                  chip === 'active' && c.phase === 'funded' ? 'funded' : chip
                }
              />
            </span>
          }
          type={CHALLENGE_TYPE_LABELS[type]}
          size={accountSize(c, accounts)}
          currency={sizeAccount?.currency ?? 'USD'}
          started={started}
          onEdit={() => setEditing(true)}
          onDelete={() => setDeleting(true)}
        />

        <div className="flex flex-wrap items-end gap-x-2.5 gap-y-3">
          <nav
            aria-label="Phases"
            className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto border-b border-line max-sm:basis-full [scrollbar-width:none]"
          >
            {steps.map((s) => (
              <Link
                key={s}
                href={phaseHref(c.id, s)}
                scroll={false}
                aria-current={s === step ? 'page' : undefined}
                className={`${TAB} -mb-px ${
                  s === step
                    ? 'border-accent font-semibold text-text'
                    : 'border-transparent font-medium text-muted hover:text-text'
                }`}
              >
                {TAB_NAME[s]}{' '}
                <span className="text-[12px] font-medium text-faint">
                  {STATE_WORD[states[s]]}
                </span>
              </Link>
            ))}
          </nav>
          {open && onCurrent ? (
            <div className="flex gap-2 pb-1.5 max-sm:w-full max-sm:*:flex-1">
              {c.phase === 'evaluation' ? (
                <Button
                  variant="secondary"
                  data-return="fund"
                  onClick={() => setMoving(true)}
                >
                  <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                  Move to funded
                </Button>
              ) : null}
              <Button
                variant="secondary"
                data-return="breach"
                onClick={() => setBreaching(true)}
              >
                <Prohibit size={16} aria-hidden="true" />
                Mark as breached
              </Button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <BalanceCard
            label={label}
            account={account}
            flows={flows}
            trades={own}
            {...(startDate !== undefined && { startDate })}
            timeZone={timeZone}
          />
          <RulesCard
            label={label}
            phase={phase}
            {...(startDate !== undefined && { startDate })}
            onEdit={() => setEditing(true)}
          />
        </div>

        <StatsCard
          label={label}
          stats={stats}
          currency={account?.currency ?? 'USD'}
        />

        <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <TradesCard
            label={label}
            account={account}
            trades={phaseTrades}
            {...(startDate !== undefined && { startDate })}
            timeZone={timeZone}
            phone={phone}
          />
          <StrategiesCard challenge={c} />
        </div>
      </div>

      {breaching ? (
        <MarkBreached
          challenge={c}
          check={check}
          today={today}
          returnFocus={RETURN.breach}
          onClose={() => setBreaching(false)}
        />
      ) : null}
      <MoveToFunded
        row={moving ? { c, check } : undefined}
        returnFocus={RETURN.fund}
        // The funded phase is the current one now: show it.
        onMoved={() => writeParam('phase', null)}
        onClose={() => setMoving(false)}
      />
      <ConfirmDialog
        open={deleting}
        title={`Delete ${c.name}?`}
        body="Its accounts and their trades stay. Only the challenge, its status and its fees are removed."
        confirmLabel="Delete"
        danger
        returnFocus={RETURN.delete}
        onConfirm={async () => {
          onLeaving(true);
          try {
            await remove.mutateAsync(c.id);
          } catch (e) {
            onLeaving(false);
            throw e;
          }
          router.push(ACCOUNTS_HREF);
        }}
        onClose={() => setDeleting(false)}
      />
      {editing ? (
        <ChallengeForm
          key={c.id}
          challenge={c}
          returnFocus={RETURN.edit}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </FigureSourceContext.Provider>
  );
}

/** The head: the name with its status, the firm, type, size and start, and Edit and Delete. */
function Head({
  c,
  chip,
  type,
  size,
  currency,
  started,
  onEdit,
  onDelete,
}: {
  c: Challenge;
  chip: React.ReactNode;
  type: string;
  size: number | null;
  currency: string;
  started: string | null;
  onEdit(): void;
  onDelete(): void;
}): React.JSX.Element {
  const display = useDisplay();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[22px] leading-tight font-[650] tracking-[-0.03em]">
          {c.name}
        </h2>
        {chip}
        <p className="m-0 min-w-0 text-[13.5px] text-muted max-sm:basis-full">
          {c.firm}, {type}
          {size === null ? null : (
            <>
              , <FigureText f={display.cash(size, false, currency)} />
            </>
          )}
          {started ? `, started ${dateLabel(started)}` : ''}
        </p>
        <div className="flex gap-2 sm:ml-auto max-sm:ml-auto">
          <Button variant="secondary" data-return="edit" onClick={onEdit}>
            <PencilSimple size={16} aria-hidden="true" />
            Edit
          </Button>
          <Button variant="secondary" data-return="delete" onClick={onDelete}>
            <Trash size={16} aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>
      {c.status === 'breached' ? (
        <BreachLine c={c} privacy={display.unit === 'privacy'} />
      ) : null}
    </div>
  );
}

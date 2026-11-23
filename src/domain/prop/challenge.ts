import { balanceAt } from '../metrics/balance';
import type { MetricContext } from '../metrics/context';
import { localDate } from '../time';
import type {
  Account,
  CashFlow,
  Cents,
  Challenge,
  ChallengeStep,
  DrawdownType,
  PropRuleSet,
  Trade,
} from '../types';
import { evaluateProp, type PropStatus } from './evaluate';

export type BreachFinding = {
  rule: 'daily-loss' | 'max-drawdown' | 'period-ended' | 'consistency';
  /** The local day it happened (YYYY-MM-DD). */
  date: string;
  /** The size of it: the day's loss, the fall, the profit so far, the best day. Always positive. */
  value: Cents;
  limit: Cents;
};

export interface ChallengePhaseCheck {
  step: ChallengeStep;
  accountId?: string;
  /** The linked account is archived: read-only. */
  archived: boolean;
  state?: PropStatus;
  /** What the account holds today: its starting balance, its deposits and withdrawals, and its realized net. */
  balance?: Cents;
  account?: Account;
}

export interface ChallengeCheck {
  currentStep: ChallengeStep | null;
  health: 'active' | 'near' | 'breached' | 'target-met';
  finding?: BreachFinding;
  /** Days after today in the current phase's period; null when it has none. */
  daysLeft: number | null;
  phases: ChallengePhaseCheck[];
}

const FAR_FUTURE = '9999-12-31T00:00:00Z';

/** "Static drawdown", "End-of-day drawdown" or "Trailing drawdown": the label comes from the type (E22). */
export function drawdownLabel(t: DrawdownType): string {
  return t === 'static'
    ? 'Static drawdown'
    : t === 'eod-trailing'
      ? 'End-of-day drawdown'
      : 'Trailing drawdown';
}

/** "12 Nov". */
function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** The sentence the card shows, and the failure reason it saves. `money` formats cents without a sign. */
export function findingText(
  f: BreachFinding,
  money: (c: Cents) => string,
): string {
  const on = shortDate(f.date);
  switch (f.rule) {
    case 'daily-loss':
      return `Daily loss limit broken on ${on} (−${money(f.value)} of −${money(f.limit)}).`;
    case 'max-drawdown':
      return `Max drawdown limit broken on ${on} (−${money(f.value)} of −${money(f.limit)}).`;
    case 'period-ended':
      return `The period ended on ${on} with the profit target unmet (${money(f.value)} of ${money(f.limit)}).`;
    case 'consistency':
      return `Best-day consistency broken: the best day, ${on}, made ${money(f.value)} against ${money(f.limit)} allowed.`;
  }
}

/** The earliest rule the phase broke, if any. */
function findingOf(
  s: PropStatus,
  rules: PropRuleSet,
  timeZone: string,
): BreachFinding | undefined {
  const found: BreachFinding[] = [];
  if (s.dailyLoss.breachedOn !== undefined)
    found.push({
      rule: 'daily-loss',
      date: s.dailyLoss.breachedOn,
      value: -(s.dailyLoss.breachedNet ?? -s.dailyLoss.limit),
      limit: s.dailyLoss.limit,
    });
  if (s.drawdown.breachedAt !== undefined)
    found.push({
      rule: 'max-drawdown',
      date: localDate(s.drawdown.breachedAt, timeZone),
      // The limit, plus how far under it the equity went.
      value:
        rules.maxDrawdown +
        ((s.drawdown.breachedFloor ?? 0) - (s.drawdown.breachedEquity ?? 0)),
      limit: rules.maxDrawdown,
    });
  if (s.period?.ended && s.overall === 'breached') {
    const best = s.consistency?.bestDay;
    const onlyConsistency =
      s.profit.current >= rules.profitTarget &&
      s.tradingDays.met &&
      s.consistency !== null &&
      !s.consistency.met &&
      best != null;
    found.push(
      onlyConsistency
        ? {
            rule: 'consistency',
            date: best.date,
            value: best.net,
            limit: Math.round(s.consistency!.limitPct * s.profit.current),
          }
        : {
            rule: 'period-ended',
            date: s.period.lastDay,
            value: Math.max(0, s.profit.current),
            limit: rules.profitTarget,
          },
    );
  }
  return found.sort((a, b) => a.date.localeCompare(b.date))[0];
}

function phaseCheck(
  phase: Challenge['phases'][number],
  accounts: readonly Account[],
  trades: readonly Trade[],
  flows: readonly CashFlow[],
  ctx: MetricContext,
  today: string,
): ChallengePhaseCheck {
  const account = accounts.find((a) => a.id === phase.accountId);
  if (!account) return { step: phase.step, archived: false };
  const own = trades.filter(
    (t) =>
      t.accountId === account.id &&
      t.pnlCurrency === account.currency &&
      (phase.startDate === undefined ||
        localDate(t.closedAt ?? t.openedAt, ctx.timeZone) >= phase.startDate),
  );
  return {
    step: phase.step,
    accountId: account.id,
    archived: account.status === 'archived',
    account,
    balance: balanceAt([account], flows, own, today, ctx),
    ...(account.propRules && {
      state: evaluateProp({
        startingBalance: account.startingBalance,
        rules: account.propRules,
        trades: own,
        timeZone: ctx.timeZone,
        now: FAR_FUTURE,
        today,
        ...(phase.startDate !== undefined && { startDate: phase.startDate }),
      }),
    }),
  };
}

/**
 * Where the challenge stands today, on closed trades and net P&L. It only
 * reads: the stored status is the trader's, and a breach or a met target is a
 * suggestion for the card to offer. `flows` move a phase's balance, not its
 * profit. The current step is the first phase with an account whose evaluation
 * hasn't met its target, or the funded phase.
 */
export function checkChallenge(
  c: Challenge,
  accounts: readonly Account[],
  trades: readonly Trade[],
  ctx: MetricContext,
  today: string,
  flows: readonly CashFlow[] = [],
): ChallengeCheck {
  const phases = c.phases.map((p) =>
    phaseCheck(p, accounts, trades, flows, ctx, today),
  );
  const met = (p: ChallengePhaseCheck) =>
    p.step !== 'funded' && p.state?.overall === 'target-reached';
  const current = phases.find((p) => p.accountId !== undefined && !met(p));
  const evalUnlinked = phases.some(
    (p) => p.step !== 'funded' && p.accountId === undefined,
  );
  const funded = phases.find((p) => p.step === 'funded');

  if (!current) {
    // Every linked evaluation step is on target and the funded phase has no account yet.
    const reached = !evalUnlinked && phases.some(met);
    return {
      currentStep: evalUnlinked ? null : (funded?.step ?? null),
      health: reached ? 'target-met' : 'active',
      daysLeft: null,
      phases,
    };
  }
  const state = current.state;
  const rules = current.account?.propRules;
  const finding =
    state && rules && state.overall === 'breached'
      ? findingOf(state, rules, ctx.timeZone)
      : undefined;
  const near =
    state !== undefined &&
    (state.dailyLoss.state === 'near' || state.drawdown.state === 'near');
  return {
    currentStep: current.step,
    health:
      state?.overall === 'breached' ? 'breached' : near ? 'near' : 'active',
    ...(finding && { finding }),
    daysLeft: state?.period?.daysLeft ?? null,
    phases,
  };
}

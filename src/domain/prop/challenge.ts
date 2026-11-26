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
import { accountTrades, phaseTradesOf } from './phase';

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
  /** What the account has paid out: the sum of its withdrawals, positive. */
  paidOut?: Cents;
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

// Spelled out, not read from Intl: the en-GB short month for September is
// "Sept" in current engines, and Keel writes "Sep".
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** "12 Nov", from YYYY-MM-DD. */
function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
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
  // The account holds every trade of its own, whatever the phase's start date.
  const all = accountTrades(account, trades);
  const own = phaseTradesOf(phase.startDate, all, ctx.timeZone);
  return {
    step: phase.step,
    accountId: account.id,
    archived: account.status === 'archived',
    account,
    balance: balanceAt([account], flows, all, today, ctx),
    paidOut: flows
      .filter((f) => f.accountId === account.id && f.amount < 0)
      .reduce((sum, f) => sum - f.amount, 0),
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
 * profit. The current step is the funded phase once the stored phase is
 * funded; before that, the first evaluation step that is unlinked or hasn't met
 * its target. When that step is unlinked and the one before it is met, or when
 * every evaluation step is met, the last met step stays current with health
 * 'target-met': the funded phase is the trader's to start.
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
  const met = (p: ChallengePhaseCheck) => p.state?.overall === 'target-reached';
  const evals = phases.filter((p) => p.step !== 'funded');
  let current: ChallengePhaseCheck | undefined;
  let onTarget = false;
  if (c.phase === 'funded') {
    current = phases.find((p) => p.step === 'funded');
  } else {
    const i = evals.findIndex((p) => p.accountId === undefined || !met(p));
    if (i === -1) {
      current = evals[evals.length - 1];
      onTarget = true;
    } else if (i > 0 && evals[i]!.accountId === undefined) {
      // The next step isn't linked yet: the met step before it carries on.
      current = evals[i - 1];
      onTarget = true;
    } else {
      current = evals[i];
    }
  }
  if (!current)
    return { currentStep: null, health: 'active', daysLeft: null, phases };
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
    health: onTarget
      ? 'target-met'
      : state?.overall === 'breached'
        ? 'breached'
        : near
          ? 'near'
          : 'active',
    ...(finding && { finding }),
    daysLeft: state?.period?.daysLeft ?? null,
    phases,
  };
}

/**
 * How urgent a challenge is, the least first: a breach to confirm, a limit
 * near, a target met, then the rest of the active ones, then those passed and
 * those breached. The Prop firms page sorts its cards by it.
 */
export function urgencyOf(c: Challenge, check: ChallengeCheck): number {
  if (c.status === 'active') {
    if (check.health === 'breached') return 0;
    if (check.health === 'near') return 1;
    if (check.health === 'target-met') return 2;
    return 3;
  }
  return c.status === 'passed' ? 4 : 5;
}

/**
 * The challenge a dashboard widget shows: the one asked for, when it is still
 * there, else the most urgent (as the Prop firms page sorts, so an active one
 * comes before any passed or breached one). Undefined with no challenge.
 */
export function shownChallenge<
  T extends { c: Challenge; check: ChallengeCheck },
>(rows: readonly T[], asked: string | undefined): T | undefined {
  const named =
    asked === undefined ? undefined : rows.find((r) => r.c.id === asked);
  if (named) return named;
  // The sort is stable, so equally urgent challenges stay in their stored order.
  return [...rows].sort(
    (a, b) => urgencyOf(a.c, a.check) - urgencyOf(b.c, b.check),
  )[0];
}

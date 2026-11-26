import { balanceAt, dayBefore } from '../metrics/balance';
import { inRange, type MetricContext } from '../metrics/context';
import { roundHalfAway } from '../money';
import { localDate } from '../time';
import type {
  Account,
  BreachReason,
  Cents,
  Challenge,
  PropTxn,
  PropTxnCategory,
  Trade,
} from '../types';
import { TXN_CATEGORY_LABELS } from './transactions';

/**
 * What the prop dashboard reads, as pure functions over the workspace's
 * challenges, accounts and prop transactions. Money is in the base currency
 * (C58): the caller passes the accounts and trades it wants counted, and
 * leaves out and names the ones in another currency.
 */

export type ChallengeType = '1-step' | '2-step' | 's2f';

export const CHALLENGE_TYPE_LABELS: Record<ChallengeType, string> = {
  '1-step': '1-step',
  '2-step': '2-step',
  s2f: 'Straight to funded',
};
const TYPE_ORDER: ChallengeType[] = ['1-step', '2-step', 's2f'];

/**
 * The five reasons a breach can give, in the order the Mark as breached dialog
 * asks them, worded as the dialog and the breach insights show them (C33).
 */
export const BREACH_REASON_LABELS: Record<BreachReason, string> = {
  'max-drawdown': 'Broke the max drawdown',
  overtrading: 'Overtrading or forcing trades',
  'time-pressure': 'Time pressure',
  'risk-management': 'Lack of risk management',
  other: 'Other',
};
export const BREACH_REASONS = Object.keys(
  BREACH_REASON_LABELS,
) as BreachReason[];

export interface PropFilters {
  firm?: string[];
  phase?: 'evaluation' | 'funded';
  /** 'active': every challenge not breached (Keel's passed one too); 'breached'. */
  status?: 'active' | 'breached';
  /** Account sizes, in cents. */
  size?: number[];
  type?: ChallengeType[];
  strategy?: string[];
  /** Inclusive local dates; an open end is open. */
  range?: { from?: string; to?: string };
}

export interface Money {
  /** What went out, never negative. */
  spent: Cents;
  earned: Cents;
  net: Cents;
}

export interface RoiPoint {
  date: string;
  income: Cents;
  costs: Cents;
  net: Cents;
}

export interface BreakdownRow {
  key: string;
  label: string;
  spent: Cents;
  earned: Cents;
  net: Cents;
  /** Challenges of the group in the list; transactions in a fee row. */
  count: number;
}

export interface PassRateRow {
  key: string;
  label: string;
  passed: number;
  attempted: number;
}

export interface BreachInsights {
  reasons: { reason: BreachReason; count: number; share: number }[];
  avgDays: number | null;
  avgPnl: Cents | null;
  commonSize: number | null;
  commonFirm: string | null;
}

type Group = { key: string; label: string };
const NONE: Group = { key: 'none', label: 'None' };

const byId = (accounts: readonly Account[]): ReadonlyMap<string, Account> =>
  new Map(accounts.map((a) => [a.id, a]));

/** A row that moves money: an ignored row never counts, whatever sees it. */
const counts = (i: PropTxn): boolean =>
  i.status !== 'ignored' && i.amount !== 0;

function has<T>(a: readonly T[] | undefined): a is readonly T[] {
  return a !== undefined && a.length > 0;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/** The earliest start date any phase has; undefined when none has one. */
export function firstStart(c: Challenge): string | undefined {
  let first: string | undefined;
  for (const p of c.phases)
    if (
      p.startDate !== undefined &&
      (first === undefined || p.startDate < first)
    )
      first = p.startDate;
  return first;
}

/** The local day each account first traded (by account id), from when each trade opened. */
export function firstTradeDays(
  trades: readonly Trade[],
  timeZone: string,
): Map<string, string> {
  const first = new Map<string, string>();
  for (const t of trades) {
    const day = localDate(t.openedAt, timeZone);
    const seen = first.get(t.accountId);
    if (seen === undefined || day < seen) first.set(t.accountId, day);
  }
  return first;
}

/**
 * The day a challenge started: its earliest phase start date, else the day its
 * accounts first traded (`firstTradeDays`); null with neither.
 */
export function startedOn(
  c: Challenge,
  firstTrade: ReadonlyMap<string, string>,
): string | null {
  return (
    firstStart(c) ??
    c.phases
      .map((p) => firstTrade.get(p.accountId ?? ''))
      .filter((d): d is string => d !== undefined)
      .sort()[0] ??
    null
  );
}

export type AccountsGroup = 'evaluations' | 'funded' | 'breached';

/**
 * The Accounts sub-tab a challenge sits in (C62). Breached: breached, whatever
 * its phase. Funded: funded, or passed (Keel's "passed" waits there until its
 * funded account is linked), and not breached. Evaluations: the rest, the
 * active challenges in an evaluation phase.
 */
export function accountsGroup(c: Challenge): AccountsGroup {
  if (c.status === 'breached') return 'breached';
  if (c.phase === 'funded' || c.status === 'passed') return 'funded';
  return 'evaluations';
}

/**
 * 1-step or 2-step from `steps`; straight to funded is a challenge created in
 * the funded phase, whose phases hold no evaluation step with an account or a
 * start date (C30).
 */
export function challengeType(c: Challenge): ChallengeType {
  if (
    c.phase === 'funded' &&
    !c.phases.some(
      (p) =>
        p.step !== 'funded' &&
        (p.accountId !== undefined || p.startDate !== undefined),
    )
  )
    return 's2f';
  return c.steps === 2 ? '2-step' : '1-step';
}

function sizeIn(
  c: Challenge,
  accounts: ReadonlyMap<string, Account>,
): Cents | null {
  for (const p of c.phases) {
    const a = p.accountId === undefined ? undefined : accounts.get(p.accountId);
    if (a) return a.startingBalance;
  }
  return null;
}

/** The first phase account's starting balance; null when no account is linked (C31). */
export function accountSize(
  c: Challenge,
  accounts: readonly Account[],
): Cents | null {
  return sizeIn(c, byId(accounts));
}

// One formatter: building it per call costs more than the rest of a breakdown.
const SIZE_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});
const sizeLabel = (size: Cents): string => SIZE_FORMAT.format(size / 100);

const sizeGroup = (size: Cents | null): Group =>
  size === null ? NONE : { key: String(size), label: sizeLabel(size) };

const firmGroup = (firm: string): Group =>
  firm.trim() === '' ? NONE : { key: firm, label: firm };

/** The groups a challenge sits in: one, except by strategy, where it sits in each of its own. */
function groupsOf(
  by: 'firm' | 'type' | 'size' | 'strategy',
  c: Challenge,
  accounts: ReadonlyMap<string, Account>,
): Group[] {
  switch (by) {
    case 'firm':
      return [firmGroup(c.firm)];
    case 'type': {
      const t = challengeType(c);
      return [{ key: t, label: CHALLENGE_TYPE_LABELS[t] }];
    }
    case 'size':
      return [sizeGroup(sizeIn(c, accounts))];
    case 'strategy': {
      const ids = [...new Set(c.strategyIds ?? [])];
      return ids.length > 0
        ? ids.map((id) => ({ key: id, label: id }))
        : [NONE];
    }
  }
}

/** None last; type in its own order, size smallest first; the rest by `weight`, biggest first. */
function sortGroups<T extends Group>(
  rows: T[],
  by: 'firm' | 'type' | 'size' | 'strategy',
  weight: (r: T) => number[],
): T[] {
  return rows.sort((a, b) => {
    const none = (a.key === NONE.key ? 1 : 0) - (b.key === NONE.key ? 1 : 0);
    if (none !== 0) return none;
    if (by === 'type')
      return (
        TYPE_ORDER.indexOf(a.key as ChallengeType) -
        TYPE_ORDER.indexOf(b.key as ChallengeType)
      );
    if (by === 'size') return Number(a.key) - Number(b.key);
    const wa = weight(a);
    const wb = weight(b);
    for (let i = 0; i < wa.length; i++) {
      const d = wb[i]! - wa[i]!;
      if (d !== 0) return d;
    }
    return a.label.localeCompare(b.label);
  });
}

// ---- Money -------------------------------------------------------------

const FEE_FIELDS = [
  ['evaluationFee', 'evaluation-fee', 'Evaluation fee'],
  ['activationFee', 'activation-fee', 'Activation fee'],
] as const;

/**
 * Every row that counts: the transactions not ignored, plus a synthetic cost
 * for each fee field of a challenge that no linked cost of its category
 * replaces (C28), dated the challenge's first start. A challenge with no start
 * date has its fee counted with no date: it is in the totals and the
 * breakdowns, and in no window or range.
 */
export function spendItems(
  challenges: readonly Challenge[],
  txns: readonly PropTxn[],
): PropTxn[] {
  const items = txns.filter((t) => t.status !== 'ignored');
  // A cost linked to a challenge is that fee's own record; a refund is not.
  const linked = new Set<string>();
  for (const t of items)
    if (t.challengeId !== undefined && t.amount < 0)
      linked.add(`${t.challengeId}:${t.category}`);
  for (const c of challenges) {
    const date = firstStart(c) ?? '';
    for (const [field, category, label] of FEE_FIELDS) {
      const fee = c[field];
      if (fee === undefined || fee <= 0 || linked.has(`${c.id}:${category}`))
        continue;
      items.push({
        id: `fee-${c.id}-${category}`,
        workspaceId: c.workspaceId,
        date,
        description: `${label}, ${c.name}`,
        firm: c.firm,
        challengeId: c.id,
        category,
        amount: -fee,
        status: 'reviewed',
      });
    }
  }
  return items;
}

/**
 * The sign decides (C60): a negative amount is spent, a positive one earned,
 * whatever its category. ROI is the net over what was spent, null with no
 * spend (C32). `payouts` counts the positive payout rows.
 */
export function totals(
  items: readonly PropTxn[],
): Money & { roi: number | null; payouts: number } {
  let spent = 0;
  let earned = 0;
  let payouts = 0;
  for (const i of items) {
    if (!counts(i)) continue;
    if (i.amount < 0) spent -= i.amount;
    else {
      earned += i.amount;
      if (i.category === 'payout') payouts++;
    }
  }
  const net = earned - spent;
  return { spent, earned, net, roi: spent > 0 ? net / spent : null, payouts };
}

const WINDOW_DAYS = { '1w': 7, '1m': 30, '1y': 365 } as const;

/**
 * A point a day over the window that ends on `end` (7, 30 or 365 days),
 * adding up what came in and went out from the window's first day: the last
 * point is the window's totals. Rows with no date or outside the window stay
 * out (C36).
 */
export function roiSeries(
  items: readonly PropTxn[],
  window: '1w' | '1m' | '1y',
  end: string,
): RoiPoint[] {
  const days = WINDOW_DAYS[window];
  const start = addDays(end, 1 - days);
  const income = new Map<string, Cents>();
  const costs = new Map<string, Cents>();
  for (const i of items) {
    if (!counts(i) || i.date < start || i.date > end) continue;
    const into = i.amount > 0 ? income : costs;
    into.set(i.date, (into.get(i.date) ?? 0) + Math.abs(i.amount));
  }
  const out: RoiPoint[] = [];
  const day = new Date(`${start}T00:00:00Z`);
  let inc = 0;
  let cost = 0;
  for (let k = 0; k < days; k++) {
    const date = day.toISOString().slice(0, 10);
    inc += income.get(date) ?? 0;
    cost += costs.get(date) ?? 0;
    out.push({ date, income: inc, costs: cost, net: inc - cost });
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}

/** The fee rows' order in the breakdown: the fees first, then the incomes, then the rest. */
const FEE_ORDER: { category: PropTxnCategory; label: string }[] = (
  [
    'evaluation-fee',
    'activation-fee',
    'reset-fee',
    'payout',
    'affiliate-income',
    'uncategorized',
  ] as const
).map((category) => ({ category, label: TXN_CATEGORY_LABELS[category] }));

/**
 * Spent, earned and net by firm, account type or account size; a row with no
 * challenge (or no size) reads None. By fee it groups the negative amounts by
 * category, uncategorized included, in the category order (C60): all of a fee
 * row is spent, and its count is its transactions. Elsewhere a row's count is
 * the challenges of its group in `inView` (all of `challenges` by default):
 * `challenges` is what groups the rows, so a row linked to a challenge a
 * filter leaves out of view still counts in its own group.
 */
export function breakdown(
  items: readonly PropTxn[],
  challenges: readonly Challenge[],
  accounts: readonly Account[],
  by: 'firm' | 'type' | 'size' | 'fee',
  inView: readonly Challenge[] = challenges,
): BreakdownRow[] {
  if (by === 'fee') {
    const rows = new Map<PropTxnCategory, BreakdownRow>();
    for (const i of items) {
      if (!counts(i) || i.amount > 0) continue;
      let row = rows.get(i.category);
      if (!row) {
        const f = FEE_ORDER.find((x) => x.category === i.category)!;
        row = {
          key: f.category,
          label: f.label,
          spent: 0,
          earned: 0,
          net: 0,
          count: 0,
        };
        rows.set(i.category, row);
      }
      row.spent -= i.amount;
      row.net += i.amount;
      row.count++;
    }
    return FEE_ORDER.flatMap((f) => rows.get(f.category) ?? []);
  }

  const accountById = byId(accounts);
  const groupOfChallenge = new Map(
    challenges.map((c) => [c.id, groupsOf(by, c, accountById)[0]!]),
  );
  const rows = new Map<string, BreakdownRow>();
  for (const i of items) {
    if (!counts(i)) continue;
    const g =
      by === 'firm'
        ? firmGroup(i.firm)
        : ((i.challengeId === undefined
            ? undefined
            : groupOfChallenge.get(i.challengeId)) ?? NONE);
    let row = rows.get(g.key);
    if (!row) {
      row = {
        key: g.key,
        label: g.label,
        spent: 0,
        earned: 0,
        net: 0,
        count: 0,
      };
      rows.set(g.key, row);
    }
    if (i.amount < 0) row.spent -= i.amount;
    else row.earned += i.amount;
    row.net += i.amount;
  }
  const viewed = new Set(inView.map((c) => c.id));
  for (const [id, g] of groupOfChallenge) {
    const row = viewed.has(id) ? rows.get(g.key) : undefined;
    if (row) row.count++;
  }
  return sortGroups([...rows.values()], by, (r) => [r.spent + r.earned]);
}

// ---- Pass rate ---------------------------------------------------------

/**
 * How a challenge's evaluation ended, null while it has no outcome. A straight
 * to funded challenge never took an evaluation, so it has none (Ruling 12).
 * Passed is `passed` or moved to funded, whether or not the funded account
 * broke since (C32); a breach in an evaluation phase is a failure.
 */
function evaluationResult(c: Challenge): 'passed' | 'failed' | null {
  if (challengeType(c) === 's2f') return null;
  if (c.status === 'passed') return 'passed';
  if (c.status === 'breached')
    return c.phase === 'evaluation' ? 'failed' : 'passed';
  return c.phase === 'funded' ? 'passed' : null;
}

/**
 * Passed over attempted, overall and by firm, type, size or strategy. An
 * attempt is an evaluation that passed (or moved to funded) or was breached;
 * active ones and straight-to-funded ones are not counted (C32), and a group
 * with none has no row. A challenge counts under
 * each of its strategies and once overall. A strategy row's label is its id.
 */
export function passRates(
  challenges: readonly Challenge[],
  accounts: readonly Account[],
  by: 'firm' | 'type' | 'size' | 'strategy',
): { overall: { passed: number; attempted: number }; rows: PassRateRow[] } {
  const accountById = byId(accounts);
  const overall = { passed: 0, attempted: 0 };
  const rows = new Map<string, PassRateRow>();
  for (const c of challenges) {
    const result = evaluationResult(c);
    if (result === null) continue;
    overall.attempted++;
    if (result === 'passed') overall.passed++;
    for (const g of groupsOf(by, c, accountById)) {
      let row = rows.get(g.key);
      if (!row) {
        row = { key: g.key, label: g.label, passed: 0, attempted: 0 };
        rows.set(g.key, row);
      }
      row.attempted++;
      if (result === 'passed') row.passed++;
    }
  }
  return {
    overall,
    rows: sortGroups([...rows.values()], by, (r) => [r.attempted, r.passed]),
  };
}

// ---- Breach insights ---------------------------------------------------

/** The value met most often; a tie goes to the one with the latest date. */
function mostCommon<K>(entries: { key: K; on: string }[]): K | null {
  const tally = new Map<K, { n: number; last: string }>();
  for (const e of entries) {
    const t = tally.get(e.key);
    if (!t) tally.set(e.key, { n: 1, last: e.on });
    else {
      t.n++;
      if (e.on > t.last) t.last = e.on;
    }
  }
  let best: K | null = null;
  let top: { n: number; last: string } | undefined;
  for (const [key, t] of tally)
    if (!top || t.n > top.n || (t.n === top.n && t.last > top.last)) {
      best = key;
      top = t;
    }
  return best;
}

/** The phase that was live when the challenge broke: the last one of its kind started by then. */
function breachedPhase(
  c: Challenge,
  which: 'evaluation' | 'funded',
): Challenge['phases'][number] | undefined {
  const live = c.phases.filter(
    (p) =>
      (p.step === 'funded') === (which === 'funded') &&
      (p.accountId !== undefined || p.startDate !== undefined),
  );
  const on = c.breachedOn;
  const started =
    on === undefined
      ? live
      : live.filter((p) => p.startDate === undefined || p.startDate <= on);
  return started[started.length - 1] ?? live[0];
}

/**
 * Why and how accounts broke: the breached challenges whose phase is `which`.
 * Reasons are ranked by count, ties by the most recent breach, and a breach
 * with no reason reads "other" (C33). Days are the breach date less the live
 * phase's start, and P&L is that phase account's net from its start to the
 * breach (C34); a breach with no date, start or account is left out of the
 * averages and still counted in the rest. Size and firm go by count, ties to
 * the latest breach. A phase account's trades are those in its own currency.
 */
export function breachInsights(
  challenges: readonly Challenge[],
  accounts: readonly Account[],
  trades: readonly Trade[],
  ctx: Pick<MetricContext, 'timeZone'>,
  which: 'evaluation' | 'funded',
): BreachInsights {
  const breached = challenges.filter(
    (c) => c.status === 'breached' && c.phase === which,
  );
  if (breached.length === 0)
    return {
      reasons: [],
      avgDays: null,
      avgPnl: null,
      commonSize: null,
      commonFirm: null,
    };

  const accountById = byId(accounts);
  const tradesOf = new Map<string, Trade[]>();
  for (const t of trades) {
    const list = tradesOf.get(t.accountId);
    if (list) list.push(t);
    else tradesOf.set(t.accountId, [t]);
  }

  const reasons = new Map<BreachReason, { count: number; last: string }>();
  const sizes: { key: number; on: string }[] = [];
  const firms: { key: string; on: string }[] = [];
  const days: number[] = [];
  const pnls: Cents[] = [];
  for (const c of breached) {
    const on = c.breachedOn ?? '';
    const reason = c.breachReason ?? 'other';
    const r = reasons.get(reason);
    if (!r) reasons.set(reason, { count: 1, last: on });
    else {
      r.count++;
      if (on > r.last) r.last = on;
    }
    const size = sizeIn(c, accountById);
    if (size !== null) sizes.push({ key: size, on });
    firms.push({ key: c.firm, on });

    const phase = breachedPhase(c, which);
    if (phase === undefined || c.breachedOn === undefined) continue;
    if (phase.startDate !== undefined)
      days.push(Math.max(0, daysBetween(phase.startDate, c.breachedOn)));
    const account =
      phase.accountId === undefined
        ? undefined
        : accountById.get(phase.accountId);
    if (!account) continue;
    const own = (tradesOf.get(account.id) ?? []).filter(
      (t) => t.pnlCurrency === account.currency,
    );
    const until = balanceAt([account], [], own, c.breachedOn, ctx);
    const from =
      phase.startDate === undefined
        ? account.startingBalance
        : balanceAt([account], [], own, dayBefore(phase.startDate), ctx);
    pnls.push(until - from);
  }

  const mean = (xs: number[]) => xs.reduce((n, x) => n + x, 0) / xs.length;
  return {
    reasons: [...reasons]
      .map(([reason, r]) => ({ reason, ...r }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) ||
          a.reason.localeCompare(b.reason),
      )
      .map((r) => ({
        reason: r.reason,
        count: r.count,
        share: r.count / breached.length,
      })),
    avgDays: days.length > 0 ? mean(days) : null,
    avgPnl: pnls.length > 0 ? roundHalfAway(mean(pnls)) : null,
    commonSize: mostCommon(sizes),
    commonFirm: mostCommon(firms),
  };
}

// ---- Filters -----------------------------------------------------------

const bounded = (
  r: PropFilters['range'],
): r is NonNullable<PropFilters['range']> =>
  r !== undefined && (r.from !== undefined || r.to !== undefined);

/** Phase, status, size, type and strategy: what a challenge is, apart from its firm and its dates. */
function matchesTraits(
  c: Challenge,
  accounts: ReadonlyMap<string, Account>,
  f: PropFilters,
): boolean {
  if (f.phase !== undefined && c.phase !== f.phase) return false;
  if (f.status === 'breached' && c.status !== 'breached') return false;
  if (f.status === 'active' && c.status === 'breached') return false;
  if (has(f.size)) {
    const size = sizeIn(c, accounts);
    if (size === null || !f.size.includes(size)) return false;
  }
  if (has(f.type) && !f.type.includes(challengeType(c))) return false;
  if (has(f.strategy)) {
    const own = c.strategyIds ?? [];
    if (!f.strategy.some((id) => own.includes(id))) return false;
  }
  return true;
}

/**
 * The challenges that pass every filter (a filter with several values passes
 * any of them). The range tests a challenge's first start date (C37): with a
 * bound set, a challenge with no start date is outside it. 'active' is every
 * challenge not breached.
 */
export function filterChallenges(
  cs: readonly Challenge[],
  accounts: readonly Account[],
  f: PropFilters,
): Challenge[] {
  const accountById = byId(accounts);
  return cs.filter((c) => {
    if (has(f.firm) && !f.firm.includes(c.firm)) return false;
    if (!matchesTraits(c, accountById, f)) return false;
    if (bounded(f.range)) {
      const start = firstStart(c);
      if (start === undefined || !inRange(start, f.range)) return false;
    }
    return true;
  });
}

/**
 * The rows that pass the filters. The range tests a row's own date (C37), and
 * a row with no date is outside any bound. The firm filter reads the row's
 * firm; the others read the challenge the row is linked to, found in `cs`
 * (every challenge, not the filtered ones), so a row with no challenge is out
 * of those filters.
 */
export function filterItems(
  items: readonly PropTxn[],
  cs: readonly Challenge[],
  accounts: readonly Account[],
  f: PropFilters,
): PropTxn[] {
  const accountById = byId(accounts);
  const challengeById = new Map(cs.map((c) => [c.id, c]));
  const ofChallenge =
    f.phase !== undefined ||
    f.status !== undefined ||
    has(f.size) ||
    has(f.type) ||
    has(f.strategy);
  return items.filter((i) => {
    if (bounded(f.range) && (i.date === '' || !inRange(i.date, f.range)))
      return false;
    if (has(f.firm) && !f.firm.includes(i.firm)) return false;
    if (!ofChallenge) return true;
    const c =
      i.challengeId === undefined
        ? undefined
        : challengeById.get(i.challengeId);
    return c !== undefined && matchesTraits(c, accountById, f);
  });
}

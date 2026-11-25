import { defaultMetricContext } from '@/domain/metrics/context';
import {
  checkChallenge,
  findingText,
  type BreachFinding,
} from '@/domain/prop/challenge';
import { evaluateProp } from '@/domain/prop/evaluate';
import { localDate } from '@/domain/time';
import type {
  Account,
  BreachReason,
  Cents,
  Challenge,
  PropRuleSet,
  PropTxn,
  Trade,
} from '@/domain/types';
import { SAMPLE_WORKSPACE } from '../workspaces';
import { DAY_MS, NY, nyMs, parseYmd, ymd } from './calendar';
import { FUTURES_SPECS, type AccountSpec } from './instruments';
import { createRandom, type Random } from './random';
import type { BuildPlanTrades, Plan, PlanTrade } from './generate';

const WS = SAMPLE_WORKSPACE.id;
const FIRM = 'Sample prop firm';
const FAR_FUTURE = '9999-12-31T00:00:00Z';

interface PropAccountSpec extends AccountSpec {
  /**
   * The random stream of this account's trading. Streams are absolute, not
   * the workspace seed plus an offset, so each outcome holds for every sample
   * seed; `generate.test.ts` pins what each one produces.
   */
  stream: number;
  /** The index in the sample's weekdays of the first day it may trade. */
  firstDay: number;
  /** The trader stops on the day the phase reaches its outcome: the target met or a rule broken. */
  stopsAtOutcome: boolean;
  rules: PropRuleSet;
}

const EVAL_50K: PropRuleSet = {
  firm: FIRM,
  phase: 'evaluation',
  profitTarget: 300_000,
  dailyLossLimit: 100_000,
  maxDrawdown: 200_000,
  drawdownType: 'eod-trailing',
  minTradingDays: 5,
  consistencyPct: 0.5,
  periodDays: 45,
};

/** The three accounts the prop challenges add, in the order the sample lists them. */
export const PROP_ACCOUNT_SPECS: PropAccountSpec[] = [
  {
    id: 'sample-futures-50k-eval',
    name: 'Futures 50K evaluation',
    broker: FIRM,
    type: 'prop-evaluation',
    startingBalance: 5_000_000,
    specs: FUTURES_SPECS,
    openH: 9,
    openM: 30,
    sessionMin: 390,
    activeProb: 0.96,
    perDay: [2, 4],
    risk: 75,
    days: 40,
    firstDay: 54,
    stream: 4,
    stopsAtOutcome: true,
    rules: EVAL_50K,
  },
  {
    id: 'sample-futures-50k-funded',
    name: 'Futures 50K funded',
    broker: FIRM,
    type: 'prop-funded',
    startingBalance: 5_000_000,
    specs: FUTURES_SPECS,
    openH: 9,
    openM: 30,
    sessionMin: 390,
    activeProb: 0.96,
    perDay: [2, 4],
    risk: 70,
    days: 30,
    firstDay: 90,
    stream: 3,
    stopsAtOutcome: false,
    rules: {
      firm: FIRM,
      phase: 'funded',
      profitTarget: 0,
      dailyLossLimit: 100_000,
      maxDrawdown: 200_000,
      drawdownType: 'trailing',
      minTradingDays: 5,
    },
  },
  {
    id: 'sample-futures-100k-eval',
    name: 'Futures 100K evaluation',
    broker: FIRM,
    type: 'prop-evaluation',
    startingBalance: 10_000_000,
    specs: FUTURES_SPECS,
    openH: 9,
    openM: 30,
    sessionMin: 390,
    activeProb: 0.96,
    perDay: [2, 5],
    risk: 260,
    days: 40,
    firstDay: 78,
    stream: 81,
    stopsAtOutcome: true,
    rules: {
      firm: FIRM,
      phase: 'evaluation',
      profitTarget: 800_000,
      dailyLossLimit: 200_000,
      maxDrawdown: 400_000,
      drawdownType: 'static',
      minTradingDays: 5,
    },
  },
];

/** The weekdays an account may trade, and its plans for them, drawn from its own stream. */
function planAccount(
  spec: PropAccountSpec,
  stream: number,
  days: readonly string[],
  endDate: string,
  planTrade: PlanTrade,
): Plan[] {
  const rng = createRandom(stream);
  const prices = new Map<string, number>();
  for (const s of FUTURES_SPECS)
    if (!prices.has(s.walk)) prices.set(s.walk, s.price0);
  const plans: Plan[] = [];
  const window = days.slice(spec.firstDay, spec.firstDay + spec.days);
  window.forEach((date, i) => {
    for (const [walk, price] of prices) {
      const inst = FUTURES_SPECS.find((s) => s.walk === walk)!;
      prices.set(walk, price * (1 + rng.around(0.0002, inst.vol)));
    }
    if (i > 0 && !rng.chance(spec.activeProb)) return;
    const openMs = nyMs(date, spec.openH, spec.openM);
    const sessionSec = spec.sessionMin * 60;
    let cursor = rng.int(0, 20) * 60;
    const count = rng.int(spec.perDay[0], spec.perDay[1]);
    for (let k = 0; k < count; k++) {
      const total = spec.specs.reduce((n, x) => n + x.weight, 0);
      let r = rng.next() * total;
      let inst = spec.specs[spec.specs.length - 1]!;
      for (const x of spec.specs) {
        r -= x.weight;
        if (r < 0) {
          inst = x;
          break;
        }
      }
      const durSec = rng.int(4, 50) * 60 + rng.int(0, 59);
      const startSec = cursor + rng.int(1, 12) * 60 + rng.int(0, 59);
      if (startSec + durSec > sessionSec - 60) break;
      cursor = startSec + durSec;
      const plan = planTrade(
        rng,
        spec,
        inst,
        date,
        openMs + startSec * 1000,
        durSec,
        prices,
        new Map(),
        endDate,
      );
      if (plan) plans.push(plan);
    }
  });
  return plans;
}

/** The account's trades up to the day its phase reaches an outcome, when the trader stops there. */
function untilOutcome(spec: PropAccountSpec, trades: Trade[]): Trade[] {
  if (!spec.stopsAtOutcome) return trades;
  const days = [
    ...new Set(trades.map((t) => localDate(t.closedAt!, NY))),
  ].sort();
  for (const day of days) {
    const upTo = trades.filter((t) => localDate(t.closedAt!, NY) <= day);
    const state = evaluateProp({
      startingBalance: spec.startingBalance,
      rules: spec.rules,
      trades: upTo,
      timeZone: NY,
      now: FAR_FUTURE,
      today: day,
    });
    if (state.overall !== 'in-progress') return upTo;
  }
  return trades;
}

export interface PropDeps {
  planTrade: PlanTrade;
  buildPlanTrades: BuildPlanTrades;
  /** The workspace's own decoration of a trade: strategy, rule checks, tags, rating, stop, target and excursion. */
  decorate: (rng: Random, t: Trade, plan: Plan) => void;
}

/** One new account's trades: its stream, planned, built and cut at its outcome. Exported for the stream search. */
export function simulateAccount(
  spec: PropAccountSpec,
  stream: number,
  days: readonly string[],
  endDate: string,
  deps: PropDeps,
): Trade[] {
  const plans = planAccount(spec, stream, days, endDate, deps.planTrade);
  // Strategies, tags, stops and the rest are drawn from a stream beside the trading's.
  const rng = createRandom(stream + 5000);
  return untilOutcome(
    spec,
    deps.buildPlanTrades(plans, `sample-prop-${spec.id.slice(15)}`, (t, plan) =>
      deps.decorate(rng, t, plan),
    ),
  );
}

const usd = (cents: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);

/** The reason a rule check's finding gives the trader's list (C33). */
const REASON_OF: Record<BreachFinding['rule'], BreachReason> = {
  'max-drawdown': 'max-drawdown',
  'daily-loss': 'risk-management',
  'period-ended': 'time-pressure',
  consistency: 'other',
};

/** The accounts, their trades and the three challenges of the sample's Prop firms page. */
export function addPropFirms(
  args: {
    endDate: string;
    days: readonly string[];
    /** The serial after the workspace's own trades. */
    firstSerial: number;
  } & PropDeps,
): { accounts: Account[]; trades: Trade[]; challenges: Challenge[] } {
  const accounts: Account[] = PROP_ACCOUNT_SPECS.map((a) => ({
    id: a.id,
    workspaceId: WS,
    name: a.name,
    broker: a.broker,
    type: a.type,
    currency: 'USD',
    startingBalance: a.startingBalance,
    status: 'active',
    propRules: a.rules,
  }));
  const trades = PROP_ACCOUNT_SPECS.flatMap((spec) =>
    simulateAccount(spec, spec.stream, args.days, args.endDate, args),
  );
  trades.sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
  trades.forEach((t, i) => {
    t.serial = args.firstSerial + i;
  });

  const firstDay = (accountId: string): string =>
    localDate(trades.find((t) => t.accountId === accountId)!.openedAt, NY);
  const [eval50, funded50, eval100] = PROP_ACCOUNT_SPECS.map((a) => a.id) as [
    string,
    string,
    string,
  ];
  const challenges: Challenge[] = [
    {
      id: 'sample-challenge-forex-100k',
      workspaceId: WS,
      name: 'Forex 100K',
      firm: FIRM,
      steps: 2,
      phases: [
        { step: 'step-1', accountId: 'sample-forex-prop' },
        { step: 'step-2' },
        { step: 'funded' },
      ],
      phase: 'evaluation',
      status: 'active',
      evaluationFee: 54_900,
      activationFee: 14_900,
    },
    {
      id: 'sample-challenge-futures-50k',
      workspaceId: WS,
      name: 'Futures 50K',
      firm: FIRM,
      steps: 1,
      phases: [
        { step: 'step-1', accountId: eval50, startDate: firstDay(eval50) },
        { step: 'funded', accountId: funded50, startDate: firstDay(funded50) },
      ],
      phase: 'funded',
      status: 'active',
      evaluationFee: 16_500,
      activationFee: 13_000,
    },
    {
      id: 'sample-challenge-futures-100k',
      workspaceId: WS,
      name: 'Futures 100K',
      firm: FIRM,
      steps: 1,
      phases: [
        { step: 'step-1', accountId: eval100, startDate: firstDay(eval100) },
        { step: 'funded' },
      ],
      phase: 'evaluation',
      status: 'breached',
      evaluationFee: 29_900,
      activationFee: 0,
    },
  ];
  // The breached challenge's reason is what its own check finds.
  const breached = challenges[2]!;
  const finding = checkChallenge(
    breached,
    accounts,
    trades,
    defaultMetricContext(NY),
    args.endDate,
  ).finding;
  if (!finding)
    throw new Error("the sample's breached challenge has no breach");
  breached.failureReason = findingText(finding, usd);
  // v7: the reason and the day, as the rule check found them (C33, C34).
  breached.breachReason = REASON_OF[finding.rule];
  breached.breachedOn = finding.date;
  return { accounts, trades, challenges };
}

const addDays = (date: string, n: number): string =>
  ymd(parseYmd(date) + n * DAY_MS);

/** The day a challenge starts: its earliest start date, else its first phase account's first trade. */
function startOf(c: Challenge, trades: readonly Trade[]): string {
  const dated = c.phases.flatMap((p) =>
    p.startDate === undefined ? [] : [p.startDate],
  );
  if (dated.length > 0) return dated.sort()[0]!;
  const account = c.phases.find((p) => p.accountId !== undefined)?.accountId;
  const days = trades
    .filter((t) => t.accountId === account)
    .map((t) => localDate(t.openedAt, NY))
    .sort();
  if (days[0] === undefined)
    throw new Error(`the sample's challenge "${c.name}" has no start`);
  return days[0];
}

/**
 * The strategies a challenge was traded with, most used first: the ones its
 * accounts' trades carry, one or two of them.
 */
function strategiesOf(
  c: Challenge,
  trades: readonly Trade[],
  rng: Random,
): string[] {
  const accounts = new Set(c.phases.flatMap((p) => p.accountId ?? []));
  const used = new Map<string, number>();
  for (const t of trades)
    if (accounts.has(t.accountId))
      for (const id of t.strategyIds) used.set(id, (used.get(id) ?? 0) + 1);
  const ranked = [...used].sort((a, b) => b[1] - a[1]);
  return ranked.slice(0, rng.int(1, 2)).map(([id]) => id);
}

/**
 * The money a sample trader moved through its prop firms, and what a
 * challenge records beyond v6 (C57). Both draw from streams of their own, so
 * nothing the generator wrote before moves. The shapes follow the comps: a
 * fee for each challenge (the Futures 50K evaluation fee, the Forex 100K one
 * and the breached challenge's, all matching their fee fields, which a linked
 * cost then replaces: C28), two resets on the breached challenge, two payouts
 * on the funded one, one ignored refund, and one uncategorized cost no
 * challenge owns. The activation fees stay fields, so both readings show.
 */
export function addPropFinances(args: {
  endDate: string;
  challenges: readonly Challenge[];
  /** The prop accounts' trades. */
  trades: readonly Trade[];
  strategyRng: Random;
  txnRng: Random;
}): { challenges: Challenge[]; propTxns: PropTxn[] } {
  const { endDate, trades, strategyRng: sr, txnRng: rng } = args;
  const challenges = args.challenges.map((c) => ({
    ...c,
    strategyIds: strategiesOf(c, trades, sr),
  }));
  const named = (name: string): Challenge => {
    const c = challenges.find((x) => x.name === name);
    if (!c) throw new Error(`the sample has no challenge "${name}"`);
    return c;
  };
  const forex = named('Forex 100K');
  const funded = named('Futures 50K');
  const broken = named('Futures 100K');
  const notAfterEnd = (date: string): string =>
    date > endDate ? endDate : date;

  const rows: Omit<PropTxn, 'id' | 'workspaceId'>[] = [];
  const add = (
    date: string,
    description: string,
    c: Challenge | undefined,
    category: PropTxn['category'],
    amount: Cents,
    status: PropTxn['status'],
    firm = FIRM,
  ): void => {
    rows.push({
      date,
      description,
      firm: c?.firm ?? firm,
      ...(c && { challengeId: c.id }),
      category,
      amount,
      status,
    });
  };
  /** A fee is paid up to three days before the challenge's first day. */
  const feeDate = (c: Challenge): string =>
    addDays(startOf(c, trades), -rng.int(0, 3));

  add(
    feeDate(broken),
    `Evaluation, ${broken.name}`,
    broken,
    'evaluation-fee',
    -broken.evaluationFee!,
    'reviewed',
  );
  // Two resets inside the breached challenge's life, a week apart at least.
  const born = startOf(broken, trades);
  const resetOne = rng.int(6, 12);
  const resetTwo = resetOne + rng.int(7, 14);
  add(
    addDays(born, resetOne),
    'Reset',
    broken,
    'reset-fee',
    -9_900,
    'reviewed',
  );
  add(
    notAfterEnd(addDays(born, resetTwo)),
    'Reset',
    broken,
    'reset-fee',
    -9_900,
    'not-reviewed',
  );
  add(
    feeDate(forex),
    `Evaluation, ${forex.name}`,
    forex,
    'evaluation-fee',
    -forex.evaluationFee!,
    'reviewed',
  );
  add(
    feeDate(funded),
    `Evaluation, ${funded.name}`,
    funded,
    'evaluation-fee',
    -funded.evaluationFee!,
    'reviewed',
  );
  // Payouts on the funded phase: the first a few weeks in, the second after it.
  const fundedFrom =
    funded.phases.find((p) => p.step === 'funded')?.startDate ??
    startOf(funded, trades);
  const firstPayout = addDays(fundedFrom, rng.int(14, 21));
  const secondPayout = addDays(firstPayout, rng.int(10, 16));
  add(
    notAfterEnd(firstPayout),
    'Payout',
    funded,
    'payout',
    180_000,
    'reviewed',
  );
  add(
    notAfterEnd(secondPayout),
    'Payout',
    funded,
    'payout',
    270_000,
    'not-reviewed',
  );
  // A refund the trader marked ignored, after the breach.
  add(
    notAfterEnd(addDays(broken.breachedOn ?? born, rng.int(3, 10))),
    'Card refund, duplicate charge',
    broken,
    'uncategorized',
    16_500,
    'ignored',
  );
  // A cost no challenge owns, from another payee.
  add(
    addDays(endDate, -rng.int(5, 20)),
    'Market data fee',
    undefined,
    'uncategorized',
    -2_900,
    'not-reviewed',
    'Sample data feed',
  );

  return {
    challenges,
    propTxns: rows.map((r, i) => ({
      ...r,
      id: `sample-prop-txn-${i + 1}`,
      workspaceId: WS,
    })),
  };
}

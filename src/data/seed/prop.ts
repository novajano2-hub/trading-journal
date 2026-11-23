import { defaultMetricContext } from '@/domain/metrics/context';
import { checkChallenge, findingText } from '@/domain/prop/challenge';
import { evaluateProp } from '@/domain/prop/evaluate';
import { localDate } from '@/domain/time';
import type { Account, Challenge, PropRuleSet, Trade } from '@/domain/types';
import { SAMPLE_WORKSPACE } from '../workspaces';
import { NY, nyMs } from './calendar';
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
  return { accounts, trades, challenges };
}

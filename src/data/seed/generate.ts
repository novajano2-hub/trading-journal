import { settleExpiredOptions } from '@/domain/import/expiry';
import { resolveInstrument } from '@/domain/instruments';
import { mistakeTags } from '@/domain/metrics/mistakes';
import { riskFromStop } from '@/domain/metrics/summary';
import { localDate } from '@/domain/time';
import { buildTrades } from '@/domain/trade-builder';
import { closedInOrder } from '@/domain/trade-status';
import {
  strategyRules,
  type Account,
  type AssetClass,
  type Execution,
  type JournalEntry,
  type Rule,
  type Side,
  type Challenge,
  type DayRecord,
  type Tracker,
  type Strategy,
  type Tag,
  type TagCategory,
  type Trade,
} from '@/domain/types';
import { SAMPLE_WORKSPACE } from '../workspaces';
import { DAY_MS, NY, dow, isWeekday, nyMs, parseYmd, ymd } from './calendar';
import {
  CUSTOM_NAMES,
  MISTAKE_NAMES,
  NEGATIVE_EMOTIONS,
  POSITIVE_EMOTIONS,
  SEED_GROUPS,
  STRATEGY_SEEDS,
  TAG_SEEDS,
} from './content';
import {
  ACCOUNT_SPECS,
  CRYPTO_SPECS,
  FOREX_SPECS,
  FUTURES_SPECS,
  OPTION_UNDERLYINGS,
  STOCK_SPECS,
  WEEKDAYS,
  feesFor,
  frontMonth,
  optionSymbol,
  snap,
  snapQty,
  type AccountSpec,
  type InstSpec,
} from './instruments';
import { writeDailyNotes, writeJournal } from './journal';
import { addPropFirms } from './prop';
import { writeRoutine } from './routine';
import { createRandom, type Random } from './random';
import { CATEGORIES, categoryIn } from './templates';

const WS = SAMPLE_WORKSPACE.id;

export const SAMPLE_SEED = 20261120;
export { SAMPLE_SEED_VERSION } from './version';

export interface SampleWorkspace {
  seed: number;
  endDate: string;
  accounts: Account[];
  strategies: Strategy[];
  tagCategories: TagCategory[];
  tags: Tag[];
  trades: Trade[];
  journal: JournalEntry[];
  challenges: Challenge[];
  tracker: Tracker;
  days: DayRecord[];
}

/** The last weekday strictly before `now`'s New York date. */
export function sampleEndDate(now: string): string {
  let ms = parseYmd(localDate(now, NY)) - DAY_MS;
  while (!isWeekday(ms)) ms -= DAY_MS;
  return ymd(ms);
}

/** A real YYYY-MM-DD date; a weekend rolls back to the Friday before it. */
function normalizeEndDate(endDate: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    ymd(parseYmd(endDate)) !== endDate
  )
    throw new Error(`endDate must be a real YYYY-MM-DD date, got "${endDate}"`);
  let ms = parseYmd(endDate);
  while (!isWeekday(ms)) ms -= DAY_MS;
  return ymd(ms);
}

function weekdaysEnding(endDate: string, count: number): string[] {
  const out: string[] = [];
  let ms = parseYmd(endDate);
  while (out.length < count) {
    if (isWeekday(ms)) out.unshift(ymd(ms));
    ms -= DAY_MS;
  }
  return out;
}

// ---- planning round trips -------------------------------------------------

interface Leg {
  side: Side;
  qty: number;
  price: number;
  at: number; // epoch ms
}
export interface Plan {
  accountId: string;
  symbol: string;
  cls: AssetClass;
  legs: Leg[];
  broke: boolean;
  expire: boolean;
  open: boolean;
  /** Stop distance in price units. */
  stop: number;
}

/** Realised result of a plan in multiples of its stop distance. */
function drawR(rng: Random, broke: boolean): number {
  if (rng.chance(broke ? 0.38 : 0.52))
    return broke
      ? Math.max(0.3, rng.around(1.0, 0.8))
      : Math.max(0.4, rng.around(1.55, 1.0));
  return -(broke
    ? Math.max(1.0, rng.around(1.45, 0.7))
    : Math.max(0.5, rng.around(0.95, 0.4)));
}

function weighted(rng: Random, specs: readonly InstSpec[]): InstSpec {
  const total = specs.reduce((s, x) => s + x.weight, 0);
  let r = rng.next() * total;
  for (const s of specs) {
    r -= s.weight;
    if (r < 0) return s;
  }
  return specs[specs.length - 1]!;
}

function durationMin(rng: Random, cls: AssetClass): number {
  switch (cls) {
    case 'future':
      return rng.int(4, 50);
    case 'forex':
      return rng.int(15, 150);
    case 'stock':
      return rng.int(6, 90);
    case 'option':
      return rng.int(5, 60);
    default:
      return rng.int(10, 120);
  }
}

// ---- the generator --------------------------------------------------------

export function generateSampleWorkspace(opts: {
  seed: number;
  endDate: string;
}): SampleWorkspace {
  const endDate = normalizeEndDate(opts.endDate);
  const rng = createRandom(opts.seed);
  const days = weekdaysEnding(endDate, WEEKDAYS);
  const lastDay = days[days.length - 1]!;

  const accounts: Account[] = ACCOUNT_SPECS.map((a) => ({
    id: a.id,
    workspaceId: WS,
    name: a.name,
    broker: a.broker,
    type: a.type,
    currency: 'USD',
    startingBalance: a.startingBalance,
    status: 'active',
    ...(a.type === 'prop-evaluation'
      ? {
          propRules: {
            firm: 'Sample prop firm',
            phase: 'evaluation' as const,
            profitTarget: 800_000,
            dailyLossLimit: 500_000,
            maxDrawdown: 1_000_000,
            drawdownType: 'trailing' as const,
            minTradingDays: 5,
            consistencyPct: 0.4,
          },
        }
      : {}),
  }));

  // Prices walk daily, whether or not an instrument is traded that day.
  const prices = new Map<string, number>();
  for (const s of [
    ...FUTURES_SPECS,
    ...FOREX_SPECS,
    ...STOCK_SPECS,
    ...CRYPTO_SPECS,
  ])
    if (!prices.has(s.walk)) prices.set(s.walk, s.price0);
  const reservedOptions = new Map<string, string>(); // contract -> expiry

  const plans: Plan[] = [];
  for (const date of days) {
    const dayIndex = days.indexOf(date);
    for (const [walk, price] of prices) {
      const spec = [
        ...FUTURES_SPECS,
        ...FOREX_SPECS,
        ...STOCK_SPECS,
        ...CRYPTO_SPECS,
      ].find((s) => s.walk === walk)!;
      prices.set(walk, price * (1 + rng.around(0.0002, spec.vol)));
    }
    for (const acct of ACCOUNT_SPECS) {
      if (dayIndex < WEEKDAYS - acct.days) continue;
      const first = dayIndex === WEEKDAYS - acct.days;
      if (!first && date !== lastDay && !rng.chance(acct.activeProb)) continue;
      const openMs = nyMs(date, acct.openH, acct.openM);
      const sessionSec = acct.sessionMin * 60;
      let cursor = rng.int(0, 20) * 60;
      const count = rng.int(acct.perDay[0], acct.perDay[1]);
      for (let k = 0; k < count; k++) {
        const spec = weighted(rng, acct.specs);
        const durSec = durationMin(rng, spec.cls) * 60 + rng.int(0, 59);
        const startSec = cursor + rng.int(1, 12) * 60 + rng.int(0, 59);
        if (startSec + durSec > sessionSec - 60) break;
        cursor = startSec + durSec;
        const plan = planTrade(
          rng,
          acct,
          spec,
          date,
          openMs + startSec * 1000,
          durSec,
          prices,
          reservedOptions,
          endDate,
        );
        if (plan) plans.push(plan);
      }
    }
  }

  // A few positions are still open at the end date (never options).
  const seen = new Set<string>();
  let opens = 0;
  const lastDayPlans = plans
    .filter(
      (p) => localDate(new Date(p.legs[0]!.at).toISOString(), NY) === lastDay,
    )
    .sort((a, b) => b.legs[0]!.at - a.legs[0]!.at);
  for (const p of lastDayPlans) {
    const key = `${p.accountId}|${p.symbol}`;
    if (!seen.has(key) && opens < 4 && p.cls !== 'option') {
      p.open = true;
      p.legs = p.legs.filter((l) => l.side === p.legs[0]!.side);
      opens += 1;
    }
    seen.add(key);
  }

  // Emit fills in time order and number them.
  const emitted = plans.flatMap((p, planIndex) =>
    p.legs.map((l, legIndex) => ({ p, l, planIndex, legIndex })),
  );
  emitted.sort(
    (a, b) =>
      a.l.at - b.l.at || a.planIndex - b.planIndex || a.legIndex - b.legIndex,
  );
  const firstFillPlan = new Map<string, Plan>();
  const fills: Execution[] = emitted.map(({ p, l, legIndex }, i) => {
    const id = `sample-fill-${String(i + 1).padStart(5, '0')}`;
    if (legIndex === 0) firstFillPlan.set(id, p);
    return {
      id,
      accountId: p.accountId,
      symbol: p.symbol,
      side: l.side,
      qty: l.qty,
      price: l.price,
      time: new Date(l.at).toISOString(),
      ...feesFor(p.cls, l.qty, l.price),
    };
  });

  const asOf = new Date(nyMs(endDate, 23, 59, 59)).toISOString();
  const resolve = (symbol: string) => resolveInstrument(symbol);
  const settled = settleExpiredOptions(fills, resolve, asOf);
  const built = buildTrades(settled.executions, {
    workspaceId: WS,
    startSerial: 1,
    resolve,
    accountCurrency: () => 'USD',
  });
  if (built.unresolvedSymbols.length > 0)
    throw new Error(
      `unresolved sample symbols: ${built.unresolvedSymbols.join(', ')}`,
    );
  const trades = built.trades;

  const { strategies, tagCategories, tags } = buildStrategiesAndTags();
  const planOf = (t: Trade) => firstFillPlan.get(t.executions[0]!.id)!;
  for (const t of trades) decorate(rng, t, planOf(t), strategies, tags);
  // Plan 5's additions draw from streams of their own, so nothing above moves.
  addSecondStrategies(
    createRandom(opts.seed + 102),
    trades,
    planOf,
    strategies,
  );
  gradeLoserRules(createRandom(opts.seed + 103), trades, planOf, strategies);
  pinLatestTrades(trades, strategies, tags, tagCategories);
  markReviewed(createRandom(opts.seed + 101), trades, endDate);
  const journal = [
    ...writeJournal(rng, trades, days, lastDay),
    ...writeDailyNotes(createRandom(opts.seed + 104), trades, days),
  ];

  // The prop firms' accounts and challenges draw from streams of their own and
  // come after everything above, so the first three accounts stay as they were.
  const prop = addPropFirms({
    endDate,
    days,
    firstSerial: trades.length + 1,
    planTrade,
    buildPlanTrades,
    decorate: (rng, t, plan) => decorate(rng, t, plan, strategies, tags),
  });

  markReviewed(createRandom(opts.seed + 105), prop.trades, endDate);

  // The routine comes last, from a stream of its own, so nothing above moves.
  const allAccounts = [...accounts, ...prop.accounts];
  const allTrades = [...trades, ...prop.trades];
  const startedOn = allTrades
    .map((t) => localDate(t.openedAt, NY))
    .reduce((a, b) => (a < b ? a : b));
  const routine = writeRoutine(createRandom(opts.seed + 106), {
    trades: allTrades,
    journal,
    accounts: allAccounts,
    startedOn,
    endDate,
  });

  return {
    seed: opts.seed,
    endDate,
    accounts: allAccounts,
    strategies,
    tagCategories,
    tags,
    trades: allTrades,
    journal: [...journal, ...routine.notes],
    challenges: prop.challenges,
    tracker: routine.tracker,
    days: routine.days,
  };
}

export type PlanTrade = typeof planTrade;
export type BuildPlanTrades = typeof buildPlanTrades;

/**
 * Builds trades from plans, with fills numbered `${idPrefix}-nnnnn` and each
 * trade handed to `decorate` with its plan. It draws nothing itself. Serials
 * start at 1; the caller renumbers.
 */
export function buildPlanTrades(
  plans: readonly Plan[],
  idPrefix: string,
  decorate: (t: Trade, plan: Plan) => void,
): Trade[] {
  const emitted = plans.flatMap((p, planIndex) =>
    p.legs.map((l, legIndex) => ({ p, l, planIndex, legIndex })),
  );
  emitted.sort(
    (a, b) =>
      a.l.at - b.l.at || a.planIndex - b.planIndex || a.legIndex - b.legIndex,
  );
  const firstFillPlan = new Map<string, Plan>();
  const fills: Execution[] = emitted.map(({ p, l, legIndex }, i) => {
    const id = `${idPrefix}-${String(i + 1).padStart(5, '0')}`;
    if (legIndex === 0) firstFillPlan.set(id, p);
    return {
      id,
      accountId: p.accountId,
      symbol: p.symbol,
      side: l.side,
      qty: l.qty,
      price: l.price,
      time: new Date(l.at).toISOString(),
      ...feesFor(p.cls, l.qty, l.price),
    };
  });
  const built = buildTrades(fills, {
    workspaceId: WS,
    startSerial: 1,
    resolve: (symbol) => resolveInstrument(symbol),
    accountCurrency: () => 'USD',
  });
  if (built.unresolvedSymbols.length > 0)
    throw new Error(
      `unresolved sample symbols: ${built.unresolvedSymbols.join(', ')}`,
    );
  for (const t of built.trades)
    decorate(t, firstFillPlan.get(t.executions[0]!.id)!);
  return built.trades;
}

export function planTrade(
  rng: Random,
  acct: AccountSpec,
  spec: InstSpec,
  date: string,
  startMs: number,
  durSec: number,
  prices: Map<string, number>,
  reserved: Map<string, string>,
  endDate: string,
): Plan | null {
  const broke = rng.chance(0.2);
  let symbol: string;
  let price: number;
  let expire = false;
  let tick = spec.tick;
  let dec = spec.dec;
  let stop: number;
  let dir: 1 | -1 = rng.chance(0.52) ? 1 : -1;

  if (spec.cls === 'option') {
    const under = rng.pick(OPTION_UNDERLYINGS);
    const und = prices.get(under.walk)!;
    const expiryMs =
      parseYmd(date) + ((5 - dow(parseYmd(date)) + 7) % 7) * DAY_MS;
    const expiry = ymd(expiryMs);
    const stepK = under.key === 'SPY' ? 1 : und > 300 ? 5 : 2.5;
    const right: 'C' | 'P' = rng.chance(0.5) ? 'C' : 'P';
    let contract = '';
    for (let attempt = 0; attempt < 6 && contract === ''; attempt++) {
      const strike = Math.round(und / stepK) * stepK + stepK * rng.int(-2, 2);
      const candidate = optionSymbol(under.key, expiry, right, strike);
      const holder = reserved.get(candidate);
      if (holder === undefined || holder < date) contract = candidate;
    }
    if (contract === '') return null;
    symbol = contract;
    tick = 0.01;
    dec = 2;
    price = Math.max(0.3, snap(und * 0.012 * rng.around(1, 0.5), 0.01, 2));
    stop = Math.max(0.02, snap(price * 0.35, 0.01, 2));
    dir = 1;
    expire = expiry <= endDate && rng.chance(0.08);
    if (expire) reserved.set(symbol, expiry);
  } else {
    symbol = spec.cls === 'future' ? frontMonth(spec.key, date) : spec.key;
    const mid = prices.get(spec.walk)! * (1 + rng.around(0, 0.004));
    price = snap(mid, tick, dec);
    const rawStop =
      (spec.stopAbs ?? price * (spec.stopPct ?? 0.005)) * rng.around(1, 0.3);
    stop = Math.max(2 * tick, snap(rawStop, tick, dec));
  }

  const inst = resolveInstrument(symbol);
  if (!inst) throw new Error(`sample symbol does not resolve: ${symbol}`);
  const usdPerUnit =
    inst.quoteCurrency !== 'USD' && inst.baseCurrency === 'USD'
      ? (stop * inst.pointValue) / price
      : stop * inst.pointValue;
  const riskUsd = acct.risk * (spec.riskMult ?? 1) * rng.around(1, 0.35);
  let qty = snapQty(
    Math.min(spec.qtyMax, Math.max(spec.qtyMin, riskUsd / usdPerUnit)),
    spec.step,
  );
  if (spec.cls === 'stock') {
    // Entry notional stays within 4x the account (intraday margin).
    const cap = Math.floor((4 * (acct.startingBalance / 100)) / price);
    qty = Math.min(qty, Math.max(spec.qtyMin, cap));
  }
  qty = Math.max(spec.qtyMin, qty);

  const canSplit = qty >= 2 * spec.step;
  // Draw both rolls unconditionally so the random stream does not depend on sizing.
  const scaleRoll = rng.chance(0.15);
  const splitRoll = rng.chance(0.25);
  const scaleIn = canSplit && scaleRoll;
  const splitExit = canSplit && !expire && splitRoll;
  const side: Side = dir === 1 ? 'buy' : 'sell';
  const other: Side = dir === 1 ? 'sell' : 'buy';
  const at = (frac: number): number =>
    startMs + Math.floor(durSec * frac) * 1000;
  const px = (x: number): number => Math.max(tick, snap(x, tick, dec));

  const legs: Leg[] = [];
  let avgEntry = price;
  if (scaleIn) {
    const q1 = Math.min(
      qty - spec.step,
      Math.max(spec.step, snapQty(qty * rng.around(0.5, 0.3), spec.step)),
    );
    const q2 = snapQty(qty - q1, spec.step);
    const p2 = px(price + dir * stop * rng.around(0, 0.5));
    legs.push(
      { side, qty: q1, price, at: at(0) },
      { side, qty: q2, price: p2, at: at(0.3) },
    );
    avgEntry = (q1 * price + q2 * p2) / qty;
  } else {
    legs.push({ side, qty, price, at: at(0) });
  }

  if (!expire) {
    const r =
      spec.cls === 'option'
        ? Math.max(-2.2, drawR(rng, broke))
        : drawR(rng, broke);
    const target = avgEntry + dir * r * stop;
    if (splitExit) {
      const q1 = Math.min(
        qty - spec.step,
        Math.max(spec.step, snapQty(qty / 2, spec.step)),
      );
      const q2 = snapQty(qty - q1, spec.step);
      const s = 0.4 * stop;
      legs.push(
        {
          side: other,
          qty: q1,
          price: px(target - (dir * s * q2) / qty),
          at: at(0.7),
        },
        {
          side: other,
          qty: q2,
          price: px(target + (dir * s * q1) / qty),
          at: at(1),
        },
      );
    } else {
      legs.push({ side: other, qty, price: px(target), at: at(1) });
    }
  }
  return {
    accountId: acct.id,
    symbol,
    cls: spec.cls,
    legs,
    broke,
    expire,
    open: false,
    stop,
  };
}

// ---- strategies, tags and trade decoration ---------------------------------

function buildStrategiesAndTags(): {
  strategies: Strategy[];
  tagCategories: TagCategory[];
  tags: Tag[];
} {
  const strategies: Strategy[] = STRATEGY_SEEDS.map((s, i) => {
    const id = `sample-strategy-${i + 1}`;
    const loser: Rule = {
      id: `${id}-rule-${s.rules.length + 1}`,
      text: s.loserRule,
      showWhen: 'loser',
    };
    return {
      id,
      workspaceId: WS,
      name: s.name,
      description: s.description,
      assetClasses: [...s.assetClasses],
      groups: SEED_GROUPS.map(([key, title]) => ({
        id: `${id}-group-${key}`,
        title,
        rules: [
          ...s.rules.flatMap((r, j): Rule[] =>
            r.group === key
              ? [
                  {
                    id: `${id}-rule-${j + 1}`,
                    text: r.text,
                    showWhen: 'always',
                  },
                ]
              : [],
          ),
          ...(key === 'risk' ? [loser] : []),
        ],
      })),
      checklist: [...s.checklist],
      status: 'active',
      icon: s.icon,
      tone: s.tone,
    };
  });
  const tagCategories = [
    CATEGORIES.setups,
    CATEGORIES.mistakes,
    CATEGORIES.emotions,
    CATEGORIES.custom,
  ].map((c) => categoryIn(WS, c));
  const tags: Tag[] = TAG_SEEDS.map((t, i) => ({
    id: `sample-tag-${i + 1}`,
    workspaceId: WS,
    name: t.name,
    categoryId: CATEGORIES[t.category].id,
    ...(t.description !== undefined && { description: t.description }),
  }));
  return { strategies, tagCategories, tags };
}

/** The rules graded on every trade, in group order: all but the outcome-specific ones. */
const alwaysRules = (s: Strategy): Rule[] =>
  strategyRules(s).filter((r) => r.showWhen === 'always');

/** A check drawn as Plan 4 drew them: sometimes left ungraded, broken more often when the plan broke. */
function drawCheck(rng: Random, ruleId: string, broke: boolean) {
  return {
    ruleId,
    followed: rng.chance(0.08) ? null : !rng.chance(broke ? 0.45 : 0.045),
  };
}

/** About 15% of the trades with one strategy follow a second one that fits their asset class, graded on it too. */
function addSecondStrategies(
  rng: Random,
  trades: readonly Trade[],
  planOf: (t: Trade) => Plan,
  strategies: readonly Strategy[],
): void {
  for (const t of trades) {
    if (t.strategyIds.length !== 1 || !rng.chance(0.15)) continue;
    const others = strategies.filter(
      (s) =>
        s.id !== t.strategyIds[0] &&
        s.assetClasses.includes(t.instrument.assetClass),
    );
    if (others.length === 0) continue;
    const second = rng.pick(others);
    t.strategyIds = [...t.strategyIds, second.id];
    t.ruleChecks = [
      ...t.ruleChecks,
      ...alwaysRules(second).map((r) => drawCheck(rng, r.id, planOf(t).broke)),
    ];
  }
}

/** A closed losing trade is graded on its strategies' 'loser' rules: the stop is skipped more often when the plan broke. */
function gradeLoserRules(
  rng: Random,
  trades: readonly Trade[],
  planOf: (t: Trade) => Plan,
  strategies: readonly Strategy[],
): void {
  const byId = new Map(strategies.map((s) => [s.id, s]));
  for (const t of trades) {
    if (t.status !== 'closed' || t.net >= 0) continue;
    for (const id of t.strategyIds)
      for (const r of strategyRules(byId.get(id)!))
        if (r.showWhen === 'loser')
          t.ruleChecks.push({
            ruleId: r.id,
            followed: rng.chance(0.08)
              ? null
              : !rng.chance(planOf(t).broke ? 0.5 : 0.1),
          });
  }
}

/** About 70% of the trades closed a week or more before the end date are marked reviewed. */
function markReviewed(
  rng: Random,
  trades: readonly Trade[],
  endDate: string,
): void {
  const cutoff = ymd(parseYmd(endDate) - 7 * DAY_MS);
  for (const t of trades)
    if (
      t.status === 'closed' &&
      localDate(t.closedAt!, NY) <= cutoff &&
      rng.chance(0.7)
    )
      t.reviewed = true;
}

/**
 * The dashboard's recent-trades table shows the five latest closed trades, so
 * they carry a fixed mix: three with every rule kept, two with a broken rule and
 * a mistake tag, none ungraded. No random draws, so the rest of the sample is
 * unchanged.
 */
const LATEST_MIX: readonly { broken: boolean; mistake: string }[] = [
  { broken: false, mistake: '' },
  { broken: true, mistake: 'moved stop' },
  { broken: false, mistake: '' },
  { broken: true, mistake: 'fomo entry' },
  { broken: false, mistake: '' },
];

function pinLatestTrades(
  trades: readonly Trade[],
  strategies: readonly Strategy[],
  tags: readonly Tag[],
  categories: readonly TagCategory[],
): void {
  const latest = closedInOrder(trades).slice(-LATEST_MIX.length).reverse();
  latest.forEach((closed, i) => {
    const t = trades.find((x) => x.id === closed.id)!;
    const mix = LATEST_MIX[i]!;
    const eligible = strategies.filter((s) =>
      s.assetClasses.includes(t.instrument.assetClass),
    );
    const st = eligible[i % eligible.length]!;
    t.strategyIds = [st.id];
    const rules = alwaysRules(st);
    const brokenRule = i % rules.length;
    t.ruleChecks = rules.map((r, j) => ({
      ruleId: r.id,
      followed: !(mix.broken && j === brokenRule),
    }));
    const mistakes = new Set(mistakeTags(tags, categories).map((x) => x.id));
    const kept = t.tagIds.filter((id) => !mistakes.has(id));
    const mistake = tags.find((x) => x.name === mix.mistake);
    t.tagIds = mistake ? [...kept, mistake.id] : kept;
  });
}

function decorate(
  rng: Random,
  t: Trade,
  plan: Plan,
  strategies: readonly Strategy[],
  tags: readonly Tag[],
): void {
  const tagId = (name: string): string => tags.find((x) => x.name === name)!.id;
  const isLoss = t.status === 'closed' && t.net < 0;
  const isWin = t.status === 'closed' && t.net > 0;
  const dir = t.direction === 'long' ? 1 : -1;

  // Strategy and rule checks.
  const eligible = strategies.filter((s) =>
    s.assetClasses.includes(t.instrument.assetClass),
  );
  let strategyIndex = -1;
  if (rng.chance(0.85) && eligible.length > 0) {
    const st = rng.pick(eligible);
    t.strategyIds = [st.id];
    strategyIndex = strategies.indexOf(st);
    t.ruleChecks = alwaysRules(st).map((r) => drawCheck(rng, r.id, plan.broke));
  }

  // Tags: setup, emotion, mistakes (on losses and rule breaks), custom.
  const ids: string[] = [];
  const seed = strategyIndex >= 0 ? STRATEGY_SEEDS[strategyIndex] : undefined;
  if (seed && rng.chance(0.8)) ids.push(tagId(seed.setupTag));
  if (rng.chance(0.55)) {
    const pool = isLoss || plan.broke ? NEGATIVE_EMOTIONS : POSITIVE_EMOTIONS;
    ids.push(tagId(rng.pick(pool)));
  }
  if (rng.chance(plan.broke ? 0.8 : isLoss ? 0.12 : 0.02)) {
    ids.push(tagId(rng.pick(MISTAKE_NAMES)));
  }
  if (rng.chance(0.15)) ids.push(tagId(rng.pick(CUSTOM_NAMES)));
  t.tagIds = [...new Set(ids)];

  if (rng.chance(0.6)) {
    const base = isWin ? 4 : isLoss ? 2 : 3;
    t.rating = Math.min(
      5,
      Math.max(1, Math.round(base + rng.around(0, 1.6))),
    ) as 1 | 2 | 3 | 4 | 5;
  }

  // Stop, target and risk.
  const tick = t.instrument.tickSize;
  const dec = tick < 0.001 ? 5 : tick < 0.01 ? 3 : 2;
  const stopDist = plan.stop;
  const snapPx = (x: number): number =>
    Number((Math.round(x / tick) * tick).toFixed(dec));
  const stop = snapPx(t.avgEntry - dir * stopDist);
  if (rng.chance(0.85)) {
    t.plannedStop = stop;
    t.initialRisk = riskFromStop(t, stop);
  }
  if (rng.chance(0.6)) {
    t.plannedTarget = snapPx(
      t.avgEntry + dir * stopDist * Math.max(1.2, rng.around(2, 0.6)),
    );
  }

  // Synthetic excursion, signed so MAE <= min(0, gross) and MFE >= max(0, gross).
  if (t.status === 'closed' && rng.chance(0.96)) {
    const risk = Math.max(100, riskFromStop(t, stop));
    const part = (lo: number, hi: number): number =>
      Math.round(risk * (lo + rng.next() * (hi - lo)));
    if (t.gross > 0) {
      t.mae = 0 - part(0, 0.6);
      t.mfe = t.gross + part(0, 0.8);
    } else if (t.gross < 0) {
      t.mae = t.gross - part(0, 0.25);
      t.mfe = part(0, 0.6);
    } else {
      t.mae = 0 - part(0, 0.3);
      t.mfe = part(0, 0.3);
    }
  }
}

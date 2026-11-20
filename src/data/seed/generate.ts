import { TZDate } from '@date-fns/tz';
import { settleExpiredOptions } from '@/domain/import/expiry';
import { resolveInstrument } from '@/domain/instruments';
import { riskFromStop } from '@/domain/metrics/summary';
import { toCents } from '@/domain/money';
import { localDate } from '@/domain/time';
import { buildTrades } from '@/domain/trade-builder';
import type {
  Account,
  AssetClass,
  Execution,
  JournalEntry,
  Side,
  Strategy,
  Tag,
  Trade,
} from '@/domain/types';
import {
  CUSTOM_NAMES,
  FOLDERS,
  MISTAKE_NAMES,
  NEGATIVE_EMOTIONS,
  PHRASES,
  POSITIVE_EMOTIONS,
  STRATEGY_SEEDS,
  TAG_SEEDS,
  bullets,
  doc,
  heading,
  paragraph,
} from './content';
import { createRandom, type Random } from './random';

export const SAMPLE_SEED = 20261120;

export interface SampleWorkspace {
  seed: number;
  endDate: string;
  accounts: Account[];
  strategies: Strategy[];
  tags: Tag[];
  trades: Trade[];
  journal: JournalEntry[];
}

const WS = 'sample';
const NY = 'America/New_York';
const DAY_MS = 86_400_000;
const WEEKDAYS = 126;
const PROP_WEEKDAYS = 60; // the last 12 weeks

// ---- calendar -------------------------------------------------------------

const parseYmd = (s: string): number => {
  const [y = 1970, m = 1, d = 1] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const ymd = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const dow = (ms: number): number => new Date(ms).getUTCDay();
const isWeekday = (ms: number): boolean => dow(ms) >= 1 && dow(ms) <= 5;
const mondayOf = (date: string): string => {
  const ms = parseYmd(date);
  return ymd(ms - ((dow(ms) + 6) % 7) * DAY_MS);
};

/** The last weekday strictly before `now`'s New York date. */
export function sampleEndDate(now: string): string {
  let ms = parseYmd(localDate(now, NY)) - DAY_MS;
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

/** A New York wall-clock time as epoch milliseconds. */
function nyMs(date: string, hour: number, minute: number, second = 0): number {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return new TZDate(y, m - 1, d, hour, minute, second, NY).getTime();
}
const nyIso = (date: string, h: number, m: number): string =>
  new Date(nyMs(date, h, m)).toISOString();

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
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
];
function dayLabel(date: string, withWeekday = true): string {
  const ms = parseYmd(date);
  const d = new Date(ms);
  const base = `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
  return withWeekday ? `${DAY_NAMES[dow(ms)]} ${base}` : base;
}

// ---- instruments and fees -------------------------------------------------

interface InstSpec {
  key: string;
  cls: AssetClass;
  /** Price walks are shared by instruments with the same walk key. */
  walk: string;
  price0: number;
  vol: number;
  tick: number;
  dec: number;
  stopAbs?: number;
  stopPct?: number;
  qtyMin: number;
  qtyMax: number;
  step: number;
  weight: number;
  riskMult?: number;
}
const fut = (
  key: string,
  walk: string,
  price0: number,
  tick: number,
  stopAbs: number,
  qtyMin: number,
  qtyMax: number,
  weight: number,
): InstSpec => ({
  key,
  cls: 'future',
  walk,
  price0,
  vol: 0.02,
  tick,
  dec: 2,
  stopAbs,
  qtyMin,
  qtyMax,
  step: 1,
  weight,
});
const fx = (
  key: string,
  price0: number,
  stopPct: number,
  tick = 0.00001,
  dec = 5,
): InstSpec => ({
  key,
  cls: 'forex',
  walk: key,
  price0,
  vol: 0.008,
  tick,
  dec,
  stopPct,
  qtyMin: 0.1,
  qtyMax: 3,
  step: 0.1,
  weight: 1,
});
const stock = (
  key: string,
  price0: number,
  stopPct: number,
  weight: number,
): InstSpec => ({
  key,
  cls: 'stock',
  walk: key,
  price0,
  vol: 0.035,
  tick: 0.01,
  dec: 2,
  stopPct,
  qtyMin: 5,
  qtyMax: 400,
  step: 1,
  weight,
});

const FUTURES_SPECS: InstSpec[] = [
  fut('ES', 'ES', 5800, 0.25, 4, 1, 2, 30),
  fut('NQ', 'NQ', 20800, 0.25, 16, 1, 2, 25),
  fut('MES', 'ES', 5800, 0.25, 5, 2, 10, 20),
  fut('MNQ', 'NQ', 20800, 0.25, 20, 2, 8, 15),
  fut('CL', 'CL', 68, 0.01, 0.25, 1, 2, 6),
  fut('GC', 'GC', 2700, 0.1, 3, 1, 1, 4),
];
const FOREX_SPECS: InstSpec[] = [
  fx('EURUSD', 1.08, 0.0011),
  fx('GBPUSD', 1.28, 0.0011),
  fx('AUDUSD', 0.66, 0.0016),
  fx('USDJPY', 150, 0.0012, 0.001, 3),
];
const STOCK_SPECS: InstSpec[] = [
  stock('AAPL', 230, 0.005, 9),
  stock('NVDA', 140, 0.007, 9),
  stock('MSFT', 420, 0.005, 9),
  stock('TSLA', 330, 0.008, 9),
  stock('SPY', 590, 0.003, 9),
];
const OPTION_SPEC: InstSpec = {
  key: 'OPT',
  cls: 'option',
  walk: 'OPT',
  price0: 0,
  vol: 0,
  tick: 0.01,
  dec: 2,
  qtyMin: 1,
  qtyMax: 10,
  step: 1,
  weight: 30,
};
const CRYPTO_SPECS: InstSpec[] = [
  {
    key: 'BTCUSD',
    cls: 'crypto',
    walk: 'BTCUSD',
    price0: 95000,
    vol: 0.06,
    tick: 0.01,
    dec: 2,
    stopPct: 0.015,
    qtyMin: 0.01,
    qtyMax: 1,
    step: 0.01,
    weight: 13,
    riskMult: 0.5,
  },
  {
    key: 'ETHUSD',
    cls: 'crypto',
    walk: 'ETHUSD',
    price0: 3300,
    vol: 0.07,
    tick: 0.01,
    dec: 2,
    stopPct: 0.02,
    qtyMin: 0.1,
    qtyMax: 20,
    step: 0.1,
    weight: 12,
    riskMult: 0.5,
  },
];
const MULTI_SPECS: InstSpec[] = [...STOCK_SPECS, OPTION_SPEC, ...CRYPTO_SPECS];
const OPTION_UNDERLYINGS = STOCK_SPECS;

const MONTH_CODES = 'FGHJKMNQUVXZ';
/** Front-month futures symbol on a date (index futures roll mid-quarter-month). */
function frontMonth(root: string, date: string): string {
  const [y = 2026, m = 1, d = 1] = date.split('-').map(Number);
  let year = y;
  let month = m; // 1..12
  if (root === 'ES' || root === 'NQ' || root === 'MES' || root === 'MNQ') {
    month = Math.ceil(month / 3) * 3;
    if (m === month && d >= 15) month += 3;
  } else if (root === 'CL') {
    month += 1;
  } else {
    month = Math.ceil((month + 1) / 2) * 2; // GC: even months
  }
  if (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${root}${MONTH_CODES[month - 1]}${year % 10}`;
}

function optionSymbol(
  underlying: string,
  expiry: string,
  right: 'C' | 'P',
  strike: number,
): string {
  return `${underlying}${expiry.slice(2, 4)}${expiry.slice(5, 7)}${expiry.slice(8, 10)}${right}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}

function feesFor(
  cls: AssetClass,
  qty: number,
  price: number,
): { fees: number; commission: number } {
  switch (cls) {
    case 'future':
      return { commission: toCents(qty * 2.25), fees: toCents(qty * 0.35) };
    case 'forex':
      return { commission: toCents(qty * 3.5), fees: 0 };
    case 'stock':
      return { commission: Math.max(100, toCents(qty * 0.005)), fees: 0 };
    case 'option':
      return { commission: toCents(qty * 0.65), fees: 0 };
    default:
      return { commission: 0, fees: toCents(qty * price * 0.001) };
  }
}

const snap = (x: number, tick: number, dec: number): number =>
  Number((Math.round(x / tick) * tick).toFixed(dec));
const snapQty = (x: number, step: number): number =>
  Number((Math.round(x / step) * step).toFixed(2));

// ---- planning round trips -------------------------------------------------

interface Leg {
  side: Side;
  qty: number;
  price: number;
  at: number; // epoch ms
}
interface Plan {
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

interface AccountSpec {
  id: string;
  name: string;
  broker: string;
  type: Account['type'];
  startingBalance: number;
  specs: InstSpec[];
  openH: number;
  openM: number;
  sessionMin: number;
  activeProb: number;
  perDay: [number, number];
  risk: number; // dollars per trade
  days: number;
}
const ACCOUNT_SPECS: AccountSpec[] = [
  {
    id: 'sample-futures',
    name: 'Futures live',
    broker: 'Sample futures broker',
    type: 'live',
    startingBalance: 5_000_000,
    specs: FUTURES_SPECS,
    openH: 9,
    openM: 30,
    sessionMin: 390,
    activeProb: 0.95,
    perDay: [3, 6],
    risk: 300,
    days: WEEKDAYS,
  },
  {
    id: 'sample-forex-prop',
    name: 'Forex evaluation',
    broker: 'Sample prop firm',
    type: 'prop-evaluation',
    startingBalance: 10_000_000,
    specs: FOREX_SPECS,
    openH: 3,
    openM: 0,
    sessionMin: 510,
    activeProb: 0.95,
    perDay: [1, 4],
    risk: 250,
    days: PROP_WEEKDAYS,
  },
  {
    id: 'sample-multi',
    name: 'Stocks & options',
    broker: 'Sample multi-asset broker',
    type: 'live',
    startingBalance: 2_500_000,
    specs: MULTI_SPECS,
    openH: 9,
    openM: 30,
    sessionMin: 390,
    activeProb: 0.93,
    perDay: [3, 6],
    risk: 300,
    days: WEEKDAYS,
  },
];

/** Realised result of a plan in multiples of its stop distance. */
function drawR(rng: Random, broke: boolean): number {
  if (rng.chance(broke ? 0.38 : 0.52))
    return broke
      ? Math.max(0.3, rng.around(1.0, 0.8))
      : Math.max(0.4, rng.around(1.6, 1.0));
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
  const rng = createRandom(opts.seed);
  const days = weekdaysEnding(opts.endDate, WEEKDAYS);
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
          opts.endDate,
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

  const asOf = new Date(nyMs(opts.endDate, 23, 59, 59)).toISOString();
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

  const { strategies, tags } = buildStrategiesAndTags();
  for (const t of trades)
    decorate(rng, t, firstFillPlan.get(t.executions[0]!.id)!, strategies, tags);
  const journal = writeJournal(rng, trades, days, lastDay);

  return {
    seed: opts.seed,
    endDate: opts.endDate,
    accounts,
    strategies,
    tags,
    trades,
    journal,
  };
}

function planTrade(
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
  qty = Math.max(spec.qtyMin, qty);

  const canSplit = qty >= 2 * spec.step;
  const scaleIn = canSplit && rng.chance(0.15);
  const splitExit = canSplit && !expire && rng.chance(0.25);
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

function buildStrategiesAndTags(): { strategies: Strategy[]; tags: Tag[] } {
  const strategies: Strategy[] = STRATEGY_SEEDS.map((s, i) => ({
    id: `sample-strategy-${i + 1}`,
    workspaceId: WS,
    name: s.name,
    description: s.description,
    assetClasses: [...s.assetClasses],
    rules: s.rules.map((r, j) => ({
      id: `sample-strategy-${i + 1}-rule-${j + 1}`,
      text: r.text,
      group: r.group,
    })),
    checklist: [...s.checklist],
    status: 'active',
  }));
  const tags: Tag[] = TAG_SEEDS.map((t, i) => ({
    id: `sample-tag-${i + 1}`,
    workspaceId: WS,
    name: t.name,
    category: t.category,
  }));
  return { strategies, tags };
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
    t.strategyId = st.id;
    strategyIndex = strategies.indexOf(st);
    t.ruleChecks = st.rules.map((r) => ({
      ruleId: r.id,
      followed: rng.chance(0.08)
        ? null
        : !rng.chance(plan.broke ? 0.45 : 0.045),
    }));
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

// ---- journal ----------------------------------------------------------------

function money(cents: number): string {
  const abs = Math.abs(Math.round(cents / 100));
  const s = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : '+'}$${s}`;
}
const picks = (rng: Random, xs: readonly string[], n: number): string[] => {
  const pool = [...xs];
  const out: string[] = [];
  while (out.length < n && pool.length > 0)
    out.push(...pool.splice(rng.int(0, pool.length - 1), 1));
  return out;
};

function writeJournal(
  rng: Random,
  trades: readonly Trade[],
  days: readonly string[],
  lastDay: string,
): JournalEntry[] {
  const journal: JournalEntry[] = [];
  const add = (e: Omit<JournalEntry, 'id' | 'workspaceId'>): JournalEntry => {
    const entry: JournalEntry = {
      id: `sample-journal-${String(journal.length + 1).padStart(4, '0')}`,
      workspaceId: WS,
      ...e,
    };
    journal.push(entry);
    return entry;
  };

  const byDay = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = localDate(t.openedAt, NY);
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }

  for (const date of days) {
    const day = byDay.get(date);
    if (!day) continue;
    if (date === days[0] || rng.chance(0.75)) {
      add({
        kind: 'pre-market',
        date,
        title: `Plan for ${dayLabel(date)}`,
        body: doc(
          heading('Market view'),
          paragraph(rng.pick(PHRASES.marketView)),
          heading('Plan'),
          bullets(picks(rng, PHRASES.planItems, 3)),
          heading('Risk'),
          paragraph(rng.pick(PHRASES.riskNotes)),
        ),
        linkedTradeIds: [],
        folder: FOLDERS.plan,
        updatedAt: nyIso(date, 8, 40 + rng.int(0, 15)),
      });
    }
    if (date === lastDay || rng.chance(0.88)) {
      const closed = day.filter((t) => t.status === 'closed');
      const net = closed.reduce((s, t) => s + t.net, 0);
      const w = closed.filter((t) => t.net > 0).length;
      add({
        kind: 'daily-review',
        date,
        title: `Daily review, ${dayLabel(date)}`,
        body: doc(
          heading('Summary'),
          paragraph(
            `${day.length} trades, ${w} won and ${closed.length - w} did not. Net ${money(net)} after costs.`,
          ),
          heading('What went well'),
          bullets(picks(rng, PHRASES.wentWell, 2)),
          heading('To improve'),
          bullets(picks(rng, PHRASES.toImprove, 2)),
          heading('Takeaway'),
          paragraph(rng.pick(PHRASES.lessons)),
        ),
        linkedTradeIds: day.map((t) => t.id),
        folder: FOLDERS.daily,
        updatedAt: nyIso(date, 16, 30 + rng.int(0, 25)),
      });
    }
  }

  // Weekly recaps, one for each completed week.
  const weeks = new Map<string, string[]>();
  for (const d of days)
    weeks.set(mondayOf(d), [...(weeks.get(mondayOf(d)) ?? []), d]);
  for (const [monday, wdays] of weeks) {
    const friday = ymd(parseYmd(monday) + 4 * DAY_MS);
    if (!wdays.includes(friday)) continue;
    const wt = wdays.flatMap((d) => byDay.get(d) ?? []);
    const closed = wt.filter((t) => t.status === 'closed');
    if (closed.length === 0) continue;
    const net = closed.reduce((s, t) => s + t.net, 0);
    const wins = closed.filter((t) => t.net > 0).length;
    const best = closed.reduce((a, b) => (b.net > a.net ? b : a));
    const worst = closed.reduce((a, b) => (b.net < a.net ? b : a));
    add({
      kind: 'weekly-recap',
      date: friday,
      title: `Week of ${dayLabel(monday, false)}`,
      body: doc(
        heading('The week in numbers'),
        paragraph(
          `${closed.length} closed trades, ${Math.round((wins / closed.length) * 100)}% winners, net ${money(net)}.`,
        ),
        bullets([
          `Best trade: ${best.instrument.symbol} ${best.direction}, ${money(best.net)}.`,
          `Worst trade: ${worst.instrument.symbol} ${worst.direction}, ${money(worst.net)}.`,
        ]),
        heading('Next week'),
        bullets(picks(rng, PHRASES.weeklyFocus, 2)),
      ),
      linkedTradeIds: [...new Set([best.id, worst.id])],
      folder: FOLDERS.weekly,
      updatedAt: nyIso(friday, 17, 30 + rng.int(0, 20)),
    });
  }

  // About 40 trade notes: the biggest results, then a random spread.
  const closed = trades.filter((t) => t.status === 'closed');
  const ranked = [...closed].sort((a, b) => b.net - a.net);
  const chosen = new Set<Trade>([...ranked.slice(0, 8), ...ranked.slice(-8)]);
  const rest = closed.filter((t) => !chosen.has(t));
  while (chosen.size < 40 && rest.length > 0)
    chosen.add(rest.splice(rng.int(0, rest.length - 1), 1)[0]!);
  for (const t of trades.filter((x) => chosen.has(x))) {
    const when = t.closedAt ?? t.openedAt;
    const note = add({
      kind: 'note',
      date: localDate(when, NY),
      title: `${t.instrument.symbol} ${t.direction}, ${money(t.net)}`,
      body: doc(
        paragraph(`Thesis: ${rng.pick(PHRASES.thesis)}`),
        paragraph(`Execution: ${rng.pick(PHRASES.execution)}`),
        paragraph(
          `Result: ${money(t.net)} net. ${rng.pick(PHRASES.lessonsTrade)}`,
        ),
      ),
      linkedTradeIds: [t.id],
      folder: FOLDERS.note,
      updatedAt: new Date(
        Date.parse(when) + rng.int(10, 90) * 60_000,
      ).toISOString(),
    });
    t.noteId = note.id;
  }
  return journal;
}

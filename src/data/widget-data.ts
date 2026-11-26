import { partitionByCurrency } from '@/domain/currency';
import {
  balanceAt,
  balanceSeries,
  type BalancePoint,
} from '@/domain/metrics/balance';
import { classify, type MetricContext } from '@/domain/metrics/context';
import {
  dailyPnl,
  dayOutcome,
  daySummary,
  type DayStat,
} from '@/domain/metrics/days';
import {
  avgDrawdown,
  drawdownSeries,
  equityCurve,
  maxDrawdown,
  type Drawdown,
  type EquityPoint,
} from '@/domain/metrics/equity';
import { scatterPoints, type ScatterPoint } from '@/domain/metrics/scatter';
import { scoreOf, type ScoreResult } from '@/domain/metrics/score';
import { winStreak } from '@/domain/metrics/streaks';
import { summarize, type Summary } from '@/domain/metrics/summary';
import { throughDay, type ThroughDayPoint } from '@/domain/metrics/through-day';
import { closedInOrder } from '@/domain/trade-status';
import type {
  Account,
  CashFlow,
  Cents,
  Trade,
  WidgetKey,
} from '@/domain/types';
import { riskBasisOf } from './metrics';

/**
 * What the dashboard's widgets read (#46): one function per widget key, over
 * one filtered trade set, one P&L currency at a time. A widget not listed is
 * not computed, so a template without scatters never builds them, and series
 * several widgets share (the summary, the days, the risk basis) are built once
 * per call. A key whose series has no builder yet is left out of the result,
 * as one a later build adds to the catalogue is.
 */

/** The trades, accounts and context the widgets read, as the hooks gather them. */
export interface WidgetEnv {
  /** The trades the filters match, whatever the display unit: the score reads them (it reads money). */
  matched: readonly Trade[];
  /** The same trades narrowed to the display unit: what the money widgets read. */
  trades: readonly Trade[];
  /** Every filter but the date, narrowed to the unit: the day figures are built from them. */
  dayTrades: readonly Trade[];
  /** The selected accounts, of every currency. */
  accounts: readonly Account[];
  flows: readonly CashFlow[];
  /** Every trade of the selected accounts, whatever the other filters: the balance before a range is booked from them. */
  balanceTrades: readonly Trade[];
  /** The metric context: the date range resolved, and the unit when it narrows the trades. */
  ctx: MetricContext;
  baseCurrency: string;
  /** The P&L currency to read; the base currency when absent or not among `currencies`. */
  currency?: string;
  /** The local date today, in the profile zone. */
  today: string;
}

export interface BalanceAndPnl {
  /** The selected accounts' balance at the range's end (today when it has none). */
  balance: Cents;
  /** The closed net P&L of the matched trades. */
  net: Cents;
  /** The accounts' starting balances: 0 asks the trader for one. */
  startingBalance: Cents;
}

export interface WidgetValues {
  'net-pnl': Summary;
  'balance-pnl': BalanceAndPnl;
  'trade-win': Summary;
  'profit-factor': Summary;
  'day-win': ReturnType<typeof daySummary>;
  'win-loss-ratio': Summary;
  expectancy: Summary;
  /** The winning days in a row ending on the range's last trading day (C16). */
  'day-streak': number;
  /** The winning trades in a row ending on the last closed trade (C16). */
  'trade-streak': number;
  streaks: { day: number; trade: number };
  'max-drawdown': Drawdown;
  /** The mean drawdown of the days under a peak; `current` is today's depth from the all-time peak, for a range with no start (C18). */
  'avg-drawdown': ReturnType<typeof avgDrawdown> & { current: number | null };
  score: ScoreResult | null;
  'cum-pnl': DayStat[];
  /** The closed trades in order of the time of day they closed, with the running win rate and averages after each (C14). */
  'win-avg': ThroughDayPoint[];
  'trade-time': { entry: ScatterPoint[]; exit: ScatterPoint[] };
  'trade-duration': ScatterPoint[];
  'daily-pnl': DayStat[];
  'daily-cum': DayStat[];
  balance: {
    startingBalance: Cents;
    equity: EquityPoint[];
    flows: readonly CashFlow[];
    /** The balance and the net deposits and withdrawals a day at a time, inside the range (C75). Empty under a narrowing unit: a balance has no value in one. */
    points: BalancePoint[];
  };
  drawdown: { key: string; value: number }[];
  /** The trades the filters match, in this currency and the display unit: the list of recent and open trades is cut from them. */
  recent: readonly Trade[];
  /**
   * Every filter but the date, in this currency and the display unit: a
   * calendar books each exit on its own day and shows the whole month or year,
   * whatever the date range.
   */
  calendar: readonly Trade[];
  'calendar-mini': readonly Trade[];
  'calendar-adv': readonly Trade[];
  year: readonly Trade[];
  /**
   * What the report's metrics are plotted from, as Performance plots them: the
   * day trades, the balance the day before the range and the flows after it.
   */
  report: {
    dayTrades: readonly Trade[];
    riskStart: Cents;
    riskFlows: readonly CashFlow[];
  };
}

/** The widgets asked for, as far as they are built. Absent: not asked for, or not built yet. */
export type WidgetData = Partial<Record<WidgetKey, unknown>> &
  Partial<WidgetValues>;

/** What every widget of one currency reads, each series built on first use. */
interface Calc {
  trades: readonly Trade[];
  dayTrades: readonly Trade[];
  ctx: MetricContext;
  today: string;
  accounts: readonly Account[];
  flows: readonly CashFlow[];
  balanceTrades: readonly Trade[];
  startingBalance: Cents;
  matched: readonly Trade[];
  summary(): Summary;
  days(): DayStat[];
  risk(): { riskStart: Cents; riskFlows: readonly CashFlow[] };
}

function lazy<T>(make: () => T): () => T {
  let value: T | undefined;
  let made = false;
  return () => {
    if (!made) {
      value = make();
      made = true;
    }
    return value as T;
  };
}

/** The wins in a row that end at the last item; a flat one (a win inside the breakeven range) ends it. */
const streakOf = (items: readonly { win: boolean; pnl: Cents }[]): number =>
  winStreak(items.map((i) => ({ pnl: i.win ? i.pnl : 0 })));

const READ: { [K in keyof WidgetValues]: (c: Calc) => WidgetValues[K] } = {
  'net-pnl': (c) => c.summary(),
  'trade-win': (c) => c.summary(),
  'profit-factor': (c) => c.summary(),
  'win-loss-ratio': (c) => c.summary(),
  expectancy: (c) => c.summary(),
  'day-win': (c) => daySummary(c.days(), c.ctx),
  'balance-pnl': (c) => ({
    balance: balanceAt(
      c.accounts,
      c.flows,
      c.balanceTrades,
      c.ctx.range?.to ?? c.today,
      c.ctx,
    ),
    net: c.summary().netPnl,
    startingBalance: c.startingBalance,
  }),
  'day-streak': (c) =>
    streakOf(
      c.days().map((d) => ({
        win: dayOutcome(d, c.ctx) === 'win',
        pnl: d.net,
      })),
    ),
  'trade-streak': (c) =>
    streakOf(
      closedInOrder(c.trades).map((t) => {
        const { value, outcome } = classify(t, c.ctx);
        return { win: outcome === 'win', pnl: value };
      }),
    ),
  streaks: (c) => ({
    day: READ['day-streak'](c),
    trade: READ['trade-streak'](c),
  }),
  'max-drawdown': (c) => {
    const { riskStart, riskFlows } = c.risk();
    const dd = maxDrawdown(c.days(), riskStart, riskFlows);
    // A share of the balance means nothing once a unit has narrowed the trades.
    return c.ctx.unit ? { ...dd, pct: null } : dd;
  },
  'avg-drawdown': (c) => {
    const { riskStart, riskFlows } = c.risk();
    const avg = avgDrawdown(c.days(), riskStart, riskFlows);
    const curve = drawdownSeries(c.days());
    return {
      ...(c.ctx.unit ? { ...avg, pct: null } : avg),
      current: curve.length === 0 ? null : curve[curve.length - 1]!.value,
    };
  },
  // The score reads money: the unit narrows the other widgets, not this one.
  score: (c) => {
    const money: MetricContext = { ...c.ctx };
    delete money.unit;
    return scoreOf(c.matched, money);
  },
  'cum-pnl': (c) => c.days(),
  'win-avg': (c) => throughDay(c.trades, c.ctx),
  'daily-pnl': (c) => c.days(),
  'daily-cum': (c) => c.days(),
  'trade-time': (c) => ({
    entry: scatterPoints(c.trades, c.ctx, 'entry'),
    exit: scatterPoints(c.trades, c.ctx, 'exit'),
  }),
  'trade-duration': (c) => scatterPoints(c.trades, c.ctx, 'duration'),
  balance: (c) => ({
    startingBalance: c.startingBalance,
    equity: equityCurve(c.trades, c.startingBalance, c.ctx),
    flows: c.flows,
    points: c.ctx.unit
      ? []
      : balanceSeries(
          // Every trade of the accounts, on net, from the beginning: the balance is the accounts', whatever the filters.
          dailyPnl(c.balanceTrades, {
            ...c.ctx,
            pnlBasis: 'net',
            range: undefined,
          }),
          c.startingBalance,
          c.flows,
          c.ctx.range,
        ),
  }),
  drawdown: (c) => drawdownSeries(c.days()),
  recent: (c) => c.trades,
  calendar: (c) => c.dayTrades,
  'calendar-mini': (c) => c.dayTrades,
  'calendar-adv': (c) => c.dayTrades,
  year: (c) => c.dayTrades,
  report: (c) => ({ dayTrades: c.dayTrades, ...c.risk() }),
};

function isBuilt(key: string): key is keyof WidgetValues {
  return Object.hasOwn(READ, key);
}

/** The base currency first, always; the other currencies the trades are in follow in code order. */
function currenciesOf(env: WidgetEnv): string[] {
  const seen = new Set([
    ...partitionByCurrency(env.trades).keys(),
    ...partitionByCurrency(env.dayTrades).keys(),
  ]);
  seen.delete(env.baseCurrency);
  return [
    env.baseCurrency,
    ...[...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  ];
}

/**
 * The series the listed widgets need, in one currency (`env.currency`, else
 * the base currency). A widget whose series is not built yet is absent from
 * `values`.
 */
export function widgetData(
  keys: readonly WidgetKey[],
  env: WidgetEnv,
): { values: WidgetData; currency: string; currencies: string[] } {
  const currencies = currenciesOf(env);
  const currency =
    env.currency !== undefined && currencies.includes(env.currency)
      ? env.currency
      : env.baseCurrency;
  const ofCurrency = (trades: readonly Trade[]) =>
    trades.filter((t) => t.pnlCurrency === currency);
  const accounts = env.accounts.filter((a) => a.currency === currency);
  const ids = new Set(accounts.map((a) => a.id));
  const trades = ofCurrency(env.trades);
  const dayTrades = ofCurrency(env.dayTrades);
  const flows = env.flows.filter((f) => ids.has(f.accountId));
  const balanceTrades = ofCurrency(env.balanceTrades);
  const startingBalance = accounts.reduce((n, a) => n + a.startingBalance, 0);

  const days = lazy(() => dailyPnl(dayTrades, env.ctx));
  const calc: Calc = {
    trades,
    dayTrades,
    ctx: env.ctx,
    today: env.today,
    accounts,
    flows,
    balanceTrades,
    startingBalance,
    matched: ofCurrency(env.matched),
    summary: lazy(() => summarize(trades, env.ctx)),
    days,
    risk: lazy(() =>
      riskBasisOf({
        accounts,
        flows,
        trades: balanceTrades,
        startDay: env.ctx.range?.from ?? days()[0]?.date,
        startingBalance,
        ctx: env.ctx,
      }),
    ),
  };

  const values: Record<string, unknown> = {};
  for (const key of keys)
    if (isBuilt(key) && !Object.hasOwn(values, key))
      values[key] = READ[key](calc);
  return { values: values as WidgetData, currency, currencies };
}

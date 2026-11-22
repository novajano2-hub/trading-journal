import type { MetricContext } from '@/domain/metrics/context';
import {
  dailyLossProgress,
  goalWeek,
  weeklyGoalProgress,
  type DailyLossProgress,
  type WeeklyGoalProgress,
} from '@/domain/metrics/goals';
import {
  mistakeCosts,
  mistakeTags,
  type MistakeCost,
} from '@/domain/metrics/mistakes';
import {
  brokenRulesCost,
  ruleScorecard,
  type RuleScore,
} from '@/domain/metrics/rules';
import { ruleApplies } from '@/domain/rule-applies';
import { closedInOrder } from '@/domain/trade-status';
import {
  strategyRules,
  type Cents,
  type Goals,
  type PnlBasis,
  type Strategy,
  type Tag,
  type TagCategory,
  type Trade,
} from '@/domain/types';
import type { CurrencyMetrics } from './metrics';

export const RULES_SHOWN = 5;
export const RECENT_TRADE_COUNT = 5;

export interface TradeRulesSummary {
  kind: 'kept' | 'broke' | 'ungraded';
  kept: number;
  /** Decisive checks (followed is true or false). */
  checked: number;
  /** Texts of the rules this trade broke. */
  broken: string[];
}

/**
 * A trade's grading against the rules that count for it: those of its own
 * strategies that apply to its outcome, as the trade page counts them.
 */
export function tradeRulesSummary(
  trade: Trade,
  strategies: readonly Strategy[],
  ctx: Pick<MetricContext, 'pnlBasis' | 'breakevenRange'>,
): TradeRulesSummary {
  const ruleText = new Map<string, string>();
  for (const s of strategies)
    if (trade.strategyIds.includes(s.id))
      for (const r of strategyRules(s))
        if (ruleApplies(r, trade, ctx) && !ruleText.has(r.id))
          ruleText.set(r.id, r.text);
  let kept = 0;
  const broken: string[] = [];
  let brokenCount = 0;
  for (const c of trade.ruleChecks) {
    const text = ruleText.get(c.ruleId);
    if (text === undefined || c.followed === null) continue;
    if (c.followed) kept += 1;
    else {
      brokenCount += 1;
      broken.push(text);
    }
  }
  const checked = kept + brokenCount;
  return {
    kind: checked === 0 ? 'ungraded' : brokenCount > 0 ? 'broke' : 'kept',
    kept,
    checked,
    broken,
  };
}

export interface RecentTrade {
  trade: Trade;
  /** The names of its known strategies, in the trade's order. */
  strategyNames: string[];
  mistakes: string[];
  rules: TradeRulesSummary;
}

export interface DashboardEnv {
  strategies: readonly Strategy[];
  tags: readonly Tag[];
  tagCategories: readonly TagCategory[];
  goals: Goals;
  /** Goals are in the base currency only. */
  baseCurrency: string;
  ctx: MetricContext;
  /** The resolved date range. */
  range: { from?: string; to?: string };
  today: string;
}

export interface DashboardModel {
  currency: string;
  basis: PnlBasis;
  closedCount: number;
  plan: {
    /** Kept over decisive checks, summed over `rules`; null with none. */
    adherence: number | null;
    /** Decisive checks, summed over `rules`. */
    checks: number;
    cost: { pnl: Cents; tradeCount: number };
    rules: RuleScore[];
  };
  mistakes: MistakeCost[];
  /** `unavailable` is a plain reason when goals can't be shown for this currency; the goals are then null. */
  goals: {
    weekly: WeeklyGoalProgress | null;
    dailyLoss: DailyLossProgress | null;
    unavailable: string | null;
  };
  performance: {
    pnl: Cents;
    winRate: number | null;
    profitFactor: number | null;
    expectancy: Cents | null;
    /** Starting balance first, then the equity after each closed trade. */
    equity: Cents[];
  };
  recent: RecentTrade[];
  tradesById: ReadonlyMap<string, Trade>;
}

export function buildDashboard(
  m: CurrencyMetrics,
  env: DashboardEnv,
): DashboardModel {
  const { summary } = m;
  const closed = closedInOrder(m.trades);

  const strategyName = new Map(env.strategies.map((s) => [s.id, s.name]));
  const mistakeTag = new Map(
    mistakeTags(env.tags, env.tagCategories).map((t) => [t.id, t.name]),
  );

  const rules = ruleScorecard(m.trades, env.strategies, env.ctx);
  // The headline adds up the rows, so it skips what they skip: checks on
  // unknown rule ids and a trade's repeat checks on one rule.
  const kept = rules.reduce((n, r) => n + r.kept, 0);
  const checks = rules.reduce((n, r) => n + r.kept + r.broken, 0);

  // Goals run on net P&L whatever the Gross/Net switch says, and only in the base currency.
  let goals: DashboardModel['goals'] = {
    weekly: null,
    dailyLoss: null,
    unavailable: null,
  };
  if (m.currency !== env.baseCurrency) {
    goals = {
      ...goals,
      unavailable: `Goals use your base currency (${env.baseCurrency}).`,
    };
  } else {
    // Goals read the net days, whatever the basis shows.
    const days = m.netDays;
    const window = goalWeek(env.range, env.today);
    goals = {
      weekly:
        env.goals.weeklyNet !== undefined && window !== null
          ? weeklyGoalProgress(days, env.goals.weeklyNet, window)
          : null,
      dailyLoss:
        env.goals.dailyLossLimit !== undefined
          ? dailyLossProgress(days, env.goals.dailyLossLimit)
          : null,
      unavailable: null,
    };
  }

  const recent = closed
    .slice()
    .reverse()
    .slice(0, RECENT_TRADE_COUNT)
    .map((trade) => ({
      trade,
      strategyNames: trade.strategyIds.flatMap(
        (id) => strategyName.get(id) ?? [],
      ),
      mistakes: trade.tagIds.flatMap((id) => mistakeTag.get(id) ?? []),
      rules: tradeRulesSummary(trade, env.strategies, env.ctx),
    }));

  return {
    currency: m.currency,
    basis: summary.basis,
    closedCount: summary.closedCount,
    plan: {
      adherence: checks === 0 ? null : kept / checks,
      checks,
      cost: brokenRulesCost(m.trades, env.strategies, env.ctx),
      rules,
    },
    mistakes: mistakeCosts(m.trades, env.tags, env.tagCategories, env.ctx),
    goals,
    performance: {
      pnl: summary.basis === 'gross' ? summary.grossPnl : summary.netPnl,
      winRate: summary.winRate,
      profitFactor: summary.profitFactor,
      expectancy: summary.expectancy,
      equity: [m.startingBalance, ...m.equity.map((p) => p.equity)],
    },
    recent,
    tradesById: new Map(m.trades.map((t) => [t.id, t])),
  };
}

/** One currency at a time: the chosen one if it exists, else the base currency if it has closed trades, else the first that has. `metricsByCurrency` always yields the base partition, so an empty list is a caller bug and throws. */
export function pickPartition(
  ms: readonly CurrencyMetrics[],
  chosen: string | undefined,
  base: string,
): CurrencyMetrics {
  const named = (c: string | undefined) =>
    c === undefined ? undefined : ms.find((m) => m.currency === c);
  const has = (m: CurrencyMetrics) => m.summary.closedCount > 0;
  const pick =
    named(chosen) ??
    ms.find((m) => m.currency === base && has(m)) ??
    ms.find(has) ??
    named(base) ??
    ms[0];
  if (!pick) throw new RangeError('pickPartition needs at least one partition');
  return pick;
}

import type { MetricContext } from '@/domain/metrics/context';
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
import { sizedRealizations } from '@/domain/metrics/realized';
import { realizedUnits, type TradeUnits } from '@/domain/metrics/units';
import { winsVsLosses } from '@/domain/metrics/breakdowns';
import { ruleApplies } from '@/domain/rule-applies';
import { closedInOrder } from '@/domain/trade-status';
import {
  strategyRules,
  type Cents,
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

/** An open trade: what is still held, and what its exits so far booked. */
export interface OpenPosition {
  trade: Trade;
  /** Contracts, shares or lots still held: the entry fills less the exit fills. */
  openQty: number;
  /** The exits' booked P&L on the basis; null before the first exit. No unrealized P&L: Keel has no live prices. */
  realized: Cents | null;
  /** The same booked exits in R, ticks, pips and points: ticks of the contracts closed so far. Null before the first exit. */
  realizedUnits: TradeUnits | null;
}

/** The open trades, newest opened first, each with its open size and the P&L its partial exits booked. */
export function openPositions(
  trades: readonly Trade[],
  ctx: Pick<MetricContext, 'pnlBasis'>,
): OpenPosition[] {
  return trades
    .filter((t) => t.status === 'open')
    .sort(
      (a, b) =>
        Date.parse(b.openedAt) - Date.parse(a.openedAt) || b.serial - a.serial,
    )
    .map((trade) => {
      const long = trade.direction === 'long';
      let held = 0;
      for (const e of trade.executions)
        held += (e.side === 'buy') === long ? e.qty : -e.qty;
      const exits = sizedRealizations(trade);
      const basis = ctx.pnlBasis;
      return {
        trade,
        openQty: trade.executions.length === 0 ? trade.maxPosition : held,
        realizedUnits: realizedUnits(trade, basis),
        realized:
          exits.length === 0
            ? null
            : exits.reduce(
                (n, r) => n + (ctx.pnlBasis === 'gross' ? r.gross : r.net),
                0,
              ),
      };
    });
}

export interface DashboardEnv {
  strategies: readonly Strategy[];
  tags: readonly Tag[];
  tagCategories: readonly TagCategory[];
  ctx: MetricContext;
}

/**
 * The newest closed trades, each with its strategy names, its mistakes and how
 * it went against its rules, and the open trades: what the recent trades list
 * reads, without the rest of the dashboard model.
 */
export function recentAndOpen(
  trades: readonly Trade[],
  env: DashboardEnv,
): { recent: RecentTrade[]; open: OpenPosition[] } {
  const strategyName = new Map(env.strategies.map((s) => [s.id, s.name]));
  const mistakeTag = new Map(
    mistakeTags(env.tags, env.tagCategories).map((t) => [t.id, t.name]),
  );
  const recent = closedInOrder(trades)
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
  return { recent, open: openPositions(trades, env.ctx) };
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
  performance: {
    pnl: Cents;
    winRate: number | null;
    profitFactor: number | null;
    expectancy: Cents | null;
    /** Starting balance first, then the equity after each closed trade. */
    equity: Cents[];
    /** Winning days over trading days, with the green, flat and red counts; null rate with no day. */
    dayWin: {
      rate: number | null;
      green: number;
      flat: number;
      red: number;
    };
    /** Average win over average loss, from `Summary`; null without both. */
    winLossRatio: number | null;
    avgWin: Cents | null;
    avgLoss: Cents | null;
    /** The trades behind each average, so a display unit can read them. */
    winIds: string[];
    lossIds: string[];
  };
  recent: RecentTrade[];
  open: OpenPosition[];
  tradesById: ReadonlyMap<string, Trade>;
}

export function buildDashboard(
  m: CurrencyMetrics,
  env: DashboardEnv,
): DashboardModel {
  const { summary } = m;

  const rules = ruleScorecard(m.trades, env.strategies, env.ctx);
  // The headline adds up the rows, so it skips what they skip: checks on
  // unknown rule ids and a trade's repeat checks on one rule.
  const kept = rules.reduce((n, r) => n + r.kept, 0);
  const checks = rules.reduce((n, r) => n + r.kept + r.broken, 0);

  const outcomes = winsVsLosses(m.trades, env.ctx);
  const { recent, open } = recentAndOpen(m.trades, env);

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
    performance: {
      pnl: summary.basis === 'gross' ? summary.grossPnl : summary.netPnl,
      winRate: summary.winRate,
      profitFactor: summary.profitFactor,
      expectancy: summary.expectancy,
      equity: [m.startingBalance, ...m.equity.map((p) => p.equity)],
      dayWin: {
        rate: m.daySummary.greenPct,
        green: m.daySummary.greenDays,
        flat: m.daySummary.flatDays,
        red: m.daySummary.redDays,
      },
      winLossRatio: summary.winLossRatio,
      avgWin: summary.avgWin,
      avgLoss: summary.avgLoss,
      winIds: outcomes.wins.tradeIds,
      lossIds: outcomes.losses.tradeIds,
    },
    recent,
    open,
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

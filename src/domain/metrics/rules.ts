import type { Cents, Rule, Strategy, Trade } from '../types';
import { ruleApplies } from '../rule-applies';
import { closedInOrder, type ClosedTrade } from '../trade-status';
import { strategyRules } from '../types';
import { pnlOf, type MetricContext } from './context';
import { summarize } from './summary';

export interface RuleScore {
  ruleId: string;
  text: string;
  /** The title of the strategy's group that holds the rule. */
  group: string;
  strategyId: string;
  strategyName: string;
  /** When the rule is graded: a `loser` rule's kept trades are all losers, so win rate and profit factor mean nothing for it. */
  showWhen: Rule['showWhen'];
  kept: number;
  broken: number;
  /** kept / (kept + broken); a row exists only with at least one decisive check. */
  adherence: number;
  /** Basis P&L of the closed trades that broke / kept the rule. */
  brokenPnl: Cents;
  keptPnl: Cents;
  /** Newest close first. */
  brokenTradeIds: string[];
}

interface RuleOwner {
  rule: Rule;
  group: string;
  strategy: Strategy;
}

function ruleIndex(strategies: readonly Strategy[]): Map<string, RuleOwner> {
  const index = new Map<string, RuleOwner>();
  for (const strategy of strategies)
    for (const group of strategy.groups)
      for (const rule of group.rules)
        if (!index.has(rule.id))
          index.set(rule.id, { rule, group: group.title, strategy });
  return index;
}

/** A closed trade's decisive checks on known rules: the first check per rule wins; unknown ids are skipped. */
function decisiveChecks(
  t: ClosedTrade,
  index: ReadonlyMap<string, RuleOwner>,
): { ruleId: string; followed: boolean }[] {
  const seen = new Set<string>();
  const out: { ruleId: string; followed: boolean }[] = [];
  for (const c of t.ruleChecks) {
    if (!index.has(c.ruleId) || seen.has(c.ruleId)) continue;
    seen.add(c.ruleId);
    if (c.followed !== null)
      out.push({ ruleId: c.ruleId, followed: c.followed });
  }
  return out;
}

/** Per-rule adherence and cost when broken, over closed trades. Broken rules first (costliest first), then kept ones. */
export function ruleScorecard(
  trades: readonly Trade[],
  strategies: readonly Strategy[],
  ctx: MetricContext,
): RuleScore[] {
  const index = ruleIndex(strategies);
  const rows = new Map<string, RuleScore>();
  // Newest close first, so brokenTradeIds come out in that order.
  for (const t of closedInOrder(trades).reverse()) {
    const pnl = pnlOf(t, ctx.pnlBasis);
    for (const { ruleId, followed } of decisiveChecks(t, index)) {
      const { rule, group, strategy } = index.get(ruleId)!;
      let row = rows.get(ruleId);
      if (!row) {
        row = {
          ruleId,
          text: rule.text,
          group,
          strategyId: strategy.id,
          strategyName: strategy.name,
          showWhen: rule.showWhen,
          kept: 0,
          broken: 0,
          adherence: 0,
          brokenPnl: 0,
          keptPnl: 0,
          brokenTradeIds: [],
        };
        rows.set(ruleId, row);
      }
      if (followed) {
        row.kept += 1;
        row.keptPnl += pnl;
      } else {
        row.broken += 1;
        row.brokenPnl += pnl;
        row.brokenTradeIds.push(t.id);
      }
    }
  }
  const out = [...rows.values()];
  for (const r of out) r.adherence = r.kept / (r.kept + r.broken);
  return out.sort((a, b) => {
    if (a.broken > 0 !== b.broken > 0) return a.broken > 0 ? -1 : 1;
    if (a.broken > 0)
      return a.brokenPnl - b.brokenPnl || a.text.localeCompare(b.text);
    return b.adherence - a.adherence || a.text.localeCompare(b.text);
  });
}

/**
 * The headline "Broken rules cost": each closed trade that broke at least one known rule counts once,
 * however many it broke. Per-rule rows count it in every row, so they can sum to more than this.
 */
export function brokenRulesCost(
  trades: readonly Trade[],
  strategies: readonly Strategy[],
  ctx: MetricContext,
): { pnl: Cents; tradeCount: number } {
  const index = ruleIndex(strategies);
  let pnl = 0;
  let tradeCount = 0;
  for (const t of closedInOrder(trades)) {
    if (!decisiveChecks(t, index).some((c) => !c.followed)) continue;
    tradeCount += 1;
    pnl += pnlOf(t, ctx.pnlBasis);
  }
  return { pnl, tradeCount };
}

export interface RuleStat {
  ruleId: string;
  /** Closed trades the rule is graded on (its show-when fits their outcome). */
  applies: number;
  /** Of those, trades that kept / broke it. Unanswered checks are neither. */
  kept: number;
  broken: number;
  /** kept / (kept + broken); null with no answered check. */
  followRate: number | null;
  /** Basis P&L of the trades that kept it, and their win rate and profit factor. */
  followedNet: Cents;
  followedWinRate: number | null;
  followedProfitFactor: number | null;
  /** Basis P&L of the trades that broke it. */
  brokenNet: Cents;
  /** The trades behind the figures, so a display unit can read them. */
  keptTradeIds: string[];
  brokenTradeIds: string[];
}

/**
 * Per-rule stats of `strategy`, in group then rule order, over the closed
 * trades in `trades` (pass the strategy's own). A trade counts for a rule only
 * where `ruleApplies`, so a loser rule is read on the losses alone, and
 * outcomes come from `classify` through `summarize`. The first check per rule
 * on a trade wins.
 */
export function ruleStats(
  trades: readonly Trade[],
  strategy: Strategy,
  ctx: MetricContext,
): RuleStat[] {
  const closed = closedInOrder(trades);
  return strategyRules(strategy).map((rule) => {
    const kept: Trade[] = [];
    const broken: Trade[] = [];
    let applies = 0;
    for (const t of closed) {
      if (!ruleApplies(rule, t, ctx)) continue;
      applies += 1;
      const check = t.ruleChecks.find((c) => c.ruleId === rule.id);
      if (check?.followed === true) kept.push(t);
      else if (check?.followed === false) broken.push(t);
    }
    const followed = summarize(kept, ctx);
    return {
      ruleId: rule.id,
      applies,
      kept: kept.length,
      broken: broken.length,
      followRate:
        kept.length + broken.length === 0
          ? null
          : kept.length / (kept.length + broken.length),
      followedNet: kept.reduce((n, t) => n + pnlOf(t, ctx.pnlBasis), 0),
      followedWinRate: followed.winRate,
      followedProfitFactor: followed.profitFactor,
      brokenNet: broken.reduce((n, t) => n + pnlOf(t, ctx.pnlBasis), 0),
      keptTradeIds: kept.map((t) => t.id),
      brokenTradeIds: broken.map((t) => t.id),
    };
  });
}

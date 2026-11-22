import type { Cents, Rule, Strategy, Trade } from '../types';
import { closedInOrder, type ClosedTrade } from '../trade-status';
import { pnlOf, type MetricContext } from './context';

export interface RuleScore {
  ruleId: string;
  text: string;
  /** The title of the strategy's group that holds the rule. */
  group: string;
  strategyId: string;
  strategyName: string;
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

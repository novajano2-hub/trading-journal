import { classify, type MetricContext } from './metrics/context';
import type { Rule, Trade } from './types';

/**
 * Whether a rule is graded on this trade. 'always' rules apply to every trade;
 * the others follow the trade's outcome, read through `classify` so the
 * breakeven range and the Gross/Net basis agree with every other figure. An
 * open trade has no outcome yet, so it gets only the 'always' rules.
 */
export function ruleApplies(
  rule: Rule,
  trade: Trade,
  ctx: Pick<MetricContext, 'pnlBasis' | 'breakevenRange'>,
): boolean {
  if (rule.showWhen === 'always') return true;
  if (trade.status !== 'closed') return false;
  const { outcome } = classify(trade, ctx);
  return (
    (rule.showWhen === 'winner' && outcome === 'win') ||
    (rule.showWhen === 'loser' && outcome === 'loss') ||
    (rule.showWhen === 'breakeven' && outcome === 'breakeven')
  );
}

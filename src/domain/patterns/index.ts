import type { Trade } from '../types';
import { dayPatterns } from './day';
import type { PatternEnv, PatternHit } from './defs';
import { buildFacts } from './facts';
import { tradePatterns } from './trade';

export * from './defs';

/**
 * Every pattern of a workspace's trades (Plan 6B spec §5.5): the trade-level
 * ones by trade id, the day-level ones by local date, each trade or day with
 * its hits in the order of `PATTERNS`, and none for a trade or day with no
 * hit. All accounts, computed and never stored (B20); a trade's look-back is
 * the 60 days before its entry, a day's the 60 days before it, so a later
 * trade never changes an earlier result.
 */
export function computePatterns(
  trades: readonly Trade[],
  env: PatternEnv,
): { byTrade: Map<string, PatternHit[]>; byDay: Map<string, PatternHit[]> } {
  const facts = buildFacts(trades, env);
  return {
    byTrade: tradePatterns(facts),
    byDay: dayPatterns(facts, env),
  };
}

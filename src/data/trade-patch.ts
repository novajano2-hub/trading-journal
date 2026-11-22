import { riskFromStop } from '@/domain/metrics/summary';
import type { Trade } from '@/domain/types';
import { mergePatch } from './merge';

export type TradePatch = Partial<
  Pick<
    Trade,
    | 'strategyIds'
    | 'tagIds'
    | 'rating'
    | 'ruleChecks'
    | 'plannedStop'
    | 'plannedTarget'
    | 'initialRisk'
    | 'noteId'
    | 'reviewed'
  >
>;

/** The optional fields of Trade that a patch may clear with `undefined`. */
const CLEARABLE = [
  'rating',
  'plannedStop',
  'plannedTarget',
  'initialRisk',
  'noteId',
  'reviewed',
];

/**
 * A new trade with the patch applied; the input is never mutated.
 * `undefined` removes an optional field; the required `strategyIds`, `tagIds`
 * and `ruleChecks` become empty. When the patch leaves a strategy and sets no
 * `ruleChecks`, the checks of that strategy's rules (by `rulesOf`) are dropped.
 */
export function applyTradePatch(
  trade: Trade,
  patch: TradePatch,
  rulesOf?: (strategyId: string) => readonly string[] | undefined,
): Trade {
  const result = mergePatch(trade, patch, CLEARABLE);

  if ('plannedStop' in patch && !('initialRisk' in patch)) {
    if (patch.plannedStop === undefined) delete result.initialRisk;
    else result.initialRisk = riskFromStop(result, patch.plannedStop);
  }
  // These are required on Trade: clearing them means empty.
  if ('strategyIds' in patch && patch.strategyIds === undefined)
    result.strategyIds = [];
  if ('ruleChecks' in patch && patch.ruleChecks === undefined)
    result.ruleChecks = [];
  if ('tagIds' in patch && patch.tagIds === undefined) result.tagIds = [];
  result.strategyIds = [...new Set(result.strategyIds)];
  result.tagIds = [...new Set(result.tagIds)];

  if ('strategyIds' in patch && !('ruleChecks' in patch) && rulesOf) {
    const kept = new Set(result.strategyIds);
    const gone = new Set(
      trade.strategyIds
        .filter((id) => !kept.has(id))
        .flatMap((id) => rulesOf(id) ?? []),
    );
    result.ruleChecks = result.ruleChecks.filter((c) => !gone.has(c.ruleId));
  }
  return result;
}

/** The patch that marks one rule kept or broken on `trade`; its other checks are untouched, and a rule with no check yet is appended. */
export function withRuleCheck(
  trade: Trade,
  ruleId: string,
  followed: boolean,
): TradePatch {
  const has = trade.ruleChecks.some((c) => c.ruleId === ruleId);
  return {
    ruleChecks: has
      ? trade.ruleChecks.map((c) =>
          c.ruleId === ruleId ? { ruleId, followed } : c,
        )
      : [...trade.ruleChecks, { ruleId, followed }],
  };
}

import { riskFromStop } from '@/domain/metrics/summary';
import type { Trade } from '@/domain/types';

export type TradePatch = Partial<
  Pick<
    Trade,
    | 'strategyId'
    | 'tagIds'
    | 'rating'
    | 'ruleChecks'
    | 'plannedStop'
    | 'plannedTarget'
    | 'initialRisk'
    | 'noteId'
  >
>;

/**
 * A new trade with the patch applied; the input is never mutated.
 * A key present with `undefined` removes the field.
 */
export function applyTradePatch(trade: Trade, patch: TradePatch): Trade {
  const next: Record<string, unknown> = { ...trade };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  const result = next as unknown as Trade;

  if ('plannedStop' in patch && !('initialRisk' in patch)) {
    if (patch.plannedStop === undefined) delete result.initialRisk;
    else result.initialRisk = riskFromStop(result, patch.plannedStop);
  }
  if (
    'strategyId' in patch &&
    patch.strategyId !== trade.strategyId &&
    !('ruleChecks' in patch)
  ) {
    result.ruleChecks = [];
  }
  // These two are required on Trade: clearing them means empty.
  result.ruleChecks ??= [];
  result.tagIds = [...new Set(result.tagIds ?? [])];
  return result;
}

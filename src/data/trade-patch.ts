import { riskFromStop } from '@/domain/metrics/summary';
import type { Trade } from '@/domain/types';
import { mergePatch } from './merge';

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

/** The optional fields of Trade that a patch may clear with `undefined`. */
const CLEARABLE = [
  'strategyId',
  'rating',
  'plannedStop',
  'plannedTarget',
  'initialRisk',
  'noteId',
];

/**
 * A new trade with the patch applied; the input is never mutated.
 * `undefined` removes an optional field; the required `tagIds` and `ruleChecks` become empty.
 */
export function applyTradePatch(trade: Trade, patch: TradePatch): Trade {
  const result = mergePatch(trade, patch, CLEARABLE);

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
  if ('ruleChecks' in patch && patch.ruleChecks === undefined)
    result.ruleChecks = [];
  if ('tagIds' in patch && patch.tagIds === undefined) result.tagIds = [];
  result.tagIds = [...new Set(result.tagIds)];
  return result;
}

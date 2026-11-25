import { sidesOf, tradeRisk } from '@/domain/risk';
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
    | 'targets'
    | 'stops'
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
  'targets',
  'stops',
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

  // B14: a trade with a side saved in levels leaves the single-level fields.
  // The side the patch does not name moves into levels with them, so it is
  // not lost with the fields it was read from.
  if ('targets' in patch || 'stops' in patch) {
    const before = sidesOf(trade);
    if (!('targets' in patch) && !result.targets && before.targets)
      result.targets = before.targets;
    if (!('stops' in patch) && !result.stops && before.stops)
      result.stops = before.stops;
    delete result.plannedStop;
    delete result.plannedTarget;
  }
  // The stored risk is the stop side's loss, one figure for every R reader.
  // It follows the stop whichever shape it is saved in; an explicit one wins.
  if (
    ('stops' in patch || 'plannedStop' in patch) &&
    !('initialRisk' in patch)
  ) {
    const risk = tradeRisk(result);
    if (risk === undefined) delete result.initialRisk;
    else result.initialRisk = risk;
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

/**
 * The patch that applies one pick on a tag list: the tags that `after` adds to
 * or drops from `before`, applied to the trade as stored when the patch runs.
 * Two quick picks made from the same stale list therefore both land.
 */
export function withTagPick(
  before: readonly string[],
  after: readonly string[],
): (t: Trade) => TradePatch {
  const added = after.filter((id) => !before.includes(id));
  const dropped = before.filter((id) => !after.includes(id));
  return (t) => ({
    tagIds: [
      ...t.tagIds.filter((id) => !dropped.includes(id)),
      ...added.filter((id) => !t.tagIds.includes(id)),
    ],
  });
}

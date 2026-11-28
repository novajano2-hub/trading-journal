import {
  levelPrice,
  levelProblems,
  sidesOf,
  unitsFor,
  type LevelRole,
} from '../risk';
import type {
  AssetClass,
  Level,
  LevelSide,
  LevelUnit,
  RuleLevel,
  TargetRule,
  Trade,
} from '../types';
import { ruleAssetError, type RuleAsset } from './match';

export { ruleMatches, pickRule, ruleAssetOf, type RuleAsset } from './match';

/**
 * Default target and stop rules (Plan 6B spec §5.3, B15 to B19). A rule's
 * levels are shares of the position, so what a rule gives a trade depends on
 * the trade's size and its average entry. Everything here is pure: the data
 * layer decides when to apply a rule and writes what these functions return.
 */

/** The side of a rule: a unit and its levels, each a value and a share of the position. */
type RuleSide = NonNullable<TargetRule['target']>;

const QTY_EPS = 1e-9;
/** The finest quantity Keel reads: eight decimals, as a crypto size can have. */
const QTY_PLACES = 8;

/** The smallest step a position of the kind is cut in, before the trade's own fills say otherwise. */
const CLASS_STEP: Record<AssetClass, number> = {
  stock: 1,
  option: 1,
  future: 1,
  forex: 0.01,
  cfd: 0.01,
  crypto: 0.0001,
};

const tidy = (q: number): number => {
  const k = 10 ** QTY_PLACES;
  return Math.round(q * k) / k;
};

/** Decimal places a quantity is written with, 8 at the most. */
function placesOf(q: number): number {
  const text = tidy(q).toFixed(QTY_PLACES).replace(/0+$/, '');
  return text.endsWith('.') ? 0 : text.length - text.indexOf('.') - 1;
}

/**
 * The step a trade's levels are cut in (B17): the kind of instrument's own
 * (whole contracts and shares, a hundredth of a lot), or finer when the trade's
 * own fills are, so a position of 2.5 shares is cut in tenths.
 */
export function qtyStep(t: Trade): number {
  const finest = Math.max(
    0,
    placesOf(t.maxPosition),
    ...t.executions.map((e) => placesOf(e.qty)),
  );
  return Math.min(CLASS_STEP[t.instrument.assetClass], 10 ** -finest);
}

/**
 * One side of a rule as levels on this trade: each level's share of the
 * position, rounded down to the step, and the last level taking what is left
 * of the position (B17). A level that comes out as nothing is dropped. A level
 * on the wrong side of the entry (B13), for a trade running this way, takes the
 * whole side with it, as does one that has no price.
 */
function levelsFor(
  t: Trade,
  role: LevelRole,
  side: RuleSide,
): LevelSide | undefined {
  const size = t.maxPosition;
  if (!(size > 0) || side.levels.length === 0) return undefined;
  const step = qtyStep(t);
  const levels: Level[] = [];
  let left = size;
  side.levels.forEach((l: RuleLevel, i) => {
    const last = i === side.levels.length - 1;
    const share = Math.floor((size * l.pct) / 100 / step + QTY_EPS) * step;
    const qty = tidy(last ? left : Math.min(share, left));
    left = tidy(left - qty);
    if (qty > QTY_EPS) levels.push({ value: l.value, qty });
  });
  if (levels.length === 0) return undefined;
  const given: LevelSide = { unit: side.unit, levels };
  if (levels.some((l) => !Number.isFinite(levelPrice(t, role, side.unit, l))))
    return undefined;
  const sides = role === 'target' ? { targets: given } : { stops: given };
  if (levelProblems(t, sides).some((p) => p.kind === 'wrong-side'))
    return undefined;
  return given;
}

/**
 * The levels a rule gives a trade, whatever the trade has now: the rule's
 * target and stop read against the trade's size and entry. A side the rule
 * does not have, or that is skipped for this trade, is absent.
 */
export function applyTargetRule(
  t: Trade,
  rule: TargetRule,
): Pick<Trade, 'targets' | 'stops'> {
  const out: Pick<Trade, 'targets' | 'stops'> = {};
  const targets = rule.target && levelsFor(t, 'target', rule.target);
  const stops = rule.stop && levelsFor(t, 'stop', rule.stop);
  if (targets) out.targets = targets;
  if (stops) out.stops = stops;
  return out;
}

const sameSide = (
  a: LevelSide | undefined,
  b: LevelSide | undefined,
): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * What to write on the trade, or nothing when the rule changes nothing (the
 * trade is left as it is, and is not counted). Without `override` only a trade
 * with neither a target nor a stop is filled, with both sides the rule gives
 * (record §2.2: "no target or stop"); with it, each side the rule gives
 * replaces that side, and the side the rule does not give stays. A legacy
 * `plannedStop` or `plannedTarget` counts as set. The patch is for
 * `applyTradePatch`, which keeps the risk in step.
 */
export function targetRulePatch(
  t: Trade,
  rule: TargetRule,
  override: boolean,
): Pick<Trade, 'targets' | 'stops'> | undefined {
  const have = sidesOf(t);
  if (!override && (have.targets || have.stops)) return undefined;
  const given = applyTargetRule(t, rule);
  const patch: Pick<Trade, 'targets' | 'stops'> = {};
  if (given.targets && !sameSide(given.targets, have.targets))
    patch.targets = given.targets;
  if (given.stops && !sameSide(given.stops, have.stops))
    patch.stops = given.stops;
  return patch.targets || patch.stops ? patch : undefined;
}

/**
 * The units a rule's levels can be in, by its instrument (B9): the same list a
 * trade of that kind has, so the unit select can wait for the instrument.
 */
export function unitsForRule(asset: RuleAsset): LevelUnit[] {
  const future = asset === 'future-option';
  return unitsFor({
    symbol: '',
    root: '',
    assetClass: future ? 'option' : asset,
    ...(future ? { optionOn: 'future' as const } : {}),
    pointValue: 1,
    tickSize: 1,
    quoteCurrency: 'USD',
  });
}

/** Why a rule's side cannot be kept, or null. */
function sideError(
  asset: RuleAsset,
  side: RuleSide | undefined,
): string | null {
  if (!side) return null;
  if (!unitsForRule(asset).includes(side.unit))
    return `The unit ${side.unit} is not one a ${asset} has`;
  if (side.levels.length === 0) return 'A side needs at least one level';
  for (const l of side.levels) {
    if (!Number.isFinite(l.value))
      return 'A level needs a value that is a number';
    if (!(l.pct > 0 && l.pct <= 100))
      return 'A level takes a share of the position, above 0 and up to 100 percent';
  }
  return null;
}

/** A message for what keeps a target rule from being kept, or null when it is fine. */
export function targetRuleError(rule: {
  assetClass: RuleAsset;
  target?: RuleSide;
  stop?: RuleSide;
}): string | null {
  if (!rule.target && !rule.stop) return 'A rule needs a target or a stop';
  return (
    ruleAssetError(rule.assetClass) ??
    sideError(rule.assetClass, rule.target) ??
    sideError(rule.assetClass, rule.stop)
  );
}

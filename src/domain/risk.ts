import { quoteToPnl } from './currency';
import { riskFromStop } from './metrics/summary';
import { toCents } from './money';
import type {
  Cents,
  Instrument,
  Level,
  LevelSide,
  LevelUnit,
  Trade,
} from './types';

/**
 * Several targets and stops on a trade, in six units, and the R figures built
 * from them (Plan 6B spec §5.2, B9 to B14). Every level is its quantity times
 * its distance from the average entry; the levels of a side add up.
 *
 * Money is the distance on either side of the entry (as `riskFromStop` reads
 * it), so it is never negative; whether a level sits on the right side is the
 * question `levelProblems` answers.
 */

/** Which of a trade's two sides a level belongs to. */
export type LevelRole = 'target' | 'stop';

/** A trade's targets and stops; a side with no levels is absent. */
export interface LevelSides {
  targets?: LevelSide;
  stops?: LevelSide;
}

export interface LevelProblem {
  side: LevelRole;
  /** The level's place in its side. */
  index: number;
  /**
   * `wrong-side`: a stop on the profit side of the average entry, or a target
   * on the loss side (B13). `over-size`: the level takes the side's quantities
   * past the trade's size, flagged once at the level that crosses it (B11).
   */
  kind: 'wrong-side' | 'over-size';
}

/** Price noise from float arithmetic: 1.075 + 20 x 0.0001 is 1.0770000000000002. */
const tidy = (n: number) => Math.round(n * 1e9) / 1e9;
/** How far a price may sit from the entry and still count as at it. */
const PRICE_EPS = 1e-9;
/** How far a side's quantities may exceed the size and still count as equal (0.1 + 0.2 lots). */
const QTY_EPS = 1e-9;

/** One pip of the instrument's price: 0.01 against a JPY quote, 0.0001 otherwise. */
export function pipSize(i: Instrument): number {
  return i.quoteCurrency === 'JPY' ? 0.01 : 0.0001;
}

/**
 * The units a level can be set in (B9), in the order the unit list reads:
 * Price, Price movement and Amount everywhere; Ticks and Points for futures
 * and options on futures; Pips for forex.
 */
export function unitsFor(i: Instrument): LevelUnit[] {
  const futureLike =
    i.assetClass === 'future' ||
    (i.assetClass === 'option' && i.optionOn === 'future');
  const units: LevelUnit[] = ['price', 'movement'];
  if (futureLike) units.push('ticks', 'points');
  units.push('amount');
  if (i.assetClass === 'forex') units.push('pips');
  return units;
}

/** Money in the trade's P&L currency for one price unit of one contract, lot or share. */
function moneyPerPriceUnit(t: Trade): number {
  return quoteToPnl(
    t.instrument.pointValue,
    t.instrument,
    t.pnlCurrency,
    t.avgEntry,
  );
}

/**
 * The price a level sits at. `price` is the value itself; every other unit
 * measures from the average entry, towards the profit for a target and towards
 * the loss for a stop, whichever way the trade runs: `movement` and `points`
 * by the value, `ticks` by `value x tickSize`, `pips` by `value x pipSize`, and
 * `amount` by the distance that is worth the money (in the P&L currency) on the
 * level's own quantity. A negative value lands on the other side of the entry,
 * which `levelProblems` reports.
 */
export function levelPrice(
  t: Trade,
  side: LevelRole,
  unit: LevelUnit,
  level: Level,
): number {
  if (unit === 'price') return level.value;
  let distance: number;
  switch (unit) {
    case 'movement':
    case 'points':
      distance = level.value;
      break;
    case 'ticks':
      distance = level.value * t.instrument.tickSize;
      break;
    case 'pips':
      distance = level.value * pipSize(t.instrument);
      break;
    case 'amount':
      distance = level.value / (level.qty * moneyPerPriceUnit(t));
      break;
  }
  const towardsProfit = (t.direction === 'long') === (side === 'target');
  return tidy(t.avgEntry + (towardsProfit ? distance : -distance));
}

/**
 * The money, in cents of the P&L currency and never negative, the trade makes
 * (a target) or loses (a stop) if the level fills. An `amount` level is its
 * own value (B10); any other is priced as `riskFromStop` prices a stop, so a
 * trade's legacy single stop and its one-level form agree to the cent.
 */
export function levelMoney(
  t: Trade,
  side: LevelRole,
  unit: LevelUnit,
  level: Level,
): Cents {
  if (unit === 'amount') return toCents(Math.abs(level.value));
  return riskFromStop(
    { ...t, maxPosition: level.qty },
    levelPrice(t, side, unit, level),
  );
}

/** A side's levels, or nothing when it has none. A stored side wins, even an emptied one. */
function sideOf(
  stored: LevelSide | undefined,
  legacyPrice: number | undefined,
  size: number,
): LevelSide | undefined {
  if (stored) return stored.levels.length > 0 ? stored : undefined;
  if (legacyPrice === undefined) return undefined;
  return { unit: 'price', levels: [{ value: legacyPrice, qty: size }] };
}

/**
 * The trade's sides. A trade without stored levels reads its single
 * `plannedStop` and `plannedTarget` as one Price level each, at its full size
 * (B14), so a legacy trade is read, never rewritten.
 */
export function sidesOf(t: Trade): LevelSides {
  const targets = sideOf(t.targets, t.plannedTarget, t.maxPosition);
  const stops = sideOf(t.stops, t.plannedStop, t.maxPosition);
  const sides: LevelSides = {};
  if (targets) sides.targets = targets;
  if (stops) sides.stops = stops;
  return sides;
}

function sideMoney(t: Trade, role: LevelRole, side: LevelSide): Cents {
  return side.levels.reduce(
    (sum, level) => sum + levelMoney(t, role, side.unit, level),
    0,
  );
}

/** Whether the trade has at least one stop level (the tracker's stop rule). */
export function hasStop(t: Trade): boolean {
  return sidesOf(t).stops !== undefined;
}

/**
 * The loss if every stop level fills, alone: what Realized R divides by and
 * what `initialRisk` stores. A level counts only its own quantity, so stops
 * covering part of the position count only that part (B14). Undefined without
 * a stop; it needs no target.
 */
export function tradeRisk(t: Trade): Cents | undefined {
  const { stops } = sidesOf(t);
  return stops ? sideMoney(t, 'stop', stops) : undefined;
}

/** The profit if every target level fills; none unless the trade has a stop too. */
export function plannedReward(t: Trade): Cents | undefined {
  const { targets, stops } = sidesOf(t);
  return targets && stops ? sideMoney(t, 'target', targets) : undefined;
}

/** The loss if every stop level fills; none unless the trade has a target too. */
export function plannedRisk(t: Trade): Cents | undefined {
  const { targets, stops } = sidesOf(t);
  return targets && stops ? sideMoney(t, 'stop', stops) : undefined;
}

/** Planned reward over planned risk; none without both sides, or when the risk is nothing. */
export function plannedRMultiple(t: Trade): number | undefined {
  const reward = plannedReward(t);
  const risk = plannedRisk(t);
  if (reward === undefined || risk === undefined || !(risk > 0))
    return undefined;
  return reward / risk;
}

/**
 * What is wrong with the given sides on this trade, for the inline errors: a
 * level on the wrong side of the average entry (B13), and a side whose
 * quantities pass the trade's size (B11). A stop at the entry is a break-even
 * stop, and a side that falls short of the size is allowed.
 */
export function levelProblems(t: Trade, sides: LevelSides): LevelProblem[] {
  const problems: LevelProblem[] = [];
  const sign = t.direction === 'long' ? 1 : -1;
  const roles: [LevelRole, LevelSide | undefined][] = [
    ['target', sides.targets],
    ['stop', sides.stops],
  ];
  for (const [role, side] of roles) {
    if (!side) continue;
    let used = 0;
    let flaggedSize = false;
    side.levels.forEach((level, index) => {
      // Positive: towards the profit.
      const move = (levelPrice(t, role, side.unit, level) - t.avgEntry) * sign;
      if (role === 'target' ? move < -PRICE_EPS : move > PRICE_EPS)
        problems.push({ side: role, index, kind: 'wrong-side' });
      used += level.qty;
      if (!flaggedSize && used > t.maxPosition + QTY_EPS) {
        flaggedSize = true;
        problems.push({ side: role, index, kind: 'over-size' });
      }
    });
  }
  return problems;
}

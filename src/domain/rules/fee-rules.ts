import { withCosts } from '../fill-costs';
import { isExpirySettlement } from '../import/expiry';
import { roundHalfAway } from '../money';
import type { Cents, Execution, FeeRule, Trade } from '../types';
import { ruleAssetError } from './match';

/**
 * Default commission and fee rules (Plan 6B spec §5.3, B18). A rule writes the
 * commission and fee of a trade's executions; the trade's own fees and net
 * follow from the change. Pure: the data layer decides which trades a rule
 * covers and when, and writes what these functions return.
 */

/**
 * Whether any fill of the trade carries a commission or a fee. TradeZella
 * leaves such a fill alone unless the rule overrides. `fills` (execution ids)
 * narrows the question to those fills: at import, the ones the import brought.
 */
export function hasCosts(t: Trade, fills?: ReadonlySet<string>): boolean {
  return t.executions.some(
    (e) => (!fills || fills.has(e.id)) && (e.commission !== 0 || e.fees !== 0),
  );
}

type Leg = 'entry' | 'exit';

/**
 * Whether each fill (in time order) opens or closes position: it is an entry
 * when it makes the position bigger, from flat included, and an exit when it
 * makes it smaller. This reads the position, not the side of the first fill,
 * so a trade of several legs (one the user joined by hand) has the right
 * entries in each.
 */
function legsOf(fills: readonly Execution[]): Leg[] {
  let position = 0;
  return fills.map((e): Leg => {
    const next = position + (e.side === 'buy' ? e.qty : -e.qty);
    const leg: Leg = Math.abs(next) > Math.abs(position) ? 'entry' : 'exit';
    position = next;
    return leg;
  });
}

/** The execution as the rule's costs write it: per contract is the amount times the fill's quantity, per execution the amount once (B18), in whole cents. */
function costed(e: Execution, rule: FeeRule): Execution {
  const factor = rule.mode === 'per-contract' ? e.qty : 1;
  return {
    ...e,
    commission: roundHalfAway(rule.commission * factor),
    fees: roundHalfAway(rule.fee * factor),
  };
}

/**
 * The trade's executions with the rule's commission and fee written on every
 * fill it covers (all, entries or exits); the others keep what they have. This
 * replaces whatever those fills carried: whether a trade may be written at all
 * is `withFeeRule`'s question. With `fills` (execution ids) only those fills
 * may be written; which of them are entries and exits is still read from the
 * whole trade's position. The synthetic fill that settled an expired option is
 * never written: no broker charged it (spec §5.3), at import or by Apply to
 * existing trades.
 */
export function applyFeeRule(
  t: Trade,
  rule: FeeRule,
  fills?: ReadonlySet<string>,
): Execution[] {
  // Legs are read in time order; a stable sort keeps the stored order for equal times.
  const order = t.executions
    .map((_, index) => index)
    .sort(
      (a, b) =>
        Date.parse(t.executions[a]!.time) - Date.parse(t.executions[b]!.time) ||
        a - b,
    );
  const legs = legsOf(order.map((index) => t.executions[index]!));
  const legAt = new Map(order.map((index, at) => [index, legs[at]!]));
  return t.executions.map((e, index) =>
    (!fills || fills.has(e.id)) &&
    !isExpirySettlement(e) &&
    (rule.applyOn === 'all' || legAt.get(index) === rule.applyOn)
      ? costed(e, rule)
      : { ...e },
  );
}

/**
 * The trade with the rule's costs written, or nothing when the rule changes
 * nothing for it. Without `override` a trade with any costed fill is left
 * alone (B18); with it every fill the rule covers is replaced. The rule's
 * amounts are in the account's currency, so a trade settled in another one is
 * left alone too.
 *
 * `fills` (execution ids) is the scope: at import, the fills that import
 * brought, since TradeZella skips rows that already carry fees. Only those are
 * looked at for costs and only those are written; a fill an earlier import
 * costed does not stop the rule, and the others keep what they have.
 *
 * Fees and net move by the change in the fills' costs, and everything else
 * stays: the gross, the swap that sits inside the net, a P&L a closed-trade
 * file gave, the excursions. For a trade built from its fills this is exactly
 * what rebuilding it from them gives, since net is gross less fees plus swap.
 */
export function withFeeRule(
  t: Trade,
  rule: FeeRule,
  o: {
    override: boolean;
    accountCurrency: string;
    fills?: ReadonlySet<string>;
  },
): Trade | undefined {
  if (t.pnlCurrency !== o.accountCurrency) return undefined;
  if (!o.override && hasCosts(t, o.fills)) return undefined;
  return withCosts(t, applyFeeRule(t, rule, o.fills));
}

/** A message for what keeps a fee rule from being kept, or null when it is fine. */
export function feeRuleError(rule: {
  assetClass: FeeRule['assetClass'];
  mode: FeeRule['mode'];
  applyOn: FeeRule['applyOn'];
  commission: Cents;
  fee: Cents;
}): string | null {
  const asset = ruleAssetError(rule.assetClass);
  if (asset) return asset;
  if (rule.mode !== 'per-contract' && rule.mode !== 'per-execution')
    return 'A fee rule is per contract or per execution';
  if (!['all', 'entry', 'exit'].includes(rule.applyOn))
    return 'A fee rule applies on entry, exit or all executions';
  for (const cents of [rule.commission, rule.fee])
    if (!Number.isInteger(cents) || cents < 0)
      return 'A commission and a fee are whole, non-negative cents';
  return null;
}

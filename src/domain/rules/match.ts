import { ASSET_TYPES, assetTypeOf } from '../manual-trade';
import { canonicalSymbol } from '../trade-builder';
import type { FeeRule, Instrument, TargetRule, Trade } from '../types';

/** What a default rule names as its instrument: Keel's six asset classes and the future option. */
export type RuleAsset = TargetRule['assetClass'];

/** The instrument a trade's rules are read by: an option written on a future is its own kind. */
export function ruleAssetOf(i: Instrument): RuleAsset {
  return assetTypeOf(i);
}

/** Why a rule's instrument is not one Keel has, or null. */
export function ruleAssetError(asset: RuleAsset): string | null {
  return ASSET_TYPES.some((a) => a.id === asset)
    ? null
    : `A rule is for one kind of instrument, not "${String(asset)}"`;
}

/** A symbol as a rule compares it: upper case, no leading slash, no separators (EUR/USD is EURUSD). */
const norm = (symbol: string): string =>
  canonicalSymbol(symbol).replace(/[\s/-]/g, '');

/** Whether the rule names this trade's symbol: the contract as traded, or its root (ES for ESZ5). */
function namesSymbol(symbols: readonly string[], t: Trade): boolean {
  const names = new Set([norm(t.instrument.symbol), norm(t.instrument.root)]);
  return symbols.some((s) => names.has(norm(s)));
}

/**
 * Whether a default rule covers the trade (B15): its account, its kind of
 * instrument, and one of its symbols (every symbol when it names none).
 */
export function ruleMatches(
  rule: {
    accountId: string;
    assetClass: RuleAsset;
    symbols: readonly string[];
  },
  t: Trade,
): boolean {
  return (
    rule.accountId === t.accountId &&
    rule.assetClass === ruleAssetOf(t.instrument) &&
    (rule.symbols.length === 0 || namesSymbol(rule.symbols, t))
  );
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The one rule of the list that rules a trade (B15, B18): of those that match,
 * one that names the symbol beats one that names none, then the newest wins
 * (the later `createdAt`; the id breaks a tie, so the answer is the same
 * whatever the order of the list).
 */
export function pickRule<R extends TargetRule | FeeRule>(
  rules: readonly R[],
  t: Trade,
): R | undefined {
  const named = (r: R) => r.symbols.length > 0;
  return rules
    .filter((r) => ruleMatches(r, t))
    .sort(
      (a, b) =>
        Number(named(b)) - Number(named(a)) ||
        cmp(b.createdAt, a.createdAt) ||
        cmp(b.id, a.id),
    )[0];
}

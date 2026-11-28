import { ASSET_TYPES } from '@/domain/manual-trade';
import { sidesOf } from '@/domain/risk';
import { withFeeRule } from '@/domain/rules/fee-rules';
import { isExpirySettlement } from '@/domain/import/expiry';
import { pickRule } from '@/domain/rules/match';
import { targetRulePatch } from '@/domain/rules/target-rules';
import { canonicalSymbol } from '@/domain/trade-builder';
import type { Account, FeeRule, TargetRule, Trade } from '@/domain/types';
import { applyTradePatch } from '../trade-patch';
import type { KeelDb } from './db';
import {
  changeRows,
  fieldChanges,
  tradeLabel,
  type NewHistoryRow,
} from './history';

/**
 * What the two kinds of default rule share (Plan 6B spec §5.3): how a rule is
 * named in history, how its symbols are kept, how it is written onto a trade,
 * and what an import does with the rules. It imports nothing from `imports.ts`
 * (which uses `withDefaultRules`), so the two never form a cycle.
 */

/** Symbols as stored: trimmed, upper case, no leading slash, none twice, none empty. */
export function tidySymbols(symbols: readonly string[]): string[] {
  return [...new Set(symbols.map(canonicalSymbol).filter((s) => s !== ''))];
}

/** How history names a rule: its account, its kind of instrument and its symbols. */
export function ruleLabel(
  account: Account | undefined,
  rule: Pick<TargetRule, 'accountId' | 'assetClass' | 'symbols'>,
): string {
  const asset =
    ASSET_TYPES.find((a) => a.id === rule.assetClass)?.label ?? rule.assetClass;
  const symbols =
    rule.symbols.length > 0 ? rule.symbols.join(' ') : 'All symbols';
  return `${account?.name ?? rule.accountId}, ${asset}, ${symbols}`;
}

/** The newest rule first (`pickRule`'s own order), the id breaking a tie. */
export function newestFirst<R extends TargetRule | FeeRule>(rules: R[]): R[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return rules.sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(b.id, a.id));
}

/** The trade with the rule's levels written, or nothing when the rule changes nothing. The levels go through `applyTradePatch`, so the stored risk follows the stop (ledger R1). */
export function levelledBy(
  t: Trade,
  rule: TargetRule,
  override: boolean,
): Trade | undefined {
  const patch = targetRulePatch(t, rule, override);
  return patch && applyTradePatch(t, patch);
}

/** The history rows of a trade a target rule changed: one per side, as the sides read before and after (a legacy stop reads as its one level). */
export function levelRows(
  before: Trade,
  after: Trade,
  timeZone: string,
): NewHistoryRow[] {
  return changeRows(
    'trade',
    after.id,
    tradeLabel(after, timeZone),
    fieldChanges(sidesOf(before), sidesOf(after), ['targets', 'stops']),
    'rule',
  );
}

/** The history row of a trade a fee rule changed: its fees, in cents, before and after. */
export function feeRows(
  before: Trade,
  after: Trade,
  timeZone: string,
): NewHistoryRow[] {
  return changeRows(
    'trade',
    after.id,
    tradeLabel(after, timeZone),
    fieldChanges(before, after, ['fees']),
    'rule',
  );
}

/**
 * The trades of an import with the account's default rules applied (B15 to
 * B18). Levels go to each trade the plan makes that was not already stored,
 * the picked target rule when it has no levels; a trade the import carries on
 * keeps its levels (B17: a trade that grows is not re-levelled). Costs go by
 * the fills the import brought: the picked fee rule writes them on those fills
 * when none of them carries a cost from the file, whether they make a new
 * trade or join one an earlier import opened. A fill an earlier import costed
 * stays as it is, and so does the synthetic fill that settles an expired
 * option, which is not an execution. `continued` holds the stored trades the
 * plan carries on, by id. No history row is written per trade: the import's
 * own row stands for them (B27). Call inside a transaction that includes
 * `db.targetRules` and `db.feeRules`.
 */
export async function withDefaultRules(
  db: KeelDb,
  ws: string,
  account: Account,
  trades: readonly Trade[],
  continued: ReadonlyMap<string, Trade>,
): Promise<Trade[]> {
  // `pickRule` leaves out the rules of other accounts.
  const targetRules = await db.targetRules
    .where('workspaceId')
    .equals(ws)
    .toArray();
  const feeRules = await db.feeRules.where('workspaceId').equals(ws).toArray();
  if (targetRules.length === 0 && feeRules.length === 0) return [...trades];
  return trades.map((t) => {
    const stored = continued.get(t.id);
    const target = stored ? undefined : pickRule(targetRules, t);
    const levelled = (target && levelledBy(t, target, false)) ?? t;
    const fee = pickRule(feeRules, levelled);
    if (!fee) return levelled;
    const had = new Set(stored?.executions.map((e) => e.id));
    const fills = new Set(
      levelled.executions
        .filter((e) => !had.has(e.id) && !isExpirySettlement(e))
        .map((e) => e.id),
    );
    return (
      withFeeRule(levelled, fee, {
        override: false,
        accountCurrency: account.currency,
        fills,
      }) ?? levelled
    );
  });
}

import { withFeeRule } from '@/domain/rules/fee-rules';
import { ruleMatches } from '@/domain/rules/match';
import type { Account, FeeRule, TargetRule, Trade } from '@/domain/types';
import { ArchivedAccountError, NotFoundError } from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { logHistory, type NewHistoryRow } from './history';
import { bumpImportRevision } from './imports';
import { readPrefs } from './prefs';
import { feeRows, levelledBy, levelRows } from './rule-shared';

/**
 * Fill in logged trades, for either kind: `change` is what the rule does
 * to one trade of the rule's account that it matches (`levelledBy` or
 * `withFeeRule`). Throws NotFoundError for a missing account and
 * ArchivedAccountError for an archived one (its trades are read-only). Writes
 * the changed trades, one history row per changed field with source `rule`,
 * and moves the import state when anything changed, since a pending plan
 * carries the stored open trades it would overwrite. Returns how many trades
 * changed. Call inside the rw transaction of the apply, with `db.trades`,
 * `db.accounts`, `db.history` and `db.meta` in it.
 */
async function applyStored(
  db: KeelDb,
  ws: string,
  ctx: LocalContext,
  rule: TargetRule | FeeRule,
  change: (t: Trade, account: Account) => Trade | undefined,
  rows: (before: Trade, after: Trade, timeZone: string) => NewHistoryRow[],
): Promise<number> {
  const account = await db.accounts.get([ws, rule.accountId]);
  if (!account) throw new NotFoundError('account', rule.accountId);
  if (account.status === 'archived')
    throw new ArchivedAccountError([account.id]);
  const stored = (
    await db.trades
      .where('[workspaceId+accountId]')
      .equals([ws, rule.accountId])
      .filter((t) => ruleMatches(rule, t))
      .toArray()
  ).sort((a, b) => a.serial - b.serial);
  const changed = stored.flatMap((before) => {
    const after = change(before, account);
    return after ? [{ before, after }] : [];
  });
  if (changed.length === 0) return 0;
  await db.trades.bulkPut(changed.map((c) => c.after));
  await bumpImportRevision(db, ws);
  const { timeZone } = await readPrefs(db);
  await logHistory(
    db,
    ws,
    changed.flatMap((c) => rows(c.before, c.after, timeZone)),
    ctx,
  );
  return changed.length;
}

export const applyTargetRuleStored = (
  db: KeelDb,
  ws: string,
  ctx: LocalContext,
  rule: TargetRule,
  override: boolean,
): Promise<number> =>
  applyStored(
    db,
    ws,
    ctx,
    rule,
    (t) => levelledBy(t, rule, override),
    levelRows,
  );

export const applyFeeRuleStored = (
  db: KeelDb,
  ws: string,
  ctx: LocalContext,
  rule: FeeRule,
  override: boolean,
): Promise<number> =>
  applyStored(
    db,
    ws,
    ctx,
    rule,
    (t, account) =>
      withFeeRule(t, rule, { override, accountCurrency: account.currency }),
    feeRows,
  );

import { pnlCurrencyFor } from '@/domain/currency';
import { finalizeTrade } from '@/domain/trade-builder';
import type { Account, CostMethod, Trade } from '@/domain/types';
import type { KeelDb } from './db';
import { bumpImportRevision } from './imports';

/** The row carrying `method`; FIFO is stamped by omission. */
function stamped<T extends { costMethod?: CostMethod }>(
  row: T,
  method: CostMethod,
): T {
  const out = { ...row };
  delete out.costMethod;
  if (method !== 'fifo') out.costMethod = method;
  return out;
}

/**
 * The trades as `method` builds them from their stored executions (C40). A
 * trade already built under it is returned as it is, so a rebuild writes only
 * what moves. A trade whose P&L currency is not the one its instrument and the
 * account give came from an imported trip row, whose gross is the file's own
 * conversion: it is one entry and one exit, the same under every method, so
 * only its method is stamped.
 */
export function rebuiltUnder(
  trades: readonly Trade[],
  method: CostMethod,
  accountCurrency: string,
): Trade[] {
  return trades.map((t) => {
    if ((t.costMethod ?? 'fifo') === method) return t;
    return t.pnlCurrency === pnlCurrencyFor(t.instrument, accountCurrency)
      ? finalizeTrade(t, method)
      : stamped(t, method);
  });
}

/**
 * Writes `account` with `method`, then rebuilds each of its trades under it. A
 * change of method also makes a pending import plan stale: it was built with
 * the old one. Call inside an rw transaction over `db.accounts`, `db.trades`
 * and `db.meta`. FIFO is stored as unset.
 */
export async function applyCostMethod(
  db: KeelDb,
  account: Account,
  method: CostMethod,
  /** The method the account held before, when `account` already carries the new one. */
  was: CostMethod = account.costMethod ?? 'fifo',
): Promise<Account> {
  const next = stamped(account, method);
  await db.accounts.put(next);
  const ws = account.workspaceId;
  const stored = await db.trades
    .where('[workspaceId+accountId]')
    .equals([ws, account.id])
    .toArray();
  const rebuilt = rebuiltUnder(stored, method, account.currency);
  const moved = rebuilt.filter((t, i) => t !== stored[i]);
  if (moved.length > 0) await db.trades.bulkPut(moved);
  if (moved.length > 0 || was !== method) await bumpImportRevision(db, ws);
  return next;
}

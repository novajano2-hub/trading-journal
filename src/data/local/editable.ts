import type { Trade } from '@/domain/types';
import { ArchivedAccountError } from '../repository';
import type { KeelDb } from './db';

/**
 * Throws ArchivedAccountError when any of the trades is in an archived
 * account (ruling M15: an archived account's trades are read-only
 * everywhere, in the repository itself). Call inside a transaction over
 * `db.accounts`.
 */
export async function assertEditable(
  db: KeelDb,
  ws: string,
  trades: readonly (Trade | undefined)[],
): Promise<void> {
  const held = trades.filter((t): t is Trade => t !== undefined);
  const accountIds = [...new Set(held.map((t) => t.accountId))];
  const accounts = await db.accounts.bulkGet(
    accountIds.map((id): [string, string] => [ws, id]),
  );
  const archived = new Set(
    accounts.flatMap((a) => (a?.status === 'archived' ? [a.id] : [])),
  );
  if (archived.size === 0) return;
  throw new ArchivedAccountError(
    [...archived],
    held.filter((t) => archived.has(t.accountId)).map((t) => t.id),
  );
}

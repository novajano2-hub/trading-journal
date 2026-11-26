import { NotFoundError, type AccountsRepo } from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { deleteOwnerFiles } from './files';
import { changeRows, fieldChanges, lifecycleRow, logHistory } from './history';
import { bumpImportRevision, droppedOwners } from './imports';
import { rwTx } from './tx';
import { pruneJournalLinks } from './journal';
import { mergePatch } from '../merge';

/** The account fields history keeps (B26). */
const LOGGED_FIELDS = [
  'name',
  'broker',
  'type',
  'currency',
  'startingBalance',
  'status',
] as const;

/**
 * Deletes the files of the trades the account's active imports dropped: the
 * imports go with the account's trades, so nothing can bring those back. Call
 * inside an rw transaction over `db.imports`, `db.trades` and `db.files`,
 * before the jobs are deleted.
 */
async function deleteDroppedFiles(
  db: KeelDb,
  ws: string,
  accountId: string,
): Promise<void> {
  const jobs = await db.imports
    .where('[workspaceId+accountId]')
    .equals([ws, accountId])
    .filter((j) => j.status === 'active')
    .toArray();
  await deleteOwnerFiles(db, ws, await droppedOwners(db, ws, jobs));
}

export function localAccounts(ctx: LocalContext): AccountsRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.accounts.where('workspaceId').equals(ws).toArray();
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    },

    async create(ws, input) {
      const db = await ctx.db();
      const account = { ...input, id: ctx.newId(), workspaceId: ws };
      return rwTx(db, [db.accounts, db.history], async () => {
        await db.accounts.put(account);
        await logHistory(
          db,
          ws,
          [lifecycleRow('account', 'created', account.id, account.name)],
          ctx,
        );
        return account;
      });
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.accounts, db.history], async () => {
        const account = await db.accounts.get([ws, id]);
        if (!account) throw new NotFoundError('account', id);
        const next = {
          ...mergePatch(account, patch, [
            'propRules',
            'timeZone',
            'importMapping',
          ]),
          id,
          workspaceId: ws,
        };
        await db.accounts.put(next);
        await logHistory(
          db,
          ws,
          changeRows(
            'account',
            id,
            next.name,
            fieldChanges(account, next, LOGGED_FIELDS),
          ),
          ctx,
        );
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(
        db,
        [
          db.accounts,
          db.trades,
          db.imports,
          db.cashflows,
          db.challenges,
          db.files,
          db.history,
          db.targetRules,
          db.feeRules,
        ],
        async () => {
          const account = await db.accounts.get([ws, id]);
          if (!account) throw new NotFoundError('account', id);
          const trades = await db.trades
            .where('[workspaceId+accountId]')
            .equals([ws, id])
            .count();
          if (trades > 0) throw new Error('account has trades');
          // Its default rules go with it, as its cash flows do.
          await db.targetRules
            .where('workspaceId')
            .equals(ws)
            .filter((r) => r.accountId === id)
            .delete();
          await db.feeRules
            .where('workspaceId')
            .equals(ws)
            .filter((r) => r.accountId === id)
            .delete();
          await deleteDroppedFiles(db, ws, id);
          // Undone imports keep their history rows; they go with the account.
          await db.imports
            .where('[workspaceId+accountId]')
            .equals([ws, id])
            .delete();
          await db.cashflows
            .where('[workspaceId+accountId]')
            .equals([ws, id])
            .delete();
          // A phase that was linked to it is left unlinked, with its start date.
          const linked = await db.challenges
            .where('workspaceId')
            .equals(ws)
            .filter((c) => c.phases.some((p) => p.accountId === id))
            .toArray();
          await db.challenges.bulkPut(
            linked.map((c) => ({
              ...c,
              phases: c.phases.map(({ accountId, ...p }) =>
                accountId === id ? p : { ...p, accountId },
              ),
            })),
          );
          await db.accounts.delete([ws, id]);
          // Its cash flows, import jobs and default rules go with it, under this one row.
          await logHistory(
            db,
            ws,
            [lifecycleRow('account', 'deleted', id, account.name)],
            ctx,
          );
        },
      );
    },

    async clearTrades(ws, id) {
      const db = await ctx.db();
      return rwTx(
        db,
        [
          db.accounts,
          db.trades,
          db.journal,
          db.imports,
          db.meta,
          db.files,
          db.history,
        ],
        async () => {
          const account = await db.accounts.get([ws, id]);
          if (!account) throw new NotFoundError('account', id);
          const tradeKeys = await db.trades
            .where('[workspaceId+accountId]')
            .equals([ws, id])
            .primaryKeys();
          await db.trades.bulkDelete(tradeKeys);
          const tradeIds = tradeKeys.map(([, tradeId]) => tradeId);
          await pruneJournalLinks(db, ws, tradeIds);
          await deleteOwnerFiles(
            db,
            ws,
            tradeIds.map((tradeId) => `trade:${tradeId}`),
          );
          await deleteDroppedFiles(db, ws, id);
          await db.imports
            .where('[workspaceId+accountId]')
            .equals([ws, id])
            .delete();
          // A plan made before this would write onto trades that are gone.
          await bumpImportRevision(db, ws);
          // One row for the account, not one per trade it loses.
          if (tradeKeys.length > 0)
            await logHistory(
              db,
              ws,
              changeRows('account', id, account.name, [
                { field: 'trades', oldValue: tradeKeys.length, newValue: 0 },
              ]),
              ctx,
            );
          return tradeKeys.length;
        },
      );
    },
  };
}

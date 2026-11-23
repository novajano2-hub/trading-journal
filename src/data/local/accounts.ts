import { NotFoundError, type AccountsRepo } from '../repository';
import type { LocalContext } from './context';
import { bumpImportRevision } from './imports';
import { rwTx } from './tx';
import { pruneJournalLinks } from './journal';
import { mergePatch } from '../merge';

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
      await db.accounts.put(account);
      return account;
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.accounts], async () => {
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
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(
        db,
        [db.accounts, db.trades, db.imports, db.cashflows, db.challenges],
        async () => {
          if (!(await db.accounts.get([ws, id])))
            throw new NotFoundError('account', id);
          const trades = await db.trades
            .where('[workspaceId+accountId]')
            .equals([ws, id])
            .count();
          if (trades > 0) throw new Error('account has trades');
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
        },
      );
    },

    async clearTrades(ws, id) {
      const db = await ctx.db();
      return rwTx(
        db,
        [db.accounts, db.trades, db.journal, db.imports, db.meta],
        async () => {
          if (!(await db.accounts.get([ws, id])))
            throw new NotFoundError('account', id);
          const tradeKeys = await db.trades
            .where('[workspaceId+accountId]')
            .equals([ws, id])
            .primaryKeys();
          await db.trades.bulkDelete(tradeKeys);
          await pruneJournalLinks(
            db,
            ws,
            tradeKeys.map(([, tradeId]) => tradeId),
          );
          await db.imports
            .where('[workspaceId+accountId]')
            .equals([ws, id])
            .delete();
          // A plan made before this would write onto trades that are gone.
          await bumpImportRevision(db, ws);
          return tradeKeys.length;
        },
      );
    },
  };
}

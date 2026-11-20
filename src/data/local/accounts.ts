import { NotFoundError, type AccountsRepo } from '../repository';
import type { LocalContext } from './context';
import { rwTx } from './tx';
import { pruneJournalLinks } from './journal';
import { mergePatch } from './merge';

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
        const next = mergePatch(account, patch);
        await db.accounts.put(next);
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(
        db,
        [db.accounts, db.trades, db.journal, db.imports],
        async () => {
          if (!(await db.accounts.get([ws, id])))
            throw new NotFoundError('account', id);
          const tradeIds = await db.trades
            .where('[workspaceId+accountId]')
            .equals([ws, id])
            .primaryKeys();
          await db.trades.bulkDelete(tradeIds);
          await pruneJournalLinks(
            db,
            ws,
            tradeIds.map(([, tradeId]) => tradeId),
          );
          await db.imports
            .where('[workspaceId+accountId]')
            .equals([ws, id])
            .delete();
          await db.accounts.delete([ws, id]);
        },
      );
    },
  };
}

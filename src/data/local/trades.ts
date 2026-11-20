import {
  NotFoundError,
  OpenImportedTradeError,
  type TradesRepo,
} from '../repository';
import { applyTradePatch } from '../trade-patch';
import type { LocalContext } from './context';
import { rwTx } from './tx';
import { pruneJournalLinks } from './journal';

export function localTrades(ctx: LocalContext): TradesRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.trades.where('workspaceId').equals(ws).toArray();
      return rows.sort((a, b) => a.serial - b.serial);
    },

    async get(ws, id) {
      return (await ctx.db()).trades.get([ws, id]);
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.trades], async () => {
        const trade = await db.trades.get([ws, id]);
        if (!trade) throw new NotFoundError('trade', id);
        const next = { ...applyTradePatch(trade, patch), id, workspaceId: ws };
        await db.trades.put(next);
        return next;
      });
    },

    async remove(ws, ids) {
      const db = await ctx.db();
      const keys = ids.map((id): [string, string] => [ws, id]);
      await rwTx(db, [db.trades, db.journal], async () => {
        // Later imports' fills would have nothing to close (Plan 5 adds a tombstone flow).
        for (const t of await db.trades.bulkGet(keys))
          if (t?.status === 'open' && t.importId !== undefined)
            throw new OpenImportedTradeError(t.id, t.importId);
        await db.trades.bulkDelete(keys);
        await pruneJournalLinks(db, ws, ids);
      });
    },
  };
}

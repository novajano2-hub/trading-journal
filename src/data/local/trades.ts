import { strategyRules, type Trade } from '@/domain/types';
import {
  NotFoundError,
  OpenImportedTradeError,
  type TradesRepo,
} from '../repository';
import { applyTradePatch, type TradePatch } from '../trade-patch';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { rwTx } from './tx';
import { pruneJournalLinks } from './journal';

/**
 * `patch` applied to the stored trades, which must all exist; leaving a
 * strategy drops the checks of its rules. Call inside a transaction over
 * `db.trades` and `db.strategies`.
 */
async function patched(
  db: KeelDb,
  ws: string,
  ids: readonly string[],
  patch: TradePatch | ((t: Trade) => TradePatch),
): Promise<Trade[]> {
  const stored = await db.trades.bulkGet(
    ids.map((id): [string, string] => [ws, id]),
  );
  const trades = stored.map((t, i) => {
    if (!t) throw new NotFoundError('trade', ids[i]!);
    return t;
  });
  const strategyIds = [...new Set(trades.flatMap((t) => t.strategyIds))];
  const strategies = await db.strategies.bulkGet(
    strategyIds.map((id): [string, string] => [ws, id]),
  );
  const rules = new Map(
    strategies.flatMap((s) =>
      s ? [[s.id, strategyRules(s).map((r) => r.id)] as const] : [],
    ),
  );
  return trades.map((t) => ({
    ...applyTradePatch(
      t,
      typeof patch === 'function' ? patch(t) : patch,
      (id) => rules.get(id),
    ),
    id: t.id,
    workspaceId: ws,
  }));
}

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
      return rwTx(db, [db.trades, db.strategies], async () => {
        const [next] = await patched(db, ws, [id], patch);
        await db.trades.put(next!);
        return next!;
      });
    },

    async updateMany(ws, ids, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.trades, db.strategies], async () => {
        const next = await patched(db, ws, ids, patch);
        await db.trades.bulkPut(next);
        return next;
      });
    },

    async createManual() {
      throw new Error('manual trades land in Task 10');
    },

    async replaceManual() {
      throw new Error('manual trades land in Task 10');
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

import { buildManualTrade } from '@/domain/manual-trade';
import { strategyRules, type Trade } from '@/domain/types';
import {
  ArchivedAccountError,
  ManualTradeRejected,
  NotFoundError,
  OpenImportedTradeError,
  type TradesRepo,
} from '../repository';
import { applyTradePatch, type TradePatch } from '../trade-patch';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { rwTx } from './tx';
import { assertEditable } from './editable';
import { deleteOwnerFiles } from './files';
import { pruneJournalLinks } from './journal';
import { bumpImportRevision } from './imports';

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
      return rwTx(db, [db.trades, db.strategies, db.accounts], async () => {
        await assertEditable(db, ws, [await db.trades.get([ws, id])]);
        const [next] = await patched(db, ws, [id], patch);
        await db.trades.put(next!);
        return next!;
      });
    },

    async updateMany(ws, ids, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.trades, db.strategies, db.accounts], async () => {
        await assertEditable(
          db,
          ws,
          await db.trades.bulkGet(ids.map((id): [string, string] => [ws, id])),
        );
        const next = await patched(db, ws, ids, patch);
        await db.trades.bulkPut(next);
        return next;
      });
    },

    async createManual(ws, input) {
      const db = await ctx.db();
      const id = `manual:${ctx.newId()}`;
      return rwTx(db, [db.trades, db.accounts, db.meta], async () => {
        const account = await db.accounts.get([ws, input.accountId]);
        if (!account) throw new NotFoundError('account', input.accountId);
        if (account.status === 'archived')
          throw new ArchivedAccountError([account.id]);
        let highest = 0;
        await db.trades
          .where('workspaceId')
          .equals(ws)
          .each((t) => {
            highest = Math.max(highest, t.serial);
          });
        const built = buildManualTrade(input, {
          workspaceId: ws,
          serial: highest + 1,
          accountCurrency: account.currency,
          id,
        });
        if (!built.ok)
          throw new ManualTradeRejected(built.error, built.fillIndex);
        await db.trades.put(built.trade);
        // A pending import preview took its serial before this trade existed.
        await bumpImportRevision(db, ws);
        return built.trade;
      });
    },

    async replaceManual(ws, id, input) {
      const db = await ctx.db();
      return rwTx(db, [db.trades, db.accounts, db.meta], async () => {
        const old = await db.trades.get([ws, id]);
        if (!old) throw new NotFoundError('trade', id);
        if (old.source !== 'manual')
          throw new Error(
            `Trade "${id}" was imported; only manual trades can be rebuilt`,
          );
        await assertEditable(db, ws, [old]);
        const account = await db.accounts.get([ws, input.accountId]);
        if (!account) throw new NotFoundError('account', input.accountId);
        if (account.status === 'archived')
          throw new ArchivedAccountError([account.id]);
        const built = buildManualTrade(input, {
          workspaceId: ws,
          serial: old.serial,
          accountCurrency: account.currency,
          id,
        });
        if (!built.ok)
          throw new ManualTradeRejected(built.error, built.fillIndex);
        // The journal stays; the figures and fills are rebuilt.
        const next: Trade = {
          ...built.trade,
          strategyIds: old.strategyIds,
          tagIds: old.tagIds,
          ruleChecks: old.ruleChecks,
        };
        for (const k of ['rating', 'noteId', 'reviewed'] as const)
          if (old[k] !== undefined) Object.assign(next, { [k]: old[k] });
        await db.trades.put(next);
        await bumpImportRevision(db, ws);
        return next;
      });
    },

    async remove(ws, ids) {
      const db = await ctx.db();
      const keys = ids.map((id): [string, string] => [ws, id]);
      await rwTx(
        db,
        [db.trades, db.journal, db.accounts, db.files],
        async () => {
          await assertEditable(db, ws, await db.trades.bulkGet(keys));
          // Later imports' fills would have nothing to close (Plan 5 adds a tombstone flow).
          for (const t of await db.trades.bulkGet(keys))
            if (t?.status === 'open' && t.importId !== undefined)
              throw new OpenImportedTradeError(t.id, t.importId);
          await db.trades.bulkDelete(keys);
          await pruneJournalLinks(db, ws, ids);
          await deleteOwnerFiles(
            db,
            ws,
            ids.map((id) => `trade:${id}`),
          );
        },
      );
    },
  };
}

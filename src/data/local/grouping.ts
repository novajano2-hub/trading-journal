import type { Table } from 'dexie';
import {
  canMerge,
  canSplit,
  GroupRefused,
  mergeTrades,
  splitTrade,
} from '@/domain/grouping';
import type { BuildOptions } from '@/domain/trade-builder';
import type { Trade } from '@/domain/types';
import {
  ArchivedAccountError,
  NotFoundError,
  type TradesRepo,
} from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { assertEditable } from './editable';
import { moveOwnerFiles } from './files';
import {
  logHistory,
  tradeLabel,
  type FieldChange,
  type NewHistoryRow,
} from './history';
import { bumpImportRevision, releaseSpentFiles } from './imports';
import { pruneJournalLinks } from './journal';
import { readPrefs } from './prefs';
import { rwTx } from './tx';

/**
 * Merging, splitting and moving trades (Plan 6B spec §5.1). Each is one rw
 * transaction over everything it touches: the trades, the notes it unlinks,
 * the files it moves, the accounts it reads, the import state it moves and
 * the history. The day lock is not read: trades stay editable on a finished
 * day (B55), and nothing here writes `days`, so a finished day's frozen score
 * is never touched.
 */
const tables = (db: KeelDb): Table[] => [
  db.trades,
  db.journal,
  db.files,
  db.accounts,
  db.imports,
  db.history,
  db.meta,
];

/** The stored trades, once each and in the order given; throws NotFoundError for a missing one. */
async function heldTrades(
  db: KeelDb,
  ws: string,
  ids: readonly string[],
): Promise<Trade[]> {
  const unique = [...new Set(ids)];
  const stored = await db.trades.bulkGet(
    unique.map((id): [string, string] => [ws, id]),
  );
  return stored.map((t, i) => {
    if (!t) throw new NotFoundError('trade', unique[i]!);
    return t;
  });
}

/**
 * What the builder needs to rebuild trades in `accountId`: its currency and
 * its cost method, the way every build reads them. The instrument comes from the trade itself.
 */
async function buildOptions(
  db: KeelDb,
  ws: string,
  accountId: string,
): Promise<BuildOptions> {
  const account = await db.accounts.get([ws, accountId]);
  if (!account) throw new NotFoundError('account', accountId);
  return {
    workspaceId: ws,
    startSerial: 0,
    resolve: () => null,
    accountCurrency: () => account.currency,
    costMethodOf: () => account.costMethod ?? 'fifo',
  };
}

/** An account that can receive trades; throws NotFoundError, or ArchivedAccountError (naming `tradeIds`) when it is archived. */
async function openAccount(
  db: KeelDb,
  ws: string,
  id: string,
  tradeIds: readonly string[] = [],
): Promise<void> {
  const account = await db.accounts.get([ws, id]);
  if (!account) throw new NotFoundError('account', id);
  if (account.status === 'archived')
    throw new ArchivedAccountError([id], tradeIds);
}

type Action = 'merged' | 'split' | 'moved';

/** The one row a trade the write touched gets; the fields are `change`'s. */
function touched(
  action: Action,
  trade: Trade,
  timeZone: string,
  change: FieldChange,
): NewHistoryRow {
  return {
    type: 'trade',
    action,
    source: 'you',
    entityId: trade.id,
    label: tradeLabel(trade, timeZone),
    ...change,
  };
}

/** A trade's fills, before and after: how a merge or a split reads in history. */
const fills = (before: number, after: number): FieldChange => ({
  field: 'fills',
  oldValue: before,
  newValue: after,
});

/**
 * Puts the trades in the account, with their fills, and logs each. Everything
 * else about a trade stays, its P&L currency and figures included (B6). The
 * import state moves, as a pending plan would rebuild a trade that is no
 * longer in the account it read. Returns how many moved; trades already
 * there are left alone.
 */
async function relocate(
  db: KeelDb,
  ws: string,
  trades: readonly Trade[],
  accountId: string,
  ctx: LocalContext,
): Promise<number> {
  const moving = trades.filter((t) => t.accountId !== accountId);
  if (moving.length === 0) return 0;
  const moved = moving.map((t): Trade => ({
    ...t,
    accountId,
    executions: t.executions.map((e) => ({ ...e, accountId })),
  }));
  await db.trades.bulkPut(moved);
  await bumpImportRevision(db, ws);
  const { timeZone } = await readPrefs(db);
  await logHistory(
    db,
    ws,
    moved.map((t, i) =>
      touched('moved', t, timeZone, {
        field: 'accountId',
        oldValue: moving[i]!.accountId,
        newValue: accountId,
      }),
    ),
    ctx,
  );
  // An import whose trade left its account can no longer be undone.
  for (const from of new Set(moving.map((t) => t.accountId)))
    await releaseSpentFiles(db, ws, from);
  return moved.length;
}

export function localGrouping(
  ctx: LocalContext,
): Pick<TradesRepo, 'merge' | 'split' | 'move' | 'moveAccount'> {
  return {
    async merge(ws, ids, picked) {
      const db = await ctx.db();
      return rwTx(db, tables(db), async () => {
        const sources = await heldTrades(db, ws, ids);
        await assertEditable(db, ws, sources);
        const pick = new Set(picked);
        const refusal = canMerge(sources, pick);
        if (refusal) throw new GroupRefused(refusal);
        const { kept, removedIds, changed } = mergeTrades(
          sources,
          pick,
          await buildOptions(db, ws, sources[0]!.accountId),
        );

        await db.trades.bulkDelete(removedIds.map((id) => [ws, id]));
        await db.trades.bulkPut([kept, ...changed]);
        // A removed trade's note stays among the notes, linked to no trade, and
        // its files go to the trade that took its fills.
        await pruneJournalLinks(db, ws, removedIds);
        for (const id of removedIds)
          await moveOwnerFiles(db, ws, `trade:${id}`, `trade:${kept.id}`);
        await bumpImportRevision(db, ws);

        const { timeZone } = await readPrefs(db);
        const was = new Map(sources.map((t) => [t.id, t]));
        const count = (id: string) => was.get(id)!.executions.length;
        await logHistory(
          db,
          ws,
          [
            touched(
              'merged',
              kept,
              timeZone,
              fills(count(kept.id), kept.executions.length),
            ),
            ...changed.map((t) =>
              touched(
                'merged',
                t,
                timeZone,
                fills(count(t.id), t.executions.length),
              ),
            ),
            ...removedIds.map((id) =>
              touched('merged', was.get(id)!, timeZone, fills(count(id), 0)),
            ),
          ],
          ctx,
        );
        await releaseSpentFiles(db, ws, kept.accountId);
        return kept;
      });
    },

    async split(ws, id, moved) {
      const db = await ctx.db();
      return rwTx(db, tables(db), async () => {
        const trade = await db.trades.get([ws, id]);
        if (!trade) throw new NotFoundError('trade', id);
        await assertEditable(db, ws, [trade]);
        const pick = new Set(moved);
        const refusal = canSplit(trade, pick);
        if (refusal) throw new GroupRefused(refusal);
        let highest = 0;
        await db.trades
          .where('workspaceId')
          .equals(ws)
          .each((t) => {
            highest = Math.max(highest, t.serial);
          });
        const { original, created } = splitTrade(trade, pick, {
          ...(await buildOptions(db, ws, trade.accountId)),
          serial: highest + 1,
          id: `split:${ctx.newId()}`,
        });

        await db.trades.bulkPut([original, created]);
        await bumpImportRevision(db, ws);
        const { timeZone } = await readPrefs(db);
        await logHistory(
          db,
          ws,
          [
            touched(
              'split',
              original,
              timeZone,
              fills(trade.executions.length, original.executions.length),
            ),
            touched(
              'split',
              created,
              timeZone,
              fills(0, created.executions.length),
            ),
          ],
          ctx,
        );
        await releaseSpentFiles(db, ws, trade.accountId);
        return { original, created };
      });
    },

    async move(ws, ids, accountId) {
      const db = await ctx.db();
      return rwTx(db, tables(db), async () => {
        const trades = await heldTrades(db, ws, ids);
        await openAccount(
          db,
          ws,
          accountId,
          trades.map((t) => t.id),
        );
        await assertEditable(db, ws, trades);
        return relocate(db, ws, trades, accountId, ctx);
      });
    },

    async moveAccount(ws, fromAccountId, toAccountId) {
      const db = await ctx.db();
      return rwTx(db, tables(db), async () => {
        const from = await db.accounts.get([ws, fromAccountId]);
        if (!from) throw new NotFoundError('account', fromAccountId);
        await openAccount(db, ws, toAccountId);
        if (from.status === 'archived')
          throw new ArchivedAccountError([fromAccountId]);
        const trades = await db.trades
          .where('[workspaceId+accountId]')
          .equals([ws, fromAccountId])
          .toArray();
        return relocate(db, ws, trades, toAccountId, ctx);
      });
    },
  };
}

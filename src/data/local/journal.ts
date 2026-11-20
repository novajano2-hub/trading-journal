import type { JournalEntry } from '@/domain/types';
import {
  NotFoundError,
  type JournalDraft,
  type JournalRepo,
} from '../repository';
import type { LocalContext } from './context';
import { rwTx } from './tx';
import type { KeelDb } from './db';

/**
 * Drops `tradeIds` from the `linkedTradeIds` of the workspace's journal entries.
 * Call inside an open rw transaction that includes `db.journal`.
 */
export async function pruneJournalLinks(
  db: KeelDb,
  ws: string,
  tradeIds: readonly string[],
): Promise<void> {
  if (tradeIds.length === 0) return;
  const gone = new Set(tradeIds);
  // The multiEntry index spans workspaces, so keep only this workspace's entries.
  const hits = await db.journal
    .where('linkedTradeIds')
    .anyOf([...gone])
    .filter((e) => e.workspaceId === ws)
    .toArray();
  const byId = new Map(hits.map((e) => [e.id, e]));
  for (const entry of byId.values()) {
    await db.journal.put({
      ...entry,
      linkedTradeIds: entry.linkedTradeIds.filter((id) => !gone.has(id)),
    });
  }
}

/** Date descending, undated last, then most recently updated first. */
function byRecency(a: JournalEntry, b: JournalEntry): number {
  if (a.date !== b.date) {
    if (a.date === undefined) return 1;
    if (b.date === undefined) return -1;
    return a.date < b.date ? 1 : -1;
  }
  return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
}

export function localJournal(ctx: LocalContext): JournalRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.journal.where('workspaceId').equals(ws).toArray();
      return rows.sort(byRecency);
    },

    async get(ws, id) {
      return (await ctx.db()).journal.get([ws, id]);
    },

    async listForTrade(ws, tradeId) {
      const db = await ctx.db();
      const rows = await db.journal
        .where('linkedTradeIds')
        .equals(tradeId)
        .filter((e) => e.workspaceId === ws)
        .toArray();
      return rows.sort(byRecency);
    },

    async save(ws, draft: JournalDraft) {
      const db = await ctx.db();
      const entry: JournalEntry = {
        ...draft,
        id: draft.id ?? ctx.newId(),
        workspaceId: ws,
        updatedAt: ctx.now().toISOString(),
      };
      await db.journal.put(entry);
      return entry;
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.journal, db.trades], async () => {
        if (!(await db.journal.get([ws, id])))
          throw new NotFoundError('journal entry', id);
        await db.journal.delete([ws, id]);
        await db.trades
          .where('workspaceId')
          .equals(ws)
          .filter((t) => t.noteId === id)
          .modify((t) => {
            delete t.noteId;
          });
      });
    },
  };
}

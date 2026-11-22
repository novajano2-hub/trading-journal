import { format, parse } from 'date-fns';
import { localDate } from '@/domain/time';
import type { JournalEntry } from '@/domain/types';
import {
  NotFoundError,
  type JournalDraft,
  type JournalRepo,
} from '../repository';
import { dayLabel, parseYmd, ymd } from '../seed/calendar';
import type { LocalContext } from './context';
import { readPrefs } from './prefs';
import { rwTx } from './tx';
import type { KeelDb } from './db';

/** How long a trashed entry is kept. */
const TRASH_MS = 30 * 86_400_000;

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

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

/** Deletes the entries and clears `noteId` on trades pointing at them. Call inside an rw transaction over `db.journal` and `db.trades`. */
async function deleteEntries(
  db: KeelDb,
  ws: string,
  ids: readonly string[],
): Promise<void> {
  const gone = new Set(ids);
  await db.journal.bulkDelete(ids.map((id): [string, string] => [ws, id]));
  await db.trades
    .where('workspaceId')
    .equals(ws)
    .filter((t) => t.noteId !== undefined && gone.has(t.noteId))
    .modify((t) => {
      delete t.noteId;
    });
}

export function localJournal(ctx: LocalContext): JournalRepo {
  /** Sets or clears `deletedAt`. */
  async function setTrashed(ws: string, id: string, trashed: boolean) {
    const db = await ctx.db();
    await rwTx(db, [db.journal], async () => {
      const entry = await db.journal.get([ws, id]);
      if (!entry) throw new NotFoundError('journal entry', id);
      const next = { ...entry };
      if (trashed) next.deletedAt = ctx.now().toISOString();
      else delete next.deletedAt;
      await db.journal.put(next);
    });
  }

  return {
    async list(ws) {
      const db = await ctx.db();
      const cutoff = ctx.now().getTime() - TRASH_MS;
      const expired = (e: JournalEntry) =>
        e.deletedAt !== undefined && Date.parse(e.deletedAt) < cutoff;
      let rows = await db.journal.where('workspaceId').equals(ws).toArray();
      if (rows.some(expired)) {
        await rwTx(db, [db.journal, db.trades], () =>
          deleteEntries(
            db,
            ws,
            rows.filter(expired).map((e) => e.id),
          ),
        );
        rows = rows.filter((e) => !expired(e));
      }
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
        await deleteEntries(db, ws, [id]);
      });
    },

    trash: (ws, id) => setTrashed(ws, id, true),
    restore: (ws, id) => setTrashed(ws, id, false),

    async ensureTradeNote(ws, tradeId) {
      const db = await ctx.db();
      return rwTx(db, [db.trades, db.journal, db.meta], async () => {
        const trade = await db.trades.get([ws, tradeId]);
        if (!trade) throw new NotFoundError('trade', tradeId);
        if (trade.noteId !== undefined) {
          const linked = await db.journal.get([ws, trade.noteId]);
          if (linked && linked.deletedAt === undefined) return linked;
        }
        const { timeZone } = await readPrefs(db);
        const date = localDate(trade.openedAt, timeZone);
        const note: JournalEntry = {
          id: ctx.newId(),
          workspaceId: ws,
          kind: 'trade-note',
          date,
          title: `${trade.instrument.symbol} : ${format(parse(date, 'yyyy-MM-dd', new Date(0)), 'd MMM yyyy')}`,
          body: structuredClone(EMPTY_DOC),
          linkedTradeIds: [tradeId],
          tags: [],
          updatedAt: ctx.now().toISOString(),
        };
        await db.journal.put(note);
        await db.trades.put({ ...trade, noteId: note.id });
        return note;
      });
    },

    async dailyNote(ws, date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ymd(parseYmd(date)) !== date)
        throw new RangeError(
          `A daily note needs a YYYY-MM-DD date, got "${date}"`,
        );
      const db = await ctx.db();
      return rwTx(db, [db.journal, db.templates], async () => {
        const existing = await db.journal
          .where('workspaceId')
          .equals(ws)
          .filter(
            (e) =>
              e.kind === 'daily-review' &&
              e.date === date &&
              e.deletedAt === undefined,
          )
          .first();
        if (existing) return existing;
        const template = await db.templates
          .where('workspaceId')
          .equals(ws)
          .filter((t) => t.kind === 'daily-review' && t.isDefault)
          .first();
        const note: JournalEntry = {
          id: ctx.newId(),
          workspaceId: ws,
          kind: 'daily-review',
          date,
          title: `Daily review, ${dayLabel(date)}`,
          body: structuredClone(template?.body ?? EMPTY_DOC),
          linkedTradeIds: [],
          tags: [],
          updatedAt: ctx.now().toISOString(),
        };
        await db.journal.put(note);
        return note;
      });
    },
  };
}

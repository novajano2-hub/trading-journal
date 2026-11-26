import { format, parse } from 'date-fns';
import { localDate } from '@/domain/time';
import type { JournalEntry } from '@/domain/types';
import {
  LockedDayError,
  NotFoundError,
  type JournalDraft,
  type JournalRepo,
} from '../repository';
import { dayLabel, parseYmd, ymd } from '../seed/calendar';
import type { LocalContext } from './context';
import { readPrefs } from './prefs';
import {
  isLocked,
  isLockedNote,
  refuseLockedNote,
  routineNowIn,
  todayIn,
} from './routine-today';
import { deleteOwnerFiles } from './files';
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

const KINDS: ReadonlySet<string> = new Set([
  'daily-review',
  'pre-market',
  'weekly-recap',
  'note',
  'trade-note',
]);

/**
 * A stored row as a whole entry: a row written without its kind, title,
 * links or tags (an older bug, another build) reads as an untitled plain
 * note with empty lists, so no page that lists notes can break on it.
 */
function whole(e: JournalEntry): JournalEntry {
  const row = e as Partial<JournalEntry> & Pick<JournalEntry, 'id'>;
  if (
    KINDS.has(row.kind ?? '') &&
    typeof row.title === 'string' &&
    Array.isArray(row.linkedTradeIds) &&
    Array.isArray(row.tags) &&
    typeof row.updatedAt === 'string'
  )
    return e;
  return {
    ...e,
    kind: KINDS.has(row.kind ?? '') ? row.kind! : 'note',
    title: typeof row.title === 'string' ? row.title : '',
    body: row.body ?? EMPTY_DOC,
    linkedTradeIds: Array.isArray(row.linkedTradeIds) ? row.linkedTradeIds : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
  };
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

/** Deletes the entries and their image files (B56) and clears `noteId` on trades pointing at them. Call inside an rw transaction over `db.journal`, `db.trades` and `db.files`. */
async function deleteEntries(
  db: KeelDb,
  ws: string,
  ids: readonly string[],
): Promise<void> {
  const gone = new Set(ids);
  await db.journal.bulkDelete(ids.map((id): [string, string] => [ws, id]));
  await deleteOwnerFiles(
    db,
    ws,
    ids.map((id) => `note:${id}`),
  );
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
    await rwTx(db, [db.journal, db.days], async () => {
      const entry = await db.journal.get([ws, id]);
      if (!entry) throw new NotFoundError('journal entry', id);
      await refuseLockedNote(db, ws, entry);
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
        // A finished day's note is frozen, so the purge leaves it in Trash.
        const purged = new Set<string>();
        await rwTx(db, [db.journal, db.trades, db.days, db.files], async () => {
          for (const e of rows.filter(expired))
            if (!(await isLockedNote(db, ws, e))) purged.add(e.id);
          await deleteEntries(db, ws, [...purged]);
        });
        rows = rows.filter((e) => !purged.has(e.id));
      }
      return rows.map(whole).sort(byRecency);
    },

    async get(ws, id) {
      const row = await (await ctx.db()).journal.get([ws, id]);
      return row === undefined ? undefined : whole(row);
    },

    async listForTrade(ws, tradeId) {
      const db = await ctx.db();
      const rows = await db.journal
        .where('linkedTradeIds')
        .equals(tradeId)
        .filter((e) => e.workspaceId === ws && e.deletedAt === undefined)
        .toArray();
      return rows.map(whole).sort(byRecency);
    },

    async save(ws, draft: JournalDraft) {
      const db = await ctx.db();
      const entry: JournalEntry = {
        ...draft,
        id: draft.id ?? ctx.newId(),
        workspaceId: ws,
        updatedAt: ctx.now().toISOString(),
      };
      return rwTx(db, [db.journal, db.days, db.meta, db.trackers], async () => {
        await refuseLockedNote(db, ws, entry);
        const stored =
          draft.id !== undefined
            ? await db.journal.get([ws, draft.id])
            : undefined;
        await refuseLockedNote(db, ws, stored);
        // Only trash and restore move a note in or out of Trash: a save keeps what is stored.
        if (stored !== undefined) {
          if (stored.deletedAt !== undefined)
            entry.deletedAt = stored.deletedAt;
          else delete entry.deletedAt;
        }
        await db.journal.put(entry);
        // K9: the first edit on the note's own date starts its clock.
        if (entry.kind === 'daily-review' && entry.date !== undefined) {
          const day = (await db.days.get([ws, entry.date])) ?? {
            id: entry.date,
            workspaceId: ws,
          };
          if (
            day.noteStartedAt === undefined &&
            entry.date === (await todayIn(db, ws, ctx.now()))
          )
            await db.days.put({
              ...day,
              noteStartedAt: await routineNowIn(db, ws, ctx.now()),
            });
        }
        return entry;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.journal, db.trades, db.days, db.files], async () => {
        const entry = await db.journal.get([ws, id]);
        if (!entry) throw new NotFoundError('journal entry', id);
        await refuseLockedNote(db, ws, entry);
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
      return rwTx(db, [db.journal, db.templates, db.days], async () => {
        // A trashed note is still the date's note (E109); one out of Trash wins.
        const onDate = await db.journal
          .where('workspaceId')
          .equals(ws)
          .filter((e) => e.kind === 'daily-review' && e.date === date)
          .toArray();
        const existing =
          onDate.find((e) => e.deletedAt === undefined) ?? onDate[0];
        if (existing) return existing;
        if (await isLocked(db, ws, date)) throw new LockedDayError();
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
          // The template it started from; a kind with no default starts empty.
          ...(template ? { templateId: template.id } : {}),
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

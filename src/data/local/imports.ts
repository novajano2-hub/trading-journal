import type { InstrumentOverrides } from '@/domain/import/mapping';
import type { ImportJob, Trade } from '@/domain/types';
import {
  ImportBlockedError,
  NotFoundError,
  type ImportRepo,
  type UndoResult,
} from '../repository';
import { USER_WORKSPACE } from '../workspaces';
import type { LocalContext } from './context';
import { META, type ImportJobRecord, type KeelDb } from './db';
import { pruneJournalLinks } from './journal';
import { rwTx } from './tx';

/** The job as the history shows it, without the snapshots undo works from. */
function withoutSnapshots(record: ImportJobRecord): ImportJob {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
  const { fingerprints, replacedTrades, ...job } = record;
  return job;
}

async function storedOverrides(
  db: KeelDb,
  ws: string,
): Promise<InstrumentOverrides> {
  const value = (await db.meta.get(META.overrides(ws)))?.value;
  return (value as InstrumentOverrides | undefined) ?? {};
}

/**
 * The trades as they can be restored now: references to tags, strategies,
 * rules and notes deleted since the snapshot are dropped, as those deletions'
 * cascades did to the trades that replaced them. Call inside a transaction
 * that includes `db.tags`, `db.strategies` and `db.journal`.
 */
async function withLiveReferences(
  db: KeelDb,
  ws: string,
  trades: readonly Trade[],
): Promise<Trade[]> {
  const keys = (ids: readonly string[]) =>
    [...new Set(ids)].map((id): [string, string] => [ws, id]);
  const tags = await db.tags.bulkGet(keys(trades.flatMap((t) => t.tagIds)));
  const strategies = await db.strategies.bulkGet(
    keys(trades.flatMap((t) => t.strategyId ?? [])),
  );
  const notes = await db.journal.bulkGet(
    keys(trades.flatMap((t) => t.noteId ?? [])),
  );
  const tagIds = new Set(tags.flatMap((t) => (t ? [t.id] : [])));
  const noteIds = new Set(notes.flatMap((n) => (n ? [n.id] : [])));
  const ruleIds = new Map(
    strategies.flatMap((s) => (s ? [[s.id, s.rules.map((r) => r.id)]] : [])),
  );

  return trades.map((stored) => {
    const t: Trade = {
      ...stored,
      tagIds: stored.tagIds.filter((id) => tagIds.has(id)),
    };
    if (t.noteId !== undefined && !noteIds.has(t.noteId)) delete t.noteId;
    if (t.strategyId !== undefined) {
      const rules = ruleIds.get(t.strategyId);
      if (rules)
        t.ruleChecks = t.ruleChecks.filter((c) => rules.includes(c.ruleId));
      else {
        delete t.strategyId;
        t.ruleChecks = [];
      }
    }
    return t;
  });
}

export function localImports(ctx: LocalContext): ImportRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.imports.where('workspaceId').equals(ws).toArray();
      return rows
        .sort((a, b) =>
          a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
        )
        .map(withoutSnapshots);
    },

    async context(ws, accountId) {
      const db = await ctx.db();
      // One consistent read. Dexie wraps errors thrown inside a transaction,
      // so a missing account is reported once it ends.
      const context = await db.transaction(
        'r',
        [db.accounts, db.trades, db.imports, db.meta],
        async () => {
          const account = await db.accounts.get([ws, accountId]);
          if (!account) return undefined;
          let highest = 0;
          await db.trades
            .where('workspaceId')
            .equals(ws)
            .each((t) => {
              highest = Math.max(highest, t.serial);
            });
          const openTrades = await db.trades
            .where('[workspaceId+accountId]')
            .equals([ws, accountId])
            .filter((t) => t.status === 'open')
            .toArray();
          const jobs = await db.imports
            .where('[workspaceId+accountId]')
            .equals([ws, accountId])
            .filter((j) => j.status === 'active')
            .toArray();
          return {
            workspaceId: ws,
            accountId,
            accountCurrency: account.currency,
            nextSerial: highest + 1,
            openTrades: openTrades.sort((a, b) => a.serial - b.serial),
            fingerprints: jobs.flatMap((j) => j.fingerprints),
            overrides: await storedOverrides(db, ws),
          };
        },
      );
      if (!context) throw new NotFoundError('account', accountId);
      return context;
    },

    async commit(ws, plan) {
      if (plan.blocked) throw new ImportBlockedError(plan.blocked);
      if (ws !== USER_WORKSPACE.id || plan.workspaceId !== ws)
        throw new RangeError(
          `Imports land only in ${USER_WORKSPACE.id}, got ${ws} for a plan in ${plan.workspaceId}`,
        );
      const record: ImportJobRecord = {
        id: plan.importId,
        workspaceId: ws,
        accountId: plan.accountId,
        fileName: plan.fileName,
        mapping: plan.mapping,
        rowCount: plan.rowCount,
        tradeCount: plan.trades.length,
        skippedCount: plan.issues.length,
        duplicateCount: plan.duplicateRows.length,
        status: 'active',
        createdAt: plan.createdAt,
        fingerprints: plan.fingerprints,
        replacedTrades: plan.replacedTrades,
      };
      const db = await ctx.db();
      await rwTx(db, [db.trades, db.imports, db.meta], async () => {
        await db.trades.bulkDelete(plan.replacedTrades.map((t) => [ws, t.id]));
        await db.trades.bulkPut(plan.trades);
        await db.imports.put(record);
        await db.meta.put({
          key: META.overrides(ws),
          value: {
            ...(await storedOverrides(db, ws)),
            ...plan.mapping.overrides,
          },
        });
      });
      return withoutSnapshots(record);
    },

    async undo(ws, jobId) {
      const db = await ctx.db();
      return rwTx(
        db,
        [db.imports, db.trades, db.journal, db.tags, db.strategies],
        async (): Promise<UndoResult> => {
          const job = await db.imports.get([ws, jobId]);
          if (!job) throw new NotFoundError('import', jobId);
          if (job.status === 'undone') return { ok: true };
          const dependent = await db.imports
            .where('workspaceId')
            .equals(ws)
            .filter(
              (j) =>
                j.id !== jobId &&
                j.status === 'active' &&
                j.replacedTrades.some((t) => t.importId === jobId),
            )
            .first();
          if (dependent)
            return {
              ok: false,
              reason: 'later-import-depends',
              dependentJobId: dependent.id,
            };

          // Trades the user has deleted since the import are simply not found.
          const built = await db.trades
            .where('[workspaceId+importId]')
            .equals([ws, jobId])
            .primaryKeys();
          await db.trades.bulkDelete(built);
          // A restored trade keeps its id, so its journal links stay.
          const restored = new Set(job.replacedTrades.map((t) => t.id));
          await pruneJournalLinks(
            db,
            ws,
            built.map(([, id]) => id).filter((id) => !restored.has(id)),
          );
          await db.trades.bulkPut(
            await withLiveReferences(db, ws, job.replacedTrades),
          );
          await db.imports.put({
            ...job,
            status: 'undone',
            undoneAt: ctx.now().toISOString(),
          });
          return { ok: true };
        },
      );
    },
  };
}

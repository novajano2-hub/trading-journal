import type { InstrumentOverrides } from '@/domain/import/mapping';
import type { ImportPlan } from '@/domain/import/plan';
import { canonicalSymbol } from '@/domain/trade-builder';
import { strategyRules, type ImportJob, type Trade } from '@/domain/types';
import {
  ArchivedAccountError,
  ImportBlockedError,
  NotFoundError,
  StalePlanError,
  type ImportRepo,
  type UndoResult,
} from '../repository';
import { USER_WORKSPACE } from '../workspaces';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { assertEditable } from './editable';
import { deleteOwnerFiles } from './files';
import { META, type ImportJobRecord } from './schema';
import { pruneJournalLinks } from './journal';
import { rwTx } from './tx';

/** The job as the history shows it, without what dedupe and undo work from. */
function withoutSnapshots(record: ImportJobRecord): ImportJob {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
  const { fingerprints, replacedTrades, tradeIds, revision, ...job } = record;
  return job;
}

/** Throws RangeError unless the plan and every row it writes or replaces are in My workspace and its account. */
function assertLandsInMyWorkspace(ws: string, plan: ImportPlan): void {
  if (ws !== USER_WORKSPACE.id || plan.workspaceId !== ws)
    throw new RangeError(
      `Imports land only in ${USER_WORKSPACE.id}, got ${ws} for a plan in ${plan.workspaceId}`,
    );
  const stray = [...plan.trades, ...plan.replacedTrades].find(
    (t) => t.workspaceId !== ws || t.accountId !== plan.accountId,
  );
  if (stray)
    throw new RangeError(
      `Trade ${stray.id} is in ${stray.workspaceId}/${stray.accountId}, not the plan's ${ws}/${plan.accountId}`,
    );
}

async function storedOverrides(
  db: KeelDb,
  ws: string,
): Promise<InstrumentOverrides> {
  const value = (await db.meta.get(META.overrides(ws)))?.value;
  return (value as InstrumentOverrides | undefined) ?? {};
}

async function importRevision(db: KeelDb, ws: string): Promise<number> {
  const value = (await db.meta.get(META.importRevision(ws)))?.value;
  return (value as number | undefined) ?? 0;
}

/** Returns the new revision. Call inside the rw transaction of the write that moved the import context (a commit, an undo, clearing an account). */
export async function bumpImportRevision(
  db: KeelDb,
  ws: string,
): Promise<number> {
  const next = (await importRevision(db, ws)) + 1;
  await db.meta.put({ key: META.importRevision(ws), value: next });
  return next;
}

/**
 * The latest active import that undoing `job` would break, if any: one that
 * rebuilt one of the job's trades, or a later one in the account with trades
 * in the symbol of a trade the undo would restore. Restoring it beside those
 * would leave two positions in one symbol, which FIFO never builds. Deleting
 * the job's own trades breaks nothing: a later import's fills joined any of
 * them still open (the first case) and never matched a closed one. Call
 * inside the undo's transaction.
 */
async function blockingImport(
  db: KeelDb,
  ws: string,
  job: ImportJobRecord,
  restored: readonly Trade[],
): Promise<string | undefined> {
  const others = (
    await db.imports
      .where('[workspaceId+accountId]')
      .equals([ws, job.accountId])
      .toArray()
  ).filter((j) => j.status === 'active' && j.id !== job.id);
  const blocking = new Set(
    others
      .filter((j) => j.replacedTrades.some((t) => t.importId === job.id))
      .map((j) => j.id),
  );
  const later = new Set(
    others.filter((j) => j.revision > job.revision).map((j) => j.id),
  );
  if (later.size > 0 && restored.length > 0) {
    const touched = new Set(
      restored.map((t) => canonicalSymbol(t.instrument.symbol)),
    );
    await db.trades
      .where('[workspaceId+accountId]')
      .equals([ws, job.accountId])
      .filter(
        (t) =>
          t.importId !== undefined &&
          later.has(t.importId) &&
          touched.has(canonicalSymbol(t.instrument.symbol)),
      )
      .each((t) => {
        blocking.add(t.importId!);
      });
  }
  return others
    .filter((j) => blocking.has(j.id))
    .sort((a, b) => b.revision - a.revision)[0]?.id;
}

/**
 * The trades as they can be written now: references to tags, strategies,
 * rules and notes deleted since the snapshot (an undo's replaced trades, a
 * plan's inherited journaling) are dropped, as those deletions' cascades did
 * to the stored trades. Call inside a transaction that includes `db.tags`,
 * `db.strategies` and `db.journal`.
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
    keys(trades.flatMap((t) => t.strategyIds)),
  );
  const notes = await db.journal.bulkGet(
    keys(trades.flatMap((t) => t.noteId ?? [])),
  );
  const tagIds = new Set(tags.flatMap((t) => (t ? [t.id] : [])));
  const noteIds = new Set(notes.flatMap((n) => (n ? [n.id] : [])));
  const ruleIds = new Map(
    strategies.flatMap((s) =>
      s ? [[s.id, strategyRules(s).map((r) => r.id)] as const] : [],
    ),
  );

  return trades.map((stored) => {
    const t: Trade = {
      ...stored,
      tagIds: stored.tagIds.filter((id) => tagIds.has(id)),
    };
    if (t.noteId !== undefined && !noteIds.has(t.noteId)) delete t.noteId;
    if (t.strategyIds.length > 0) {
      // Only the live strategies stay, with the checks on their current rules.
      t.strategyIds = t.strategyIds.filter((id) => ruleIds.has(id));
      const rules = new Set(t.strategyIds.flatMap((id) => ruleIds.get(id)!));
      t.ruleChecks = t.ruleChecks.filter((c) => rules.has(c.ruleId));
    }
    return t;
  });
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function localImports(ctx: LocalContext): ImportRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.imports.where('workspaceId').equals(ws).toArray();
      // By commit order: `createdAt` is when the plan was made.
      return rows
        .sort((a, b) => b.revision - a.revision || cmp(a.id, b.id))
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
            .filter((t) => t.status === 'open' && t.source !== 'manual')
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
            importRevision: await importRevision(db, ws),
          };
        },
      );
      if (!context) throw new NotFoundError('account', accountId);
      return context;
    },

    async commit(ws, plan) {
      if (plan.blocked) throw new ImportBlockedError(plan.blocked);
      assertLandsInMyWorkspace(ws, plan);
      const job: ImportJob = {
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
      };
      const tradeIds = plan.trades.map((t) => t.id);
      const db = await ctx.db();
      await rwTx(
        db,
        [
          db.accounts,
          db.trades,
          db.imports,
          db.journal,
          db.tags,
          db.strategies,
          db.meta,
        ],
        async () => {
          if (!(await db.accounts.get([ws, plan.accountId])))
            throw new StalePlanError('account-removed');
          // A commit or undo since then moved the open trades, fingerprints
          // and serials the plan was made from.
          if ((await importRevision(db, ws)) !== plan.importRevision)
            throw new StalePlanError('imports-changed');
          // An id already in the history, even an undone one, would
          // overwrite that record.
          if (await db.imports.get([ws, plan.importId]))
            throw new StalePlanError('imports-changed');
          const revision = await bumpImportRevision(db, ws);
          await db.trades.bulkDelete(
            plan.replacedTrades.map((t) => [ws, t.id]),
          );
          // A replaced trade that no written trade continues under its id is gone.
          const written = new Set(tradeIds);
          // Its files stay, so undoing this import brings the trade back with them.
          await pruneJournalLinks(
            db,
            ws,
            plan.replacedTrades
              .map((t) => t.id)
              .filter((id) => !written.has(id)),
          );
          // The plan carries journaling read with its context.
          await db.trades.bulkPut(
            await withLiveReferences(db, ws, plan.trades),
          );
          await db.imports.put({
            ...job,
            fingerprints: plan.fingerprints,
            replacedTrades: plan.replacedTrades,
            tradeIds,
            revision,
          });
          await db.meta.put({
            key: META.overrides(ws),
            value: {
              ...(await storedOverrides(db, ws)),
              ...plan.mapping.overrides,
            },
          });
        },
      );
      return job;
    },

    async undo(ws, jobId) {
      const db = await ctx.db();
      return rwTx(
        db,
        [
          db.imports,
          db.trades,
          db.journal,
          db.tags,
          db.strategies,
          db.meta,
          db.accounts,
          db.files,
        ],
        async (): Promise<UndoResult> => {
          const job = await db.imports.get([ws, jobId]);
          if (!job) throw new NotFoundError('import', jobId);
          if (job.status === 'undone') return { ok: true };
          // An archived account is read-only: undo would delete and restore its trades.
          const archived =
            (await db.accounts.get([ws, job.accountId]))?.status === 'archived';
          if (archived)
            throw new ArchivedAccountError([job.accountId], job.tradeIds);
          // Trades the user has deleted since the import are simply not found.
          const built = await db.trades
            .where('[workspaceId+importId]')
            .equals([ws, jobId])
            .toArray();
          // A replaced trade comes back unless the job wrote a trade under its
          // id that the user has since deleted: that deletion stands.
          const wrote = new Set(job.tradeIds);
          const remaining = new Set(built.map((t) => t.id));
          const restored = job.replacedTrades.filter(
            (t) => !wrote.has(t.id) || remaining.has(t.id),
          );
          await assertEditable(db, ws, [...built, ...restored]);
          const blocker = await blockingImport(db, ws, job, restored);
          if (blocker)
            return {
              ok: false,
              reason: 'later-import-depends',
              dependentJobId: blocker,
            };

          await db.trades.bulkDelete(built.map((t) => [ws, t.id]));
          // A restored trade keeps its id, so its journal links stay.
          const restoredIds = new Set(restored.map((t) => t.id));
          const gone = [...remaining].filter((id) => !restoredIds.has(id));
          await pruneJournalLinks(db, ws, gone);
          await deleteOwnerFiles(
            db,
            ws,
            gone.map((id) => `trade:${id}`),
          );
          await db.trades.bulkPut(await withLiveReferences(db, ws, restored));
          await db.imports.put({
            ...job,
            status: 'undone',
            undoneAt: ctx.now().toISOString(),
          });
          await bumpImportRevision(db, ws);
          return { ok: true };
        },
      );
    },
  };
}

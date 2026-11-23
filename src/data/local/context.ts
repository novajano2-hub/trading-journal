import { StorageUnavailableError } from '../repository';
import type { SampleWorkspace } from '../seed/generate';
import { builtInCategories, builtInTemplates } from '../seed/templates';
import { SAMPLE_WORKSPACE, WORKSPACES } from '../workspaces';
import type { KeelDb } from './db';
import { DATA_TABLES, META, type SeedMeta } from './schema';

/** What every local repo module works from. */
export interface LocalContext {
  /** The database, opened and seeded with the sample on first use. */
  db(): Promise<KeelDb>;
  now(): Date;
  newId(): string;
}

/** Builds the sample workspace as of `now`. */
export type SampleSource = (now: Date) => Promise<SampleWorkspace>;

/** The real generator, loaded only when a sample is needed. */
export const defaultSample: SampleSource = async (now) => {
  const { generateSampleWorkspace, SAMPLE_SEED, sampleEndDate } =
    await import('../seed/generate');
  return generateSampleWorkspace({
    seed: SAMPLE_SEED,
    endDate: sampleEndDate(now.toISOString()),
  });
};

export interface LocalContextOptions {
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
  now?: () => Date;
  newId?: () => string;
  sample: SampleSource;
  /** Default 5000. */
  openTimeoutMs?: number;
}

const DEFAULT_OPEN_TIMEOUT_MS = 5000;

/** Touches no storage: the database is created and opened by the first `db()` call. */
export function createLocalContext(opts: LocalContextOptions): LocalContext {
  const now = opts.now ?? (() => new Date());
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const timeoutMs = opts.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
  let instance: KeelDb | undefined;
  let ready: Promise<KeelDb> | undefined;

  async function openAndSeed(): Promise<KeelDb> {
    if (!instance) {
      // Dexie loads with the store, never at module load or in a server render.
      const { KeelDb } = await import('./db');
      instance = new KeelDb({
        indexedDB: opts.indexedDB,
        IDBKeyRange: opts.IDBKeyRange,
      });
    }
    const db = await openWithin(instance, timeoutMs);
    if (!(await db.meta.get(META.seed))) {
      const at = now();
      // Generate outside the transaction: awaiting anything but Dexie inside one commits it early.
      const sample = await opts.sample(at);
      await db.transaction('rw', [...DATA_TABLES, 'meta'], async () => {
        // Another tab may have seeded while we generated.
        if (await db.meta.get(META.seed)) return;
        await writeSample(db, sample, at);
      });
    }
    await db.transaction(
      'rw',
      [db.tagCategories, db.templates, db.tags, db.trades, db.meta],
      async () => {
        for (const w of WORKSPACES) await writeBuiltIns(db, w.id);
        // Once: names written after it are lowercased by the repository.
        if (await db.meta.get(META.tagNamesLowercased)) return;
        await lowercaseTagNames(db);
        await db.meta.put({ key: META.tagNamesLowercased, value: true });
      },
    );
    return db;
  }

  return {
    db() {
      ready ??= openAndSeed().catch((error: unknown) => {
        ready = undefined; // the next call retries
        throw error;
      });
      return ready;
    },
    now,
    newId,
  };
}

async function openWithin(db: KeelDb, ms: number): Promise<KeelDb> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new StorageUnavailableError(`IndexedDB did not open within ${ms} ms`),
        ),
      ms,
    );
  });
  const open = db.open().catch((cause: unknown) => {
    throw new StorageUnavailableError('IndexedDB could not be opened', {
      cause,
    });
  });
  try {
    await Promise.race([open, timeout]);
  } finally {
    clearTimeout(timer);
  }
  return db;
}

/** Writes the sample's rows and its seed record. Call inside an rw transaction over the data tables and `meta`. */
export async function writeSample(
  db: KeelDb,
  sample: SampleWorkspace,
  at: Date,
): Promise<void> {
  await db.accounts.bulkPut(sample.accounts);
  await db.strategies.bulkPut(sample.strategies);
  await db.tagCategories.bulkPut(sample.tagCategories);
  await db.tags.bulkPut(sample.tags);
  await db.trades.bulkPut(sample.trades);
  await db.journal.bulkPut(sample.journal);
  const seed: SeedMeta = {
    seed: sample.seed,
    endDate: sample.endDate,
    seededAt: at.toISOString(),
  };
  await db.meta.put({ key: META.seed, value: seed });
  await writeBuiltIns(db, SAMPLE_WORKSPACE.id);
}

/**
 * Adds whichever of the workspace's built-in tag categories and templates are
 * missing; ones the user renamed or edited stay as they are. Call inside an
 * rw transaction over `tagCategories` and `templates`.
 */
export async function writeBuiltIns(db: KeelDb, ws: string): Promise<void> {
  const keys = (rows: readonly { id: string }[]) =>
    rows.map((r): [string, string] => [ws, r.id]);
  const categories = builtInCategories(ws);
  const haveCategories = await db.tagCategories.bulkGet(keys(categories));
  await db.tagCategories.bulkPut(
    categories.filter((_, i) => haveCategories[i] === undefined),
  );
  const templates = builtInTemplates(ws);
  const haveTemplates = await db.templates.bulkGet(keys(templates));
  await db.templates.bulkPut(
    templates.filter((_, i) => haveTemplates[i] === undefined),
  );
}

/**
 * Tag names are stored lowercase, as TradeZella stores them. Names written
 * before that rule (the v1 sample, a v1 import) have their capitals taken
 * out. Tags of one category whose names then match are merged: the one already
 * lowercase survives (else the first by id), the trades of the others are
 * repointed to it without a repeat, it takes a description it lacks from them,
 * and they are deleted. Call inside an rw transaction over `tags`, `trades`.
 */
export async function lowercaseTagNames(db: KeelDb): Promise<void> {
  const rows = await db.tags.toArray();
  const groups = new Map<string, typeof rows>();
  for (const t of rows) {
    const key = `${t.workspaceId}\u0000${t.categoryId}\u0000${t.name.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const put = [];
  const lost = new Map<string, string>(); // workspace and loser id -> survivor id
  const lostKeys: [string, string][] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    const lower = sorted[0]!.name.toLowerCase();
    const survivor = sorted.find((t) => t.name === lower) ?? sorted[0]!;
    const next = { ...survivor, name: lower };
    for (const t of sorted) {
      if (t === survivor) continue;
      lost.set(`${t.workspaceId}\u0000${t.id}`, survivor.id);
      lostKeys.push([t.workspaceId, t.id]);
      if (!next.description && t.description) next.description = t.description;
    }
    if (
      next.name !== survivor.name ||
      next.description !== survivor.description
    )
      put.push(next);
  }
  if (lost.size > 0) {
    const repointed = [];
    for (const trade of await db.trades.toArray()) {
      const own = (id: string) => `${trade.workspaceId}\u0000${id}`;
      if (!trade.tagIds.some((id) => lost.has(own(id)))) continue;
      const ids = trade.tagIds.map((id) => lost.get(own(id)) ?? id);
      repointed.push({
        ...trade,
        tagIds: ids.filter((id, i) => ids.indexOf(id) === i),
      });
    }
    if (repointed.length > 0) await db.trades.bulkPut(repointed);
    await db.tags.bulkDelete(lostKeys);
  }
  if (put.length > 0) await db.tags.bulkPut(put);
}

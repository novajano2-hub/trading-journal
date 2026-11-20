import { StorageUnavailableError } from '../repository';
import type { SampleWorkspace } from '../seed/generate';
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
  await db.tags.bulkPut(sample.tags);
  await db.trades.bulkPut(sample.trades);
  await db.journal.bulkPut(sample.journal);
  const seed: SeedMeta = {
    seed: sample.seed,
    endDate: sample.endDate,
    seededAt: at.toISOString(),
  };
  await db.meta.put({ key: META.seed, value: seed });
}

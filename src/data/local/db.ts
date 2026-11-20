import { Dexie, type Table } from 'dexie';
import type {
  Account,
  ImportJob,
  JournalEntry,
  Strategy,
  Tag,
  Trade,
} from '@/domain/types';

/** Dexie's own database: idb-keyval's `keel` database must never be version-upgraded. */
export const DB_NAME = 'keel-data';

export interface MetaRecord {
  key: string;
  value: unknown;
}

/** Keys of the `meta` table. */
export const META = {
  activeWorkspace: 'active-workspace',
  prefs: 'prefs',
  /** Value: `SeedMeta`. */
  seed: 'seed:sample',
  overrides: (ws: string) => `overrides:${ws}`,
  /** Value: a number, bumped by every import commit and undo in the workspace. */
  importRevision: (ws: string) => `import-revision:${ws}`,
} as const;

export interface SeedMeta {
  seed: number;
  endDate: string;
  seededAt: string;
}

export interface ImportJobRecord extends ImportJob {
  fingerprints: string[];
  replacedTrades: Trade[];
}

/** Every table whose rows belong to a workspace, keyed `[workspaceId+id]`. */
export const DATA_TABLES = [
  'trades',
  'accounts',
  'strategies',
  'tags',
  'journal',
  'imports',
] as const;

type Key = [workspaceId: string, id: string];

export class KeelDb extends Dexie {
  declare readonly trades: Table<Trade, Key>;
  declare readonly accounts: Table<Account, Key>;
  declare readonly strategies: Table<Strategy, Key>;
  declare readonly tags: Table<Tag, Key>;
  declare readonly journal: Table<JournalEntry, Key>;
  declare readonly imports: Table<ImportJobRecord, Key>;
  declare readonly meta: Table<MetaRecord, string>;

  /** Opens nothing: Dexie connects on `open()` or the first query. */
  constructor(
    deps: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange } = {},
  ) {
    // Pass only what was given: an explicit undefined would replace Dexie's browser defaults.
    super(DB_NAME, {
      ...(deps.indexedDB && { indexedDB: deps.indexedDB }),
      ...(deps.IDBKeyRange && { IDBKeyRange: deps.IDBKeyRange }),
    });
    this.version(1).stores({
      trades:
        '[workspaceId+id], workspaceId, [workspaceId+accountId], [workspaceId+importId], [workspaceId+strategyId]',
      accounts: '[workspaceId+id], workspaceId',
      strategies: '[workspaceId+id], workspaceId',
      tags: '[workspaceId+id], workspaceId',
      journal: '[workspaceId+id], workspaceId, *linkedTradeIds',
      imports: '[workspaceId+id], workspaceId, [workspaceId+accountId]',
      meta: 'key',
    });
  }
}

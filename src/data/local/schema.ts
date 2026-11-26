import type { ImportJob, Trade } from '@/domain/types';

// What the store's modules share about its layout. This module never imports
// Dexie, so importing it loads no IndexedDB code; `db.ts` holds the database
// and is loaded only when the store opens.

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
  /** Value: true once the tag names have been lowercased and merged. */
  tagNamesLowercased: 'tag-names-lowercased',
  overrides: (ws: string) => `overrides:${ws}`,
  /** Value: a number, bumped by every import commit and undo in the workspace. */
  importRevision: (ws: string) => `import-revision:${ws}`,
} as const;

export interface SeedMeta {
  /** `SAMPLE_SEED_VERSION` when the sample was written; a record from before versions has none. */
  version?: number;
  seed: number;
  endDate: string;
  seededAt: string;
}

export interface ImportJobRecord extends ImportJob {
  fingerprints: string[];
  replacedTrades: Trade[];
  /** Ids of the trades the commit wrote. */
  tradeIds: string[];
  /** The workspace's import revision this commit made; orders the commits. */
  revision: number;
}

/** Every table whose rows belong to a workspace, keyed `[workspaceId+id]`. */
export const DATA_TABLES = [
  'trades',
  'accounts',
  'strategies',
  'tags',
  'journal',
  'imports',
  'tagCategories',
  'templates',
  'folders',
  'cashflows',
  'challenges',
  'trackers',
  'days',
  'dayShots',
] as const;

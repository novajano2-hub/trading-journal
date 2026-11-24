import { Dexie, type Table, type Transaction } from 'dexie';
import type {
  Account,
  CashFlow,
  Challenge,
  JournalEntry,
  NoteFolder,
  NoteTemplate,
  Strategy,
  Tag,
  TagCategory,
  Trade,
} from '@/domain/types';
import { builtInCategories, categoryIn, CATEGORIES } from '../seed/templates';
import { WORKSPACES } from '../workspaces';
import { DB_NAME, type ImportJobRecord, type MetaRecord } from './schema';

type Key = [workspaceId: string, id: string];

export class KeelDb extends Dexie {
  declare readonly trades: Table<Trade, Key>;
  declare readonly accounts: Table<Account, Key>;
  declare readonly strategies: Table<Strategy, Key>;
  declare readonly tags: Table<Tag, Key>;
  declare readonly journal: Table<JournalEntry, Key>;
  declare readonly imports: Table<ImportJobRecord, Key>;
  declare readonly tagCategories: Table<TagCategory, Key>;
  declare readonly templates: Table<NoteTemplate, Key>;
  declare readonly folders: Table<NoteFolder, Key>;
  declare readonly cashflows: Table<CashFlow, Key>;
  declare readonly challenges: Table<Challenge, Key>;
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
    this.version(2)
      .stores({
        // The multiEntry index spans workspaces: filter by workspaceId after it.
        trades:
          '[workspaceId+id], workspaceId, [workspaceId+accountId], [workspaceId+importId], *strategyIds',
        tagCategories: '[workspaceId+id], workspaceId',
        templates: '[workspaceId+id], workspaceId',
        folders: '[workspaceId+id], workspaceId',
        challenges: '[workspaceId+id], workspaceId',
        cashflows: '[workspaceId+id], workspaceId, [workspaceId+accountId]',
      })
      .upgrade(toVersion2);
  }
}

// ---- version 1 to 2 --------------------------------------------------------
// TradeZella's model: several strategies per trade, tag categories as records,
// titled rule groups, and note folders as records. No figure changes.

type Row = Record<string, unknown>;

/** `strategyId` becomes `strategyIds`. Also applied to the trades an import job keeps for undo. */
function tradeToV2(t: Row): void {
  const id = t.strategyId;
  t.strategyIds = typeof id === 'string' ? [id] : [];
  delete t.strategyId;
}

const CATEGORY_OF: Record<string, string> = {
  setup: CATEGORIES.setups.id,
  mistake: CATEGORIES.mistakes.id,
  emotion: CATEGORIES.emotions.id,
  custom: CATEGORIES.custom.id,
};

const GROUPS = [
  ['entry', 'Entry'],
  ['exit', 'Exit'],
  ['risk', 'Risk'],
  ['management', 'Management'],
] as const;

async function toVersion2(tx: Transaction): Promise<void> {
  await tx.table('trades').toCollection().modify(tradeToV2);
  await tx
    .table('imports')
    .toCollection()
    .modify((job: Row) => {
      for (const t of (job.replacedTrades as Row[] | undefined) ?? [])
        tradeToV2(t);
    });

  // Every workspace gets the built-in categories; Setups and Emotions only
  // where such tags exist.
  const tags = (await tx.table('tags').toArray()) as Row[];
  const spaces = new Set([
    ...WORKSPACES.map((w) => w.id),
    ...tags.map((t) => t.workspaceId as string),
  ]);
  const categories: TagCategory[] = [];
  for (const ws of spaces) {
    categories.push(...builtInCategories(ws));
    const has = (category: string) =>
      tags.some((t) => t.workspaceId === ws && t.category === category);
    if (has('setup')) categories.push(categoryIn(ws, CATEGORIES.setups));
    if (has('emotion')) categories.push(categoryIn(ws, CATEGORIES.emotions));
  }
  await tx.table('tagCategories').bulkPut(categories);
  await tx
    .table('tags')
    .toCollection()
    .modify((t: Row) => {
      t.categoryId = CATEGORY_OF[t.category as string] ?? CATEGORIES.custom.id;
      delete t.category;
    });

  // Rule groups in Entry, Exit, Risk, Management order; a group with no rules
  // is left out. A rule of an unknown group joins Management.
  await tx
    .table('strategies')
    .toCollection()
    .modify((s: Row) => {
      const rules = (s.rules as Row[] | undefined) ?? [];
      const groupOf = (r: Row) =>
        GROUPS.some(([key]) => key === r.group) ? r.group : 'management';
      s.groups = GROUPS.flatMap(([key, title]) => {
        const own = rules.filter((r) => groupOf(r) === key);
        if (own.length === 0) return [];
        return [
          {
            id: `group-${key}`,
            title,
            rules: own.map((r) => ({
              id: r.id,
              text: r.text,
              showWhen: 'always',
            })),
          },
        ];
      });
      delete s.rules;
    });

  // Each distinct folder name in a workspace becomes a folder.
  const entries = (await tx.table('journal').toArray()) as Row[];
  const createdAt = new Date().toISOString();
  const folders = new Map<string, NoteFolder>();
  const folderKey = (e: Row) =>
    `${e.workspaceId as string}\u0000${e.folder as string}`;
  for (const e of entries) {
    if (typeof e.folder !== 'string' || e.folder === '') continue;
    if (!folders.has(folderKey(e)))
      folders.set(folderKey(e), {
        id: crypto.randomUUID(),
        workspaceId: e.workspaceId as string,
        name: e.folder,
        createdAt,
      });
  }
  await tx.table('folders').bulkPut([...folders.values()]);
  await tx
    .table('journal')
    .toCollection()
    .modify((e: Row) => {
      const folder =
        typeof e.folder === 'string' ? folders.get(folderKey(e)) : undefined;
      if (folder) e.folderId = folder.id;
      delete e.folder;
      if (!Array.isArray(e.tags)) e.tags = [];
    });
}

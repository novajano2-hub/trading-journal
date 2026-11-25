import { Dexie } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { CATEGORIES } from '@/data/seed/templates';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { KeelDb } from './db';
import { DB_NAME } from './schema';

const M = 'mine';

/** The stores as Plan 2 declared them. */
const V1_STORES = {
  trades:
    '[workspaceId+id], workspaceId, [workspaceId+accountId], [workspaceId+importId], [workspaceId+strategyId]',
  accounts: '[workspaceId+id], workspaceId',
  strategies: '[workspaceId+id], workspaceId',
  tags: '[workspaceId+id], workspaceId',
  journal: '[workspaceId+id], workspaceId, *linkedTradeIds',
  imports: '[workspaceId+id], workspaceId, [workspaceId+accountId]',
  meta: 'key',
};

/** A trade as version 1 stored it: one optional `strategyId`. */
function v1Trade(id: string, strategyId?: string): Record<string, unknown> {
  const t: Record<string, unknown> = {
    ...makeTrade({ id, workspaceId: M, net: 1_000 }),
  };
  delete t.strategyIds;
  if (strategyId !== undefined) t.strategyId = strategyId;
  return t;
}

const v1Tag = (id: string, name: string, category: string) => ({
  id,
  workspaceId: M,
  name,
  category,
});

const v1Entry = (id: string, folder?: string) => ({
  id,
  workspaceId: M,
  kind: 'note',
  title: id,
  body: null,
  linkedTradeIds: [],
  ...(folder !== undefined ? { folder } : {}),
  updatedAt: '2026-11-20T00:00:00.000Z',
});

async function openV1(indexedDB: IDBFactory): Promise<void> {
  const v1 = new Dexie(DB_NAME, { indexedDB, IDBKeyRange });
  v1.version(1).stores(V1_STORES);
  await v1.table('trades').bulkPut([v1Trade('t-1', 's1'), v1Trade('t-2')]);
  // An import keeps the trades it replaced, for undo.
  await v1.table('imports').put({
    id: 'imp-1',
    workspaceId: M,
    accountId: 'a1',
    replacedTrades: [v1Trade('t-0', 's1')],
  });
  await v1
    .table('tags')
    .bulkPut([
      v1Tag('g-setup', 'Breakout', 'setup'),
      v1Tag('g-fomo', 'FOMO', 'mistake'),
      v1Tag('g-stop', 'Moved stop', 'mistake'),
      v1Tag('g-calm', 'Calm', 'emotion'),
      v1Tag('g-news', 'News day', 'custom'),
    ]);
  await v1.table('strategies').put({
    id: 's1',
    workspaceId: M,
    name: 'Range break',
    description: '',
    assetClasses: ['future'],
    rules: [
      { id: 'r-1', text: 'Wait for the range', group: 'entry' },
      { id: 'r-2', text: 'Risk 1R', group: 'risk' },
      { id: 'r-3', text: 'Volume confirms', group: 'entry' },
    ],
    checklist: [],
    status: 'active',
  });
  await v1
    .table('journal')
    .bulkPut([
      v1Entry('j-1', 'Ideas'),
      v1Entry('j-2', 'Ideas'),
      v1Entry('j-3'),
    ]);
  v1.close();
}

test('version 2 moves version 1 data onto the new model', async () => {
  const indexedDB = new IDBFactory();
  await openV1(indexedDB);
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  await db.open();

  // Trades: one strategy becomes a list, and the new index finds it.
  const t1 = await db.trades.get([M, 't-1']);
  const t2 = await db.trades.get([M, 't-2']);
  expect(t1?.strategyIds).toEqual(['s1']);
  expect(t2?.strategyIds).toEqual([]);
  expect(t1).not.toHaveProperty('strategyId');
  expect(
    (await db.trades.where('strategyIds').equals('s1').toArray()).map(
      (t) => t.id,
    ),
  ).toEqual(['t-1']);

  const job = await db.imports.get([M, 'imp-1']);
  expect(job?.replacedTrades[0]?.strategyIds).toEqual(['s1']);
  expect(job?.replacedTrades[0]).not.toHaveProperty('strategyId');

  // Tags: the four old categories become records.
  const categories = await db.tagCategories
    .where('workspaceId')
    .equals(M)
    .toArray();
  expect(categories.map((c) => c.name).sort()).toEqual([
    'Custom tags',
    'Emotions',
    'Mistakes',
    'Setups',
  ]);
  const byName = new Map(categories.map((c) => [c.name, c]));
  expect(byName.get('Mistakes')).toMatchObject({
    role: 'mistake',
    builtIn: true,
    color: '#D97706',
  });
  expect(byName.get('Custom tags')).toMatchObject({
    builtIn: true,
    color: CATEGORIES.custom.color,
  });
  expect(byName.get('Custom tags')).not.toHaveProperty('role');
  expect(byName.get('Setups')).toMatchObject({
    builtIn: false,
    color: CATEGORIES.setups.color,
  });
  expect(byName.get('Emotions')).toMatchObject({
    builtIn: false,
    color: CATEGORIES.emotions.color,
  });
  const tags = await db.tags.where('workspaceId').equals(M).toArray();
  const categoryOf = (id: string) =>
    categories.find((c) => c.id === tags.find((t) => t.id === id)?.categoryId)
      ?.name;
  expect(['g-fomo', 'g-stop'].map(categoryOf)).toEqual([
    'Mistakes',
    'Mistakes',
  ]);
  expect(['g-setup', 'g-calm', 'g-news'].map(categoryOf)).toEqual([
    'Setups',
    'Emotions',
    'Custom tags',
  ]);
  for (const t of tags) expect(t).not.toHaveProperty('category');

  // Strategies: enum groups become titled groups, in order.
  const s1 = await db.strategies.get([M, 's1']);
  expect(s1?.groups.map((g) => g.title)).toEqual(['Entry', 'Risk']);
  expect(s1?.groups.map((g) => g.rules.map((r) => r.id))).toEqual([
    ['r-1', 'r-3'],
    ['r-2'],
  ]);
  for (const r of s1!.groups.flatMap((g) => g.rules)) {
    expect(r.showWhen).toBe('always');
    expect(r).not.toHaveProperty('group');
  }
  expect(s1).not.toHaveProperty('rules');

  // Journal: folder names become folders.
  const folders = await db.folders.where('workspaceId').equals(M).toArray();
  expect(folders.map((f) => f.name)).toEqual(['Ideas']);
  const entries = await db.journal.where('workspaceId').equals(M).toArray();
  const entry = (id: string) => entries.find((e) => e.id === id)!;
  expect(entry('j-1').folderId).toBe(folders[0]!.id);
  expect(entry('j-2').folderId).toBe(folders[0]!.id);
  expect(entry('j-3')).not.toHaveProperty('folderId');
  for (const e of entries) {
    expect(e.tags).toEqual([]);
    expect(e).not.toHaveProperty('folder');
  }
  db.close();
});

test('a workspace without setup or emotion tags gets only the built-in categories', async () => {
  const indexedDB = new IDBFactory();
  const v1 = new Dexie(DB_NAME, { indexedDB, IDBKeyRange });
  v1.version(1).stores(V1_STORES);
  await v1.table('tags').put(v1Tag('g-fomo', 'FOMO', 'mistake'));
  v1.close();
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  const names = (
    await db.tagCategories.where('workspaceId').equals(M).toArray()
  )
    .map((c) => c.name)
    .sort();
  expect(names).toEqual(['Custom tags', 'Mistakes']);
  db.close();
});

// ---- version 2 to 3 --------------------------------------------------------

/** The stores as version 2 declared them: version 1's, with version 2's changes. */
const V2_STORES = {
  ...V1_STORES,
  trades:
    '[workspaceId+id], workspaceId, [workspaceId+accountId], [workspaceId+importId], *strategyIds',
  tagCategories: '[workspaceId+id], workspaceId',
  templates: '[workspaceId+id], workspaceId',
  folders: '[workspaceId+id], workspaceId',
  challenges: '[workspaceId+id], workspaceId',
  cashflows: '[workspaceId+id], workspaceId, [workspaceId+accountId]',
};

const S = 'sample';
const PREFS = { displayName: 'Sam', baseCurrency: 'EUR' };
const SEED_META = {
  key: 'seed:sample',
  value: { version: 1, seed: 7, endDate: '2026-11-20', seededAt: 'x' },
};

type V2Rows = Partial<Record<string, object[]>>;

/** A version 2 database holding `rows` (by table) and `meta` records. */
async function openV2(
  indexedDB: IDBFactory,
  rows: V2Rows = {},
  meta: { key: string; value: unknown }[] = [],
): Promise<void> {
  const v2 = new Dexie(DB_NAME, { indexedDB, IDBKeyRange });
  v2.version(2).stores(V2_STORES);
  for (const [table, list] of Object.entries(rows))
    await v2.table(table).bulkPut(list ?? []);
  await v2.table('meta').bulkPut(meta);
  v2.close();
}

const account = (ws: string) => ({
  id: `a-${ws}`,
  workspaceId: ws,
  name: 'Main',
});
const v2Trade = (ws: string) =>
  makeTrade({ id: `t-${ws}`, workspaceId: ws, net: 500 });
const v2Entry = (ws: string) => ({
  ...v1Entry(`j-${ws}`),
  workspaceId: ws,
  tags: [],
});
const v2Template = (ws: string) => ({
  id: `tpl-${ws}`,
  workspaceId: ws,
  name: 'T',
});

async function onboardingOf(indexedDB: IDBFactory) {
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  await db.open();
  const prefs = (await db.meta.get('prefs'))?.value as
    Record<string, unknown> | undefined;
  db.close();
  return prefs;
}

test('v2 to v3 keeps every v2 row and adds empty tables', async () => {
  const indexedDB = new IDBFactory();
  const rows: V2Rows = {
    trades: [v2Trade(M), v2Trade(S)],
    accounts: [account(M), account(S)],
    journal: [v2Entry(M), v2Entry(S)],
    templates: [v2Template(M), v2Template(S)],
  };
  await openV2(indexedDB, rows, [{ key: 'prefs', value: PREFS }, SEED_META]);
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  await db.open();
  for (const [table, list] of Object.entries(rows))
    for (const row of list ?? []) {
      const { workspaceId, id } = row as { workspaceId: string; id: string };
      expect(await db.table(table).get([workspaceId, id])).toEqual(row);
    }
  expect((await db.meta.get('seed:sample'))?.value).toEqual(SEED_META.value);
  expect(await db.trackers.count()).toBe(0);
  expect(await db.days.count()).toBe(0);
  expect(await db.dayShots.count()).toBe(0);
  db.close();
});

const SIGNALS: [string, V2Rows, { key: string; value: unknown }[]][] = [
  ['a prefs record', {}, [{ key: 'prefs', value: PREFS }]],
  ['an account in My workspace', { accounts: [account(M)] }, []],
  ['a trade in My workspace', { trades: [v2Trade(M)] }, []],
  ['a journal entry in My workspace', { journal: [v2Entry(M)] }, []],
  ['an active workspace record', {}, [{ key: 'active-workspace', value: S }]],
];

test.each(SIGNALS)(
  'v3 marks a v2 user onboarded: %s',
  async (_n, rows, meta) => {
    const indexedDB = new IDBFactory();
    await openV2(indexedDB, rows, meta);
    const prefs = await onboardingOf(indexedDB);
    expect(prefs?.onboarding).toEqual({
      status: 'done',
      existing: true,
      at: expect.any(String),
    });
    const rest = { ...prefs };
    delete rest.onboarding;
    const stored = meta.find((m) => m.key === 'prefs')?.value ?? {};
    expect(rest).toEqual(stored);
  },
);

test('a v2 database with only the sample is not onboarded', async () => {
  const indexedDB = new IDBFactory();
  await openV2(
    indexedDB,
    {
      trades: [v2Trade(S)],
      accounts: [account(S)],
      journal: [v2Entry(S)],
    },
    [SEED_META],
  );
  expect(await onboardingOf(indexedDB)).toBeUndefined();
});

test('a fresh database is not onboarded', async () => {
  expect(await onboardingOf(new IDBFactory())).toBeUndefined();
});

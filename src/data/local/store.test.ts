import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
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
} from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import {
  defaultPrefs,
  NotFoundError,
  StorageUnavailableError,
} from '../repository';
import type { SampleWorkspace } from '../seed/generate';
import { SAMPLE_SEED_VERSION } from '../seed/version';
import { builtInCategories, builtInTemplates } from '../seed/templates';
import { SAMPLE_WORKSPACE, USER_WORKSPACE, WORKSPACES } from '../workspaces';
import { KeelDb } from './db';
import type { ImportJobRecord } from './schema';
import { createLocalRepository } from './local-repository';

const sample = async () => fixtureSample();

afterEach(() => {
  vi.restoreAllMocks();
});

test('constructing touches no storage', () => {
  const open = vi.fn();
  createLocalRepository({ indexedDB: { open } as unknown as IDBFactory });
  expect(open).not.toHaveBeenCalled();
});

test('seeds the sample once, on first use, shared across instances', async () => {
  const indexedDB = new IDBFactory();
  const sample = vi.fn(async () => fixtureSample());
  await createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample,
  }).workspaces.getActive();
  await createLocalRepository({ indexedDB, IDBKeyRange, sample }).prefs.get();
  expect(sample).toHaveBeenCalledTimes(1);
  expect(
    await new KeelDb({ indexedDB, IDBKeyRange }).trades
      .where('workspaceId')
      .equals('sample')
      .count(),
  ).toBe(3);
});

test('the sample writes its edit history, default rules and missed trades', async () => {
  const indexedDB = new IDBFactory();
  const now = new Date('2026-11-20T15:00:00.000Z');
  const seeded = async (): Promise<SampleWorkspace> => ({
    ...fixtureSample(),
    history: [
      {
        id: 'sample-history-1',
        workspaceId: 'sample',
        at: '2026-11-20T14:00:00.000Z',
        type: 'trade',
        action: 'edited',
        source: 'you',
        entityId: 'f-1',
        label: 'ESZ5 2026-11-16',
        field: 'stops',
        oldValue: null,
        newValue: '{"unit":"price","levels":[{"value":5995,"qty":1}]}',
      },
    ],
    targetRules: [
      {
        id: 'sample-target-rule-1',
        workspaceId: 'sample',
        accountId: 'acc-a',
        assetClass: 'future',
        symbols: ['ES'],
        stop: { unit: 'ticks', levels: [{ value: 12, pct: 100 }] },
        createdAt: '2026-11-20T13:00:00.000Z',
      },
    ],
    feeRules: [
      {
        id: 'sample-fee-rule-1',
        workspaceId: 'sample',
        accountId: 'acc-a',
        assetClass: 'future',
        symbols: [],
        mode: 'per-contract',
        applyOn: 'all',
        commission: 225,
        fee: 35,
        createdAt: '2026-11-20T13:01:00.000Z',
      },
    ],
    missedTrades: [
      {
        id: 'sample-missed-1',
        workspaceId: 'sample',
        strategyId: 'str-1',
        symbol: 'ES',
        at: '2026-11-18T15:10:00.000Z',
        price: 6001.25,
        commission: 225,
        fees: 35,
      },
    ],
  });
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: seeded,
    now: () => now,
  });
  const s = await seeded();
  expect(await repo.history.list('sample')).toEqual(s.history);
  expect(await repo.targetRules.list('sample')).toEqual(s.targetRules);
  expect(await repo.feeRules.list('sample')).toEqual(s.feeRules);
  expect(await repo.missedTrades.list('sample', 'str-1')).toEqual(
    s.missedTrades,
  );
  // A reset writes them again, and My workspace never gets them.
  await repo.workspaces.resetSample();
  expect(await repo.history.list('sample')).toEqual(s.history);
  expect(await repo.history.list('mine')).toEqual([]);
  expect(await repo.targetRules.list('mine')).toEqual([]);
});

test('a stalled database fails with StorageUnavailableError', async () => {
  const stalled = { open: () => ({}) } as unknown as IDBFactory; // a request that never fires
  await expect(
    createLocalRepository({
      indexedDB: stalled,
      IDBKeyRange,
      openTimeoutMs: 50,
    }).prefs.get(),
  ).rejects.toBeInstanceOf(StorageUnavailableError);
});

test('a database that refuses to open fails with StorageUnavailableError', async () => {
  const refusing = {
    open: () => {
      throw new Error('denied');
    },
  } as unknown as IDBFactory;
  await expect(
    createLocalRepository({ indexedDB: refusing, IDBKeyRange }).prefs.get(),
  ).rejects.toBeInstanceOf(StorageUnavailableError);
});

test('a failed seed is retried on the next call', async () => {
  const indexedDB = new IDBFactory();
  const flaky = vi
    .fn<(now: Date) => Promise<SampleWorkspace>>()
    .mockRejectedValueOnce(new Error('generator crashed'))
    .mockImplementation(sample);
  const repo = createLocalRepository({ indexedDB, IDBKeyRange, sample: flaky });
  await expect(repo.workspaces.getActive()).rejects.toThrow(
    'generator crashed',
  );
  expect(await repo.workspaces.getActive()).toEqual(SAMPLE_WORKSPACE);
  expect(flaky).toHaveBeenCalledTimes(2);
  expect(await new KeelDb({ indexedDB, IDBKeyRange }).trades.count()).toBe(3);
});

test('the active workspace defaults to the sample and persists', async () => {
  const indexedDB = new IDBFactory();
  const repo = createLocalRepository({ indexedDB, IDBKeyRange, sample });
  expect(await repo.workspaces.list()).toEqual(WORKSPACES);
  expect(await repo.workspaces.getActive()).toEqual(SAMPLE_WORKSPACE);

  await repo.workspaces.setActive('mine');
  expect(
    await createLocalRepository({
      indexedDB,
      IDBKeyRange,
      sample,
    }).workspaces.getActive(),
  ).toEqual(USER_WORKSPACE);

  const unknown = repo.workspaces.setActive('x');
  await expect(unknown).rejects.toBeInstanceOf(NotFoundError);
  await expect(unknown).rejects.toMatchObject({ entity: 'workspace', id: 'x' });
  expect(await repo.workspaces.getActive()).toEqual(USER_WORKSPACE);
});

test('reset restores the seed; clear empties only My workspace', async () => {
  const indexedDB = new IDBFactory();
  let clock = new Date('2026-11-20T15:00:00.000Z');
  const sampleFn = vi.fn<(now: Date) => Promise<SampleWorkspace>>(sample);
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: sampleFn,
    now: () => clock,
  });
  await repo.workspaces.getActive();
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  const fixture = fixtureSample();

  // Drift the sample, and give My workspace a row in every data table.
  await db.trades.update(['sample', 'f-1'], { tagIds: ['tag-setup'] });
  await db.tags.put({
    id: 'tag-extra',
    workspaceId: 'sample',
    name: 'extra',
    categoryId: 'custom-tags',
  });
  await db.tagCategories.update(['sample', 'mistakes'], { name: 'Errors' });
  const drift = rowsIn(SAMPLE_WORKSPACE.id);
  await db.templates.put(drift.template);
  await db.folders.put(drift.folder);
  await db.cashflows.put(drift.flow);
  await db.challenges.put(drift.challenge);
  const mine = mineRows();
  await putMine(db, mine);
  await db.tagCategories.update(['mine', 'mistakes'], { name: 'Errors' });
  await db.meta.put({ key: 'overrides:mine', value: { ZC: {} } });

  clock = new Date('2026-11-23T15:00:00.000Z');
  await repo.workspaces.resetSample();
  expect(sampleFn).toHaveBeenLastCalledWith(clock);
  expect(await db.trades.get(['sample', 'f-1'])).toEqual(fixture.trades[0]);
  expect(await sampleRows(db)).toEqual(sortedRows(fixture));
  expect((await db.meta.get('seed:sample'))?.value).toEqual({
    seed: fixture.seed,
    endDate: fixture.endDate,
    seededAt: '2026-11-23T15:00:00.000Z',
    version: SAMPLE_SEED_VERSION,
  });
  // My workspace keeps its built-ins (2 categories, 6 templates) and its own rows.
  expect(await mineCounts(db)).toEqual([1, 1, 1, 1, 1, 1, 3, 7, 1, 1, 1]);
  expect(await db.trades.get(['mine', mine.trade.id])).toEqual(mine.trade);

  await repo.workspaces.clearUser();
  expect(await mineCounts(db)).toEqual([0, 0, 0, 0, 0, 0, 2, 6, 0, 0, 0]);
  const builtIns = await mineRowsOf(db, ['tagCategories', 'templates']);
  expect(builtIns).toEqual([
    [...builtInCategories(USER_WORKSPACE.id)].sort(byId),
    [...builtInTemplates(USER_WORKSPACE.id)].sort(byId),
  ]);
  expect(await db.meta.get('overrides:mine')).toBeUndefined();
  expect(await sampleRows(db)).toEqual(sortedRows(fixture));
});

/** A store seeded earlier, whose seed record carries `version`. My workspace holds a row in every table. */
async function seededBefore(version: number | undefined) {
  const indexedDB = new IDBFactory();
  await createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample,
  }).workspaces.getActive();
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  const mine = mineRows();
  await putMine(db, mine);
  await db.trades.update(['sample', 'f-1'], { tagIds: ['tag-setup'] });
  const record = (await db.meta.get('seed:sample'))!;
  const rest = { ...(record.value as Record<string, unknown>) };
  delete rest.version;
  await db.meta.put({
    key: 'seed:sample',
    value: version === undefined ? rest : { ...rest, version },
  });
  return { indexedDB, db, mine };
}

/** The fixture sample plus a challenge, as a newer seed would write it. */
async function newerSample(): Promise<SampleWorkspace> {
  const s = fixtureSample();
  s.challenges.push({ ...rowsIn('sample').challenge, id: 'sample-ch' });
  return s;
}

test.each([
  ['no version (seeded before versions)', undefined],
  ['an older version', SAMPLE_SEED_VERSION - 1],
])(
  'a sample seeded with %s is regenerated on open; My workspace is untouched',
  async (_name, version) => {
    const { indexedDB, db, mine } = await seededBefore(version);
    const before = await mineRowsOf(db, TABLES);
    const next = vi.fn(newerSample);
    const repo = createLocalRepository({
      indexedDB,
      IDBKeyRange,
      sample: next,
    });
    await repo.workspaces.getActive();
    expect(next).toHaveBeenCalledTimes(1);
    expect((await repo.challenges.list('sample')).map((c) => c.id)).toEqual([
      'sample-ch',
    ]);
    // The drift on a sample trade is gone; the version is current.
    expect(await db.trades.get(['sample', 'f-1'])).toEqual(
      fixtureSample().trades[0],
    );
    expect(
      ((await db.meta.get('seed:sample'))!.value as { version: number })
        .version,
    ).toBe(SAMPLE_SEED_VERSION);
    expect(await mineRowsOf(db, TABLES)).toEqual(before);
    expect(await db.trades.get(['mine', mine.trade.id])).toEqual(mine.trade);
  },
);

test('a sample at the current version is not regenerated', async () => {
  const { indexedDB, db } = await seededBefore(SAMPLE_SEED_VERSION);
  const next = vi.fn(newerSample);
  await createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: next,
  }).workspaces.getActive();
  expect(next).not.toHaveBeenCalled();
  // The drift on a sample trade stays.
  expect((await db.trades.get(['sample', 'f-1']))?.tagIds).toEqual([
    'tag-setup',
  ]);
});

test('prefs: defaults, persistence, validation', async () => {
  const indexedDB = new IDBFactory();
  const repo = createLocalRepository({ indexedDB, IDBKeyRange, sample });
  expect(await repo.prefs.get()).toEqual(defaultPrefs());

  const gross = { ...defaultPrefs(), pnlBasis: 'gross' as const };
  expect(await repo.prefs.update({ pnlBasis: 'gross' })).toEqual(gross);
  const other = createLocalRepository({ indexedDB, IDBKeyRange, sample });
  expect(await other.prefs.get()).toEqual(gross);

  const london = { ...gross, timeZone: 'Europe/London' };
  expect(await other.prefs.update({ timeZone: 'Europe/London' })).toEqual(
    london,
  );

  await expect(
    repo.prefs.update({ timeZone: 'Not/AZone' }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.prefs.update({
      breakevenRange: { unit: 'amount', from: 5, to: -5 },
    }),
  ).rejects.toBeInstanceOf(RangeError);
  expect(await repo.prefs.get()).toEqual(london);
});

test('default prefs use the browser zone, else New York', () => {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  expect(defaultPrefs()).toEqual({
    timeZone: browserZone,
    baseCurrency: 'USD',
    breakevenRange: { unit: 'amount', from: 0, to: 0 },
    pnlBasis: 'net',
    displayUnit: 'dollar',
    hideTradeSummary: false,
    calendarStats: ['net', 'trades', 'winRate', 'rating'],
    instrumentsTraded: [],
    settleExpiredOptions: true,
  });

  const resolved = Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    ...resolved,
    timeZone: '',
  });
  expect(defaultPrefs().timeZone).toBe('America/New_York');
});

test(
  'the real generator seeds about 1,500 trades',
  { timeout: 30_000 },
  async () => {
    // fake-indexeddb is slow at this size
    const indexedDB = new IDBFactory();
    await createLocalRepository({
      indexedDB,
      IDBKeyRange,
      now: () => new Date('2026-11-20T15:00:00Z'),
    }).workspaces.getActive();
    const n = await new KeelDb({ indexedDB, IDBKeyRange }).trades.count();
    expect(n).toBeGreaterThanOrEqual(1400);
    expect(n).toBeLessThanOrEqual(1650);
  },
);

// ---- helpers ----------------------------------------------------------------

const TABLES = [
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
] as const;

/** A row for each table that Plan 5 added, in workspace `ws`. */
function rowsIn(ws: string) {
  const category: TagCategory = {
    id: 'c-x',
    workspaceId: ws,
    name: 'Sessions',
    color: '#0F766E',
    builtIn: false,
  };
  const template: NoteTemplate = {
    id: 'tpl-x',
    workspaceId: ws,
    name: 'Mine',
    kind: 'note',
    body: null,
    isDefault: false,
    builtIn: false,
  };
  const folder: NoteFolder = {
    id: 'fold-x',
    workspaceId: ws,
    name: 'Ideas',
    createdAt: '2026-11-20T15:00:00.000Z',
  };
  const flow: CashFlow = {
    id: 'flow-x',
    workspaceId: ws,
    accountId: 'acc-m',
    date: '2026-11-02',
    amount: 100_000,
  };
  const challenge: Challenge = {
    id: 'ch-x',
    workspaceId: ws,
    name: 'Futures 50K',
    firm: 'Sample',
    steps: 1,
    phases: [{ step: 'step-1', accountId: 'acc-m' }],
    phase: 'evaluation',
    status: 'active',
  };
  return { category, template, folder, flow, challenge };
}

function mineRows() {
  const ws = USER_WORKSPACE.id;
  const account: Account = {
    id: 'acc-m',
    workspaceId: ws,
    name: 'Mine',
    broker: 'Broker',
    type: 'live',
    currency: 'USD',
    startingBalance: 1_000_000,
    status: 'active',
  };
  const trade = makeTrade({
    id: 't-m',
    workspaceId: ws,
    accountId: 'acc-m',
    net: 1_000,
  });
  const strategy: Strategy = {
    id: 's-m',
    workspaceId: ws,
    name: 'Mine',
    description: '',
    assetClasses: ['future'],
    groups: [],
    checklist: [],
    status: 'active',
  };
  const tag: Tag = {
    id: 'g-m',
    workspaceId: ws,
    name: 'mine',
    categoryId: 'custom-tags',
  };
  const note: JournalEntry = {
    id: 'j-m',
    workspaceId: ws,
    kind: 'note',
    title: 'Mine',
    body: null,
    linkedTradeIds: ['t-m'],
    tags: [],
    updatedAt: '2026-11-20T15:00:00.000Z',
  };
  const job: ImportJobRecord = {
    id: 'i-m',
    workspaceId: ws,
    accountId: 'acc-m',
    fileName: 'fills.csv',
    mapping: {
      kind: 'fills',
      columns: { time: 0, symbol: 1, side: 2, qty: 3, price: 4 },
      sourceTimeZone: 'America/New_York',
      dateOrder: 'mdy',
      decimal: '.',
      forexQtyUnit: 'lots',
      overrides: {},
    },
    rowCount: 2,
    tradeCount: 1,
    skippedCount: 0,
    duplicateCount: 0,
    status: 'active',
    createdAt: '2026-11-20T15:00:00.000Z',
    fingerprints: [],
    replacedTrades: [],
    tradeIds: [],
    revision: 1,
  };
  return { account, trade, strategy, tag, note, job, ...rowsIn(ws) };
}

async function putMine(db: KeelDb, m: ReturnType<typeof mineRows>) {
  await db.accounts.put(m.account);
  await db.trades.put(m.trade);
  await db.strategies.put(m.strategy);
  await db.tags.put(m.tag);
  await db.journal.put(m.note);
  await db.imports.put(m.job);
  await db.tagCategories.put(m.category);
  await db.templates.put(m.template);
  await db.folders.put(m.folder);
  await db.cashflows.put(m.flow);
  await db.challenges.put(m.challenge);
}

const mineCounts = (db: KeelDb) =>
  Promise.all(
    TABLES.map((t) =>
      db.table(t).where('workspaceId').equals(USER_WORKSPACE.id).count(),
    ),
  );

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

async function mineRowsOf(db: KeelDb, tables: readonly string[]) {
  const rows = await Promise.all(
    tables.map((t) =>
      db.table(t).where('workspaceId').equals(USER_WORKSPACE.id).toArray(),
    ),
  );
  return rows.map((r) => [...r].sort(byId));
}

async function sampleRows(db: KeelDb) {
  const rows = await Promise.all(
    TABLES.map((t) =>
      db.table(t).where('workspaceId').equals(SAMPLE_WORKSPACE.id).toArray(),
    ),
  );
  return rows.map((r) => [...r].sort(byId));
}

function sortedRows(s: SampleWorkspace) {
  return [
    s.trades,
    s.accounts,
    s.strategies,
    s.tags,
    s.journal,
    [],
    s.tagCategories,
    builtInTemplates(SAMPLE_WORKSPACE.id),
    [],
    [],
    [],
  ].map((r: { id: string }[]) => [...r].sort(byId));
}

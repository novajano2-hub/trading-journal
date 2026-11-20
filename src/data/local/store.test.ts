import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { Account, JournalEntry, Strategy, Tag } from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import {
  defaultPrefs,
  NotFoundError,
  StorageUnavailableError,
} from '../repository';
import type { SampleWorkspace } from '../seed/generate';
import { SAMPLE_WORKSPACE, USER_WORKSPACE, WORKSPACES } from '../workspaces';
import { KeelDb, type ImportJobRecord } from './db';
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
    name: 'Extra',
    category: 'custom',
  });
  const mine = mineRows();
  await putMine(db, mine);
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
  });
  expect(await mineCounts(db)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(await db.trades.get(['mine', mine.trade.id])).toEqual(mine.trade);

  await repo.workspaces.clearUser();
  expect(await mineCounts(db)).toEqual([0, 0, 0, 0, 0, 0]);
  expect(await db.meta.get('overrides:mine')).toBeUndefined();
  expect(await sampleRows(db)).toEqual(sortedRows(fixture));
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
  });

  const resolved = Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    ...resolved,
    timeZone: '',
  });
  expect(defaultPrefs().timeZone).toBe('America/New_York');
});

test(
  'the real generator seeds about 1,200 trades',
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
    expect(n).toBeGreaterThanOrEqual(1100);
    expect(n).toBeLessThanOrEqual(1300);
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
] as const;

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
    rules: [],
    checklist: [],
    status: 'active',
  };
  const tag: Tag = {
    id: 'g-m',
    workspaceId: ws,
    name: 'Mine',
    category: 'custom',
  };
  const note: JournalEntry = {
    id: 'j-m',
    workspaceId: ws,
    kind: 'note',
    title: 'Mine',
    body: null,
    linkedTradeIds: ['t-m'],
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
  };
  return { account, trade, strategy, tag, note, job };
}

async function putMine(db: KeelDb, m: ReturnType<typeof mineRows>) {
  await db.accounts.put(m.account);
  await db.trades.put(m.trade);
  await db.strategies.put(m.strategy);
  await db.tags.put(m.tag);
  await db.journal.put(m.note);
  await db.imports.put(m.job);
}

const mineCounts = (db: KeelDb) =>
  Promise.all(
    TABLES.map((t) =>
      db.table(t).where('workspaceId').equals(USER_WORKSPACE.id).count(),
    ),
  );

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

async function sampleRows(db: KeelDb) {
  const rows = await Promise.all(
    TABLES.map((t) =>
      db.table(t).where('workspaceId').equals(SAMPLE_WORKSPACE.id).toArray(),
    ),
  );
  return rows.map((r) => [...r].sort(byId));
}

function sortedRows(s: SampleWorkspace) {
  return [s.trades, s.accounts, s.strategies, s.tags, s.journal, []].map(
    (r: { id: string }[]) => [...r].sort(byId),
  );
}

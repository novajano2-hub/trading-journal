import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { fixtureSample } from '../__fixtures__/sample';
import { DuplicateNameError, NotFoundError } from '../repository';
import { KeelDb, type ImportJobRecord } from './db';
import { createLocalRepository } from './local-repository';

const S = 'sample';
const M = 'mine';

function setup(opts: { now?: () => Date; newId?: () => string } = {}) {
  const indexedDB = new IDBFactory();
  const make = (o = opts) =>
    createLocalRepository({
      indexedDB,
      IDBKeyRange,
      sample: async () => fixtureSample(),
      ...o,
    });
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  return { repo: make(), make, db };
}

const importJob = (
  ws: string,
  id: string,
  accountId: string,
): ImportJobRecord => ({
  id,
  workspaceId: ws,
  accountId,
  fileName: 'f.csv',
  mapping: {} as ImportJobRecord['mapping'],
  rowCount: 1,
  tradeCount: 1,
  skippedCount: 0,
  duplicateCount: 0,
  status: 'active',
  createdAt: '2026-11-20T00:00:00.000Z',
  fingerprints: [],
  replacedTrades: [],
  tradeIds: [],
  revision: 1,
});

test('lists come back in their documented order', async () => {
  const { repo } = setup();
  expect((await repo.trades.list(S)).map((t) => t.id)).toEqual([
    'f-1',
    'f-2',
    'f-3',
  ]);
  await repo.accounts.create(S, {
    name: 'Alpha',
    broker: 'b',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  expect((await repo.accounts.list(S)).map((a) => a.name)).toEqual([
    'Alpha',
    'Futures main',
    'Old demo',
  ]);
  await repo.strategies.create(S, {
    name: 'Aardvark',
    description: '',
    assetClasses: [],
    rules: [],
    checklist: [],
    status: 'active',
  });
  expect((await repo.strategies.list(S)).map((s) => s.name)).toEqual([
    'Aardvark',
    'Opening range breakout',
  ]);
  await repo.tags.create(S, { name: 'Anxious', category: 'emotion' });
  await repo.tags.create(S, { name: 'Early', category: 'mistake' });
  expect((await repo.tags.list(S)).map((t) => t.name)).toEqual([
    'Anxious',
    'Early',
    'FOMO',
    'Breakout',
  ]);
});

test('trades.update persists across instances; missing ids throw', async () => {
  const { repo, make } = setup();
  const updated = await repo.trades.update(S, 'f-2', {
    rating: 5,
    plannedStop: 6020,
  });
  expect(updated.initialRisk).toBeGreaterThan(0);
  const again = make();
  expect(await again.trades.get(S, 'f-2')).toEqual(updated);
  const missing = repo.trades.update(S, 'nope', { rating: 1 });
  await expect(missing).rejects.toBeInstanceOf(NotFoundError);
  await expect(missing).rejects.toMatchObject({ entity: 'trade', id: 'nope' });
  await expect(repo.accounts.update(S, 'nope', {})).rejects.toBeInstanceOf(
    NotFoundError,
  );
  await expect(repo.accounts.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
  await expect(repo.strategies.update(S, 'nope', {})).rejects.toBeInstanceOf(
    NotFoundError,
  );
  await expect(repo.strategies.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
  await expect(repo.tags.update(S, 'nope', {})).rejects.toBeInstanceOf(
    NotFoundError,
  );
  await expect(repo.tags.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
  await expect(repo.journal.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

test('workspaces are isolated', async () => {
  const { repo, db } = setup();
  await repo.trades.list(S); // seed
  const before = await repo.trades.get(S, 'f-1');
  await db.trades.put(
    makeTrade({ id: 'f-1', workspaceId: M, net: 100, serial: 1 }),
  );
  await repo.trades.update(M, 'f-1', { rating: 2 });
  expect(await repo.trades.get(S, 'f-1')).toEqual(before);
  expect((await repo.trades.get(M, 'f-1'))?.rating).toBe(2);
  expect((await repo.trades.list(M)).map((t) => t.workspaceId)).toEqual([M]);
  expect(await repo.accounts.list(M)).toEqual([]);
  expect(await repo.tags.list(M)).toEqual([]);
  expect(await repo.journal.list(M)).toEqual([]);
  await expect(repo.trades.update(M, 'f-2', { rating: 1 })).rejects.toThrow(
    NotFoundError,
  );
});

test('removing a trade unlinks it from journal entries and ignores missing ids', async () => {
  const { repo } = setup();
  await repo.trades.remove(S, ['f-1', 'ghost']);
  expect(await repo.trades.get(S, 'f-1')).toBeUndefined();
  expect((await repo.journal.get(S, 'j-1'))?.linkedTradeIds).toEqual([]);
  expect(await repo.trades.list(S)).toHaveLength(2);
});

test('removing a trade in My workspace leaves the sample entry linked to the same id', async () => {
  const { repo, db } = setup();
  await repo.trades.list(S); // seed
  await db.trades.put(
    makeTrade({ id: 'f-1', workspaceId: M, net: 100, serial: 1 }),
  );
  await db.journal.put({
    id: 'j-mine',
    workspaceId: M,
    kind: 'note',
    title: 'mine',
    body: null,
    linkedTradeIds: ['f-1', 'other'],
    updatedAt: '2026-11-20T00:00:00.000Z',
  });
  await repo.trades.remove(M, ['f-1']);
  expect((await repo.journal.get(M, 'j-mine'))?.linkedTradeIds).toEqual([
    'other',
  ]);
  expect((await repo.journal.get(S, 'j-1'))?.linkedTradeIds).toEqual(['f-1']);
  expect(await repo.trades.get(S, 'f-1')).toBeDefined();
});

test('removing an account deletes its trades, their links and its imports', async () => {
  const { repo, db } = setup();
  await repo.trades.list(S);
  await db.imports.bulkPut([
    importJob(S, 'imp-a', 'acc-a'),
    importJob(S, 'imp-b', 'acc-b'),
  ]);
  await repo.accounts.remove(S, 'acc-a');
  expect((await repo.accounts.list(S)).map((a) => a.id)).toEqual(['acc-b']);
  expect((await repo.trades.list(S)).map((t) => t.id)).toEqual(['f-3']);
  expect((await repo.journal.get(S, 'j-1'))?.linkedTradeIds).toEqual([]);
  expect((await db.imports.toArray()).map((i) => i.id)).toEqual(['imp-b']);
});

test('editing strategy rules gives new rules ids and drops stale rule checks', async () => {
  const { repo } = setup({ newId: () => 'new-rule' });
  const updated = await repo.strategies.update(S, 'str-1', {
    rules: [
      { id: 'r-1', text: 'Wait for the range', group: 'entry' },
      { text: 'Take profit at 2R', group: 'exit' },
    ],
  });
  expect(updated.rules.map((r) => r.id)).toEqual(['r-1', 'new-rule']);
  expect((await repo.trades.get(S, 'f-1'))?.ruleChecks).toEqual([
    { ruleId: 'r-1', followed: true },
  ]);
  // A patch without rules leaves checks alone.
  await repo.strategies.update(S, 'str-1', { name: 'ORB' });
  expect((await repo.trades.get(S, 'f-1'))?.ruleChecks).toHaveLength(1);
});

test('removing a strategy clears it from its trades', async () => {
  const { repo } = setup();
  await repo.strategies.remove(S, 'str-1');
  const trade = await repo.trades.get(S, 'f-1');
  expect(trade?.strategyId).toBeUndefined();
  expect('strategyId' in trade!).toBe(false);
  expect(trade?.ruleChecks).toEqual([]);
  expect(await repo.strategies.get(S, 'str-1')).toBeUndefined();
});

test('removing a tag drops it from every trade', async () => {
  const { repo } = setup();
  await repo.trades.update(S, 'f-2', { tagIds: ['tag-fomo', 'tag-setup'] });
  await repo.tags.remove(S, 'tag-fomo');
  expect((await repo.trades.get(S, 'f-1'))?.tagIds).toEqual([]);
  expect((await repo.trades.get(S, 'f-2'))?.tagIds).toEqual(['tag-setup']);
  expect((await repo.tags.list(S)).map((t) => t.id)).toEqual(['tag-setup']);
});

test('removing a journal entry clears noteId on its trades', async () => {
  const { repo } = setup();
  await repo.journal.remove(S, 'j-1');
  const trade = await repo.trades.get(S, 'f-1');
  expect('noteId' in trade!).toBe(false);
  expect(await repo.journal.get(S, 'j-1')).toBeUndefined();
});

test('tag names are trimmed and unique per workspace and category, ignoring case', async () => {
  const { repo } = setup();
  const dup = repo.tags.create(S, { name: 'fomo ', category: 'mistake' });
  await expect(dup).rejects.toBeInstanceOf(DuplicateNameError);
  await expect(dup).rejects.toMatchObject({ duplicate: 'FOMO' });
  // Another category or workspace may reuse the name.
  const other = await repo.tags.create(S, {
    name: ' FOMO ',
    category: 'emotion',
  });
  expect(other.name).toBe('FOMO');
  await repo.tags.create(M, { name: 'FOMO', category: 'mistake' });
  await expect(
    repo.tags.update(S, other.id, { category: 'mistake' }),
  ).rejects.toBeInstanceOf(DuplicateNameError);
  // Renaming a tag to its own name in another case is fine.
  expect((await repo.tags.update(S, 'tag-fomo', { name: 'fomo' })).name).toBe(
    'fomo',
  );
});

test('journal.save creates, then replaces, stamping updatedAt', async () => {
  let clock = new Date('2026-11-20T10:00:00.000Z');
  const { repo } = setup({ now: () => clock, newId: () => 'j-new' });
  const created = await repo.journal.save(S, {
    kind: 'note',
    title: 'First',
    body: null,
    linkedTradeIds: ['f-2'],
  });
  expect(created).toMatchObject({
    id: 'j-new',
    workspaceId: S,
    updatedAt: '2026-11-20T10:00:00.000Z',
  });
  clock = new Date('2026-11-20T11:00:00.000Z');
  const saved = await repo.journal.save(S, {
    ...created,
    title: 'Second',
  });
  expect(saved.updatedAt).toBe('2026-11-20T11:00:00.000Z');
  expect(await repo.journal.get(S, 'j-new')).toEqual(saved);
  expect(
    (await repo.journal.list(S)).filter((e) => e.id === 'j-new'),
  ).toHaveLength(1);
});

test('journal lists by date descending, undated last, then updatedAt', async () => {
  const { repo, db } = setup();
  await repo.journal.list(S);
  const base = {
    workspaceId: S,
    kind: 'note' as const,
    body: null,
    linkedTradeIds: [],
  };
  await db.journal.bulkPut([
    { ...base, id: 'u-old', title: '', updatedAt: '2026-01-01T00:00:00.000Z' },
    { ...base, id: 'u-new', title: '', updatedAt: '2026-02-01T00:00:00.000Z' },
    {
      ...base,
      id: 'd-late',
      title: '',
      date: '2026-11-18',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      ...base,
      id: 'd-late2',
      title: '',
      date: '2026-11-18',
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
  ]);
  expect((await repo.journal.list(S)).map((e) => e.id)).toEqual([
    'd-late2',
    'd-late',
    'j-1',
    'u-new',
    'u-old',
  ]);
});

test('listForTrade finds linked entries only in its workspace', async () => {
  const { repo, db } = setup();
  expect((await repo.journal.listForTrade(S, 'f-1')).map((e) => e.id)).toEqual([
    'j-1',
  ]);
  expect(await repo.journal.listForTrade(S, 'f-2')).toEqual([]);
  await db.journal.put({
    id: 'j-mine',
    workspaceId: M,
    kind: 'note',
    title: '',
    body: null,
    linkedTradeIds: ['f-1'],
    updatedAt: '2026-11-20T00:00:00.000Z',
  });
  expect((await repo.journal.listForTrade(S, 'f-1')).map((e) => e.id)).toEqual([
    'j-1',
  ]);
  expect((await repo.journal.listForTrade(M, 'f-1')).map((e) => e.id)).toEqual([
    'j-mine',
  ]);
});

test('a failed cascade rolls everything back', async () => {
  const { repo, db } = setup();
  await repo.trades.list(S);
  // A corrupt row (links not an array) makes the unlink step throw after the trade delete.
  await db.journal.put({
    id: 'corrupt',
    workspaceId: S,
    kind: 'note',
    title: '',
    body: null,
    linkedTradeIds: 'f-2' as unknown as string[],
    updatedAt: '2026-11-20T00:00:00.000Z',
  });
  await expect(repo.trades.remove(S, ['f-2'])).rejects.toThrow();
  expect(await repo.trades.get(S, 'f-2')).toBeDefined();
  await expect(repo.accounts.remove(S, 'acc-a')).rejects.toThrow();
  expect(await repo.accounts.list(S)).toHaveLength(2);
  expect(await repo.trades.list(S)).toHaveLength(3);
});

test('undefined on a required field leaves it unchanged; on propRules it clears', async () => {
  const { repo } = setup();
  const acc = await repo.accounts.update(S, 'acc-a', {
    propRules: {
      firm: 'F',
      phase: 'evaluation',
      profitTarget: 1,
      dailyLossLimit: 1,
      maxDrawdown: 1,
      drawdownType: 'static',
      minTradingDays: 1,
    },
  });
  expect(acc.propRules).toBeDefined();
  const kept = await repo.accounts.update(S, 'acc-a', { name: undefined });
  expect(kept.name).toBe('Futures main');
  const cleared = await repo.accounts.update(S, 'acc-a', {
    propRules: undefined,
  });
  expect('propRules' in cleared).toBe(false);
  expect((await repo.accounts.list(S)).map((a) => a.name)).toContain(
    'Futures main',
  );
  const strat = await repo.strategies.update(S, 'str-1', {
    name: undefined,
    checklist: undefined,
  });
  expect(strat.name).toBe('Opening range breakout');
  expect(strat.checklist).toEqual(['Check the economic calendar']);
  const tag = await repo.tags.update(S, 'tag-fomo', {
    name: undefined,
    category: undefined,
  });
  expect(tag).toMatchObject({ name: 'FOMO', category: 'mistake' });
});

test('a patch carrying a foreign id or workspaceId still updates the original row', async () => {
  const { repo } = setup();
  const sneaky = { workspaceId: M, id: 'other', name: 'Renamed' };
  const acc = await repo.accounts.update(S, 'acc-a', sneaky);
  expect(acc).toMatchObject({ id: 'acc-a', workspaceId: S, name: 'Renamed' });
  const tag = await repo.tags.update(S, 'tag-fomo', sneaky);
  expect(tag).toMatchObject({ id: 'tag-fomo', workspaceId: S });
  const strat = await repo.strategies.update(S, 'str-1', sneaky);
  expect(strat).toMatchObject({ id: 'str-1', workspaceId: S });
  const trade = await repo.trades.update(S, 'f-1', {
    ...sneaky,
    rating: 1,
  } as object);
  expect(trade).toMatchObject({ id: 'f-1', workspaceId: S, rating: 1 });
  expect(await repo.accounts.list(M)).toEqual([]);
  expect(await repo.trades.list(M)).toEqual([]);
});

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { fixtureSample } from '../__fixtures__/sample';
import {
  DuplicateNameError,
  ManualTradeRejected,
  NotFoundError,
} from '../repository';
import { KeelDb } from './db';
import type { ImportJobRecord } from './schema';
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
    groups: [],
    checklist: [],
    status: 'active',
  });
  expect((await repo.strategies.list(S)).map((s) => s.name)).toEqual([
    'Aardvark',
    'Opening range breakout',
  ]);
  const emotions = await repo.tagCategories.create(S, {
    name: 'Emotions',
    color: '#0A6F94',
  });
  expect((await repo.tagCategories.list(S)).map((c) => c.name)).toEqual([
    'Custom tags',
    'Emotions',
    'Mistakes',
    'Setups',
  ]);
  await repo.tags.create(S, { name: 'Anxious', categoryId: emotions.id });
  await repo.tags.create(S, { name: 'Early', categoryId: 'mistakes' });
  // By category name, then name.
  expect((await repo.tags.list(S)).map((t) => t.name)).toEqual([
    'anxious',
    'early',
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
    tags: [],
    updatedAt: '2026-11-20T00:00:00.000Z',
  });
  await repo.trades.remove(M, ['f-1']);
  expect((await repo.journal.get(M, 'j-mine'))?.linkedTradeIds).toEqual([
    'other',
  ]);
  expect((await repo.journal.get(S, 'j-1'))?.linkedTradeIds).toEqual(['f-1']);
  expect(await repo.trades.get(S, 'f-1')).toBeDefined();
});

test('an account with trades is refused until clearTrades empties it', async () => {
  const { repo, db } = setup();
  await repo.trades.list(S);
  await db.imports.bulkPut([
    importJob(S, 'imp-a', 'acc-a'),
    importJob(S, 'imp-b', 'acc-b'),
  ]);
  await expect(repo.accounts.remove(S, 'acc-a')).rejects.toThrow(
    'account has trades',
  );
  expect(await repo.accounts.list(S)).toHaveLength(2);
  expect(await repo.trades.list(S)).toHaveLength(3);

  expect(await repo.accounts.clearTrades(S, 'acc-a')).toBe(2);
  expect((await repo.trades.list(S)).map((t) => t.id)).toEqual(['f-3']);
  expect((await repo.journal.get(S, 'j-1'))?.linkedTradeIds).toEqual([]);
  expect((await db.imports.toArray()).map((i) => i.id)).toEqual(['imp-b']);
  expect((await repo.accounts.list(S)).map((a) => a.id)).toEqual([
    'acc-a',
    'acc-b',
  ]);

  await repo.accounts.remove(S, 'acc-a');
  expect((await repo.accounts.list(S)).map((a) => a.id)).toEqual(['acc-b']);
  await expect(repo.accounts.clearTrades(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

test('clearing an account makes a plan made before it stale', async () => {
  const { repo, db } = setup();
  await db.accounts.put({
    id: 'acc-m',
    workspaceId: M,
    name: 'Mine',
    broker: 'b',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  const before = (await repo.imports.context(M, 'acc-m')).importRevision;
  await repo.accounts.clearTrades(M, 'acc-m');
  expect((await repo.imports.context(M, 'acc-m')).importRevision).toBe(
    before + 1,
  );
});

/** A second strategy `str-2` with rule `r-9`, and `ids` in both strategies with a check on each. */
async function withTwoStrategies(
  repo: ReturnType<typeof setup>['repo'],
  db: KeelDb,
  ids: readonly string[],
) {
  await repo.trades.list(S); // seed
  await db.strategies.put({
    id: 'str-2',
    workspaceId: S,
    name: 'Pullback',
    description: '',
    assetClasses: ['future'],
    groups: [
      {
        id: 'g-9',
        title: 'Entry',
        rules: [{ id: 'r-9', text: 'Pullback holds', showWhen: 'always' }],
      },
    ],
    checklist: [],
    status: 'active',
  });
  for (const id of ids)
    await db.trades.update([S, id], {
      strategyIds: ['str-1', 'str-2'],
      ruleChecks: [
        { ruleId: 'r-1', followed: true },
        { ruleId: 'r-2', followed: false },
        { ruleId: 'r-9', followed: false },
      ],
    });
}

test('editing strategy groups gives new groups and rules ids and drops only its stale rule checks', async () => {
  let n = 0;
  const { repo, db } = setup({ newId: () => `new-${++n}` });
  await withTwoStrategies(repo, db, ['f-1']);
  const updated = await repo.strategies.update(S, 'str-1', {
    groups: [
      {
        id: 'g-entry',
        title: 'Entry',
        rules: [
          { id: 'r-1', text: 'Wait for the range', showWhen: 'always' },
          { text: 'Take profit at 2R', showWhen: 'winner' },
        ],
      },
      { title: 'Exit', rules: [] },
    ],
  });
  const [entry, exit] = updated.groups;
  expect(entry!.id).toBe('g-entry');
  expect(entry!.rules.map((r) => r.id)).toEqual([
    'r-1',
    expect.stringMatching(/^new-/),
  ]);
  expect(exit!.id).toMatch(/^new-/);
  expect(exit!.id).not.toBe(entry!.rules[1]!.id);
  // r-2 left str-1; r-9 belongs to str-2 and stays.
  expect((await repo.trades.get(S, 'f-1'))?.ruleChecks).toEqual([
    { ruleId: 'r-1', followed: true },
    { ruleId: 'r-9', followed: false },
  ]);
  // A patch without groups leaves checks alone.
  await repo.strategies.update(S, 'str-1', { name: 'ORB' });
  expect((await repo.trades.get(S, 'f-1'))?.ruleChecks).toHaveLength(2);
});

test('removing a strategy takes it out of its trades and drops its rule checks there', async () => {
  const { repo, db } = setup();
  await withTwoStrategies(repo, db, ['f-1', 'f-2', 'f-3']);
  // The same strategy id in My workspace is another strategy.
  await db.trades.put(
    makeTrade({
      id: 'f-1',
      workspaceId: M,
      net: 100,
      strategyIds: ['str-1'],
      ruleChecks: [{ ruleId: 'r-1', followed: true }],
    }),
  );
  await repo.strategies.remove(S, 'str-1');
  for (const id of ['f-1', 'f-2', 'f-3']) {
    const trade = await repo.trades.get(S, id);
    expect(trade?.strategyIds).toEqual(['str-2']);
    expect(trade?.ruleChecks).toEqual([{ ruleId: 'r-9', followed: false }]);
  }
  expect(await repo.strategies.get(S, 'str-1')).toBeUndefined();
  expect((await repo.trades.get(M, 'f-1'))?.strategyIds).toEqual(['str-1']);
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

test('tag names are stored trimmed and lowercase; creating one again returns it', async () => {
  const { repo } = setup();
  const created = await repo.tags.create(S, {
    name: ' FOMO ',
    categoryId: 'setups',
  });
  expect(created.name).toBe('fomo');
  const again = await repo.tags.create(S, {
    name: 'Fomo',
    categoryId: 'setups',
  });
  expect(again).toEqual(created);
  // A name stored before the rule, in another case, is found too.
  expect(
    (await repo.tags.create(S, { name: 'fomo', categoryId: 'mistakes' })).id,
  ).toBe('tag-fomo');
  expect(await repo.tags.list(S)).toHaveLength(3);
  await expect(
    repo.tags.create(S, { name: 'x', categoryId: 'nope' }),
  ).rejects.toBeInstanceOf(NotFoundError);

  // Renaming or moving onto a taken name in the category is refused.
  const dup = repo.tags.update(S, 'tag-setup', { name: 'FOMO' });
  await expect(dup).rejects.toBeInstanceOf(DuplicateNameError);
  await expect(dup).rejects.toMatchObject({ duplicate: 'fomo' });
  await expect(
    repo.tags.update(S, created.id, { categoryId: 'mistakes' }),
  ).rejects.toBeInstanceOf(DuplicateNameError);
  // Its own name in another case is fine, and the description clears.
  const renamed = await repo.tags.update(S, 'tag-fomo', {
    name: 'FOMO',
    description: undefined,
  });
  expect(renamed.name).toBe('fomo');
  expect(renamed).not.toHaveProperty('description');
});

test('categories: names and colours are checked; a user category takes its tags off every trade', async () => {
  const { repo } = setup();
  await expect(
    repo.tagCategories.create(S, { name: 'Bad', color: 'teal' }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.tagCategories.create(S, { name: ' setups ', color: '#000000' }),
  ).rejects.toBeInstanceOf(DuplicateNameError);
  const renamed = await repo.tagCategories.update(S, 'mistakes', {
    name: ' Errors ',
    color: '#B45309',
  });
  expect(renamed).toMatchObject({
    name: 'Errors',
    color: '#B45309',
    role: 'mistake',
    builtIn: true,
  });

  await repo.trades.update(S, 'f-2', { tagIds: ['tag-setup', 'tag-fomo'] });
  await repo.tagCategories.remove(S, 'setups');
  expect((await repo.trades.get(S, 'f-2'))?.tagIds).toEqual(['tag-fomo']);
  expect((await repo.tags.list(S)).map((t) => t.id)).toEqual(['tag-fomo']);
  expect((await repo.tagCategories.list(S)).map((c) => c.id)).toEqual([
    'custom-tags',
    'mistakes',
  ]);

  await expect(repo.tagCategories.remove(S, 'mistakes')).rejects.toThrow(
    'built-in category',
  );
  expect((await repo.trades.get(S, 'f-1'))?.tagIds).toEqual(['tag-fomo']);
  await expect(repo.tagCategories.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

test('templates: one default per kind, built-ins stay, a removed default falls back', async () => {
  const { repo } = setup({ newId: () => 'tpl-mine' });
  const dailies = async () =>
    (await repo.templates.list(S)).filter((t) => t.kind === 'daily-review');
  const builtIn = (await dailies()).find((t) => t.builtIn)!;
  expect(builtIn).toMatchObject({ name: 'Daily review', isDefault: true });
  expect((await repo.templates.list(S)).map((t) => t.name).sort()).toEqual([
    'Daily review',
    'Pre-market plan',
    'Weekly recap',
  ]);
  await expect(repo.templates.remove(S, builtIn.id)).rejects.toThrow(
    'built-in template',
  );

  const mine = await repo.templates.save(S, {
    name: 'Short daily',
    kind: 'daily-review',
    body: { type: 'doc', content: [] },
    isDefault: false,
  });
  expect(mine).toMatchObject({
    id: 'tpl-mine',
    workspaceId: S,
    builtIn: false,
  });
  await repo.templates.setDefault(S, mine.id);
  const defaults = (await dailies()).filter((t) => t.isDefault);
  expect(defaults.map((t) => t.id)).toEqual(['tpl-mine']);
  // Other kinds keep their defaults.
  expect(
    (await repo.templates.list(S)).filter((t) => t.isDefault),
  ).toHaveLength(3);

  await repo.templates.remove(S, mine.id);
  expect((await dailies()).map((t) => [t.id, t.isDefault])).toEqual([
    [builtIn.id, true],
  ]);
  await expect(repo.templates.setDefault(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

test('trash and restore round-trip; Trash is purged after 30 days', async () => {
  const now = new Date('2026-11-20T12:00:00.000Z');
  const { repo, db } = setup({ now: () => now });
  await repo.journal.trash(S, 'j-1');
  expect((await repo.journal.get(S, 'j-1'))?.deletedAt).toBe(now.toISOString());
  await repo.journal.restore(S, 'j-1');
  const back = await repo.journal.get(S, 'j-1');
  expect(back).not.toHaveProperty('deletedAt');
  expect(back?.title).toBe('Clean breakout');

  const day = 86_400_000;
  const base = {
    workspaceId: S,
    kind: 'note' as const,
    title: '',
    body: null,
    linkedTradeIds: [],
    tags: [],
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  await db.journal.bulkPut([
    { ...base, id: 'old', deletedAt: new Date(+now - 31 * day).toISOString() },
    {
      ...base,
      id: 'recent',
      deletedAt: new Date(+now - 29 * day).toISOString(),
    },
  ]);
  await db.trades.update([S, 'f-2'], { noteId: 'old' });
  const ids = (await repo.journal.list(S)).map((e) => e.id);
  expect(ids).toContain('recent');
  expect(ids).not.toContain('old');
  expect(await db.journal.get([S, 'old'])).toBeUndefined();
  expect(await repo.trades.get(S, 'f-2')).not.toHaveProperty('noteId');
  await expect(repo.journal.trash(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

test('listForTrade leaves out a trade note in Trash', async () => {
  const { repo } = setup({ newId: () => 'note-f2' });
  const note = await repo.journal.ensureTradeNote(S, 'f-2');
  expect((await repo.journal.listForTrade(S, 'f-2')).map((e) => e.id)).toEqual([
    note.id,
  ]);
  await repo.journal.trash(S, note.id);
  expect(await repo.journal.listForTrade(S, 'f-2')).toEqual([]);
  await repo.journal.restore(S, note.id);
  expect((await repo.journal.listForTrade(S, 'f-2')).map((e) => e.id)).toEqual([
    note.id,
  ]);
});

test('the purge deletes an expired trade note and clears noteId on its trade', async () => {
  const now = new Date('2026-11-20T12:00:00.000Z');
  const day = 86_400_000;
  const { repo, make } = setup({ now: () => now, newId: () => 'note-f2' });
  const note = await repo.journal.ensureTradeNote(S, 'f-2');
  await repo.journal.trash(S, note.id);
  // 29 days on it is still waiting in Trash, and still linked.
  const soon = make({ now: () => new Date(+now + 29 * day) });
  expect((await soon.journal.list(S)).map((e) => e.id)).toContain(note.id);
  expect((await soon.trades.get(S, 'f-2'))?.noteId).toBe(note.id);
  // After 30 days it is gone, and the trade no longer points at it.
  const after = make({
    now: () => new Date(+now + 31 * day),
    newId: () => 'note-again',
  });
  expect((await after.journal.list(S)).map((e) => e.id)).not.toContain(note.id);
  expect(await after.trades.get(S, 'f-2')).not.toHaveProperty('noteId');
  // The trade gets a fresh note when it is next opened.
  expect((await after.journal.ensureTradeNote(S, 'f-2')).id).toBe('note-again');
});

test('ensureTradeNote creates one trade note and links it', async () => {
  const { repo } = setup({ newId: () => 'note-f2' });
  await repo.prefs.update({ timeZone: 'America/New_York' });
  const first = await repo.journal.ensureTradeNote(S, 'f-2');
  const second = await repo.journal.ensureTradeNote(S, 'f-2');
  expect(second.id).toBe(first.id);
  expect(first).toMatchObject({
    kind: 'trade-note',
    title: 'ESZ5 : 17 Nov 2026',
    date: '2026-11-17',
    linkedTradeIds: ['f-2'],
    tags: [],
  });
  expect((await repo.trades.get(S, 'f-2'))?.noteId).toBe(first.id);
  // A trade with a note keeps it.
  expect((await repo.journal.ensureTradeNote(S, 'f-1')).id).toBe('j-1');
  await expect(repo.journal.ensureTradeNote(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

test('dailyNote opens the day, creating it from the default daily template', async () => {
  let n = 0;
  const { repo } = setup({ newId: () => `daily-${++n}` });
  const template = (await repo.templates.list(S)).find(
    (t) => t.kind === 'daily-review' && t.isDefault,
  )!;
  const first = await repo.journal.dailyNote(S, '2026-11-19');
  const second = await repo.journal.dailyNote(S, '2026-11-19');
  expect(second.id).toBe(first.id);
  expect(first).toMatchObject({
    kind: 'daily-review',
    date: '2026-11-19',
    body: template.body,
    tags: [],
  });
  expect(
    (await repo.journal.list(S)).filter(
      (e) => e.kind === 'daily-review' && e.date === '2026-11-19',
    ),
  ).toHaveLength(1);
  await expect(repo.journal.dailyNote(S, '2026-02-30')).rejects.toBeInstanceOf(
    RangeError,
  );
});

test('updateMany patches exactly the given trades', async () => {
  const { repo } = setup();
  const updated = await repo.trades.updateMany(S, ['f-1', 'f-3'], {
    reviewed: true,
  });
  expect(updated.map((t) => [t.id, t.reviewed])).toEqual([
    ['f-1', true],
    ['f-3', true],
  ]);
  expect((await repo.trades.list(S)).map((t) => t.reviewed)).toEqual([
    true,
    undefined,
    true,
  ]);
  const byTrade = await repo.trades.updateMany(S, ['f-2'], (t) => ({
    rating: t.net < 0 ? 1 : 5,
  }));
  expect(byTrade[0]?.rating).toBe(1);
  await expect(
    repo.trades.updateMany(S, ['f-1', 'nope'], { reviewed: false }),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect((await repo.trades.get(S, 'f-1'))?.reviewed).toBe(true);
});

test('manual trades: created at the next serial, rebuilt keeping the journal, refused when they do not add up', async () => {
  const { repo } = setup({ newId: () => 'm-1' });
  const inst = (await repo.trades.get(S, 'f-1'))!.instrument;
  const t = (hour: number) =>
    `2026-11-19T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const fills = (qty: number) => [
    {
      time: t(14),
      side: 'buy' as const,
      qty: 2,
      price: 100,
      commission: 0,
      fees: 0,
    },
    {
      time: t(15),
      side: 'sell' as const,
      qty,
      price: 101,
      commission: 0,
      fees: 0,
    },
  ];
  const before = (await repo.trades.list(S)).length;
  const top = Math.max(...(await repo.trades.list(S)).map((x) => x.serial));

  const made = await repo.trades.createManual(S, {
    accountId: 'acc-a',
    instrument: inst,
    fills: fills(2),
  });
  expect(made).toMatchObject({
    id: 'manual:m-1',
    source: 'manual',
    serial: top + 1,
  });
  expect((await repo.trades.list(S)).length).toBe(before + 1);

  await repo.trades.update(S, made.id, {
    tagIds: ['tg'],
    rating: 4,
    reviewed: true,
  });
  const rebuilt = await repo.trades.replaceManual(S, made.id, {
    accountId: 'acc-a',
    instrument: inst,
    fills: fills(1),
  });
  expect(rebuilt).toMatchObject({
    id: made.id,
    serial: made.serial,
    status: 'open',
    tagIds: ['tg'],
    rating: 4,
    reviewed: true,
  });

  const rejected = repo.trades.createManual(S, {
    accountId: 'acc-a',
    instrument: inst,
    fills: [],
  });
  await expect(rejected).rejects.toBeInstanceOf(ManualTradeRejected);
  await expect(rejected).rejects.toMatchObject({ error: 'no-fills' });
  expect((await repo.trades.list(S)).length).toBe(before + 1);
  await expect(
    repo.trades.replaceManual(S, 'f-1', {
      accountId: 'acc-a',
      instrument: inst,
      fills: fills(2),
    }),
  ).rejects.toThrow('only manual trades');
});

test('journal.save creates, then replaces, stamping updatedAt', async () => {
  let clock = new Date('2026-11-20T10:00:00.000Z');
  const { repo } = setup({ now: () => clock, newId: () => 'j-new' });
  const created = await repo.journal.save(S, {
    kind: 'note',
    title: 'First',
    body: null,
    linkedTradeIds: ['f-2'],
    tags: [],
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
    tags: [],
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
    tags: [],
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
    tags: [],
    updatedAt: '2026-11-20T00:00:00.000Z',
  });
  await expect(repo.trades.remove(S, ['f-2'])).rejects.toThrow();
  expect(await repo.trades.get(S, 'f-2')).toBeDefined();
  await expect(repo.accounts.clearTrades(S, 'acc-a')).rejects.toThrow();
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
    categoryId: undefined,
  });
  expect(tag).toMatchObject({ name: 'FOMO', categoryId: 'mistakes' });
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

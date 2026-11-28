import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test, vi } from 'vitest';
import { resolveInstrument } from '@/domain/instruments';
import type { HistoryRow } from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import {
  ArchivedAccountError,
  ManualTradeRejected,
  type ManualTradeInput,
} from '../repository';
import { KeelDb } from './db';
import { fieldChanges, HISTORY_DAYS } from './history';
import { createLocalRepository } from './local-repository';

const S = 'sample';
const M = 'mine';
const DAY = 86_400_000;

/** The clock is ours to move; every row's time is read from it. */
function setup(start = '2026-11-20T15:00:00.000Z') {
  let clock = new Date(start);
  const indexedDB = new IDBFactory();
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    now: () => clock,
    // `f-2` starts rated 3, so a rating edit has a before value.
    sample: async () => {
      const sample = fixtureSample();
      sample.trades.find((t) => t.id === 'f-2')!.rating = 3;
      return sample;
    },
  });
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  return {
    repo,
    db,
    at: (iso: string) => {
      clock = new Date(iso);
    },
    /** Every stored row, oldest to newest, with the volatile ids dropped. */
    rows: async (ws = S) =>
      (await db.history.where('workspaceId').equals(ws).sortBy('at')).map(
        (row): Partial<HistoryRow> => {
          const rest: Partial<HistoryRow> = { ...row };
          delete rest.id;
          delete rest.workspaceId;
          return rest;
        },
      ),
  };
}

const input = (over: Partial<ManualTradeInput> = {}): ManualTradeInput => ({
  accountId: 'acc-a',
  instrument: resolveInstrument('ESZ5')!,
  fills: [
    {
      time: '2026-11-20T02:00:00.000Z',
      side: 'buy',
      qty: 1,
      price: 6000,
      commission: 0,
      fees: 0,
    },
    {
      time: '2026-11-20T03:00:00.000Z',
      side: 'sell',
      qty: 1,
      price: 6005,
      commission: 0,
      fees: 0,
    },
  ],
  ...over,
});

test('fieldChanges lists only changed fields', () => {
  const before = { rating: 3, reviewed: false, noteId: 'n-1', swap: 5 };
  const after = { rating: 4, reviewed: true, noteId: 'n-1', swap: 5 };
  expect(fieldChanges(before, after, ['rating', 'reviewed', 'noteId'])).toEqual(
    [
      { field: 'rating', oldValue: 3, newValue: 4 },
      { field: 'reviewed', oldValue: false, newValue: true },
    ],
  );
  expect(fieldChanges(before, before, ['rating', 'reviewed'])).toEqual([]);
  // A field outside the list is never looked at.
  expect(fieldChanges(before, after, ['swap'])).toEqual([]);
});

test('fieldChanges logs arrays as joined ids, levels as JSON and a missing value as null', () => {
  type Shape = {
    tagIds: string[];
    rating?: number;
    targets?: { unit: string; levels: { value: number; qty: number }[] };
  };
  const before: Shape = { tagIds: ['a', 'b'] };
  const after: Shape = {
    tagIds: ['a', 'b', 'c'],
    rating: 2,
    targets: { unit: 'price', levels: [{ value: 6010, qty: 1 }] },
  };
  expect(fieldChanges(before, after, ['tagIds', 'rating', 'targets'])).toEqual([
    { field: 'tagIds', oldValue: 'a,b', newValue: 'a,b,c' },
    { field: 'rating', oldValue: null, newValue: 2 },
    {
      field: 'targets',
      oldValue: null,
      newValue: '{"unit":"price","levels":[{"value":6010,"qty":1}]}',
    },
  ]);
  // A new array with the same ids is not a change, and an emptied list reads as an empty string.
  expect(
    fieldChanges({ tagIds: ['a'] }, { tagIds: ['a'] }, ['tagIds']),
  ).toEqual([]);
  expect(fieldChanges({ tagIds: ['a'] }, { tagIds: [] }, ['tagIds'])).toEqual([
    { field: 'tagIds', oldValue: 'a', newValue: '' },
  ]);
});

test('an update writes one row per changed field', async () => {
  const { repo, rows } = setup();
  await repo.prefs.update({ timeZone: 'America/New_York' });
  await repo.trades.update(S, 'f-2', { rating: 4, reviewed: true });
  const written = await rows();
  expect(written).toHaveLength(2);
  expect(written).toEqual(
    expect.arrayContaining([
      {
        at: '2026-11-20T15:00:00.000Z',
        type: 'trade',
        action: 'edited',
        source: 'you',
        entityId: 'f-2',
        label: 'ESZ5 2026-11-17',
        field: 'rating',
        oldValue: 3,
        newValue: 4,
      },
      {
        at: '2026-11-20T15:00:00.000Z',
        type: 'trade',
        action: 'edited',
        source: 'you',
        entityId: 'f-2',
        label: 'ESZ5 2026-11-17',
        field: 'reviewed',
        // A trade never marked reviewed reads as not reviewed.
        oldValue: false,
        newValue: true,
      },
    ]),
  );
});

test('an update logs only the fields the trade really changed', async () => {
  const { repo, rows } = setup();
  // Same rating, a new list of the same tags, and a rule check (not a logged field).
  await repo.trades.update(S, 'f-2', {
    rating: 3,
    tagIds: [],
    ruleChecks: [{ ruleId: 'r-1', followed: true }],
  });
  expect(await rows()).toEqual([]);
  // Changing strategies logs the strategy field and not the rule checks it drops.
  await repo.trades.update(S, 'f-1', {
    strategyIds: [],
    tagIds: ['tag-setup'],
  });
  expect(
    (await rows()).map((r) => [r.entityId, r.field, r.oldValue, r.newValue]),
  ).toEqual(
    expect.arrayContaining([
      ['f-1', 'strategyIds', 'str-1', ''],
      ['f-1', 'tagIds', 'tag-fomo', 'tag-setup'],
    ]),
  );
});

test('reviewed reads as No until it is set, so setting it to No logs nothing', async () => {
  const { repo, rows } = setup();
  await repo.trades.update(S, 'f-2', { reviewed: false });
  expect(await rows()).toEqual([]);
  await repo.trades.update(S, 'f-2', { reviewed: undefined });
  expect(await rows()).toEqual([]);
});

test('the first save of one side of a legacy trade logs that side only', async () => {
  const { repo, db, rows } = setup();
  const t = (await repo.trades.get(S, 'f-2'))!;
  // The shape every trade had before levels: one stop and one target price.
  const legacy = { ...t, plannedStop: 5990, plannedTarget: 6020 };
  delete legacy.targets;
  delete legacy.stops;
  await db.trades.put(legacy);
  const size = t.maxPosition;

  await repo.trades.update(S, 'f-2', {
    targets: { unit: 'price', levels: [{ value: 6030, qty: size }] },
  });

  // The stop moved into levels untouched: no row for it.
  expect(
    (await rows()).map((r) => [r.field, r.oldValue, r.newValue]),
  ).toEqual([
    [
      'targets',
      `{"unit":"price","levels":[{"value":6020,"qty":${size}}]}`,
      `{"unit":"price","levels":[{"value":6030,"qty":${size}}]}`,
    ],
  ]);
  expect((await repo.trades.get(S, 'f-2'))!.stops).toEqual({
    unit: 'price',
    levels: [{ value: 5990, qty: size }],
  });
});

test('the label reads the open date in the profile time zone', async () => {
  const { repo, rows } = setup();
  await repo.prefs.update({ timeZone: 'Pacific/Auckland' });
  // f-2 opened 2026-11-17T15:00Z: already the 18th in Auckland.
  await repo.trades.update(S, 'f-2', { reviewed: true });
  expect((await rows())[0]!.label).toBe('ESZ5 2026-11-18');
});

test('updateMany logs each trade it changes and skips those it leaves as they were', async () => {
  const { repo, rows } = setup();
  await repo.trades.updateMany(S, ['f-1', 'f-2'], { rating: 4 });
  // f-1 was already rated 4.
  expect(
    (await rows()).map((r) => [r.entityId, r.field, r.oldValue, r.newValue]),
  ).toEqual([['f-2', 'rating', 3, 4]]);
});

test('a failed write leaves no row', async () => {
  const { repo, rows } = setup();
  await expect(
    repo.trades.update(S, 'f-3', { rating: 2 }),
  ).rejects.toBeInstanceOf(ArchivedAccountError);
  // f-1 would change; f-3 is archived, so the whole write is refused.
  await expect(
    repo.trades.updateMany(S, ['f-1', 'f-3'], { rating: 1 }),
  ).rejects.toBeInstanceOf(ArchivedAccountError);
  await expect(repo.trades.remove(S, ['f-1', 'f-3'])).rejects.toBeInstanceOf(
    ArchivedAccountError,
  );
  await expect(
    repo.trades.createManual(S, input({ accountId: 'acc-b' })),
  ).rejects.toBeInstanceOf(ArchivedAccountError);
  await expect(
    repo.trades.createManual(S, input({ fills: [] })),
  ).rejects.toBeInstanceOf(ManualTradeRejected);
  expect(await rows()).toEqual([]);
});

test('a row that cannot be written takes its change back with it', async () => {
  const { repo } = setup();
  // Two rows with one id: the second cannot be written.
  const ids = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
  try {
    await expect(
      repo.trades.update(S, 'f-1', { rating: 1, reviewed: true }),
    ).rejects.toThrow(/history\.bulkAdd/);
  } finally {
    ids.mockRestore();
  }
  expect((await repo.trades.get(S, 'f-1'))?.rating).toBe(4);
  expect((await repo.trades.get(S, 'f-1'))?.reviewed).toBeUndefined();
  expect(await repo.history.list(S)).toEqual([]);
});

test('a fixed id generator neither collides the rows nor shifts the records ids', async () => {
  const indexedDB = new IDBFactory();
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: async () => fixtureSample(),
    newId: () => 'fixed',
  });
  const made = await repo.trades.createManual(S, input());
  expect(made.id).toBe('manual:fixed');
  await repo.trades.update(S, made.id, { rating: 4, reviewed: true });
  await repo.trades.update(S, made.id, { rating: 5 });
  expect(await repo.history.list(S)).toHaveLength(4);
});

test('createManual logs one created row, labelled with the local open date', async () => {
  const { repo, rows } = setup();
  await repo.prefs.update({ timeZone: 'America/New_York' });
  // Opened 2026-11-20T02:00Z: still the 19th in New York.
  const trade = await repo.trades.createManual(S, input());
  expect(await rows()).toEqual([
    {
      at: '2026-11-20T15:00:00.000Z',
      type: 'trade',
      action: 'created',
      source: 'you',
      entityId: trade.id,
      label: 'ESZ5 2026-11-19',
    },
  ]);
});

test('replaceManual logs the fields it changes, fills as a count', async () => {
  const { repo, rows, at } = setup();
  await repo.prefs.update({ timeZone: 'America/New_York' });
  const trade = await repo.trades.createManual(S, input());
  at('2026-11-21T09:00:00.000Z');
  const [open, close] = input().fills;
  await repo.trades.replaceManual(
    S,
    trade.id,
    input({
      fills: [
        { ...open!, qty: 2 },
        { ...close!, qty: 1, time: '2026-11-20T03:00:00.000Z' },
        { ...close!, qty: 1, time: '2026-11-20T03:30:00.000Z' },
      ],
    }),
  );
  expect((await rows()).slice(1)).toEqual([
    {
      at: '2026-11-21T09:00:00.000Z',
      type: 'trade',
      action: 'edited',
      source: 'you',
      entityId: trade.id,
      label: 'ESZ5 2026-11-19',
      field: 'fills',
      oldValue: 2,
      newValue: 3,
    },
  ]);
});

test('replaceManual logs a rebuilt fill even when the count stays', async () => {
  const { repo, rows, at } = setup();
  const trade = await repo.trades.createManual(S, input());
  at('2026-11-21T09:00:00.000Z');
  const [open, close] = input().fills;
  await repo.trades.replaceManual(
    S,
    trade.id,
    input({ fills: [open!, { ...close!, price: 6010 }] }),
  );
  expect((await rows()).slice(1)).toMatchObject([
    { action: 'edited', field: 'fills', oldValue: 2, newValue: 2 },
  ]);
  // Nothing changed at all: nothing to say.
  await repo.trades.replaceManual(
    S,
    trade.id,
    input({ fills: [open!, { ...close!, price: 6010 }] }),
  );
  expect(await rows()).toHaveLength(2);
});

test('replaceManual logs a move to another account', async () => {
  const { repo, rows, db, at } = setup();
  await db.open();
  const trade = await repo.trades.createManual(S, input());
  await db.accounts.put({
    ...(await db.accounts.get([S, 'acc-a']))!,
    id: 'acc-c',
    name: 'Second',
  });
  at('2026-11-21T09:00:00.000Z');
  await repo.trades.replaceManual(S, trade.id, input({ accountId: 'acc-c' }));
  expect(
    (await rows()).slice(1).map((r) => [r.field, r.oldValue, r.newValue]),
  ).toEqual([['accountId', 'acc-a', 'acc-c']]);
});

test('remove logs one deleted row per trade it deletes', async () => {
  const { repo, rows } = setup();
  await repo.prefs.update({ timeZone: 'America/New_York' });
  // `nope` is no trade: ignored, as the write ignores it.
  await repo.trades.remove(S, ['f-1', 'f-2', 'nope']);
  const written = await rows();
  expect(written).toHaveLength(2);
  expect(written).toEqual(
    expect.arrayContaining([
      {
        at: '2026-11-20T15:00:00.000Z',
        type: 'trade',
        action: 'deleted',
        source: 'you',
        entityId: 'f-1',
        label: 'ESZ5 2026-11-16',
      },
      {
        at: '2026-11-20T15:00:00.000Z',
        type: 'trade',
        action: 'deleted',
        source: 'you',
        entityId: 'f-2',
        label: 'ESZ5 2026-11-17',
      },
    ]),
  );
});

test('history is kept per workspace', async () => {
  const { repo } = setup();
  await repo.trades.update(S, 'f-2', { rating: 4 });
  expect(await repo.history.list(M)).toEqual([]);
  expect(await repo.history.list(S)).toHaveLength(1);
});

test('list is newest first', async () => {
  const { repo, at } = setup('2026-11-20T09:00:00.000Z');
  await repo.trades.update(S, 'f-2', { rating: 4 });
  at('2026-11-20T11:00:00.000Z');
  await repo.trades.update(S, 'f-2', { rating: 5 });
  at('2026-11-20T10:00:00.000Z');
  await repo.trades.update(S, 'f-1', { rating: 2 });
  expect((await repo.history.list(S)).map((r) => [r.at, r.newValue])).toEqual([
    ['2026-11-20T11:00:00.000Z', 5],
    ['2026-11-20T10:00:00.000Z', 2],
    ['2026-11-20T09:00:00.000Z', 4],
  ]);
});

test('list purges rows older than 30 days', async () => {
  const { repo, db, at } = setup('2026-10-01T12:00:00.000Z');
  expect(HISTORY_DAYS).toBe(30);
  await repo.trades.update(S, 'f-2', { rating: 4 });
  at('2026-10-21T12:00:00.000Z');
  await repo.trades.update(S, 'f-2', { rating: 5 });
  at('2026-10-22T12:00:00.000Z');
  await repo.trades.update(S, 'f-1', { rating: 1 });
  // 30 days after the first row, to the millisecond: kept.
  const edge = new Date(Date.parse('2026-10-01T12:00:00.000Z') + 30 * DAY);
  at(edge.toISOString());
  expect(await repo.history.list(S)).toHaveLength(3);
  // One millisecond later it is older than 30 days.
  at(new Date(edge.getTime() + 1).toISOString());
  const kept = await repo.history.list(S);
  expect(kept.map((r) => r.newValue)).toEqual([1, 5]);
  // The purge deletes the rows, it does not only hide them.
  await db.open();
  expect(await db.history.count()).toBe(2);
});

test('the purge reaches only the listed workspace', async () => {
  const { repo, db, at } = setup('2026-10-01T12:00:00.000Z');
  await repo.trades.update(S, 'f-2', { rating: 4 });
  at('2026-12-15T12:00:00.000Z');
  expect(await repo.history.list(M)).toEqual([]);
  await db.open();
  expect(await db.history.count()).toBe(1);
  expect(await repo.history.list(S)).toEqual([]);
  expect(await db.history.count()).toBe(0);
});

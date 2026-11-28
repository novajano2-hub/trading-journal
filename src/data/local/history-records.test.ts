import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, test, vi } from 'vitest';
import type { HistoryRow } from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import { DuplicateNameError, NotFoundError } from '../repository';
import { KeelDb } from './db';
import { createLocalRepository } from './local-repository';

const S = 'sample';
const T0 = '2026-11-20T15:00:00.000Z';
const T1 = '2026-11-20T16:00:00.000Z';
const T2 = '2026-11-20T17:00:00.000Z';
const T3 = '2026-11-20T18:00:00.000Z';

/** The clock is ours to move; every row's time is read from it. */
function setup() {
  let clock = new Date(T0);
  const indexedDB = new IDBFactory();
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    now: () => clock,
    sample: async () => fixtureSample(),
  });
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  return {
    repo,
    db,
    at: (iso: string) => {
      clock = new Date(iso);
    },
    /** Every stored row of the sample, by time, record and field, without the volatile ids. */
    rows: async (ws = S) =>
      (await db.history.where('workspaceId').equals(ws).toArray())
        .sort(
          (a, b) =>
            a.at.localeCompare(b.at) ||
            a.entityId.localeCompare(b.entityId) ||
            (a.field ?? '').localeCompare(b.field ?? ''),
        )
        .map((row): Partial<HistoryRow> => {
          const rest: Partial<HistoryRow> = { ...row };
          delete rest.id;
          delete rest.workspaceId;
          return rest;
        }),
  };
}

/** A row as the repositories write it for you. */
const row = (r: Partial<HistoryRow>): Partial<HistoryRow> => ({
  source: 'you',
  ...r,
});

// ---- Accounts ---------------------------------------------------------------

test('account create, edit and delete each log', async () => {
  const { repo, rows, at } = setup();
  const made = await repo.accounts.create(S, {
    name: 'Swing',
    broker: 'IBKR',
    type: 'live',
    currency: 'USD',
    startingBalance: 1_000_000,
    status: 'active',
  });
  at(T1);
  await repo.accounts.update(S, made.id, {
    name: 'Swing 2',
    startingBalance: 2_000_000,
    status: 'archived',
  });
  at(T2);
  // Neither the time zone nor a value left as it was is a logged change.
  await repo.accounts.update(S, made.id, {
    timeZone: 'Asia/Tokyo',
    broker: 'IBKR',
  });
  at(T3);
  await repo.accounts.remove(S, made.id);
  const id = made.id;
  expect(await rows()).toEqual([
    row({
      at: T0,
      type: 'account',
      action: 'created',
      entityId: id,
      label: 'Swing',
    }),
    row({
      at: T1,
      type: 'account',
      action: 'edited',
      entityId: id,
      label: 'Swing 2',
      field: 'name',
      oldValue: 'Swing',
      newValue: 'Swing 2',
    }),
    row({
      at: T1,
      type: 'account',
      action: 'edited',
      entityId: id,
      label: 'Swing 2',
      field: 'startingBalance',
      oldValue: 1_000_000,
      newValue: 2_000_000,
    }),
    row({
      at: T1,
      type: 'account',
      action: 'edited',
      entityId: id,
      label: 'Swing 2',
      field: 'status',
      oldValue: 'active',
      newValue: 'archived',
    }),
    row({
      at: T3,
      type: 'account',
      action: 'deleted',
      entityId: id,
      label: 'Swing 2',
    }),
  ]);
});

test('every logged account field logs when it changes', async () => {
  const { repo, rows } = setup();
  await repo.accounts.update(S, 'acc-a', {
    broker: 'Other broker',
    type: 'demo',
    currency: 'EUR',
  });
  expect((await rows()).map((r) => [r.field, r.oldValue, r.newValue])).toEqual([
    ['broker', 'Sample broker', 'Other broker'],
    ['currency', 'USD', 'EUR'],
    ['type', 'live', 'demo'],
  ]);
});

test('a change of cost method logs one row', async () => {
  const { repo, rows, at } = setup();
  // acc-a has no method stored: FIFO, the default, reads as `fifo`.
  await repo.accounts.update(S, 'acc-a', { costMethod: 'lifo' });
  at(T1);
  // The same method again, or a method sent with nothing else changed, logs nothing.
  await repo.accounts.update(S, 'acc-a', { costMethod: 'lifo' });
  at(T2);
  await repo.accounts.update(S, 'acc-a', { costMethod: 'fifo' });
  at(T3);
  await repo.accounts.setCostMethod(S, 'acc-a', 'average');
  const edit = (at: string, oldValue: string, newValue: string) =>
    row({
      at,
      type: 'account',
      action: 'edited',
      entityId: 'acc-a',
      label: 'Futures main',
      field: 'costMethod',
      oldValue,
      newValue,
    });
  expect(await rows()).toEqual([
    edit(T0, 'fifo', 'lifo'),
    edit(T2, 'lifo', 'fifo'),
    edit(T3, 'fifo', 'average'),
  ]);
});

test('clearing an account logs one row for it, not one per trade', async () => {
  const { repo, rows, at } = setup();
  expect(await repo.accounts.clearTrades(S, 'acc-a')).toBe(2);
  expect(await rows()).toEqual([
    row({
      at: T0,
      type: 'account',
      action: 'edited',
      entityId: 'acc-a',
      label: 'Futures main',
      field: 'trades',
      oldValue: 2,
      newValue: 0,
    }),
  ]);
  // Nothing left to clear: nothing to log.
  at(T1);
  expect(await repo.accounts.clearTrades(S, 'acc-a')).toBe(0);
  expect(await rows()).toHaveLength(1);
});

test('removing an account logs the account, not the cash flows that go with it', async () => {
  const { repo, rows, at } = setup();
  const made = await repo.accounts.create(S, {
    name: 'Empty',
    broker: '',
    type: 'demo',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  at(T1);
  await repo.cashFlows.create(S, {
    accountId: made.id,
    date: '2026-11-05',
    amount: 5_000,
  });
  at(T2);
  await repo.accounts.remove(S, made.id);
  expect((await rows()).map((r) => [r.type, r.action])).toEqual([
    ['account', 'created'],
    ['cash-flow', 'created'],
    ['account', 'deleted'],
  ]);
});

test('a failed account write leaves no row', async () => {
  const { repo, rows } = setup();
  await expect(repo.accounts.remove(S, 'acc-a')).rejects.toThrow(
    'account has trades',
  );
  await expect(repo.accounts.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
  await expect(
    repo.accounts.update(S, 'nope', { name: 'x' }),
  ).rejects.toBeInstanceOf(NotFoundError);
  await expect(repo.accounts.clearTrades(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
  expect(await rows()).toEqual([]);
});

test('a row that cannot be written takes the account change back with it', async () => {
  const { repo } = setup();
  // Two rows with one id: the second cannot be written.
  const ids = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
  try {
    await expect(
      repo.accounts.update(S, 'acc-a', { name: 'Renamed', broker: 'Other' }),
    ).rejects.toThrow(/history\.bulkAdd/);
  } finally {
    ids.mockRestore();
  }
  expect((await repo.accounts.list(S))[0]).toMatchObject({
    name: 'Futures main',
    broker: 'Sample broker',
  });
  expect(await repo.history.list(S)).toEqual([]);
});

test('a row that cannot be written takes any logged write back with it', async () => {
  let n = 0;
  const indexedDB = new IDBFactory();
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: async () => fixtureSample(),
    // The records' ids stay ours while the row ids are made to fail.
    newId: () => `id-${++n}`,
  });
  const flow = await repo.cashFlows.create(S, {
    accountId: 'acc-a',
    date: '2026-11-05',
    amount: 100,
  });
  const empty = await repo.accounts.create(S, {
    name: 'Empty',
    broker: '',
    type: 'demo',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  const made = await repo.strategies.create(S, {
    name: 'Fade',
    description: '',
    assetClasses: ['future'],
    groups: [],
    checklist: [],
    status: 'active',
  });
  const state = async () =>
    JSON.stringify([
      await repo.accounts.list(S),
      await repo.cashFlows.list(S),
      await repo.strategies.list(S),
      await repo.tags.list(S),
      await repo.tagCategories.list(S),
      await repo.trades.list(S),
    ]);
  const before = await state();
  const rowsBefore = (await repo.history.list(S)).length;
  const ids = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    throw new Error('no row id');
  });
  try {
    const writes: [string, () => Promise<unknown>][] = [
      [
        'accounts.create',
        () =>
          repo.accounts.create(S, {
            name: 'New',
            broker: '',
            type: 'demo',
            currency: 'USD',
            startingBalance: 0,
            status: 'active',
          }),
      ],
      [
        'accounts.update',
        () => repo.accounts.update(S, 'acc-a', { name: 'x' }),
      ],
      ['accounts.remove', () => repo.accounts.remove(S, empty.id)],
      ['accounts.clearTrades', () => repo.accounts.clearTrades(S, 'acc-a')],
      [
        'cashFlows.create',
        () =>
          repo.cashFlows.create(S, {
            accountId: 'acc-a',
            date: '2026-11-06',
            amount: 5,
          }),
      ],
      [
        'cashFlows.update',
        () => repo.cashFlows.update(S, flow.id, { amount: 200 }),
      ],
      ['cashFlows.remove', () => repo.cashFlows.remove(S, flow.id)],
      [
        'strategies.create',
        () =>
          repo.strategies.create(S, {
            name: 'New',
            description: '',
            assetClasses: [],
            groups: [],
            checklist: [],
            status: 'active',
          }),
      ],
      [
        'strategies.update',
        () => repo.strategies.update(S, made.id, { name: 'x' }),
      ],
      ['strategies.remove', () => repo.strategies.remove(S, 'str-1')],
      [
        'tags.create',
        () => repo.tags.create(S, { name: 'new', categoryId: 'setups' }),
      ],
      ['tags.update', () => repo.tags.update(S, 'tag-fomo', { name: 'x' })],
      ['tags.remove', () => repo.tags.remove(S, 'tag-fomo')],
      [
        'tagCategories.create',
        () => repo.tagCategories.create(S, { name: 'New', color: '#112233' }),
      ],
      [
        'tagCategories.update',
        () => repo.tagCategories.update(S, 'setups', { name: 'x' }),
      ],
      ['tagCategories.remove', () => repo.tagCategories.remove(S, 'setups')],
    ];
    for (const [name, write] of writes)
      await expect(write(), name).rejects.toThrow('no row id');
  } finally {
    ids.mockRestore();
  }
  expect(await state()).toBe(before);
  expect(await repo.history.list(S)).toHaveLength(rowsBefore);
});

// ---- Cash flows -------------------------------------------------------------

test('cash flow create, edit and delete each log', async () => {
  const { repo, rows, at } = setup();
  const made = await repo.cashFlows.create(S, {
    accountId: 'acc-a',
    date: '2026-11-05',
    amount: 100_000,
    note: ' Top up ',
  });
  at(T1);
  // A deposit becomes a withdrawal: the amount and the kind both change.
  await repo.cashFlows.update(S, made.id, { amount: -50_000, note: undefined });
  at(T2);
  await repo.cashFlows.update(S, made.id, {
    date: '2026-11-06',
    note: '',
    amount: -50_000,
  });
  at(T3);
  await repo.cashFlows.remove(S, made.id);
  const id = made.id;
  expect(await rows()).toEqual([
    row({
      at: T0,
      type: 'cash-flow',
      action: 'created',
      entityId: id,
      label: 'Futures main 2026-11-05',
    }),
    row({
      at: T1,
      type: 'cash-flow',
      action: 'edited',
      entityId: id,
      label: 'Futures main 2026-11-05',
      field: 'amount',
      oldValue: 100_000,
      newValue: -50_000,
    }),
    row({
      at: T1,
      type: 'cash-flow',
      action: 'edited',
      entityId: id,
      label: 'Futures main 2026-11-05',
      field: 'kind',
      oldValue: 'deposit',
      newValue: 'withdrawal',
    }),
    row({
      at: T2,
      type: 'cash-flow',
      action: 'edited',
      entityId: id,
      label: 'Futures main 2026-11-06',
      field: 'at',
      oldValue: '2026-11-05',
      newValue: '2026-11-06',
    }),
    row({
      at: T2,
      type: 'cash-flow',
      action: 'edited',
      entityId: id,
      label: 'Futures main 2026-11-06',
      field: 'note',
      oldValue: 'Top up',
      newValue: null,
    }),
    row({
      at: T3,
      type: 'cash-flow',
      action: 'deleted',
      entityId: id,
      label: 'Futures main 2026-11-06',
    }),
  ]);
});

test('moving a cash flow to another account logs it, under the new account', async () => {
  const { repo, rows, at } = setup();
  const made = await repo.cashFlows.create(S, {
    accountId: 'acc-a',
    date: '2026-11-05',
    amount: 100,
  });
  at(T1);
  await repo.cashFlows.update(S, made.id, { accountId: 'acc-b' });
  expect((await rows()).slice(1)).toEqual([
    row({
      at: T1,
      type: 'cash-flow',
      action: 'edited',
      entityId: made.id,
      label: 'Old demo 2026-11-05',
      field: 'accountId',
      oldValue: 'acc-a',
      newValue: 'acc-b',
    }),
  ]);
});

test('a cash flow edit that changes nothing logged leaves no row; a failed one leaves none either', async () => {
  const { repo, rows, at } = setup();
  const made = await repo.cashFlows.create(S, {
    accountId: 'acc-a',
    date: '2026-11-05',
    amount: 100,
  });
  at(T1);
  await repo.cashFlows.update(S, made.id, { amount: 100, date: '2026-11-05' });
  await expect(
    repo.cashFlows.update(S, made.id, { amount: 0 }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.cashFlows.create(S, {
      accountId: 'nope',
      date: '2026-11-05',
      amount: 100,
    }),
  ).rejects.toBeInstanceOf(NotFoundError);
  await expect(repo.cashFlows.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
  expect(await rows()).toHaveLength(1);
});

// ---- Strategies -------------------------------------------------------------

const group = (texts: string[], title = 'Entry') => ({
  title,
  rules: texts.map((text) => ({ text, showWhen: 'always' as const })),
});

test('strategy create, edit and delete each log', async () => {
  const { repo, rows, at } = setup();
  const made = await repo.strategies.create(S, {
    name: 'Fade',
    description: '',
    assetClasses: ['future'],
    groups: [group(['One', 'Two'])],
    checklist: [],
    status: 'active',
  });
  at(T1);
  await repo.strategies.update(S, made.id, {
    name: 'Fade the open',
    description: 'Fade the first push.',
    status: 'archived',
    icon: 'target',
    photoId: 'photo-1',
  });
  at(T2);
  const grown = await repo.strategies.update(S, made.id, {
    groups: [group(['One', 'Two', 'Three'])],
  });
  at(T3);
  await repo.strategies.remove(S, made.id);
  const id = made.id;
  const edit = (r: Partial<HistoryRow>) =>
    row({
      type: 'strategy',
      action: 'edited',
      entityId: id,
      label: 'Fade the open',
      ...r,
    });
  expect(grown.groups[0]!.rules).toHaveLength(3);
  expect(await rows()).toEqual([
    row({
      at: T0,
      type: 'strategy',
      action: 'created',
      entityId: id,
      label: 'Fade',
    }),
    edit({
      at: T1,
      field: 'description',
      oldValue: '',
      newValue: 'Fade the first push.',
    }),
    edit({ at: T1, field: 'icon', oldValue: null, newValue: 'target' }),
    edit({
      at: T1,
      label: 'Fade the open',
      field: 'name',
      oldValue: 'Fade',
      newValue: 'Fade the open',
    }),
    edit({ at: T1, field: 'photoId', oldValue: null, newValue: 'photo-1' }),
    edit({
      at: T1,
      field: 'status',
      oldValue: 'active',
      newValue: 'archived',
    }),
    edit({ at: T2, field: 'rules', oldValue: 2, newValue: 3 }),
    row({
      at: T3,
      type: 'strategy',
      action: 'deleted',
      entityId: id,
      label: 'Fade the open',
    }),
  ]);
});

test('a strategy edit that changes its rules, not their number, still logs; one that changes nothing does not', async () => {
  const { repo, rows, at } = setup();
  const before = (await repo.strategies.get(S, 'str-1'))!;
  // The same groups sent back as they are stored.
  await repo.strategies.update(S, 'str-1', { groups: before.groups });
  // Fields outside the logged ones: asset classes and checklist.
  await repo.strategies.update(S, 'str-1', {
    assetClasses: ['future', 'option'],
    checklist: ['Something else'],
  });
  expect(await rows()).toEqual([]);
  at(T1);
  await repo.strategies.update(S, 'str-1', {
    groups: [
      {
        id: 'g-entry',
        title: 'Entry',
        rules: [{ id: 'r-1', text: 'Wait for the close', showWhen: 'always' }],
      },
      before.groups[1]!,
    ],
  });
  expect(await rows()).toEqual([
    row({
      at: T1,
      type: 'strategy',
      action: 'edited',
      entityId: 'str-1',
      label: 'Opening range breakout',
      field: 'rules',
      oldValue: 2,
      newValue: 2,
    }),
  ]);
});

test('removing a strategy logs it once, not once per trade it leaves', async () => {
  const { repo, rows } = setup();
  await repo.trades.update(S, 'f-2', { strategyIds: ['str-1'] });
  const written = (await rows()).length;
  await repo.strategies.remove(S, 'str-1');
  const after = await rows();
  expect(after).toHaveLength(written + 1);
  expect(after.at(-1)).toEqual(
    row({
      at: T0,
      type: 'strategy',
      action: 'deleted',
      entityId: 'str-1',
      label: 'Opening range breakout',
    }),
  );
});

test('a failed strategy write leaves no row', async () => {
  const { repo, rows } = setup();
  await expect(repo.strategies.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
  await expect(
    repo.strategies.update(S, 'nope', { name: 'x' }),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect(await rows()).toEqual([]);
});

// ---- Tags -------------------------------------------------------------------

test('tag create, edit and delete each log', async () => {
  const { repo, rows, at } = setup();
  const made = await repo.tags.create(S, {
    name: ' Trend ',
    categoryId: 'setups',
  });
  at(T1);
  // The same name in the same category gives back the tag it is: no new tag, no row.
  expect(
    (await repo.tags.create(S, { name: 'trend', categoryId: 'setups' })).id,
  ).toBe(made.id);
  await repo.tags.update(S, made.id, {
    name: 'Trend day',
    categoryId: 'custom-tags',
    description: 'A one-way day.',
  });
  at(T2);
  // The same name again changes nothing; an undefined description clears it.
  await repo.tags.update(S, made.id, { name: 'trend day' });
  await repo.tags.update(S, made.id, { description: undefined });
  at(T3);
  await repo.tags.remove(S, made.id);
  const id = made.id;
  const edit = (r: Partial<HistoryRow>) =>
    row({
      type: 'tag',
      action: 'edited',
      entityId: id,
      at: T1,
      label: 'trend day',
      ...r,
    });
  expect(await rows()).toEqual([
    row({
      at: T0,
      type: 'tag',
      action: 'created',
      entityId: id,
      label: 'trend',
    }),
    edit({
      field: 'categoryId',
      oldValue: 'setups',
      newValue: 'custom-tags',
    }),
    edit({
      field: 'description',
      oldValue: null,
      newValue: 'A one-way day.',
    }),
    edit({ field: 'name', oldValue: 'trend', newValue: 'trend day' }),
    edit({
      at: T2,
      field: 'description',
      oldValue: 'A one-way day.',
      newValue: null,
    }),
    row({
      at: T3,
      type: 'tag',
      action: 'deleted',
      entityId: id,
      label: 'trend day',
    }),
  ]);
});

test('removing a tag logs it once, not once per trade it leaves', async () => {
  const { repo, rows } = setup();
  await repo.trades.update(S, 'f-2', { tagIds: ['tag-fomo'] });
  const written = (await rows()).length;
  await repo.tags.remove(S, 'tag-fomo');
  const after = await rows();
  expect(after).toHaveLength(written + 1);
  expect(after.at(-1)).toMatchObject({
    type: 'tag',
    action: 'deleted',
    entityId: 'tag-fomo',
    label: 'fomo',
  });
});

test('a failed tag write leaves no row', async () => {
  const { repo, rows } = setup();
  await expect(
    repo.tags.create(S, { name: 'x', categoryId: 'nope' }),
  ).rejects.toBeInstanceOf(NotFoundError);
  await expect(
    repo.tags.update(S, 'tag-fomo', { name: 'x', categoryId: 'nope' }),
  ).rejects.toBeInstanceOf(NotFoundError);
  // `breakout` sits in Setups.
  await expect(
    repo.tags.update(S, 'tag-fomo', { name: 'breakout', categoryId: 'setups' }),
  ).rejects.toBeInstanceOf(DuplicateNameError);
  await expect(repo.tags.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
  expect(await rows()).toEqual([]);
});

// ---- Tag categories ---------------------------------------------------------

test('tag category create, edit and delete each log', async () => {
  const { repo, rows, at } = setup();
  const made = await repo.tagCategories.create(S, {
    name: ' Psychology ',
    color: '#112233',
  });
  at(T1);
  await repo.tagCategories.update(S, made.id, {
    name: 'Mindset',
    color: '#445566',
  });
  at(T2);
  // Nothing changed.
  await repo.tagCategories.update(S, made.id, { name: 'Mindset' });
  at(T3);
  await repo.tagCategories.remove(S, made.id);
  const id = made.id;
  const edit = (r: Partial<HistoryRow>) =>
    row({
      type: 'tag-category',
      action: 'edited',
      entityId: id,
      at: T1,
      label: 'Mindset',
      ...r,
    });
  expect(await rows()).toEqual([
    row({
      at: T0,
      type: 'tag-category',
      action: 'created',
      entityId: id,
      label: 'Psychology',
    }),
    edit({ field: 'color', oldValue: '#112233', newValue: '#445566' }),
    edit({ field: 'name', oldValue: 'Psychology', newValue: 'Mindset' }),
    row({
      at: T3,
      type: 'tag-category',
      action: 'deleted',
      entityId: id,
      label: 'Mindset',
    }),
  ]);
});

test('removing a category logs it once, not its tags and not the trades they leave', async () => {
  const { repo, rows } = setup();
  await repo.trades.update(S, 'f-2', { tagIds: ['tag-setup'] });
  const written = (await rows()).length;
  await repo.tagCategories.remove(S, 'setups');
  const after = await rows();
  expect(after).toHaveLength(written + 1);
  expect(after.at(-1)).toMatchObject({
    type: 'tag-category',
    action: 'deleted',
    entityId: 'setups',
    label: 'Setups',
  });
});

test('a failed category write leaves no row', async () => {
  const { repo, rows } = setup();
  await expect(
    repo.tagCategories.create(S, { name: 'Bad', color: 'teal' }),
  ).rejects.toBeInstanceOf(RangeError);
  await expect(
    repo.tagCategories.update(S, 'mistakes', { name: 'setups' }),
  ).rejects.toBeInstanceOf(DuplicateNameError);
  await expect(repo.tagCategories.remove(S, 'mistakes')).rejects.toThrow(
    'built-in category',
  );
  await expect(repo.tagCategories.remove(S, 'nope')).rejects.toBeInstanceOf(
    NotFoundError,
  );
  expect(await rows()).toEqual([]);
});

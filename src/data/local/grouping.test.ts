import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, test, vi } from 'vitest';
import { parseCsv } from '@/domain/import/csv';
import { guessMapping } from '@/domain/import/mapping';
import { planImport } from '@/domain/import/plan';
import { resolveInstrument } from '@/domain/instruments';
import type { HistoryRow, Trade } from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import { freezeDay, scoreHistory, type RoutineEnv } from '../routine';
import {
  ArchivedAccountError,
  NotFoundError,
  StalePlanError,
  type NewAccount,
} from '../repository';
import { KeelDb } from './db';
import { createLocalRepository } from './local-repository';

const M = 'mine';
const NY = 'America/New_York';
const NOW = '2026-11-19T21:00:00.000Z';
const DAY = '2026-11-19';
const ES = resolveInstrument('ESZ5')!;
const H = 'Date/Time,Symbol,Buy/Sell,Quantity,Price\n';

const at = (hhmm: string) => `${DAY}T${hhmm}:00.000Z`;
const fill = (
  hhmm: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
) => ({
  time: at(hhmm),
  side,
  qty,
  price,
  commission: 0,
  fees: 0,
});
const pdf = (name: string) => ({
  bytes: new ArrayBuffer(4),
  type: 'application/pdf',
  name,
});

async function setup() {
  const indexedDB = new IDBFactory();
  let n = 0;
  let planned = 0;
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    // A fixed clock: every history row of a write shares the time.
    now: () => new Date(NOW),
    newId: () => `id-${++n}`,
    sample: async () => fixtureSample(),
  });
  await repo.prefs.update({ timeZone: NY });
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  const account = (name: string, over: Partial<NewAccount> = {}) =>
    repo.accounts.create(M, {
      name,
      broker: 'b',
      type: 'live',
      currency: 'USD',
      startingBalance: 0,
      status: 'active',
      ...over,
    });
  const acc = await account('Futures');
  /** A closed long: in at `entry`, out ten minutes later at `exit`. */
  const trip = (
    accountId: string,
    from: [string, string],
    entry: number,
    exit: number,
  ) =>
    repo.trades.createManual(M, {
      accountId,
      instrument: ES,
      fills: [fill(from[0], 'buy', 1, entry), fill(from[1], 'sell', 1, exit)],
    });
  const archive = (id: string) =>
    repo.accounts.update(M, id, { status: 'archived' });
  const plan = async (text: string, importId: string, accountId = acc.id) => {
    const parsed = parseCsv(text);
    return planImport(
      parsed,
      guessMapping(parsed, { sourceTimeZone: 'America/New_York' }),
      await repo.imports.context(M, accountId),
      {
        importId,
        fileName: `${importId}.csv`,
        now: new Date(Date.UTC(2026, 10, 21, 0, planned++)).toISOString(),
      },
    );
  };
  const commit = async (text: string, importId: string) =>
    repo.imports.commit(M, await plan(text, importId));
  /** Every history row of one kind of action, the volatile ids and times dropped. */
  const rows = async (...actions: HistoryRow['action'][]) =>
    (await db.history.where('workspaceId').equals(M).toArray())
      .filter((r) => actions.includes(r.action))
      .map((r) => ({
        type: r.type,
        action: r.action,
        source: r.source,
        entityId: r.entityId,
        label: r.label,
        field: r.field,
        oldValue: r.oldValue,
        newValue: r.newValue,
      }));
  const rowCount = async () =>
    db.history.where('workspaceId').equals(M).count();
  return {
    repo,
    db,
    acc,
    account,
    trip,
    archive,
    plan,
    commit,
    rows,
    rowCount,
  };
}

/** Two closed longs on the day: +$200 at 09:30 and -$100 at 10:00 New York time. */
const TRIPS: [[string, string], number, number][] = [
  [['14:30', '14:40'], 6000, 6004],
  [['15:00', '15:10'], 6010, 6008],
];
const ids = (t: Trade) => t.executions.map((e) => e.id);
const byEntity = <R extends { entityId: string }>(list: R[]) =>
  Object.fromEntries(list.map((r) => [r.entityId, r]));

describe('merge', () => {
  test('merge writes one trade, unlinks the other notes, moves their files, logs each trade', async () => {
    const { repo, db, acc, trip, rows, rowCount } = await setup();
    const a = await trip(acc.id, ...TRIPS[0]!);
    const b = await trip(acc.id, ...TRIPS[1]!);
    const noteA = await repo.journal.ensureTradeNote(M, a.id);
    const noteB = await repo.journal.ensureTradeNote(M, b.id);
    const tag = await repo.tags.create(M, {
      name: 'gap',
      categoryId: 'custom-tags',
    });
    await repo.trades.update(M, b.id, { tagIds: [tag.id], rating: 5 });
    await repo.files.add(M, `trade:${a.id}`, pdf('a.pdf'), { images: false });
    const fromB = await repo.files.add(M, `trade:${b.id}`, pdf('b.pdf'), {
      images: false,
    });
    const before = await rowCount();

    // The order of the ids is the caller's; the earliest opened keeps its record.
    const kept = await repo.trades.merge(
      M,
      [b.id, a.id],
      [...ids(a), ...ids(b)],
    );
    expect(kept).toMatchObject({
      id: a.id,
      serial: a.serial,
      noteId: noteA.id,
      grouping: 'manual',
      status: 'closed',
      net: 10_000,
      tagIds: [tag.id],
    });
    expect(kept.rating).toBeUndefined();
    expect(ids(kept)).toEqual([...ids(a), ...ids(b)]);
    expect(await repo.trades.list(M)).toEqual([kept]);

    // B's note stays, as a trade note linked to nothing.
    expect(await repo.journal.get(M, noteB.id)).toMatchObject({
      kind: 'trade-note',
      linkedTradeIds: [],
    });
    expect((await repo.journal.get(M, noteA.id))!.linkedTradeIds).toEqual([
      a.id,
    ]);
    // B's files went to the merged trade, in upload order.
    const files = await repo.files.list(M, `trade:${a.id}`);
    expect(files.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(files[1]!.id).toBe(fromB.id);
    expect(await repo.files.list(M, `trade:${b.id}`)).toEqual([]);

    // One row for each trade the write touched, and no other.
    const written = await rows('merged');
    expect(await rowCount()).toBe(before + 2);
    expect(byEntity(written)).toEqual({
      [a.id]: {
        type: 'trade',
        action: 'merged',
        source: 'you',
        entityId: a.id,
        label: 'ESZ5 2026-11-19',
        field: 'fills',
        oldValue: 2,
        newValue: 4,
      },
      [b.id]: {
        type: 'trade',
        action: 'merged',
        source: 'you',
        entityId: b.id,
        label: 'ESZ5 2026-11-19',
        field: 'fills',
        oldValue: 2,
        newValue: 0,
      },
    });
    expect(await db.files.count()).toBe(2);
  });

  test('a fill left out stays in its trade, which is rebuilt and logged', async () => {
    const { repo, acc, trip, rows, rowCount } = await setup();
    const a = await trip(acc.id, ...TRIPS[0]!);
    const b = await trip(acc.id, ...TRIPS[1]!);
    const noteB = await repo.journal.ensureTradeNote(M, b.id);
    await repo.files.add(M, `trade:${b.id}`, pdf('b.pdf'), { images: false });
    const before = await rowCount();

    // A's two fills and B's entry: B keeps its exit, now alone.
    const kept = await repo.trades.merge(
      M,
      [a.id, b.id],
      [...ids(a), b.executions[0]!.id],
    );
    expect(kept).toMatchObject({
      id: a.id,
      status: 'open',
      grouping: 'manual',
    });
    expect(ids(kept)).toEqual([...ids(a), b.executions[0]!.id]);
    const left = (await repo.trades.get(M, b.id))!;
    expect(ids(left)).toEqual([b.executions[1]!.id]);
    expect(left).toMatchObject({
      status: 'open',
      direction: 'short',
      grouping: 'manual',
      noteId: noteB.id,
    });
    // B is still a trade: it keeps its note and its files.
    expect((await repo.journal.get(M, noteB.id))!.linkedTradeIds).toEqual([
      b.id,
    ]);
    expect(await repo.files.list(M, `trade:${b.id}`)).toHaveLength(1);
    expect(await repo.files.list(M, `trade:${a.id}`)).toEqual([]);

    expect(await rowCount()).toBe(before + 2);
    expect(byEntity(await rows('merged'))).toMatchObject({
      [a.id]: { oldValue: 2, newValue: 3 },
      [b.id]: { oldValue: 2, newValue: 1 },
    });
  });

  test('a refused merge writes nothing', async () => {
    const { repo, db, acc, account, trip, rowCount } = await setup();
    const other = await account('Other');
    const a = await trip(acc.id, ...TRIPS[0]!);
    const b = await trip(other.id, ...TRIPS[1]!);
    const c = await trip(acc.id, ...TRIPS[1]!);
    const before = await repo.trades.list(M);
    const rowsBefore = await rowCount();
    const all = (...t: Trade[]) => t.flatMap(ids);

    await expect(
      repo.trades.merge(M, [a.id, b.id], all(a, b)),
    ).rejects.toMatchObject({ name: 'GroupRefused', refusal: 'mixed-account' });
    // Picks that reach one trade only join nothing.
    await expect(
      repo.trades.merge(M, [a.id, c.id], ids(a)),
    ).rejects.toMatchObject({ name: 'GroupRefused', refusal: 'too-few' });
    await expect(
      repo.trades.merge(M, [a.id, 'nope'], all(a)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await repo.trades.list(M)).toEqual(before);
    expect(await rowCount()).toBe(rowsBefore);
    expect(await db.files.count()).toBe(0);
  });
});

describe('split', () => {
  test('split writes two trades and logs both', async () => {
    const { repo, acc, rows, rowCount } = await setup();
    const strategy = await repo.strategies.create(M, {
      name: 'ORB',
      description: '',
      assetClasses: ['future'],
      groups: [
        {
          title: 'Entry',
          rules: [{ id: 'r-1', text: 'Wait', showWhen: 'always' }],
        },
      ],
      checklist: [],
      status: 'active',
    });
    const tag = await repo.tags.create(M, {
      name: 'gap',
      categoryId: 'custom-tags',
    });
    const t = await repo.trades.createManual(M, {
      accountId: acc.id,
      instrument: ES,
      fills: [
        fill('14:30', 'buy', 2, 6000),
        fill('14:40', 'sell', 1, 6004),
        fill('14:50', 'sell', 1, 6008),
      ],
    });
    const note = await repo.journal.ensureTradeNote(M, t.id);
    await repo.trades.update(M, t.id, {
      strategyIds: [strategy.id],
      ruleChecks: [{ ruleId: 'r-1', followed: true }],
      tagIds: [tag.id],
      rating: 4,
      reviewed: true,
    });
    await repo.files.add(M, `trade:${t.id}`, pdf('plan.pdf'), {
      images: false,
    });
    const other = await repo.trades.createManual(M, {
      accountId: acc.id,
      instrument: ES,
      fills: [fill('16:00', 'buy', 1, 6000)],
    });
    const before = await rowCount();

    const { original, created } = await repo.trades.split(M, t.id, [
      t.executions[2]!.id,
    ]);
    expect(original).toMatchObject({
      id: t.id,
      serial: t.serial,
      noteId: note.id,
      rating: 4,
      reviewed: true,
      strategyIds: [strategy.id],
      ruleChecks: [{ ruleId: 'r-1', followed: true }],
      status: 'open',
      grouping: 'manual',
    });
    expect(ids(original)).toEqual(ids(t).slice(0, 2));
    // The new trade takes the next serial and only the tags and strategies.
    expect(created).toMatchObject({
      serial: other.serial + 1,
      direction: 'short',
      status: 'open',
      strategyIds: [strategy.id],
      tagIds: [tag.id],
      ruleChecks: [],
      grouping: 'manual',
      source: 'manual',
    });
    expect(created.id).not.toBe(t.id);
    expect(ids(created)).toEqual([t.executions[2]!.id]);
    expect(created.noteId).toBeUndefined();
    expect(created.rating).toBeUndefined();
    expect(created.reviewed).toBeUndefined();
    expect(await repo.trades.get(M, t.id)).toEqual(original);
    expect(await repo.trades.get(M, created.id)).toEqual(created);
    // The files stay with the original.
    expect(await repo.files.list(M, `trade:${t.id}`)).toHaveLength(1);
    expect(await repo.files.list(M, `trade:${created.id}`)).toEqual([]);

    expect(await rowCount()).toBe(before + 2);
    expect(byEntity(await rows('split'))).toEqual({
      [t.id]: {
        type: 'trade',
        action: 'split',
        source: 'you',
        entityId: t.id,
        label: 'ESZ5 2026-11-19',
        field: 'fills',
        oldValue: 3,
        newValue: 2,
      },
      [created.id]: {
        type: 'trade',
        action: 'split',
        source: 'you',
        entityId: created.id,
        label: 'ESZ5 2026-11-19',
        field: 'fills',
        oldValue: 0,
        newValue: 1,
      },
    });
  });

  test('a refused split writes nothing', async () => {
    const { repo, acc, trip, rowCount } = await setup();
    const a = await trip(acc.id, ...TRIPS[0]!);
    const before = await repo.trades.list(M);
    const rowsBefore = await rowCount();
    await expect(repo.trades.split(M, a.id, [])).rejects.toMatchObject({
      name: 'GroupRefused',
      refusal: 'too-few',
    });
    await expect(repo.trades.split(M, a.id, ids(a))).rejects.toMatchObject({
      name: 'GroupRefused',
      refusal: 'nothing-left',
    });
    await expect(repo.trades.split(M, 'nope', [])).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await repo.trades.list(M)).toEqual(before);
    expect(await rowCount()).toBe(rowsBefore);
  });
});

describe('move', () => {
  test('move keeps note, tags, levels and files', async () => {
    const { repo, acc, account, trip, rows, rowCount } = await setup();
    const euro = await account('Euro', { currency: 'EUR' });
    const strategy = await repo.strategies.create(M, {
      name: 'ORB',
      description: '',
      assetClasses: ['future'],
      groups: [
        {
          title: 'Entry',
          rules: [{ id: 'r-1', text: 'Wait', showWhen: 'always' }],
        },
      ],
      checklist: [],
      status: 'active',
    });
    const tag = await repo.tags.create(M, {
      name: 'gap',
      categoryId: 'custom-tags',
    });
    const t = await trip(acc.id, ...TRIPS[0]!);
    const note = await repo.journal.ensureTradeNote(M, t.id);
    await repo.trades.update(M, t.id, {
      strategyIds: [strategy.id],
      ruleChecks: [{ ruleId: 'r-1', followed: false }],
      tagIds: [tag.id],
      rating: 3,
      reviewed: true,
      stops: { unit: 'price', levels: [{ value: 5995, qty: 1 }] },
      targets: { unit: 'price', levels: [{ value: 6010, qty: 1 }] },
    });
    await repo.files.add(M, `trade:${t.id}`, pdf('plan.pdf'), {
      images: false,
    });
    const before = (await repo.trades.get(M, t.id))!;
    const filesBefore = await repo.files.list(M, `trade:${t.id}`);
    const rowsBefore = await rowCount();

    expect(await repo.trades.move(M, [t.id], euro.id)).toBe(1);
    const after = (await repo.trades.get(M, t.id))!;
    // Only the account changes: its fills sit in it, and the trade keeps its
    // own P&L currency and figures, whatever the destination's currency.
    expect(after).toEqual({
      ...before,
      accountId: euro.id,
      executions: before.executions.map((e) => ({ ...e, accountId: euro.id })),
    });
    expect(after).toMatchObject({
      pnlCurrency: 'USD',
      net: before.net,
      noteId: note.id,
      stops: before.stops,
      targets: before.targets,
    });
    expect((await repo.journal.get(M, note.id))!.linkedTradeIds).toEqual([
      t.id,
    ]);
    expect(await repo.files.list(M, `trade:${t.id}`)).toEqual(filesBefore);

    expect(await rowCount()).toBe(rowsBefore + 1);
    expect(await rows('moved')).toEqual([
      {
        type: 'trade',
        action: 'moved',
        source: 'you',
        entityId: t.id,
        label: 'ESZ5 2026-11-19',
        field: 'accountId',
        oldValue: acc.id,
        newValue: euro.id,
      },
    ]);
  });

  test('a trade already in the destination is left alone', async () => {
    const { repo, acc, account, trip, rows } = await setup();
    const other = await account('Other');
    const a = await trip(acc.id, ...TRIPS[0]!);
    const b = await trip(other.id, ...TRIPS[1]!);
    const bBefore = await repo.trades.get(M, b.id);
    expect(await repo.trades.move(M, [a.id, b.id, a.id], other.id)).toBe(1);
    expect((await repo.trades.get(M, a.id))!.accountId).toBe(other.id);
    expect(await repo.trades.get(M, b.id)).toEqual(bBefore);
    expect((await rows('moved')).map((r) => r.entityId)).toEqual([a.id]);
    // Nothing to move writes nothing.
    expect(await repo.trades.move(M, [a.id, b.id], other.id)).toBe(0);
    expect(await rows('moved')).toHaveLength(1);
  });

  test('move refuses an archived destination', async () => {
    const { repo, acc, account, archive, trip, rowCount } = await setup();
    const old = await account('Old');
    const t = await trip(acc.id, ...TRIPS[0]!);
    await archive(old.id);
    const before = await repo.trades.list(M);
    const rowsBefore = await rowCount();
    const refused = repo.trades.move(M, [t.id], old.id);
    await expect(refused).rejects.toBeInstanceOf(ArchivedAccountError);
    await expect(refused).rejects.toMatchObject({ accountIds: [old.id] });
    await expect(repo.trades.move(M, [t.id], 'nope')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(repo.trades.move(M, ['nope'], acc.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await repo.trades.list(M)).toEqual(before);
    expect(await rowCount()).toBe(rowsBefore);
  });

  test('merge, split and move refuse a trade in an archived account', async () => {
    const { repo, acc, account, archive, trip, rowCount } = await setup();
    const live = await account('Live');
    const a = await trip(acc.id, ...TRIPS[0]!);
    const b = await trip(acc.id, ...TRIPS[1]!);
    await archive(acc.id);
    const before = await repo.trades.list(M);
    const rowsBefore = await rowCount();
    for (const refuse of [
      () => repo.trades.merge(M, [a.id, b.id], [...ids(a), ...ids(b)]),
      () => repo.trades.split(M, a.id, [a.executions[1]!.id]),
      () => repo.trades.move(M, [a.id], live.id),
      () => repo.trades.moveAccount(M, acc.id, live.id),
    ])
      await expect(refuse()).rejects.toBeInstanceOf(ArchivedAccountError);
    expect(await repo.trades.list(M)).toEqual(before);
    expect(await rowCount()).toBe(rowsBefore);
  });
});

describe('moveAccount', () => {
  test('moveAccount moves every trade and leaves cash flows', async () => {
    const { repo, acc, account, trip, rows } = await setup();
    const to = await account('Destination');
    const a = await trip(acc.id, ...TRIPS[0]!);
    const b = await trip(acc.id, ...TRIPS[1]!);
    // An open one too.
    const open = await repo.trades.createManual(M, {
      accountId: acc.id,
      instrument: ES,
      fills: [fill('16:00', 'buy', 1, 6000)],
    });
    const elsewhere = await trip(to.id, ...TRIPS[1]!);
    await repo.cashFlows.create(M, {
      accountId: acc.id,
      date: '2026-11-10',
      amount: 500_000,
    });
    const flows = await repo.cashFlows.list(M);
    const accounts = await repo.accounts.list(M);
    const elsewhereBefore = await repo.trades.get(M, elsewhere.id);

    expect(await repo.trades.moveAccount(M, acc.id, to.id)).toBe(3);
    const after = await repo.trades.list(M);
    expect(after.map((t) => [t.id, t.accountId])).toEqual([
      [a.id, to.id],
      [b.id, to.id],
      [open.id, to.id],
      [elsewhere.id, to.id],
    ]);
    expect(
      after.every((t) => t.executions.every((e) => e.accountId === to.id)),
    ).toBe(true);
    expect(await repo.trades.get(M, elsewhere.id)).toEqual(elsewhereBefore);
    // The cash flows and the account stay where they were.
    expect(await repo.cashFlows.list(M)).toEqual(flows);
    expect(await repo.accounts.list(M)).toEqual(accounts);
    expect(
      (await rows('moved')).map((r) => [r.entityId, r.oldValue, r.newValue]),
    ).toHaveLength(3);
    expect(new Set((await rows('moved')).map((r) => r.field))).toEqual(
      new Set(['accountId']),
    );
    // Moving what is no longer there writes nothing.
    expect(await repo.trades.moveAccount(M, acc.id, to.id)).toBe(0);
    expect(await rows('moved')).toHaveLength(3);
  });

  test('refuses an archived account on either side, or a missing one, and the same account moves nothing', async () => {
    const { repo, acc, account, archive, trip, rowCount } = await setup();
    const old = await account('Old');
    await trip(acc.id, ...TRIPS[0]!);
    await archive(old.id);
    const rowsBefore = await rowCount();
    await expect(
      repo.trades.moveAccount(M, acc.id, old.id),
    ).rejects.toMatchObject({
      name: 'ArchivedAccountError',
      accountIds: [old.id],
    });
    await expect(
      repo.trades.moveAccount(M, old.id, acc.id),
    ).rejects.toBeInstanceOf(ArchivedAccountError);
    await expect(
      repo.trades.moveAccount(M, acc.id, 'nope'),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      repo.trades.moveAccount(M, 'nope', acc.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await repo.trades.moveAccount(M, acc.id, acc.id)).toBe(0);
    expect(await rowCount()).toBe(rowsBefore);
  });
});

describe('what a regrouping leaves behind', () => {
  test.each(['merge', 'split', 'move'] as const)(
    'a plan made before a %s is stale',
    async (op) => {
      const { repo, acc, account, trip, plan } = await setup();
      const other = await account('Other');
      const a = await trip(acc.id, ...TRIPS[0]!);
      const b = await trip(acc.id, ...TRIPS[1]!);
      // Made from the trades as they were, with their serials and open trades.
      const pending = await plan(
        H + '2026-11-20 09:41:00,ESZ5,Buy,1,6000\n',
        'impA',
      );
      if (op === 'merge')
        await repo.trades.merge(M, [a.id, b.id], [...ids(a), ...ids(b)]);
      if (op === 'split')
        await repo.trades.split(M, a.id, [a.executions[1]!.id]);
      if (op === 'move') await repo.trades.move(M, [a.id], other.id);
      await expect(repo.imports.commit(M, pending)).rejects.toBeInstanceOf(
        StalePlanError,
      );
    },
  );

  test('a regrouping that cannot log takes itself back', async () => {
    const { repo, db, acc, account, trip, rowCount } = await setup();
    const other = await account('Other');
    const a = await trip(acc.id, ...TRIPS[0]!);
    const b = await trip(acc.id, ...TRIPS[1]!);
    await repo.files.add(M, `trade:${b.id}`, pdf('b.pdf'), { images: false });
    const state = async () =>
      JSON.stringify([
        await repo.trades.list(M),
        await db.files.toArray(),
        await db.journal.toArray(),
        await db.meta.toArray(),
      ]);
    const before = await state();
    const rowsBefore = await rowCount();
    // The records' ids stay ours; the history rows' ids are made to fail.
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('no row id');
    });
    try {
      for (const write of [
        () => repo.trades.merge(M, [a.id, b.id], [...ids(a), ...ids(b)]),
        () => repo.trades.split(M, a.id, [a.executions[1]!.id]),
        () => repo.trades.move(M, [a.id], other.id),
        () => repo.trades.moveAccount(M, acc.id, other.id),
      ])
        await expect(write()).rejects.toThrow('no row id');
    } finally {
      spy.mockRestore();
    }
    expect(await state()).toBe(before);
    expect(await rowCount()).toBe(rowsBefore);
  });

  test('the sample workspace regroups like My workspace', async () => {
    const indexedDB = new IDBFactory();
    const fillOf = (
      id: string,
      side: 'buy' | 'sell',
      price: number,
      time: string,
    ) => ({
      id,
      accountId: 'acc-a',
      symbol: 'ESZ5',
      side,
      qty: 1,
      price,
      time,
      fees: 0,
      commission: 0,
    });
    const repo = createLocalRepository({
      indexedDB,
      IDBKeyRange,
      sample: async () => {
        const sample = fixtureSample();
        sample.trades.find((t) => t.id === 'f-1')!.executions = [
          fillOf('e1', 'buy', 6000, '2026-11-16T14:45:00.000Z'),
          fillOf('e2', 'sell', 6005, '2026-11-16T15:10:00.000Z'),
        ];
        sample.trades.find((t) => t.id === 'f-2')!.executions = [
          fillOf('e3', 'sell', 6010, '2026-11-17T15:00:00.000Z'),
          fillOf('e4', 'buy', 6012.5, '2026-11-17T15:30:00.000Z'),
        ];
        return sample;
      },
    });
    const kept = await repo.trades.merge(
      'sample',
      ['f-1', 'f-2'],
      ['e1', 'e2', 'e3', 'e4'],
    );
    expect(kept).toMatchObject({ id: 'f-1', grouping: 'manual' });
    expect((await repo.trades.list('sample')).map((t) => t.id)).toEqual([
      'f-1',
      'f-3',
    ]);
    expect(
      (await repo.history.list('sample')).map((r) => [r.action, r.entityId]),
    ).toHaveLength(2);
    expect(await repo.history.list(M)).toEqual([]);
  });
});

describe('a manual trade grouped by hand', () => {
  test('keeps its mark when the manual form saves it again', async () => {
    const { repo, acc } = await setup();
    // A position built up in two buys, then closed: one trade the form can rebuild.
    const t = await repo.trades.createManual(M, {
      accountId: acc.id,
      instrument: ES,
      fills: [fill('14:30', 'buy', 2, 6000), fill('14:50', 'sell', 2, 6004)],
    });
    const { original } = await repo.trades.split(M, t.id, [
      t.executions[1]!.id,
    ]);
    expect(original.grouping).toBe('manual');
    const saved = await repo.trades.replaceManual(M, t.id, {
      accountId: acc.id,
      instrument: ES,
      fills: [fill('14:30', 'buy', 2, 6001), fill('14:50', 'sell', 2, 6004)],
    });
    expect(saved).toMatchObject({ grouping: 'manual', avgEntry: 6001 });
  });
});

describe('an open trade grouped by hand', () => {
  test('can be deleted, as no import will ever close it', async () => {
    const { repo, commit } = await setup();
    // A closed round trip, then a position left open.
    await commit(
      H +
        '2026-11-16 09:41:00,ESZ5,Buy,2,6000\n2026-11-16 09:50:00,ESZ5,Sell,2,6004\n2026-11-16 10:41:00,ESZ5,Buy,1,6010\n',
      'impA',
    );
    const [one, two] = await repo.trades.list(M);
    const merged = await repo.trades.merge(
      M,
      [one!.id, two!.id],
      [...ids(one!), ...ids(two!)],
    );
    expect(merged.status).toBe('open');
    expect(merged.importId).toBe('impA');
    await repo.trades.remove(M, [merged.id]);
    expect(await repo.trades.list(M)).toEqual([]);
  });
});

describe('imports after a manual grouping', () => {
  const OPEN = (day: string) =>
    H +
    `${day} 09:41:00,ESZ5,Buy,2,6000\n${day} 09:50:00,ESZ5,Sell,2,6004\n${day} 10:41:00,ESZ5,Buy,1,6010\n`;

  test('a later import does not rebuild a manual trade', async () => {
    const { repo, acc, plan, commit } = await setup();
    await commit(OPEN('2026-11-16'), 'impA');
    const [one, two] = await repo.trades.list(M);
    expect([one!.status, two!.status]).toEqual(['closed', 'open']);
    const merged = await repo.trades.merge(
      M,
      [one!.id, two!.id],
      [...ids(one!), ...ids(two!)],
    );
    expect(merged).toMatchObject({ status: 'open', grouping: 'manual' });
    expect(ids(merged)).toHaveLength(3);

    // The context never offers it, and a plan made from one that did would not take it either.
    expect((await repo.imports.context(M, acc.id)).openTrades).toEqual([]);
    const next = await plan(
      H + '2026-11-17 10:00:00,ESZ5,Sell,1,6015\n',
      'impB',
    );
    expect(next.replacedTrades).toEqual([]);
    expect(next.trades).toHaveLength(1);
    expect(next.trades[0]).toMatchObject({
      direction: 'short',
      status: 'open',
    });
    expect(next.trades[0]!.executions).toHaveLength(1);

    await repo.imports.commit(M, next);
    expect(await repo.trades.get(M, merged.id)).toEqual(merged);
    expect(await repo.trades.list(M)).toHaveLength(2);
  });

  test('the same file again adds nothing, whatever was merged', async () => {
    const { repo, acc, plan, commit } = await setup();
    await commit(OPEN('2026-11-16'), 'impA');
    const [one, two] = await repo.trades.list(M);
    await repo.trades.merge(
      M,
      [one!.id, two!.id],
      [...ids(one!), ...ids(two!)],
    );
    const again = await plan(OPEN('2026-11-16'), 'impB');
    expect(again).toMatchObject({ trades: [], blocked: 'nothing-new' });
    expect((await repo.imports.context(M, acc.id)).fingerprints).toHaveLength(
      3,
    );
  });
});

describe('undoing an import after a regrouping', () => {
  const TWO = (day: string) =>
    H +
    `${day} 09:41:00,ESZ5,Buy,1,6000\n${day} 09:50:00,ESZ5,Sell,1,6004\n${day} 10:41:00,ESZ5,Buy,1,6010\n${day} 10:50:00,ESZ5,Sell,1,6008\n`;
  const THREE = (day: string) =>
    H +
    `${day} 09:41:00,ESZ5,Buy,2,6000\n${day} 09:50:00,ESZ5,Sell,1,6004\n${day} 09:55:00,ESZ5,Sell,1,6008\n`;

  /** Nothing about the import changed: the trades, its status and the history. */
  const unchanged = async (
    ctx: Awaited<ReturnType<typeof setup>>,
    jobId: string,
    run: () => Promise<unknown>,
  ) => {
    const trades = await ctx.repo.trades.list(M);
    const rowsBefore = await ctx.rowCount();
    await run();
    expect(await ctx.repo.trades.list(M)).toEqual(trades);
    expect(await ctx.rowCount()).toBe(rowsBefore);
    expect((await ctx.db.imports.get([M, jobId]))!.status).toBe('active');
  };

  test('undoing a regrouped import is refused with its reason', async () => {
    const ctx = await setup();
    const { repo, commit } = ctx;
    const job = await commit(TWO('2026-11-16'), 'impA');
    const [one, two] = await repo.trades.list(M);
    const merged = await repo.trades.merge(
      M,
      [one!.id, two!.id],
      [...ids(one!), ...ids(two!)],
    );
    await unchanged(ctx, job.id, async () =>
      expect(await repo.imports.undo(M, job.id)).toEqual({
        ok: false,
        reason: 'regrouped',
        tradeIds: [merged.id],
      }),
    );
    // Deleting what was regrouped leaves nothing of it to undo around.
    await repo.trades.remove(M, [merged.id]);
    expect(await repo.imports.undo(M, job.id)).toEqual({ ok: true });
  });

  test('a split import is refused, with both parts named', async () => {
    const ctx = await setup();
    const { repo, commit } = ctx;
    const job = await commit(THREE('2026-11-16'), 'impA');
    const [t] = await repo.trades.list(M);
    const { original, created } = await repo.trades.split(M, t!.id, [
      t!.executions[2]!.id,
    ]);
    await unchanged(ctx, job.id, async () => {
      const result = await repo.imports.undo(M, job.id);
      expect(result).toMatchObject({ ok: false, reason: 'regrouped' });
      expect('tradeIds' in result ? [...result.tradeIds].sort() : []).toEqual(
        [original.id, created.id].sort(),
      );
    });
  });

  test('a moved trade refuses its import', async () => {
    const ctx = await setup();
    const { repo, account, commit } = ctx;
    const other = await account('Other');
    const job = await commit(TWO('2026-11-16'), 'impA');
    const [one] = await repo.trades.list(M);
    await repo.trades.move(M, [one!.id], other.id);
    await unchanged(ctx, job.id, async () =>
      expect(await repo.imports.undo(M, job.id)).toEqual({
        ok: false,
        reason: 'regrouped',
        tradeIds: [one!.id],
      }),
    );
  });

  test('an import whose trade a merge took in is refused, though none of its trades is left', async () => {
    const ctx = await setup();
    const { repo, commit } = ctx;
    const first = await commit(TWO('2026-11-16'), 'impA');
    const second = await commit(
      H +
        '2026-11-17 09:41:00,ESZ5,Buy,1,6000\n2026-11-17 09:50:00,ESZ5,Sell,1,6004\n',
      'impB',
    );
    const [one, , late] = await repo.trades.list(M);
    expect(late!.importId).toBe(second.id);
    const merged = await repo.trades.merge(
      M,
      [one!.id, late!.id],
      [...ids(one!), ...ids(late!)],
    );
    // The later import's trade is gone from the table: its id is missing.
    expect(await repo.trades.get(M, late!.id)).toBeUndefined();
    await unchanged(ctx, second.id, async () =>
      expect(await repo.imports.undo(M, second.id)).toEqual({
        ok: false,
        reason: 'regrouped',
        tradeIds: [merged.id],
      }),
    );
    await unchanged(ctx, first.id, async () =>
      expect(await repo.imports.undo(M, first.id)).toMatchObject({
        ok: false,
        reason: 'regrouped',
      }),
    );
  });

  test('a trade deleted by hand is no regrouping', async () => {
    const { repo, commit } = await setup();
    const job = await commit(TWO('2026-11-16'), 'impA');
    const [one] = await repo.trades.list(M);
    await repo.trades.remove(M, [one!.id]);
    expect(await repo.imports.undo(M, job.id)).toEqual({ ok: true });
    expect(await repo.trades.list(M)).toEqual([]);
  });

  test('the refusal does not rest on the history, which is purged after 30 days', async () => {
    const ctx = await setup();
    const { repo, db, commit } = ctx;
    const job = await commit(TWO('2026-11-16'), 'impA');
    const [one, two] = await repo.trades.list(M);
    await repo.trades.merge(
      M,
      [one!.id, two!.id],
      [...ids(one!), ...ids(two!)],
    );
    await db.history.clear();
    expect(await repo.imports.undo(M, job.id)).toMatchObject({
      ok: false,
      reason: 'regrouped',
    });
  });
});

describe('a finished day keeps its frozen score', () => {
  const env: RoutineEnv = {
    timeZone: NY,
    baseCurrency: 'USD',
    now: NOW,
    today: DAY,
  };

  /** Two losses of $75 on one day, each inside the built-in $100 cap per trade. */
  async function finishedDay() {
    const ctx = await setup();
    const { repo, db, acc, account } = ctx;
    const tracker = await repo.tracker.get(M);
    const loss = (from: [string, string]) =>
      repo.trades.createManual(M, {
        accountId: acc.id,
        instrument: ES,
        fills: [
          fill(from[0], 'buy', 1, 6000),
          fill(from[1], 'sell', 1, 5998.5),
        ],
      });
    const a = await loss(['14:30', '14:40']);
    const b = await loss(['14:50', '15:00']);
    const other = await account('Other');
    const frozen = freezeDay(
      DAY,
      tracker,
      undefined,
      await repo.trades.list(M),
      await repo.accounts.list(M),
      [],
      env,
    );
    await repo.days.finish(M, DAY, frozen);
    /** The day as the routine scores it now, from what is stored. */
    const score = async (unfinished = false) =>
      scoreHistory(
        tracker,
        unfinished ? [{ id: DAY, workspaceId: M }] : await repo.days.list(M),
        await repo.trades.list(M),
        await repo.accounts.list(M),
        await repo.cashFlows.list(M),
        env,
      ).scoreOn(DAY);
    return { ...ctx, db, a, b, other, score };
  }

  test.each(['merge', 'split', 'move'] as const)(
    'a finished day keeps its frozen score after a %s',
    async (op) => {
      const { repo, db, a, b, other, score, rows, rowCount } =
        await finishedDay();
      const frozen = await score();
      const unfinished = await score(true);
      const dayRow = await db.days.get([M, DAY]);
      expect(frozen.finished).toBe(true);
      const rowsBefore = await rowCount();

      if (op === 'merge')
        await repo.trades.merge(M, [a.id, b.id], [...ids(a), ...ids(b)]);
      if (op === 'split')
        await repo.trades.split(M, a.id, [a.executions[1]!.id]);
      if (op === 'move') await repo.trades.move(M, [a.id, b.id], other.id);

      // The frozen day reads its lock: the score is the one it had, and nothing was written to the day.
      expect(await score()).toEqual(frozen);
      expect(await db.days.get([M, DAY])).toEqual(dayRow);
      // Each trade the write touched has one row.
      const action = {
        merge: 'merged',
        split: 'split',
        move: 'moved',
      } as const;
      expect(await rows(action[op])).toHaveLength(2);
      expect(await rowCount()).toBe(rowsBefore + 2);
      // The same trades, on a day not yet finished, do move the score: the test can fail.
      if (op === 'merge')
        expect((await score(true)).rules).not.toEqual(unfinished.rules);
    },
  );
});

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, test } from 'vitest';
import { sampleFillsCsv } from '@/content/landing-sample-csv';
import { parseCsv } from '@/domain/import/csv';
import { guessMapping, type MappingOptions } from '@/domain/import/mapping';
import { planImport, type ImportContext } from '@/domain/import/plan';
import type { Trade } from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import {
  ArchivedAccountError,
  ImportBlockedError,
  NotFoundError,
  OpenImportedTradeError,
  StalePlanError,
} from '../repository';
import { KeelDb } from './db';
import { META } from './schema';
import { createLocalRepository } from './local-repository';

const M = 'mine';
const H = 'Date/Time,Symbol,Buy/Sell,Quantity,Price\n';
const OPEN_ES = H + '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n';
const CLOSE_ES = H + '2026-11-17 10:00:00,ESZ5,Sell,2,6015\n';
const CORN =
  H +
  '2026-11-16 09:41:00,ZCZ5,Buy,1,450\n2026-11-16 10:41:00,ZCZ5,Sell,1,451\n';
const ZC = { pointValue: 50, tickSize: 0.25, assetClass: 'future' as const };

async function setup() {
  const indexedDB = new IDBFactory();
  let clock = Date.parse('2026-11-21T12:00:00.000Z');
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: async () => fixtureSample(),
    // Every reading is a minute later, so a second stamp would differ.
    now: () => new Date((clock += 60_000)),
  });
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  const account = (name: string) =>
    repo.accounts.create(M, {
      name,
      broker: 'b',
      type: 'live',
      currency: 'USD',
      startingBalance: 0,
      status: 'active',
    });
  const acc = await account('Futures');
  let planned = 0;
  /** Plans `text` against the account as stored now; each plan is created a minute after the last. */
  const plan = async (
    text: string,
    importId: string,
    o: {
      accountId?: string;
      mapping?: Partial<MappingOptions>;
      /** Plans from an altered context, to reach a state the repository no longer builds. */
      alter?: (c: ImportContext) => ImportContext;
    } = {},
  ) => {
    const read = await repo.imports.context(M, o.accountId ?? acc.id);
    const ctx = o.alter ? o.alter(read) : read;
    const parsed = parseCsv(text);
    return planImport(
      parsed,
      {
        ...guessMapping(parsed, { sourceTimeZone: 'America/New_York' }),
        ...o.mapping,
      },
      ctx,
      {
        importId,
        fileName: `${importId}.csv`,
        now: new Date(Date.UTC(2026, 10, 21, 0, planned++)).toISOString(),
      },
    );
  };
  const commit = async (...args: Parameters<typeof plan>) =>
    repo.imports.commit(M, await plan(...args));
  return { repo, db, acc, account, plan, commit };
}

describe('imports.context', () => {
  test('an empty workspace starts at serial 1 with nothing open or imported; a missing account throws', async () => {
    const { repo, acc } = await setup();
    expect(await repo.imports.context(M, acc.id)).toEqual({
      workspaceId: M,
      accountId: acc.id,
      accountCurrency: 'USD',
      nextSerial: 1,
      openTrades: [],
      fingerprints: [],
      overrides: {},
      importRevision: 0,
    });
    await expect(repo.imports.context(M, 'nope')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    // The sample's account is not in My workspace.
    await expect(repo.imports.context(M, 'acc-a')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  test('serials continue the whole workspace; open trades and fingerprints belong to the account', async () => {
    const { repo, account, commit, acc } = await setup();
    // f-3, serial 3, sits in the sample's other account.
    expect((await repo.imports.context('sample', 'acc-a')).nextSerial).toBe(4);
    await commit(OPEN_ES, 'impA');
    const [open] = await repo.trades.list(M);
    expect(await repo.imports.context(M, acc.id)).toMatchObject({
      nextSerial: 2,
      openTrades: [open],
      fingerprints: [expect.any(String)],
    });
    const other = await account('Other');
    expect(await repo.imports.context(M, other.id)).toMatchObject({
      accountId: other.id,
      nextSerial: 2,
      openTrades: [],
      fingerprints: [],
    });
  });
});

describe('manual trades and the import context', () => {
  const MANUAL = (instrument: Trade['instrument'], acc: string) => ({
    accountId: acc,
    instrument,
    fills: [
      {
        time: '2026-11-16T14:00:00.000Z',
        side: 'buy' as const,
        qty: 1,
        price: 450,
        commission: 0,
        fees: 0,
      },
    ],
  });

  test('open manual trades are left out of the context', async () => {
    const { repo, acc, commit } = await setup();
    await commit(OPEN_ES, 'impE');
    const [imported] = await repo.trades.list(M);
    await repo.trades.createManual(M, MANUAL(imported!.instrument, acc.id));
    expect((await repo.imports.context(M, acc.id)).openTrades).toEqual([
      imported,
    ]);
  });

  test('creating or rebuilding a manual trade makes a pending import plan stale', async () => {
    const { repo, acc, plan } = await setup();
    const pending = await plan(OPEN_ES, 'imp1');
    const instrument = pending.trades[0]!.instrument;
    const made = await repo.trades.createManual(M, MANUAL(instrument, acc.id));
    await expect(repo.imports.commit(M, pending)).rejects.toMatchObject({
      reason: 'imports-changed',
    });
    const again = await plan(OPEN_ES, 'imp2');
    await repo.trades.replaceManual(M, made.id, MANUAL(instrument, acc.id));
    await expect(repo.imports.commit(M, again)).rejects.toMatchObject({
      reason: 'imports-changed',
    });
  });
});

describe('imports.commit', () => {
  test('the landing sample writes 8 trades and one active job, listed without its snapshots', async () => {
    const { repo, acc, plan } = await setup();
    const p = await plan(sampleFillsCsv(), 'impA');
    const job = await repo.imports.commit(M, p);
    const trades = await repo.trades.list(M);
    expect(trades).toEqual(p.trades);
    expect(trades).toHaveLength(8);
    expect(job).toEqual({
      id: 'impA',
      workspaceId: M,
      accountId: acc.id,
      fileName: 'impA.csv',
      mapping: p.mapping,
      rowCount: 16,
      tradeCount: 8,
      skippedCount: 0,
      duplicateCount: 0,
      status: 'active',
      createdAt: p.createdAt,
    });
    const listed = await repo.imports.list(M);
    expect(listed).toEqual([job]);
    expect(listed[0]).not.toHaveProperty('fingerprints');
    expect(listed[0]).not.toHaveProperty('replacedTrades');
    const next = await repo.imports.context(M, acc.id);
    expect(next.fingerprints).toHaveLength(16);
    expect(next.nextSerial).toBe(9);
  });

  test('a job counts skipped and duplicate rows; the list is newest first', async () => {
    const { repo, commit } = await setup();
    const first = await commit(sampleFillsCsv(), 'impA');
    const overlap =
      sampleFillsCsv() +
      '2026-11-18 09:41:00,ESZ5,Buy,1,6010\n2026-11-18 09:50:00,ESZ5,Sell,1,6012\nx,ESZ5,Buy,0,1\n';
    const second = await commit(overlap, 'impB');
    expect(second).toMatchObject({
      rowCount: 19,
      tradeCount: 1,
      skippedCount: 1,
      duplicateCount: 16,
    });
    expect(await repo.imports.list(M)).toEqual([second, first]);
    expect(await repo.trades.list(M)).toHaveLength(9);
  });

  test('the list follows commit order, not the time a plan was made', async () => {
    const { repo, plan } = await setup();
    // A plan made stale and planned again can carry an older time than one committed before it.
    await repo.imports.commit(M, {
      ...(await plan(OPEN_ES, 'impA')),
      createdAt: '2026-11-21T09:00:00.000Z',
    });
    await repo.imports.commit(M, {
      ...(await plan(CORN, 'impB', { mapping: { overrides: { ZC } } })),
      createdAt: '2026-11-21T08:00:00.000Z',
    });
    expect((await repo.imports.list(M)).map((j) => j.id)).toEqual([
      'impB',
      'impA',
    ]);
  });

  test('jobs with the same revision list by id', async () => {
    const { repo, db, commit } = await setup();
    await commit(OPEN_ES, 'impB');
    await commit(CORN, 'impA', { mapping: { overrides: { ZC } } });
    await db.imports.update([M, 'impA'], { revision: 1 });
    expect((await repo.imports.list(M)).map((j) => j.id)).toEqual([
      'impA',
      'impB',
    ]);
  });

  test('point values entered for an import are remembered for the next one, in this workspace only', async () => {
    const { repo, acc, plan, commit } = await setup();
    await commit(CORN, 'impA', { mapping: { overrides: { ZC } } });
    expect((await repo.imports.context(M, acc.id)).overrides).toEqual({ ZC });
    // A later file in the same root needs no point value; its own entries merge in.
    const ZW = { ...ZC, tickSize: 0.125 };
    const later = await plan(
      H +
        '2026-11-17 09:41:00,ZCZ5,Buy,1,452\n2026-11-17 10:41:00,ZCZ5,Sell,1,453\n',
      'impB',
      { mapping: { overrides: { ZW } } },
    );
    expect(later.blocked).toBeNull();
    expect(later.trades[0]!.gross).toBe(5000);
    await repo.imports.commit(M, later);
    expect((await repo.imports.context(M, acc.id)).overrides).toEqual({
      ZC,
      ZW,
    });
    expect((await repo.imports.context('sample', 'acc-a')).overrides).toEqual(
      {},
    );
  });

  test('a plan lands only in My workspace, and a blocked plan never lands', async () => {
    const { repo, plan } = await setup();
    const p = await plan(OPEN_ES, 'impA');
    await expect(repo.imports.commit('sample', p)).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(
      repo.imports.commit('sample', { ...p, workspaceId: 'sample' }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repo.imports.commit(M, { ...p, workspaceId: 'sample' }),
    ).rejects.toBeInstanceOf(RangeError);
    // Every row it writes or replaces must be the plan's workspace and account.
    const t = p.trades[0]!;
    for (const row of [
      { ...t, workspaceId: 'sample' },
      { ...t, accountId: 'acc-a' },
    ]) {
      await expect(
        repo.imports.commit(M, { ...p, trades: [row] }),
      ).rejects.toBeInstanceOf(RangeError);
      await expect(
        repo.imports.commit(M, { ...p, replacedTrades: [row] }),
      ).rejects.toBeInstanceOf(RangeError);
    }

    const blocked = await plan(H + 'x,ESZ5,Buy,0,1\n', 'impB');
    expect(blocked.blocked).toBe('no-rows');
    const error = await repo.imports.commit(M, blocked).catch((e) => e);
    expect(error).toBeInstanceOf(ImportBlockedError);
    expect(error).toMatchObject({ reason: 'no-rows' });

    expect(await repo.trades.list(M)).toEqual([]);
    expect(await repo.trades.list('sample')).toHaveLength(3);
    expect(await repo.imports.list(M)).toEqual([]);
    expect(await repo.imports.list('sample')).toEqual([]);
  });

  test('a tag removed after the context was read is not written on the trade that inherits it', async () => {
    const { repo, plan, commit } = await setup();
    await commit(OPEN_ES, 'impA');
    const [open] = await repo.trades.list(M);
    const keep = await repo.tags.create(M, {
      name: 'Keep',
      categoryId: 'custom-tags',
    });
    const drop = await repo.tags.create(M, {
      name: 'Drop',
      categoryId: 'mistakes',
    });
    await repo.trades.update(M, open!.id, { tagIds: [keep.id, drop.id] });
    const p = await plan(CLOSE_ES, 'impB');
    expect(p.trades[0]!.tagIds).toEqual([keep.id, drop.id]);

    await repo.tags.remove(M, drop.id);
    await repo.imports.commit(M, p);
    expect(await repo.trades.list(M)).toEqual([
      expect.objectContaining({
        id: open!.id,
        status: 'closed',
        tagIds: [keep.id],
      }),
    ]);
  });

  test('a commit that fails part way writes nothing', async () => {
    const { repo, plan, commit } = await setup();
    await commit(OPEN_ES, 'impA');
    const open = await repo.trades.list(M);
    const p = await plan(CLOSE_ES, 'impB');
    expect(p.replacedTrades).toEqual(open);
    // A value IndexedDB cannot store makes the job write throw after the trade writes.
    const broken = {
      ...p,
      fingerprints: [...p.fingerprints, (() => 0) as unknown as string],
    };
    await expect(repo.imports.commit(M, broken)).rejects.toThrow();
    expect(await repo.trades.list(M)).toEqual(open);
    expect((await repo.imports.list(M)).map((j) => j.id)).toEqual(['impA']);
  });
});

describe('imports.commit refuses a stale plan', () => {
  test('when its account was removed after the context was read', async () => {
    const { repo, db, acc, plan } = await setup();
    const p = await plan(CORN, 'impA', { mapping: { overrides: { ZC } } });
    await repo.accounts.remove(M, acc.id);
    const error = await repo.imports.commit(M, p).catch((e) => e);
    expect(error).toBeInstanceOf(StalePlanError);
    expect(error).toMatchObject({ reason: 'account-removed' });
    expect(await repo.trades.list(M)).toEqual([]);
    expect(await repo.imports.list(M)).toEqual([]);
    expect(await db.meta.get(META.overrides(M))).toBeUndefined();
  });

  test('when an import was committed or undone in the workspace since', async () => {
    const { repo, account, plan } = await setup();
    const other = await account('Other');
    // Two plans from the same history: the first commit makes the second stale.
    const first = await plan(OPEN_ES, 'impA');
    const second = await plan(CORN, 'impB', {
      accountId: other.id,
      mapping: { overrides: { ZC } },
    });
    const a = await repo.imports.commit(M, first);
    const stale = await repo.imports.commit(M, second).catch((e) => e);
    expect(stale).toBeInstanceOf(StalePlanError);
    expect(stale).toMatchObject({ reason: 'imports-changed' });
    expect(await repo.trades.list(M)).toEqual(first.trades);
    expect((await repo.imports.list(M)).map((j) => j.id)).toEqual([a.id]);
    expect((await repo.imports.context(M, other.id)).overrides).toEqual({});

    // An undo moves the history on as well.
    const third = await plan(CLOSE_ES, 'impC');
    expect(third.replacedTrades).toEqual(first.trades);
    await repo.imports.undo(M, a.id);
    await expect(repo.imports.commit(M, third)).rejects.toMatchObject({
      reason: 'imports-changed',
    });
    expect(await repo.trades.list(M)).toEqual([]);

    // Planned again from the current history, it commits.
    await repo.imports.commit(
      M,
      await plan(CORN, 'impB', {
        accountId: other.id,
        mapping: { overrides: { ZC } },
      }),
    );
    expect(await repo.trades.list(M)).toHaveLength(1);
  });
});

describe('imports.commit refuses a reused import id', () => {
  test('commit X, undo X, then X planned again: the commit is refused and the undone record stays', async () => {
    const { repo, plan } = await setup();
    const x = await repo.imports.commit(M, await plan(OPEN_ES, 'impX'));
    await repo.imports.undo(M, x.id);
    const history = await repo.imports.list(M);
    expect(history).toMatchObject([{ id: x.id, status: 'undone' }]);

    // Planned from the current history, so only the id is stale.
    const again = await plan(OPEN_ES, 'impX');
    expect(again.blocked).toBeNull();
    const error = await repo.imports.commit(M, again).catch((e) => e);
    expect(error).toBeInstanceOf(StalePlanError);
    expect(error).toMatchObject({ reason: 'imports-changed' });
    expect(await repo.imports.list(M)).toEqual(history);
    expect(await repo.trades.list(M)).toEqual([]);

    // Under a fresh id it lands beside the undone record.
    await repo.imports.commit(M, await plan(OPEN_ES, 'impY'));
    expect((await repo.imports.list(M)).map((j) => [j.id, j.status])).toEqual([
      ['impY', 'active'],
      ['impX', 'undone'],
    ]);
  });
});

describe('imports.undo', () => {
  test('a position opened by A and closed by B: undoing A first is refused, undoing B restores the open trade (Review Focus 2)', async () => {
    const { repo, commit } = await setup();
    const a = await commit(OPEN_ES, 'impA');
    const [opened] = await repo.trades.list(M);
    const tag = await repo.tags.create(M, {
      name: 'Breakout',
      categoryId: 'custom-tags',
    });
    const note = await repo.journal.save(M, {
      kind: 'note',
      title: 'ES long',
      body: null,
      linkedTradeIds: [opened!.id],
      tags: [],
    });
    const tagged = await repo.trades.update(M, opened!.id, {
      tagIds: [tag.id],
      noteId: note.id,
    });

    const b = await commit(CLOSE_ES, 'impB');
    const closed = await repo.trades.list(M);
    expect(closed).toEqual([
      expect.objectContaining({
        id: tagged.id,
        serial: tagged.serial,
        status: 'closed',
        tagIds: [tag.id],
        noteId: note.id,
        importId: b.id,
      }),
    ]);

    expect(await repo.imports.undo(M, a.id)).toEqual({
      ok: false,
      reason: 'later-import-depends',
      dependentJobId: b.id,
    });
    expect(await repo.trades.list(M)).toEqual(closed);
    expect((await repo.imports.list(M)).map((j) => j.status)).toEqual([
      'active',
      'active',
    ]);

    expect(await repo.imports.undo(M, b.id)).toEqual({ ok: true });
    expect(await repo.trades.list(M)).toEqual([tagged]);
    // The restored trade keeps the note's link to it.
    expect((await repo.journal.get(M, note.id))!.linkedTradeIds).toEqual([
      tagged.id,
    ]);

    expect(await repo.imports.undo(M, a.id)).toEqual({ ok: true });
    expect(await repo.trades.list(M)).toEqual([]);
    expect((await repo.journal.get(M, note.id))!.linkedTradeIds).toEqual([]);
  });

  test('a restored trade drops tags, strategies, rules and notes deleted after the import', async () => {
    const { repo, commit } = await setup();
    await commit(
      H +
        '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n2026-11-16 09:45:00,NQZ5,Buy,1,21000\n',
      'impA',
    );
    const [es, nq] = await repo.trades.list(M);
    const keep = await repo.tags.create(M, {
      name: 'Keep',
      categoryId: 'custom-tags',
    });
    const drop = await repo.tags.create(M, {
      name: 'Drop',
      categoryId: 'mistakes',
    });
    const edited = await repo.strategies.create(M, {
      name: 'Edited',
      description: '',
      assetClasses: ['future'],
      groups: [
        {
          title: 'Entry',
          rules: [
            { id: 'r-1', text: 'One', showWhen: 'always' },
            { id: 'r-2', text: 'Two', showWhen: 'always' },
          ],
        },
      ],
      checklist: [],
      status: 'active',
    });
    const removed = await repo.strategies.create(M, {
      name: 'Removed',
      description: '',
      assetClasses: ['future'],
      groups: [
        {
          title: 'Entry',
          rules: [{ id: 'r-3', text: 'Three', showWhen: 'always' }],
        },
      ],
      checklist: [],
      status: 'active',
    });
    const note = await repo.journal.save(M, {
      kind: 'note',
      title: 'ES',
      body: null,
      linkedTradeIds: [],
      tags: [],
    });
    await repo.trades.update(M, es!.id, {
      tagIds: [keep.id, drop.id],
      strategyIds: [edited.id, removed.id],
      ruleChecks: [
        { ruleId: 'r-1', followed: true },
        { ruleId: 'r-2', followed: false },
        { ruleId: 'r-3', followed: true },
      ],
      noteId: note.id,
      rating: 4,
    });
    await repo.trades.update(M, nq!.id, {
      strategyIds: [removed.id],
      ruleChecks: [{ ruleId: 'r-3', followed: true }],
    });

    const b = await commit(
      H +
        '2026-11-17 10:00:00,ESZ5,Sell,2,6015\n2026-11-17 10:05:00,NQZ5,Sell,1,21010\n',
      'impB',
    );
    await repo.tags.remove(M, drop.id);
    await repo.strategies.update(M, edited.id, {
      groups: [
        {
          title: 'Risk',
          rules: [{ id: 'r-2', text: 'Two', showWhen: 'always' }],
        },
      ],
    });
    await repo.strategies.remove(M, removed.id);
    await repo.journal.remove(M, note.id);

    expect(await repo.imports.undo(M, b.id)).toEqual({ ok: true });
    const [esBack, nqBack] = await repo.trades.list(M);
    expect(esBack).toMatchObject({
      id: es!.id,
      status: 'open',
      tagIds: [keep.id],
      strategyIds: [edited.id],
      ruleChecks: [{ ruleId: 'r-2', followed: false }],
      rating: 4,
    });
    expect(esBack).not.toHaveProperty('noteId');
    expect(nqBack).toMatchObject({
      id: nq!.id,
      status: 'open',
      strategyIds: [],
      ruleChecks: [],
    });
  });

  test('trades deleted by hand after an import do not stop its undo', async () => {
    const { repo, commit } = await setup();
    const landing = await commit(sampleFillsCsv(), 'impL');
    const [first] = await repo.trades.list(M);
    await repo.trades.remove(M, [first!.id]);
    expect(await repo.imports.undo(M, landing.id)).toEqual({ ok: true });
    expect(await repo.trades.list(M)).toEqual([]);
    expect((await repo.imports.list(M))[0]!.status).toBe('undone');
  });

  test('undo restores a replaced trade only while its replacement exists', async () => {
    const { repo, commit } = await setup();
    const a = await commit(
      H +
        '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n2026-11-16 09:45:00,NQZ5,Buy,1,21000\n',
      'impA',
    );
    const [es, nq] = await repo.trades.list(M);
    const b = await commit(
      H +
        '2026-11-17 10:00:00,ESZ5,Sell,2,6015\n2026-11-17 10:05:00,NQZ5,Sell,1,21010\n',
      'impB',
    );
    // The user deletes B's ES trade; B's NQ trade stays.
    await repo.trades.remove(M, [es!.id]);

    expect(await repo.imports.undo(M, b.id)).toEqual({ ok: true });
    // The deletion stands; NQ is open again as A left it.
    expect(await repo.trades.list(M)).toEqual([nq]);
    expect(await repo.imports.undo(M, a.id)).toEqual({ ok: true });
    expect(await repo.trades.list(M)).toEqual([]);
  });

  test('undo is refused while a later import in the account trades a symbol it touched', async () => {
    const { repo, account, commit } = await setup();
    // An earlier ES round trip in the account is no reason either.
    await commit(
      H +
        '2026-11-13 09:41:00,ESZ5,Buy,1,6000\n2026-11-13 09:50:00,ESZ5,Sell,1,6001\n',
      'impP',
    );
    await commit(OPEN_ES, 'impA');
    const x = (await repo.trades.list(M)).find((t) => t.importId === 'impA');
    const b = await commit(CLOSE_ES, 'impB');
    const c = await commit(H + '2026-11-18 09:41:00,ESZ5,Buy,1,6020\n', 'impC');
    // The same symbol in another account, and another symbol in this one, are no reason.
    const other = await account('Other');
    await commit(H + '2026-11-19 09:41:00,ESZ5,Buy,1,6030\n', 'impE', {
      accountId: other.id,
    });
    await commit(CORN.replaceAll('2026-11-16', '2026-11-19'), 'impF', {
      mapping: { overrides: { ZC } },
    });
    const before = await repo.trades.list(M);

    // Restoring A's open trade beside C's would leave two ES positions.
    expect(await repo.imports.undo(M, b.id)).toEqual({
      ok: false,
      reason: 'later-import-depends',
      dependentJobId: c.id,
    });
    expect(await repo.trades.list(M)).toEqual(before);

    expect(await repo.imports.undo(M, c.id)).toEqual({ ok: true });
    expect(await repo.imports.undo(M, b.id)).toEqual({ ok: true });
    expect(
      (await repo.trades.list(M))
        .filter((t) => t.accountId !== other.id)
        .map((t) => t.importId),
    ).toEqual(['impP', 'impA', 'impF']);
    expect(await repo.trades.get(M, x!.id)).toEqual(x);
  });

  test('a later import in a symbol is no reason when the undo restores nothing there', async () => {
    const { repo, commit } = await setup();
    // J's closed trades replaced nothing; deleting them leaves L's fills as FIFO built them.
    const j = await commit(
      'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price\n2026-11-16 09:30:00,2026-11-16 09:45:00,ESZ5,Long,1,6000,6004\n',
      'impJ',
    );
    expect(j.mapping.kind).toBe('closed-trades');
    const l = await commit(
      H +
        '2026-11-17 09:41:00,ESZ5,Buy,1,6010\n2026-11-17 09:50:00,ESZ5,Sell,1,6011\n',
      'impL',
    );
    const kept = (await repo.trades.list(M)).filter((t) => t.importId === l.id);
    expect(await repo.imports.undo(M, j.id)).toEqual({ ok: true });
    expect(await repo.trades.list(M)).toEqual(kept);
  });

  test('a later import in a symbol is no reason when the replaced trade there stays deleted', async () => {
    const { repo, commit } = await setup();
    await commit(OPEN_ES, 'impA');
    const b = await commit(CLOSE_ES, 'impB');
    // The user deletes B's closed ES trade, so undoing B won't bring A's open one back.
    const [closed] = await repo.trades.list(M);
    await repo.trades.remove(M, [closed!.id]);
    const c = await commit(
      H +
        '2026-11-18 09:41:00,ESZ5,Buy,1,6020\n2026-11-18 09:50:00,ESZ5,Sell,1,6021\n',
      'impC',
    );
    const after = await repo.trades.list(M);
    expect(after.map((t) => t.importId)).toEqual([c.id]);
    expect(await repo.imports.undo(M, b.id)).toEqual({ ok: true });
    expect(await repo.trades.list(M)).toEqual(after);
  });

  test('an import that merged two open trades into one restores both on undo, and unlinks the one it removed', async () => {
    const { repo, commit, plan } = await setup();
    await commit(OPEN_ES, 'impA');
    // A second open ES trade beside A's, as an older undo could leave behind.
    await commit(H + '2026-11-18 09:41:00,ESZ5,Buy,1,6020\n', 'impC', {
      alter: (c) => ({ ...c, openTrades: [] }),
    });
    const [x, y] = await repo.trades.list(M);
    const tag = await repo.tags.create(M, {
      name: 'T',
      categoryId: 'custom-tags',
    });
    await repo.trades.update(M, y!.id, { tagIds: [tag.id] });
    const note = await repo.journal.save(M, {
      kind: 'note',
      title: 'Y',
      body: null,
      linkedTradeIds: [y!.id],
      tags: [],
    });
    const before = await repo.trades.list(M);
    expect(before.map((t) => t.status)).toEqual(['open', 'open']);

    const d = await plan(H + '2026-11-19 10:00:00,ESZ5,Sell,3,6030\n', 'impD');
    expect(d.replacedTrades.map((t) => t.id)).toEqual([x!.id, y!.id]);
    expect(d.trades.map((t) => t.id)).toEqual([x!.id]);
    await repo.imports.commit(M, d);
    // Y is gone, so the note no longer links it.
    expect((await repo.journal.get(M, note.id))!.linkedTradeIds).toEqual([]);

    expect(await repo.imports.undo(M, d.importId)).toEqual({ ok: true });
    expect(await repo.trades.list(M)).toEqual(before);
  });

  test('undo removes the files of the trades it deletes and keeps those of a trade it restores', async () => {
    const { repo, db, commit } = await setup();
    const file = {
      bytes: new ArrayBuffer(4),
      type: 'application/pdf',
      name: 'plan.pdf',
    };
    const a = await commit(OPEN_ES, 'impA');
    const [opened] = await repo.trades.list(M);
    await repo.files.add(M, `trade:${opened!.id}`, file, { images: false });
    const b = await commit(CLOSE_ES, 'impB');
    const c = await commit(CORN, 'impC', { mapping: { overrides: { ZC } } });
    const corn = (await repo.trades.list(M)).find((t) => t.importId === c.id)!;
    await repo.files.add(M, `trade:${corn.id}`, file, { images: false });
    const owners = async () =>
      (await db.files.toArray()).map((f) => f.owner).sort();
    expect(await owners()).toEqual(
      [`trade:${opened!.id}`, `trade:${corn.id}`].sort(),
    );

    // The closed trade goes with its job; the open one it replaced comes back with its file.
    expect(await repo.imports.undo(M, c.id)).toEqual({ ok: true });
    expect(await repo.imports.undo(M, b.id)).toEqual({ ok: true });
    expect(await owners()).toEqual([`trade:${opened!.id}`]);
    expect(await repo.imports.undo(M, a.id)).toEqual({ ok: true });
    expect(await owners()).toEqual([]);
  });

  test('undo twice is idempotent, and the undone rows stop counting as imported', async () => {
    const { repo, acc, plan, commit } = await setup();
    const a = await commit(sampleFillsCsv(), 'impA');
    const pb = await plan(CORN, 'impB', { mapping: { overrides: { ZC } } });
    await repo.imports.commit(M, pb);

    expect(await repo.imports.undo(M, a.id)).toEqual({ ok: true });
    const [, undone] = await repo.imports.list(M);
    expect(undone).toMatchObject({
      id: a.id,
      status: 'undone',
      undoneAt: expect.any(String),
    });
    expect(await repo.imports.undo(M, a.id)).toEqual({ ok: true });
    expect((await repo.imports.list(M))[1]).toEqual(undone);

    expect(await repo.trades.list(M)).toEqual(pb.trades);
    expect((await repo.imports.context(M, acc.id)).fingerprints).toEqual(
      pb.fingerprints,
    );
    // The landing sample imports again in full.
    expect((await plan(sampleFillsCsv(), 'impC')).trades).toHaveLength(8);
  });

  test('a missing job throws NotFoundError, also from another workspace', async () => {
    const { repo, commit } = await setup();
    const a = await commit(OPEN_ES, 'impA');
    await expect(repo.imports.undo(M, 'nope')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(repo.imports.undo('sample', a.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await repo.trades.list(M)).toHaveLength(1);
  });

  test('an undo that fails part way changes nothing', async () => {
    const { repo, db, commit } = await setup();
    const a = await commit(OPEN_ES, 'impA');
    const [open] = await repo.trades.list(M);
    // A corrupt row (links not an array) makes the unlink step throw after the trade delete.
    await db.journal.put({
      id: 'corrupt',
      workspaceId: M,
      kind: 'note',
      title: '',
      body: null,
      linkedTradeIds: open!.id as unknown as string[],
      tags: [],
      updatedAt: '2026-11-20T00:00:00.000Z',
    });
    await expect(repo.imports.undo(M, a.id)).rejects.toThrow();
    expect(await repo.trades.list(M)).toEqual([open]);
    expect((await repo.imports.list(M))[0]!.status).toBe('active');
  });
});

describe('trades.remove of an imported trade', () => {
  test('an open imported trade is refused, so the next import still closes it; a closed one deletes', async () => {
    const { repo, commit } = await setup();
    const a = await commit(
      H +
        '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n2026-11-16 09:45:00,ZCZ5,Buy,1,450\n2026-11-16 10:41:00,ZCZ5,Sell,1,451\n',
      'impA',
      { mapping: { overrides: { ZC } } },
    );
    const [es, zc] = await repo.trades.list(M);
    expect([es!.status, zc!.status]).toEqual(['open', 'closed']);
    const note = await repo.journal.save(M, {
      kind: 'note',
      title: 'Both',
      body: null,
      linkedTradeIds: [es!.id, zc!.id],
      tags: [],
    });
    const before = await repo.trades.list(M);

    // One open imported trade in the call refuses all of it.
    const error = await repo.trades.remove(M, [zc!.id, es!.id]).catch((e) => e);
    expect(error).toBeInstanceOf(OpenImportedTradeError);
    expect(error).toMatchObject({ tradeId: es!.id, importId: a.id });
    expect(await repo.trades.list(M)).toEqual(before);
    expect((await repo.journal.get(M, note.id))!.linkedTradeIds).toEqual([
      es!.id,
      zc!.id,
    ]);

    await repo.trades.remove(M, [zc!.id]);
    expect(await repo.trades.list(M)).toEqual([es]);

    // The sell closes the long instead of opening a short.
    await commit(CLOSE_ES, 'impB');
    const [closed] = await repo.trades.list(M);
    expect(closed).toMatchObject({
      id: es!.id,
      direction: 'long',
      status: 'closed',
    });
    await repo.trades.remove(M, [closed!.id]);
    expect(await repo.trades.list(M)).toEqual([]);
    expect((await repo.journal.get(M, note.id))!.linkedTradeIds).toEqual([]);
  });
});

describe('imports.undo on an archived account (M6)', () => {
  test('is refused, and the trades and the job stay as they are', async () => {
    const { repo, acc, commit } = await setup();
    const job = await commit(
      H +
        '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n2026-11-16 10:00:00,ESZ5,Sell,2,6015\n',
      'impArch',
    );
    await repo.accounts.update(M, acc.id, { status: 'archived' });
    const before = await repo.trades.list(M);
    const refused = repo.imports.undo(M, job.id);
    await expect(refused).rejects.toBeInstanceOf(ArchivedAccountError);
    await expect(refused).rejects.toMatchObject({ accountIds: [acc.id] });
    expect(await repo.trades.list(M)).toEqual(before);
    expect(
      (await repo.imports.list(M)).find((j) => j.id === job.id)?.status,
    ).toBe('active');
  });
});

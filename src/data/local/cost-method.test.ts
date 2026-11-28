import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, test } from 'vitest';
import { parseCsv } from '@/domain/import/csv';
import { guessMapping } from '@/domain/import/mapping';
import { planImport } from '@/domain/import/plan';
import { resolveInstrument } from '@/domain/instruments';
import { buildTrades, finalizeTrade } from '@/domain/trade-builder';
import type { CostMethod, Execution, Side, Trade } from '@/domain/types';
import { fixtureSample } from '../__fixtures__/sample';
import { generateSampleWorkspace, SAMPLE_SEED } from '../seed/generate';
import { ArchivedAccountError, NotFoundError } from '../repository';
import { KeelDb } from './db';
import { rebuiltUnder } from './cost-method';
import { createLocalRepository } from './local-repository';

const S = 'sample';
const M = 'mine';

function fill(
  id: string,
  symbol: string,
  side: Side,
  qty: number,
  price: number,
  time: string,
  accountId = 'acc-a',
): Execution {
  return {
    id,
    accountId,
    symbol,
    side,
    qty,
    price,
    time,
    fees: 100,
    commission: 50,
  };
}

/** Two lots in, one out: open, and its realized part depends on the method. */
const ES_OPEN = [
  fill('es-1', 'ESZ5', 'buy', 1, 6000, '2026-11-16T14:00:00Z'),
  fill('es-2', 'ESZ5', 'buy', 1, 6010, '2026-11-16T14:05:00Z'),
  fill('es-3', 'ESZ5', 'sell', 1, 6020, '2026-11-17T14:10:00Z'),
];
/** Two lots in, two out, a pair converted at each exit's rate: the closed total depends on the method. */
const JPY = [
  fill('jp-1', 'USDJPY', 'buy', 1, 154, '2026-11-16T15:00:00Z'),
  fill('jp-2', 'USDJPY', 'buy', 1, 155, '2026-11-16T15:01:00Z'),
  fill('jp-3', 'USDJPY', 'sell', 1, 155.5, '2026-11-16T15:02:00Z'),
  fill('jp-4', 'USDJPY', 'sell', 1, 156, '2026-11-16T15:03:00Z'),
];

function built(fills: Execution[], serial: number): Trade[] {
  return buildTrades(fills, {
    workspaceId: S,
    startSerial: serial,
    resolve: (s) => resolveInstrument(s),
    accountCurrency: () => 'USD',
  }).trades;
}

/** The journaling a rebuild must never touch. */
const JOURNAL: Partial<Trade> = {
  strategyIds: ['str-1'],
  tagIds: ['tag-fomo', 'tag-setup'],
  ruleChecks: [{ ruleId: 'r-1', followed: true }],
  rating: 3,
  noteId: 'j-1',
  reviewed: true,
  importId: 'imp-x',
  plannedStop: 5990,
  initialRisk: 50_000,
};

async function setup() {
  const indexedDB = new IDBFactory();
  const repo = createLocalRepository({
    indexedDB,
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repo.trades.list(S);
  const db = new KeelDb({ indexedDB, IDBKeyRange });
  await db.open();
  const trades = [...built(ES_OPEN, 10), ...built(JPY, 11)].map((t) => ({
    ...t,
    ...JOURNAL,
  }));
  await db.trades.bulkPut(trades);
  return { repo, db, trades };
}

describe('accounts.setCostMethod', () => {
  test('keeps every id and journal field of the account, and changes only the method and the figures', async () => {
    const { repo, trades } = await setup();
    const before = new Map(
      (await repo.trades.list(S)).map((t) => [t.id, t] as const),
    );
    const account = await repo.accounts.setCostMethod(S, 'acc-a', 'lifo');
    expect(account.costMethod).toBe('lifo');
    const after = await repo.trades.list(S);
    expect(after.map((t) => t.id)).toEqual([...before.keys()]);

    const own = after.filter((t) => t.accountId === 'acc-a');
    expect(own).toHaveLength(4);
    for (const t of own) {
      const was = before.get(t.id)!;
      expect(t.costMethod).toBe('lifo');
      // Every other field is what it was.
      expect(t).toEqual({
        ...was,
        costMethod: 'lifo',
        gross: t.gross,
        net: t.net,
      });
      expect(t).toEqual(finalizeTrade(was, 'lifo'));
    }
    for (const was of trades) {
      const t = after.find((x) => x.id === was.id)!;
      for (const k of Object.keys(JOURNAL) as (keyof Trade)[])
        expect(t[k], `${was.id}.${k}`).toEqual(was[k]);
    }

    // The open trade's realized part and the converted pair's total moved.
    const open = after.find((t) => t.status === 'open')!;
    const was = before.get(open.id)!;
    expect(was.gross).toBe(100_000);
    expect(open.gross).toBe(50_000);
    expect(open.net).toBe(open.gross - open.fees);
    const jpy = after.find((t) => t.instrument.symbol === 'USDJPY')!;
    expect(jpy.gross).not.toBe(before.get(jpy.id)!.gross);
  });

  test('leaves other accounts alone', async () => {
    const { repo } = await setup();
    const archived = (await repo.trades.list(S)).find((t) => t.id === 'f-3')!;
    const other = (await repo.trades.list(S)).find((t) => t.id === 'f-1')!;
    await repo.accounts.setCostMethod(S, 'acc-a', 'average');
    expect(await repo.trades.get(S, 'f-3')).toEqual(archived);
    // acc-a's own fixture trades have no executions to replay: stamped, nothing else.
    expect(await repo.trades.get(S, 'f-1')).toEqual({
      ...other,
      costMethod: 'average',
    });
  });

  test('FIFO is stamped by omission, on the trades and on the account', async () => {
    const { repo } = await setup();
    await repo.accounts.setCostMethod(S, 'acc-a', 'lifo');
    const back = await repo.accounts.setCostMethod(S, 'acc-a', 'fifo');
    expect('costMethod' in back).toBe(false);
    for (const t of await repo.trades.list(S))
      expect('costMethod' in t, t.id).toBe(false);
    const open = (await repo.trades.list(S)).find((t) => t.status === 'open')!;
    expect(open.gross).toBe(100_000);
  });

  test('the same method again writes nothing', async () => {
    const { repo } = await setup();
    const before = await repo.trades.list(S);
    await repo.accounts.setCostMethod(S, 'acc-a', 'fifo');
    expect(await repo.trades.list(S)).toEqual(before);
  });

  test('refuses an archived account and changes nothing', async () => {
    const { repo } = await setup();
    const trades = await repo.trades.list(S);
    const error = await repo.accounts
      .setCostMethod(S, 'acc-b', 'lifo')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArchivedAccountError);
    expect(error).toMatchObject({ accountIds: ['acc-b'] });
    expect(await repo.trades.list(S)).toEqual(trades);
    expect(
      (await repo.accounts.list(S)).find((a) => a.id === 'acc-b')!.costMethod,
    ).toBeUndefined();
  });

  test('a missing account throws', async () => {
    const { repo } = await setup();
    await expect(
      repo.accounts.setCostMethod(S, 'nope', 'lifo'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('one transaction: a trade that cannot be rebuilt leaves the account and every trade as they were', async () => {
    const { repo, db } = await setup();
    // Last in serial order, so earlier trades have been rebuilt when it throws.
    await db.trades.put({
      ...built(ES_OPEN, 99)[0]!,
      id: 'broken',
      serial: 99,
      instrument: undefined as never,
    });
    const trades = await repo.trades.list(S);
    const accounts = await repo.accounts.list(S);
    await expect(
      repo.accounts.setCostMethod(S, 'acc-a', 'lifo'),
    ).rejects.toThrow();
    expect(await repo.trades.list(S)).toEqual(trades);
    expect(await repo.accounts.list(S)).toEqual(accounts);
  });

  test('update routes a method change through the rebuild, and refuses it on an archived account', async () => {
    const { repo } = await setup();
    const updated = await repo.accounts.update(S, 'acc-a', {
      costMethod: 'lifo',
      name: 'Renamed',
    });
    expect(updated).toMatchObject({ costMethod: 'lifo', name: 'Renamed' });
    expect(
      (await repo.trades.list(S)).find((t) => t.status === 'open')!.gross,
    ).toBe(50_000);
    // Untouched by a patch that leaves it out or sets it to undefined.
    const kept = await repo.accounts.update(S, 'acc-a', {
      costMethod: undefined,
      broker: 'Other',
    });
    expect(kept.costMethod).toBe('lifo');
    await expect(
      repo.accounts.update(S, 'acc-b', { costMethod: 'lifo' }),
    ).rejects.toBeInstanceOf(ArchivedAccountError);
    // An archived account's other edits are as they were.
    await expect(
      repo.accounts.update(S, 'acc-b', { name: 'Old demo 2' }),
    ).resolves.toMatchObject({ name: 'Old demo 2' });
  });

  test('create keeps a method, and writes FIFO as unset', async () => {
    const { repo } = await setup();
    const input = {
      name: 'New',
      broker: 'b',
      type: 'live' as const,
      currency: 'USD',
      startingBalance: 0,
      status: 'active' as const,
    };
    expect(
      (await repo.accounts.create(M, { ...input, costMethod: 'lifo' }))
        .costMethod,
    ).toBe('lifo');
    expect(
      'costMethod' in
        (await repo.accounts.create(M, { ...input, costMethod: 'fifo' })),
    ).toBe(false);
  });
});

describe("the account's method reaches what it builds", () => {
  const H = 'Date/Time,Symbol,Buy/Sell,Quantity,Price\n';
  // 6000 and 6010 in, 6020 out: the open part's realized P&L is the method's.
  const OPEN =
    H +
    '2026-11-16 09:41:00,ESZ5,Buy,1,6000\n2026-11-16 09:42:00,ESZ5,Buy,1,6010\n2026-11-16 09:43:00,ESZ5,Sell,1,6020\n';
  const CLOSE = H + '2026-11-17 10:00:00,ESZ5,Sell,1,6005\n';

  async function mine() {
    const indexedDB = new IDBFactory();
    let clock = Date.parse('2026-11-21T12:00:00.000Z');
    const repo = createLocalRepository({
      indexedDB,
      IDBKeyRange,
      sample: async () => fixtureSample(),
      now: () => new Date((clock += 60_000)),
    });
    const acc = await repo.accounts.create(M, {
      name: 'Futures',
      broker: 'b',
      type: 'live',
      currency: 'USD',
      startingBalance: 0,
      status: 'active',
    });
    let n = 0;
    const commit = async (text: string) => {
      const ctx = await repo.imports.context(M, acc.id);
      const parsed = parseCsv(text);
      const plan = planImport(
        parsed,
        guessMapping(parsed, { sourceTimeZone: 'America/New_York' }),
        ctx,
        {
          importId: `imp${++n}`,
          fileName: `imp${n}.csv`,
          now: new Date(Date.UTC(2026, 10, 21, 0, n)).toISOString(),
        },
      );
      return { plan, job: await repo.imports.commit(M, plan) };
    };
    return { repo, acc, commit };
  }

  test('the import context carries the method when the account has one', async () => {
    const { repo, acc } = await mine();
    expect('costMethod' in (await repo.imports.context(M, acc.id))).toBe(false);
    await repo.accounts.setCostMethod(M, acc.id, 'lifo');
    expect(await repo.imports.context(M, acc.id)).toMatchObject({
      costMethod: 'lifo',
    });
  });

  test("an import builds with the account's method", async () => {
    for (const [method, gross] of [
      ['fifo', 100_000],
      ['lifo', 50_000],
      ['average', 75_000],
    ] as [CostMethod, number][]) {
      const { repo, acc, commit } = await mine();
      await repo.accounts.setCostMethod(M, acc.id, method);
      await commit(OPEN);
      const [t] = await repo.trades.list(M);
      expect(t, method).toMatchObject({ status: 'open', gross });
      expect(t!.costMethod).toBe(method === 'fifo' ? undefined : method);
    }
  });

  test("a manual trade builds with the account's method, and so does a rebuild of it", async () => {
    const { repo, acc } = await mine();
    await repo.accounts.setCostMethod(M, acc.id, 'lifo');
    const instrument = resolveInstrument('ESZ5')!;
    const at = (time: string, side: Side, price: number) => ({
      time,
      side,
      qty: 1,
      price,
      commission: 0,
      fees: 0,
    });
    const fills = [
      at('2026-11-16T14:00:00.000Z', 'buy', 6000),
      at('2026-11-16T14:01:00.000Z', 'buy', 6010),
      at('2026-11-16T14:02:00.000Z', 'sell', 6020),
    ];
    const made = await repo.trades.createManual(M, {
      accountId: acc.id,
      instrument,
      fills,
    });
    expect(made).toMatchObject({ costMethod: 'lifo', gross: 50_000 });
    await repo.accounts.setCostMethod(M, acc.id, 'fifo');
    expect((await repo.trades.get(M, made.id))!.gross).toBe(100_000);
    const again = await repo.trades.replaceManual(M, made.id, {
      accountId: acc.id,
      instrument,
      fills,
    });
    expect(again.gross).toBe(100_000);
    expect('costMethod' in again).toBe(false);
  });

  // Plan 6B meets Plan 6C: a trade grouped by hand is built under the method too.
  test("a merge and a split build with the account's method", async () => {
    const { repo, acc } = await mine();
    await repo.accounts.setCostMethod(M, acc.id, 'lifo');
    const instrument = resolveInstrument('ESZ5')!;
    const f = (time: string, side: Side, price: number) => ({
      time: `2026-11-16T${time}:00.000Z`,
      side,
      qty: 1,
      price,
      commission: 0,
      fees: 0,
    });
    const a = await repo.trades.createManual(M, {
      accountId: acc.id,
      instrument,
      fills: [
        f('14:00', 'buy', 6000),
        f('14:01', 'buy', 6010),
        f('14:02', 'sell', 6020),
      ],
    });
    const b = await repo.trades.createManual(M, {
      accountId: acc.id,
      instrument,
      fills: [f('14:10', 'buy', 6030), f('14:11', 'sell', 6040)],
    });
    const fills = [...a.executions, ...b.executions].map((e) => e.id);
    // LIFO closes the newest lot each time: 10 points twice, the 6000 lot left open (FIFO: 50 points).
    const merged = await repo.trades.merge(M, [a.id, b.id], fills);
    expect(merged).toMatchObject({
      grouping: 'manual',
      costMethod: 'lifo',
      status: 'open',
      gross: 100_000,
    });
    const { original, created } = await repo.trades.split(
      M,
      merged.id,
      merged.executions.slice(3).map((e) => e.id),
    );
    expect(original).toMatchObject({ costMethod: 'lifo', gross: 50_000 });
    expect(created).toMatchObject({ costMethod: 'lifo', gross: 50_000 });
    // The stored rows say the same.
    expect(await repo.trades.get(M, merged.id)).toEqual(original);
  });

  test("an undo that restores trades rebuilds them with the account's current method", async () => {
    const { repo, acc, commit } = await mine();
    await commit(OPEN);
    const first = await repo.trades.list(M);
    expect(first[0]).toMatchObject({ status: 'open', gross: 100_000 });
    const { job } = await commit(CLOSE);
    expect(await repo.trades.list(M)).toEqual([
      expect.objectContaining({ id: first[0]!.id, status: 'closed' }),
    ]);
    // The method changes after both imports; the undo restores a FIFO-built snapshot.
    await repo.accounts.setCostMethod(M, acc.id, 'lifo');
    expect(await repo.imports.undo(M, job.id)).toEqual({ ok: true });
    const [restored] = await repo.trades.list(M);
    expect(restored).toMatchObject({
      id: first[0]!.id,
      status: 'open',
      costMethod: 'lifo',
      gross: 50_000,
    });
    expect(restored).toEqual(finalizeTrade(first[0]!, 'lifo'));
  });

  test('an undo under the method the snapshot was built with restores it exactly', async () => {
    const { repo, commit } = await mine();
    await commit(OPEN);
    const first = await repo.trades.list(M);
    const { job } = await commit(CLOSE);
    await repo.imports.undo(M, job.id);
    expect(await repo.trades.list(M)).toEqual(first);
  });
});

describe('rebuiltUnder', () => {
  const [open] = built(ES_OPEN, 1);

  test('a trade already built under the method comes back as it is', () => {
    expect(rebuiltUnder([open!], 'fifo', 'USD')[0]).toBe(open);
    const lifo = finalizeTrade(open!, 'lifo');
    expect(rebuiltUnder([lifo], 'lifo', 'USD')[0]).toBe(lifo);
  });

  test("a trip row's own conversion survives: only its method is stamped", () => {
    // A pair without the account's currency, whose figure the file gave in the account's.
    const eurgbp = built(
      [
        fill('e-1', 'EURGBP', 'buy', 1, 0.85, '2026-11-16T15:00:00Z'),
        fill('e-2', 'EURGBP', 'sell', 1, 0.86, '2026-11-16T15:30:00Z'),
      ],
      1,
    )[0]!;
    const trip: Trade = {
      ...eurgbp,
      pnlCurrency: 'USD',
      gross: 12_345,
      net: 12_195,
    };
    const [lifo] = rebuiltUnder([trip], 'lifo', 'USD');
    expect(lifo).toEqual({ ...trip, costMethod: 'lifo' });
    expect(rebuiltUnder([lifo!], 'fifo', 'USD')[0]).toEqual(trip);
  });
});

describe('a method change and a pending import plan', () => {
  test('makes the plan stale, as a commit or a manual trade does', async () => {
    const indexedDB = new IDBFactory();
    const repo = createLocalRepository({
      indexedDB,
      IDBKeyRange,
      sample: async () => fixtureSample(),
    });
    const acc = await repo.accounts.create(M, {
      name: 'Futures',
      broker: 'b',
      type: 'live',
      currency: 'USD',
      startingBalance: 0,
      status: 'active',
    });
    const read = () => repo.imports.context(M, acc.id);
    const before = (await read()).importRevision;
    await repo.accounts.setCostMethod(M, acc.id, 'lifo');
    expect((await read()).importRevision).toBeGreaterThan(before);
    const after = (await read()).importRevision;
    await repo.accounts.setCostMethod(M, acc.id, 'lifo');
    expect((await read()).importRevision).toBe(after);
  });
});

describe('cost-method rebuild budget', () => {
  test('rebuild budget: largest sample account in under 50 ms', async () => {
    const sample = generateSampleWorkspace({
      seed: SAMPLE_SEED,
      endDate: '2026-11-19',
    });
    const repo = createLocalRepository({
      indexedDB: new IDBFactory(),
      IDBKeyRange,
      sample: async () => sample,
    });
    const counts = new Map<string, number>();
    for (const t of sample.trades)
      counts.set(t.accountId, (counts.get(t.accountId) ?? 0) + 1);
    const [largest, count] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
    expect(count).toBeGreaterThan(300);
    await repo.trades.list(S); // opens and seeds
    // The median of five warm rebuilds, each to another method, as the repo's other budgets read.
    const took: number[] = [];
    for (const method of [
      'lifo',
      'average',
      'fifo',
      'lifo',
      'average',
    ] as const) {
      const start = performance.now();
      await repo.accounts.setCostMethod(S, largest, method);
      took.push(performance.now() - start);
    }
    const median = took.sort((a, b) => a - b)[2]!;
    expect(median, took.join(' ')).toBeLessThan(50);
  });
});

import { describe, expect, test } from 'vitest';
import {
  buildGroupedTrade,
  canMerge,
  canSplit,
  mergeKeeper,
  mergeTrades,
  splitTrade,
} from './grouping';
import { resolveInstrument } from './instruments';
import { levelProblems, sidesOf } from './risk';
import { buildTrades, type BuildOptions } from './trade-builder';
import type { Execution, LevelSide, Side, Trade } from './types';

const opts: BuildOptions = {
  workspaceId: 'w',
  startSerial: 1,
  resolve: (s) => resolveInstrument(s),
  accountCurrency: () => 'USD',
};
const NEW = { ...opts, serial: 9, id: 'split-id' };

const time = (minute: number) =>
  `2026-03-02T15:${String(minute).padStart(2, '0')}:00Z`;

function fill(
  id: string,
  side: Side,
  qty: number,
  price: number,
  minute: number,
  extra: Partial<Execution> = {},
): Execution {
  return {
    id,
    accountId: 'a1',
    symbol: 'AAPL',
    side,
    qty,
    price,
    time: time(minute),
    fees: 0,
    commission: 0,
    ...extra,
  };
}

/** The one trade the fills make, with the journaling fields a test sets on top. */
function one(fills: Execution[], patch: Partial<Trade> = {}): Trade {
  const [t, ...rest] = buildTrades(fills, opts).trades;
  if (!t || rest.length > 0) throw new Error('the fixture must be one trade');
  return { ...t, ...patch };
}
const ids = (t: Trade) => t.executions.map((e) => e.id);
const price = (value: number, qty: number): LevelSide => ({
  unit: 'price',
  levels: [{ value, qty }],
});

/** Long 10 at 100, out at 110: +10,000 cents. */
const tripA = (patch: Partial<Trade> = {}) =>
  one([fill('a1', 'buy', 10, 100, 0), fill('a2', 'sell', 10, 110, 1)], patch);
/** Long 10 at 120, out at 115: -5,000 cents. */
const tripB = (patch: Partial<Trade> = {}) =>
  one([fill('b1', 'buy', 10, 120, 5), fill('b2', 'sell', 10, 115, 6)], patch);
/** Long 10 at 100, out 4 at 104 and 6 at 108: +6,400 cents. */
const tripT = (patch: Partial<Trade> = {}) =>
  one(
    [
      fill('s1', 'buy', 10, 100, 0),
      fill('s2', 'sell', 4, 104, 1),
      fill('s3', 'sell', 6, 108, 2),
    ],
    patch,
  );

describe('buildGroupedTrade', () => {
  test('one trade across a flat point, closed when the position ends flat', () => {
    const a = tripA();
    const fills = [...a.executions, ...tripB().executions];
    const t = buildGroupedTrade(fills, a, opts);
    expect(t).toMatchObject({
      id: a.id,
      status: 'closed',
      direction: 'long',
      openedAt: time(0),
      closedAt: time(6),
      avgEntry: 110,
      avgExit: 112.5,
      maxPosition: 10,
      gross: 5000,
      net: 5000,
      fees: 0,
    });
    expect(ids(t)).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  test('open when the position does not end flat', () => {
    const a = tripA();
    const t = buildGroupedTrade(
      [...a.executions, fill('b1', 'buy', 6, 120, 5)],
      a,
      opts,
    );
    expect(t.status).toBe('open');
    expect(t).not.toHaveProperty('closedAt');
    expect(t).toMatchObject({ avgExit: 110, net: 10000 });
  });

  test('a rebuilt open trade drops the exit and close time of the closed one', () => {
    const a = tripA();
    const t = buildGroupedTrade([fill('x', 'buy', 5, 100, 0)], a, opts);
    expect(t.status).toBe('open');
    expect(t).not.toHaveProperty('avgExit');
    expect(t).not.toHaveProperty('closedAt');
  });

  test('reads the fills in time order and leaves the input alone', () => {
    const a = tripA();
    const fills = [
      fill('a2', 'sell', 10, 110, 1),
      fill('a1', 'buy', 10, 100, 0),
    ];
    const t = buildGroupedTrade(fills, a, opts);
    expect(ids(t)).toEqual(['a1', 'a2']);
    expect(t.net).toBe(10000);
    expect(fills.map((f) => f.id)).toEqual(['a2', 'a1']);
  });

  test('a fill that crosses the flat point is split, with its costs', () => {
    const a = tripA();
    const t = buildGroupedTrade(
      [
        fill('g1', 'buy', 10, 100, 0),
        fill('g2', 'sell', 15, 110, 1, { commission: 300 }),
        fill('g3', 'buy', 5, 105, 2),
      ],
      a,
      opts,
    );
    expect(ids(t)).toEqual(['g1', 'g2:a', 'g2:b', 'g3']);
    expect(t.executions.map((e) => [e.qty, e.commission])).toEqual([
      [10, 0],
      [10, 200],
      [5, 100],
      [5, 0],
    ]);
    // +100 on the long leg, +25 on the short one, less 300 of commission.
    expect(t).toMatchObject({
      status: 'closed',
      direction: 'long',
      gross: 12500,
      fees: 300,
      net: 12200,
      maxPosition: 10,
    });
  });

  test('swap enters net and leaves gross (R3)', () => {
    const a = tripA({ swap: -300 });
    const t = buildGroupedTrade(a.executions, a, opts);
    expect(t).toMatchObject({ gross: 10000, net: 9700, swap: -300 });
  });

  test('a trade with no swap has none after a rebuild', () => {
    const a = tripA();
    const t = buildGroupedTrade(a.executions, a, opts);
    expect(t).not.toHaveProperty('swap');
    expect(t.net).toBe(10000);
  });

  test('keeps the record of the base, but not figures of fills it no longer has', () => {
    const a = tripA({
      rating: 3,
      noteId: 'n',
      tagIds: ['t'],
      mae: -500,
      mfe: 900,
    });
    const t = buildGroupedTrade(a.executions, a, opts);
    expect(t).toMatchObject({ rating: 3, noteId: 'n', tagIds: ['t'] });
    expect(t).not.toHaveProperty('mae');
    expect(t).not.toHaveProperty('mfe');
  });

  test('a risk derived from the stop follows the new size; one the user entered stays', () => {
    const big = [fill('x1', 'buy', 20, 100, 0), fill('x2', 'sell', 20, 110, 1)];
    // 5 below the entry on 10 is 5,000 cents; on 20 it is 10,000.
    const derived = tripA({ plannedStop: 95, initialRisk: 5000 });
    expect(buildGroupedTrade(big, derived, opts).initialRisk).toBe(10000);
    const entered = tripA({ plannedStop: 95, initialRisk: 7777 });
    expect(buildGroupedTrade(big, entered, opts).initialRisk).toBe(7777);
    const noStop = tripA({ initialRisk: 7777 });
    expect(buildGroupedTrade(big, noStop, opts).initialRisk).toBe(7777);
    expect(buildGroupedTrade(big, tripA(), opts)).not.toHaveProperty(
      'initialRisk',
    );
  });

  test('a risk in levels is the stop side loss from the new average entry', () => {
    const a = tripA({ stops: price(95, 10), initialRisk: 5000 });
    const t = buildGroupedTrade(
      [...a.executions, ...tripB().executions],
      a,
      opts,
    );
    // The average entry is 110 now: 15 x 10 = 150 dollars.
    expect(t.initialRisk).toBe(15000);
    expect(t.stops).toEqual(a.stops);
  });

  test('refuses no fills', () => {
    expect(() => buildGroupedTrade([], tripA(), opts)).toThrow();
  });
});

describe('canMerge', () => {
  test('refuses mixed accounts and instruments', () => {
    const a = tripA();
    const sameAgain = tripB();
    expect(canMerge([a, sameAgain])).toBeNull();

    const otherAccount = one(
      [
        fill('c1', 'buy', 1, 100, 5, { accountId: 'a2' }),
        fill('c2', 'sell', 1, 101, 6, { accountId: 'a2' }),
      ],
      {},
    );
    expect(canMerge([a, otherAccount])).toBe('mixed-account');

    const otherSymbol = one([
      fill('d1', 'buy', 1, 100, 5, { symbol: 'MSFT' }),
      fill('d2', 'sell', 1, 101, 6, { symbol: 'MSFT' }),
    ]);
    expect(canMerge([a, otherSymbol])).toBe('mixed-instrument');
    // The same symbol worth a different amount a point is another instrument.
    const dearer = {
      ...tripB(),
      instrument: { ...a.instrument, pointValue: 2 },
    };
    expect(canMerge([a, dearer])).toBe('mixed-instrument');
    // The account is named first when both differ.
    const both = one([
      fill('e1', 'buy', 1, 100, 5, { accountId: 'a2', symbol: 'MSFT' }),
      fill('e2', 'sell', 1, 101, 6, { accountId: 'a2', symbol: 'MSFT' }),
    ]);
    expect(canMerge([a, both])).toBe('mixed-account');
  });

  test('needs two trades, and picks in two of them', () => {
    const a = tripA();
    const b = tripB();
    expect(canMerge([])).toBe('too-few');
    expect(canMerge([a])).toBe('too-few');
    expect(canMerge([a, b], new Set(['a1', 'a2', 'b1']))).toBeNull();
    expect(canMerge([a, b], new Set(['a1', 'a2']))).toBe('too-few');
    expect(canMerge([a, b], new Set())).toBe('too-few');
    expect(canMerge([a, b], new Set(['nope']))).toBe('too-few');
  });
});

describe('mergeTrades', () => {
  const all = (...ts: Trade[]) =>
    new Set(ts.flatMap((t) => t.executions.map((e) => e.id)));

  test('merge across a flat point makes one trade', () => {
    const a = tripA();
    const b = tripB();
    const r = mergeTrades([a, b], all(a, b), opts);
    expect(r.kept).toMatchObject({
      id: a.id,
      status: 'closed',
      avgEntry: 110,
      avgExit: 112.5,
      maxPosition: 10,
      net: 5000,
      grouping: 'manual',
    });
    expect(ids(r.kept)).toEqual(['a1', 'a2', 'b1', 'b2']);
    expect(r.removedIds).toEqual([b.id]);
    expect(r.changed).toEqual([]);
  });

  test('an unticked fill stays in its trade', () => {
    const a = tripA();
    const b = one([fill('b1', 'buy', 6, 120, 5), fill('b2', 'buy', 4, 121, 6)]);
    const r = mergeTrades([a, b], new Set(['a1', 'a2', 'b1']), opts);

    expect(ids(r.kept)).toEqual(['a1', 'a2', 'b1']);
    expect(r.kept).toMatchObject({
      status: 'open',
      avgEntry: 107.5,
      avgExit: 110,
      maxPosition: 10,
      net: 10000,
    });
    expect(r.removedIds).toEqual([]);
    expect(r.changed).toMatchObject([
      {
        id: b.id,
        status: 'open',
        avgEntry: 121,
        maxPosition: 4,
        grouping: 'manual',
      },
    ]);
    expect(r.changed.map(ids)).toEqual([['b2']]);
    expect(r.unlinkNoteIds).toEqual([]);
  });

  test('the earliest-opened source keeps its record', () => {
    // Listed last, numbered first, opened first: opening time decides.
    const a = tripA({
      serial: 5,
      rating: 4,
      reviewed: true,
      noteId: 'note-a',
      stops: price(95, 10),
      targets: price(130, 10),
      initialRisk: 5000,
      ruleChecks: [{ ruleId: 'r1', followed: true }],
    });
    const b = tripB({
      serial: 2,
      rating: 2,
      reviewed: false,
      noteId: 'note-b',
    });
    const r = mergeTrades([b, a], all(a, b), opts);

    expect(mergeKeeper([b, a])).toBe(a);
    expect(r.kept).toMatchObject({
      id: a.id,
      serial: 5,
      rating: 4,
      reviewed: true,
      noteId: 'note-a',
      stops: a.stops,
      targets: a.targets,
      ruleChecks: [{ ruleId: 'r1', followed: true }],
      grouping: 'manual',
    });
    // The levels are the kept trade's; the risk follows the new average entry.
    expect(r.kept.initialRisk).toBe(15000);
    expect(r.removedIds).toEqual([b.id]);
    expect(r.unlinkNoteIds).toEqual(['note-b']);
  });

  test('trades opened together are told apart by serial', () => {
    const a = tripA({ serial: 7 });
    const twin = one(
      [fill('t1', 'buy', 1, 100, 0), fill('t2', 'sell', 1, 101, 1)],
      {
        serial: 3,
      },
    );
    expect(mergeKeeper([a, twin])).toBe(twin);
  });

  test('tags and strategies are united', () => {
    const a = tripA({
      tagIds: ['t1', 't2'],
      strategyIds: ['s1'],
      ruleChecks: [
        { ruleId: 'r1', followed: true },
        { ruleId: 'r4', followed: null },
      ],
    });
    const b = tripB({
      tagIds: ['t2', 't3'],
      strategyIds: ['s1', 's2'],
      ruleChecks: [
        { ruleId: 'r1', followed: false },
        { ruleId: 'r2', followed: true },
        { ruleId: 'r3', followed: null },
        { ruleId: 'r4', followed: true },
      ],
    });
    const { kept } = mergeTrades([a, b], all(a, b), opts);
    expect(kept.tagIds).toEqual(['t1', 't2', 't3']);
    expect(kept.strategyIds).toEqual(['s1', 's2']);
    // The kept trade's own answer stands; the others fill what it has none for.
    expect(kept.ruleChecks).toEqual([
      { ruleId: 'r1', followed: true },
      { ruleId: 'r4', followed: true },
      { ruleId: 'r2', followed: true },
      { ruleId: 'r3', followed: null },
    ]);
  });

  test('does not touch the sources it was given', () => {
    const a = tripA({ tagIds: ['t1'] });
    const b = tripB({ tagIds: ['t2'] });
    const before = structuredClone([a, b]);
    mergeTrades([a, b], all(a, b), opts);
    expect([a, b]).toEqual(before);
  });

  test('a swap travels with the trade that is merged away (R3)', () => {
    const a = tripA({ swap: 100 });
    const b = tripB({ swap: -250 });
    const { kept } = mergeTrades([a, b], all(a, b), opts);
    expect(kept.swap).toBe(-150);
    // 5,000 of P&L less 150 of financing.
    expect(kept).toMatchObject({ gross: 5000, net: 4850 });
  });

  test('a source that stays keeps its own swap', () => {
    const a = tripA({ swap: 100 });
    const b = one(
      [fill('b1', 'buy', 6, 120, 5), fill('b2', 'buy', 4, 121, 6)],
      { swap: -250 },
    );
    const r = mergeTrades([a, b], new Set(['a1', 'a2', 'b1']), opts);
    expect(r.kept.swap).toBe(100);
    expect(r.changed[0]?.swap).toBe(-250);
  });

  test('only the notes of trades that are gone are unlinked', () => {
    const a = tripA({ noteId: 'note-a' });
    const gone = tripB({ noteId: 'note-b' });
    const stays = one(
      [fill('c1', 'buy', 6, 120, 8), fill('c2', 'buy', 4, 121, 9)],
      { noteId: 'note-c' },
    );
    const r = mergeTrades(
      [a, gone, stays],
      new Set(['a1', 'a2', 'b1', 'b2', 'c1']),
      opts,
    );
    expect(r.removedIds).toEqual([gone.id]);
    expect(r.changed.map((t) => t.noteId)).toEqual(['note-c']);
    expect(r.unlinkNoteIds).toEqual(['note-b']);
  });

  test('a trade with no picked fill is left as it is, whatever its age', () => {
    const early = tripA({ rating: 5 });
    const b = tripB({ rating: 2, noteId: 'note-b' });
    const c = one([
      fill('c1', 'buy', 5, 130, 10),
      fill('c2', 'sell', 5, 131, 11),
    ]);
    const r = mergeTrades([early, b, c], all(b, c), opts);
    // The earliest source that gives a fill keeps its record.
    expect(mergeKeeper([early, b, c], all(b, c))).toBe(b);
    expect(r.kept).toMatchObject({ id: b.id, rating: 2, noteId: 'note-b' });
    expect(ids(r.kept)).toEqual(['b1', 'b2', 'c1', 'c2']);
    expect(r.removedIds).toEqual([c.id]);
    expect(r.changed).toEqual([]);
    expect(r.unlinkNoteIds).toEqual([]);
  });

  test('a fill of the kept trade stays in it, ticked or not', () => {
    const a = tripA();
    const b = tripB();
    const r = mergeTrades([a, b], new Set(['a1', 'b1', 'b2']), opts);
    expect(r.kept.id).toBe(a.id);
    expect(ids(r.kept)).toEqual(['a1', 'a2', 'b1', 'b2']);
    expect(r.changed).toEqual([]);
  });

  test('picks that belong to no source are ignored', () => {
    const a = tripA();
    const b = tripB();
    const r = mergeTrades([a, b], new Set([...all(a, b), 'ghost']), opts);
    expect(ids(r.kept)).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  test('refuses what canMerge refuses', () => {
    const a = tripA();
    expect(() => mergeTrades([a], all(a), opts)).toThrow();
    const other = one([
      fill('d1', 'buy', 1, 100, 5, { symbol: 'MSFT' }),
      fill('d2', 'sell', 1, 101, 6, { symbol: 'MSFT' }),
    ]);
    expect(() => mergeTrades([a, other], all(a, other), opts)).toThrow();
    expect(() => mergeTrades([a, tripB()], new Set(), opts)).toThrow();
  });
});

describe('splitTrade', () => {
  test('split leaves an open part when it does not end flat', () => {
    const t = tripT();
    const { original, created } = splitTrade(t, new Set(['s3']), NEW);

    expect(ids(original)).toEqual(['s1', 's2']);
    expect(original).toMatchObject({
      id: t.id,
      serial: t.serial,
      status: 'open',
      direction: 'long',
      avgExit: 104,
      maxPosition: 10,
      net: 1600,
      grouping: 'manual',
    });
    expect(original).not.toHaveProperty('closedAt');

    // The exit on its own is a position of its own, still open.
    expect(ids(created)).toEqual(['s3']);
    expect(created).toMatchObject({
      id: 'split-id',
      serial: 9,
      status: 'open',
      direction: 'short',
      avgEntry: 108,
      maxPosition: 6,
      net: 0,
      grouping: 'manual',
    });
    expect(created).not.toHaveProperty('avgExit');
    expect(created).not.toHaveProperty('closedAt');
  });

  test('both parts close when each returns to flat', () => {
    const joined = mergeTrades(
      [tripA(), tripB()],
      new Set(['a1', 'a2', 'b1', 'b2']),
      opts,
    ).kept;
    const { original, created } = splitTrade(
      joined,
      new Set(['b1', 'b2']),
      NEW,
    );
    expect(original).toMatchObject({ status: 'closed', net: 10000 });
    expect(created).toMatchObject({ status: 'closed', net: -5000 });
  });

  test('split refuses moving all or none', () => {
    const t = tripT();
    const every = new Set(['s1', 's2', 's3']);
    expect(canSplit(t, new Set())).toBe('too-few');
    expect(canSplit(t, new Set(['ghost']))).toBe('too-few');
    expect(canSplit(t, every)).toBe('nothing-left');
    expect(canSplit(t, new Set(['s2']))).toBeNull();
    expect(() => splitTrade(t, new Set(), NEW)).toThrow();
    expect(() => splitTrade(t, every, NEW)).toThrow();
    // One fill cannot be divided.
    const single = one([fill('o1', 'buy', 1, 100, 0)]);
    expect(canSplit(single, new Set(['o1']))).toBe('too-few');
  });

  test('the new part copies tags and strategies only', () => {
    const t = tripT({
      tagIds: ['t1', 't2'],
      strategyIds: ['s1'],
      ruleChecks: [{ ruleId: 'r1', followed: true }],
      rating: 5,
      reviewed: true,
      noteId: 'note',
      plannedStop: 95,
      plannedTarget: 120,
      stops: price(95, 10),
      targets: price(120, 10),
      initialRisk: 5000,
      swap: -200,
      source: 'import',
      importId: 'imp-1',
    });
    const { original, created } = splitTrade(t, new Set(['s3']), NEW);

    // The original keeps its record.
    expect(original).toMatchObject({
      tagIds: ['t1', 't2'],
      strategyIds: ['s1'],
      ruleChecks: [{ ruleId: 'r1', followed: true }],
      rating: 5,
      reviewed: true,
      noteId: 'note',
      plannedStop: 95,
      plannedTarget: 120,
      stops: t.stops,
      targets: t.targets,
      source: 'import',
      importId: 'imp-1',
    });

    expect(created.tagIds).toEqual(['t1', 't2']);
    expect(created.strategyIds).toEqual(['s1']);
    expect(created.tagIds).not.toBe(t.tagIds);
    expect(created.strategyIds).not.toBe(t.strategyIds);
    expect(created.ruleChecks).toEqual([]);
    for (const field of [
      'rating',
      'reviewed',
      'noteId',
      'plannedStop',
      'plannedTarget',
      'stops',
      'targets',
      'initialRisk',
      'swap',
    ])
      expect(created).not.toHaveProperty(field);
    // Where its fills came from is not journaling: an import's undo still finds them.
    expect(created).toMatchObject({
      workspaceId: t.workspaceId,
      accountId: t.accountId,
      instrument: t.instrument,
      source: 'import',
      importId: 'imp-1',
    });
  });

  test('a split keeps the swap on the original (R3)', () => {
    const t = tripT({ swap: -200 });
    const { original, created } = splitTrade(t, new Set(['s3']), NEW);
    // 1,600 of P&L on the part that is left, less the 200 of financing.
    expect(original).toMatchObject({ swap: -200, gross: 1600, net: 1400 });
    expect(created).not.toHaveProperty('swap');
    expect(created.net).toBe(0);
  });

  test('the original keeps levels that are now over its size, to be fixed by hand', () => {
    const t = one(
      [
        fill('k1', 'buy', 6, 100, 0),
        fill('k2', 'buy', 4, 101, 1),
        fill('k3', 'sell', 4, 110, 2),
        fill('k4', 'sell', 6, 111, 3),
      ],
      { stops: price(95, 10) },
    );
    const { original } = splitTrade(t, new Set(['k2', 'k3']), NEW);
    expect(original).toMatchObject({ status: 'closed', maxPosition: 6 });
    expect(original.stops).toEqual(t.stops);
    expect(levelProblems(original, sidesOf(original))).toEqual([
      { side: 'stop', index: 0, kind: 'over-size' },
    ]);
  });

  test('does not touch the trade it was given', () => {
    const t = tripT({ tagIds: ['t1'] });
    const before = structuredClone(t);
    splitTrade(t, new Set(['s3']), NEW);
    expect(t).toEqual(before);
  });

  test('merge and split reverse each other', () => {
    const t = tripT({ rating: 4, tagIds: ['t1'] });
    const { original, created } = splitTrade(t, new Set(['s3']), NEW);
    const { kept, removedIds } = mergeTrades(
      [original, created],
      new Set(['s1', 's2', 's3']),
      opts,
    );
    expect(removedIds).toEqual(['split-id']);
    expect(ids(kept)).toEqual(ids(t));
    expect(kept).toMatchObject({
      id: t.id,
      status: 'closed',
      avgEntry: t.avgEntry,
      avgExit: t.avgExit,
      maxPosition: t.maxPosition,
      gross: t.gross,
      net: t.net,
      closedAt: t.closedAt,
      rating: 4,
      tagIds: ['t1'],
    });
  });
});

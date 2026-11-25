import { describe, expect, test } from 'vitest';
import { LEGACY_TRADES } from '@/domain/__fixtures__/legacy-trades';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { plannedR } from '@/domain/metrics/summary';
import { sidesOf } from '@/domain/risk';
import { rOf, unitKeeps, unitOf } from '@/domain/metrics/units';
import type { LevelSide } from '@/domain/types';
import { applyTradePatch, withRuleCheck, withTagPick } from './trade-patch';

const t = makeTrade({
  net: 0,
  avgEntry: 4500,
  maxPosition: 2,
  strategyIds: ['s1', 's2'],
  ruleChecks: [
    { ruleId: 'r1', followed: true },
    { ruleId: 'r2', followed: false },
  ],
});
/** s1 owns r1, s2 owns r2. */
const RULES: Record<string, string[]> = { s1: ['r1'], s2: ['r2'] };
const rulesOf = (id: string) => RULES[id];

test('a stop sets risk from the stop', () =>
  expect(applyTradePatch(t, { plannedStop: 4490 }).initialRisk).toBe(100000));

test('an explicit risk wins', () =>
  expect(
    applyTradePatch(t, { plannedStop: 4490, initialRisk: 5000 }).initialRisk,
  ).toBe(5000));

test('clearing the stop clears its risk', () => {
  const r = applyTradePatch(applyTradePatch(t, { plannedStop: 4490 }), {
    plannedStop: undefined,
  });
  expect('plannedStop' in r || 'initialRisk' in r).toBe(false);
});

test('clearing the stop keeps a risk the patch sets', () => {
  const r = applyTradePatch(t, { plannedStop: undefined, initialRisk: 700 });
  expect('plannedStop' in r).toBe(false);
  expect(r.initialRisk).toBe(700);
});

/** A Price side: `[value, qty]` per level. */
const price = (...levels: [number, number][]): LevelSide => ({
  unit: 'price',
  levels: levels.map(([value, qty]) => ({ value, qty })),
});

test('saving stops rewrites initialRisk', () => {
  // One contract 10 points away and one 20 away, at $50 a point: $1,500.
  const stops = price([4490, 1], [4480, 1]);
  const saved = applyTradePatch(t, { stops });
  expect(saved.stops).toEqual(stops);
  expect(saved.initialRisk).toBe(150000);
  // Saved again, the risk follows the stops, not the old figure.
  expect(applyTradePatch(saved, { stops: price([4490, 2]) }).initialRisk).toBe(
    100000,
  );
  // A stop in another unit prices the same way: 12 ticks of 0.25 is 3 points.
  const ticks = applyTradePatch(t, {
    stops: { unit: 'ticks', levels: [{ value: 12, qty: 2 }] },
  });
  expect(ticks.initialRisk).toBe(30000);
});

test('targets alone leave the risk as it was', () => {
  const stopped = applyTradePatch(t, { stops: price([4490, 2]) });
  const r = applyTradePatch(stopped, { targets: price([4520, 2]) });
  expect(r.initialRisk).toBe(100000);
  expect(r.stops).toEqual(price([4490, 2]));
  // A trade with a target and no stop has no risk to store.
  expect(
    'initialRisk' in applyTradePatch(t, { targets: price([4520, 2]) }),
  ).toBe(false);
});

test('an explicit risk still wins over saved stops', () => {
  expect(
    applyTradePatch(t, { stops: price([4490, 2]), initialRisk: 5000 })
      .initialRisk,
  ).toBe(5000);
});

test('clearing every stop clears initialRisk', () => {
  const stopped = applyTradePatch(t, { stops: price([4490, 2]) });
  expect(stopped.initialRisk).toBe(100000);
  const cleared = applyTradePatch(stopped, { stops: undefined });
  expect('stops' in cleared || 'initialRisk' in cleared).toBe(false);
  // A side whose levels were all removed is no stop either.
  const emptied = applyTradePatch(stopped, {
    stops: { unit: 'price', levels: [] },
  });
  expect('initialRisk' in emptied).toBe(false);
  // A target that stays does not keep a risk alive.
  const both = applyTradePatch(stopped, { targets: price([4520, 2]) });
  expect('initialRisk' in applyTradePatch(both, { stops: undefined })).toBe(
    false,
  );
});

describe('a trade saved before levels (B14)', () => {
  const old = makeTrade({
    net: 0,
    avgEntry: 4500,
    maxPosition: 2,
    plannedStop: 4490,
    plannedTarget: 4520,
    initialRisk: 100000,
  });

  test('saving a side drops the legacy fields', () => {
    const stops = applyTradePatch(old, { stops: price([4495, 2]) });
    expect('plannedStop' in stops || 'plannedTarget' in stops).toBe(false);
    expect(stops.initialRisk).toBe(50000);
    const targets = applyTradePatch(old, { targets: price([4530, 2]) });
    expect('plannedStop' in targets || 'plannedTarget' in targets).toBe(false);
    // Clearing a side drops them too: the cleared stop does not come back.
    const cleared = applyTradePatch(old, { stops: undefined });
    expect('plannedStop' in cleared || 'plannedTarget' in cleared).toBe(false);
    expect(sidesOf(cleared).stops).toBeUndefined();
    expect('initialRisk' in cleared).toBe(false);
  });

  test('the side the patch leaves alone moves into the new shape, not away', () => {
    const stops = applyTradePatch(old, { stops: price([4495, 2]) });
    expect(stops.targets).toEqual(price([4520, 2]));
    expect(plannedR(stops)).toBe(4); // 20 points over 5
    const targets = applyTradePatch(old, { targets: price([4530, 2]) });
    expect(targets.stops).toEqual(price([4490, 2]));
    // The stop is the same stop, so its risk is the figure it had.
    expect(targets.initialRisk).toBe(100000);
    // A side the trade never had stays absent.
    const stopOnly = makeTrade({
      net: 0,
      avgEntry: 4500,
      maxPosition: 2,
      plannedStop: 4490,
      initialRisk: 100000,
    });
    expect(
      'targets' in applyTradePatch(stopOnly, { stops: price([4490, 2]) }),
    ).toBe(false);
  });

  test('saving a stop the old way still sets the risk from it', () => {
    const r = applyTradePatch(old, { plannedStop: 4480 });
    expect(r.plannedStop).toBe(4480);
    expect(r.initialRisk).toBe(200000);
    expect('stops' in r).toBe(false);
  });
});

describe('an unrelated edit leaves every R of a legacy trade as it was', () => {
  test.each(LEGACY_TRADES)(
    '$name',
    ({ trade, plannedR: planned, realizedR }) => {
      const edited = applyTradePatch(trade, {
        rating: 4,
        tagIds: ['setup'],
        strategyIds: ['s1'],
        reviewed: true,
      });
      // Not rewritten into levels, and no figure moved.
      expect('stops' in edited || 'targets' in edited).toBe(false);
      expect(edited.plannedStop).toBe(trade.plannedStop);
      expect(edited.plannedTarget).toBe(trade.plannedTarget);
      expect(edited.initialRisk).toBe(trade.initialRisk);
      expect(plannedR(edited)).toBe(planned);
      expect(rOf(edited, 'net')).toBe(realizedR);
      expect(unitOf(edited, 'r', 'net')).toBe(realizedR);
      expect(unitKeeps('r', edited)).toBe(true);
    },
  );
});

test("leaving a strategy drops its rule checks; the others' stay", () => {
  expect(
    applyTradePatch(t, { strategyIds: ['s2'] }, rulesOf).ruleChecks,
  ).toEqual([{ ruleId: 'r2', followed: false }]);
  expect(
    applyTradePatch(t, { strategyIds: ['s1', 's2', 's3'] }, rulesOf).ruleChecks,
  ).toEqual(t.ruleChecks);
  expect(applyTradePatch(t, { strategyIds: undefined }, rulesOf)).toMatchObject(
    { strategyIds: [], ruleChecks: [] },
  );
  // Explicit checks win; without a rule lookup nothing is dropped.
  expect(
    applyTradePatch(
      t,
      { strategyIds: [], ruleChecks: [{ ruleId: 'x', followed: null }] },
      rulesOf,
    ).ruleChecks,
  ).toEqual([{ ruleId: 'x', followed: null }]);
  expect(applyTradePatch(t, { strategyIds: [] }).ruleChecks).toEqual(
    t.ruleChecks,
  );
});

test('strategies dedupe', () =>
  expect(
    applyTradePatch(t, { strategyIds: ['s2', 's2', 's1'] }).strategyIds,
  ).toEqual(['s2', 's1']));

test('tags dedupe; input untouched', () => {
  expect(applyTradePatch(t, { tagIds: ['a', 'b', 'a'] }).tagIds).toEqual([
    'a',
    'b',
  ]);
  expect(t.tagIds).toEqual([]);
  expect(t.plannedStop).toBeUndefined();
});

test('a key present with undefined removes the field', () => {
  const rated = applyTradePatch(t, { rating: 3, noteId: 'n', reviewed: true });
  const r = applyTradePatch(rated, {
    rating: undefined,
    noteId: undefined,
    reviewed: undefined,
  });
  expect('rating' in r || 'noteId' in r || 'reviewed' in r).toBe(false);
});

test('withRuleCheck sets one rule and leaves the others; a new rule is appended', () => {
  const graded = makeTrade({
    net: 0,
    ruleChecks: [
      { ruleId: 'r1', followed: false },
      { ruleId: 'r2', followed: null },
    ],
  });
  expect(withRuleCheck(graded, 'r1', true)).toEqual({
    ruleChecks: [
      { ruleId: 'r1', followed: true },
      { ruleId: 'r2', followed: null },
    ],
  });
  expect(withRuleCheck(graded, 'r3', false).ruleChecks).toEqual([
    { ruleId: 'r1', followed: false },
    { ruleId: 'r2', followed: null },
    { ruleId: 'r3', followed: false },
  ]);
  expect(graded.ruleChecks[0]!.followed).toBe(false);
});

test('a tag pick applies to the stored list, so two picks from one stale list both land', () => {
  const stale: string[] = [];
  const stored = makeTrade({ net: 0, tagIds: ['a'] });
  // The second pick was made before the first save came back.
  const patch = withTagPick(stale, ['b'])(stored);
  expect(patch.tagIds).toEqual(['a', 'b']);
  // A removal drops only that tag.
  expect(
    withTagPick(
      ['a', 'c'],
      ['a'],
    )(makeTrade({ net: 0, tagIds: ['a', 'c', 'd'] })).tagIds,
  ).toEqual(['a', 'd']);
  // Picking what is already stored adds nothing twice.
  expect(withTagPick([], ['a'])(stored).tagIds).toEqual(['a']);
});

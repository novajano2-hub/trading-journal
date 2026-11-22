import { expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
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

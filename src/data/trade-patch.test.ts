import { expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { applyTradePatch, withRuleCheck } from './trade-patch';

const t = makeTrade({
  net: 0,
  avgEntry: 4500,
  maxPosition: 2,
  strategyId: 's1',
  ruleChecks: [{ ruleId: 'r1', followed: true }],
});

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

test('a new strategy drops old rule checks; the same one keeps them', () => {
  expect(applyTradePatch(t, { strategyId: 's2' }).ruleChecks).toEqual([]);
  expect(applyTradePatch(t, { strategyId: 's1' }).ruleChecks).toHaveLength(1);
  expect(
    applyTradePatch(t, {
      strategyId: 's2',
      ruleChecks: [{ ruleId: 'x', followed: null }],
    }).ruleChecks,
  ).toEqual([{ ruleId: 'x', followed: null }]);
});

test('tags dedupe; input untouched', () => {
  expect(applyTradePatch(t, { tagIds: ['a', 'b', 'a'] }).tagIds).toEqual([
    'a',
    'b',
  ]);
  expect(t.tagIds).toEqual([]);
  expect(t.plannedStop).toBeUndefined();
});

test('a key present with undefined removes the field', () => {
  const rated = applyTradePatch(t, { rating: 3, noteId: 'n' });
  const r = applyTradePatch(rated, { rating: undefined, noteId: undefined });
  expect('rating' in r || 'noteId' in r).toBe(false);
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

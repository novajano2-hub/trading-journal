import { expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { Account, Challenge } from '@/domain/types';
import { gettingStarted } from './getting-started';

const account = (type: Account['type']): Account => ({
  id: `a-${type}`,
  workspaceId: 'mine',
  name: 'A',
  broker: 'B',
  type,
  currency: 'USD',
  startingBalance: 0,
  status: 'active',
});
const challenge: Challenge = {
  id: 'c',
  workspaceId: 'mine',
  name: 'C',
  firm: 'F',
  steps: 1,
  phases: [{ step: 'step-1' }, { step: 'funded' }],
  phase: 'evaluation',
  status: 'active',
};
const done = (g: ReturnType<typeof gettingStarted>) =>
  g.steps.filter((s) => s.done).map((s) => s.id);

test('nothing yet is 0 of 3, the steps in order', () => {
  const g = gettingStarted([], [], []);
  expect(g.steps.map((s) => s.id)).toEqual(['prop', 'challenge', 'trade']);
  expect(g).toMatchObject({ done: 0, total: 3 });
  expect(done(g)).toEqual([]);
});

test('a live or demo account does not complete the prop step', () => {
  expect(
    done(gettingStarted([account('live'), account('demo')], [], [])),
  ).toEqual([]);
});

test.each(['prop-evaluation', 'prop-funded'] as const)(
  'a %s account completes the prop step alone',
  (type) => {
    expect(done(gettingStarted([account(type)], [], []))).toEqual(['prop']);
  },
);

test('a challenge alone completes the prop and challenge steps', () => {
  const g = gettingStarted([], [challenge], []);
  expect(done(g)).toEqual(['prop', 'challenge']);
  expect(g.done).toBe(2);
});

test('any trade completes the trade step alone', () => {
  const g = gettingStarted([], [], [makeTrade({ net: 100 })]);
  expect(done(g)).toEqual(['trade']);
  expect(g.done).toBe(1);
});

test('all three is 3 of 3', () => {
  const g = gettingStarted(
    [account('prop-funded')],
    [challenge],
    [makeTrade({ net: 100 })],
  );
  expect(g).toMatchObject({ done: 3, total: 3 });
});

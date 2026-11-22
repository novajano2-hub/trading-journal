import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import type { Tag, TagCategory } from '../types';
import { breakdown } from './breakdowns';
import { defaultMetricContext } from './context';
import { mistakeCosts, mistakeTags } from './mistakes';

const ctx = defaultMetricContext('America/New_York');
const categories = [
  { id: 'errors', name: 'Errors', role: 'mistake' },
  { id: 'setups', name: 'Setups' },
] as TagCategory[];
const tags = [
  { id: 'm1', name: 'Moved stop', categoryId: 'errors' },
  { id: 'm2', name: 'Revenge trade', categoryId: 'errors' },
  { id: 'm3', name: 'Chased entry', categoryId: 'errors' },
  { id: 'p1', name: 'Pullback', categoryId: 'setups' },
] as Tag[];
const trades = [
  makeTrade({
    id: 'a',
    net: -40000,
    closedAt: '2026-11-18T15:00:00Z',
    tagIds: ['m1', 'm2'],
  }),
  makeTrade({
    id: 'b',
    net: -10000,
    closedAt: '2026-11-19T15:00:00Z',
    tagIds: ['m1'],
  }),
  makeTrade({
    id: 'c',
    net: 30000,
    closedAt: '2026-11-19T16:00:00Z',
    tagIds: ['p1'],
  }),
  makeTrade({ id: 'd', net: 5000, status: 'open', tagIds: ['m3'] }),
];

test('a mistake is a tag in a category with the mistake role, whatever its name', () => {
  expect(mistakeTags(tags, categories).map((t) => t.id)).toEqual([
    'm1',
    'm2',
    'm3',
  ]);
  expect(mistakeTags(tags, [])).toEqual([]);
});

describe('mistakeCosts', () => {
  test('cost per mistake tag, a two-mistake trade counted in both, newest first', () => {
    expect(mistakeCosts(trades, tags, categories, ctx)).toEqual([
      {
        tagId: 'm1',
        name: 'Moved stop',
        tradeCount: 2,
        pnl: -50000,
        tradeIds: ['b', 'a'],
      },
      {
        tagId: 'm2',
        name: 'Revenge trade',
        tradeCount: 1,
        pnl: -40000,
        tradeIds: ['a'],
      },
    ]);
  });

  test('matches the Reports tag breakdown', () => {
    const rows = breakdown(trades, 'tag', ctx);
    for (const m of mistakeCosts(trades, tags, categories, ctx))
      expect(m.pnl).toBe(rows.find((r) => r.key === m.tagId)!.summary.netPnl);
  });

  test('orders by pnl then name, and follows the basis', () => {
    const ts = [
      makeTrade({ net: -100, fees: 50, tagIds: ['m1', 'm2'] }),
      makeTrade({ net: -100, tagIds: ['m3'] }),
    ];
    expect(mistakeCosts(ts, tags, categories, ctx).map((m) => m.tagId)).toEqual(
      ['m3', 'm1', 'm2'],
    );
    expect(
      mistakeCosts(ts, tags, categories, { ...ctx, pnlBasis: 'gross' })[0]!.pnl,
    ).toBe(-100);
  });
});

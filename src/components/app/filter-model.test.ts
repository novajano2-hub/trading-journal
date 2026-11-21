import { expect, test } from 'vitest';
import { EMPTY_FILTERS } from '@/data/filters';
import type { Account } from '@/domain/types';
import {
  accountSummary,
  chipLabel,
  hasActiveFilters,
  switchWorkspaceFilters,
  toggleId,
} from './filter-model';

const names = {
  strategies: new Map([
    ['s1', 'Range break'],
    ['s2', 'Pullback'],
  ]),
  tags: new Map([['t1', 'Moved stop']]),
};

test('chip labels', () => {
  expect(chipLabel('symbol', EMPTY_FILTERS, names)).toEqual({
    text: 'Symbol',
    active: false,
  });
  expect(
    chipLabel('symbol', { ...EMPTY_FILTERS, symbols: ['ES', 'NQ'] }, names)
      .text,
  ).toBe('ES, NQ');
  expect(
    chipLabel(
      'symbol',
      { ...EMPTY_FILTERS, symbols: ['CL', 'ES', 'NQ'] },
      names,
    ).text,
  ).toBe('3 symbols');
  expect(chipLabel('side', { ...EMPTY_FILTERS, side: 'short' }, names)).toEqual(
    { text: 'Short', active: true },
  );
  expect(
    chipLabel('strategy', { ...EMPTY_FILTERS, strategyIds: ['s2'] }, names)
      .text,
  ).toBe('Pullback');
  expect(
    chipLabel('tag', { ...EMPTY_FILTERS, tagIds: ['t1', 'x'] }, names).text,
  ).toBe('2 tags');
});

test('the idle chips name their dimension, and counts are pluralised', () => {
  expect(chipLabel('side', EMPTY_FILTERS, names)).toEqual({
    text: 'Side',
    active: false,
  });
  expect(chipLabel('strategy', EMPTY_FILTERS, names).text).toBe('Strategy');
  expect(chipLabel('tag', EMPTY_FILTERS, names).text).toBe('Tags');
  expect(
    chipLabel('tag', { ...EMPTY_FILTERS, tagIds: ['t1'] }, names).text,
  ).toBe('Moved stop');
  expect(
    chipLabel(
      'strategy',
      { ...EMPTY_FILTERS, strategyIds: ['s1', 's2'] },
      names,
    ).text,
  ).toBe('2 strategies');
});

test('toggling, clearing and switching workspace', () => {
  expect(toggleId(['b'], 'a')).toEqual(['a', 'b']);
  expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  const f = {
    ...EMPTY_FILTERS,
    range: { preset: 'this-week' as const },
    symbols: ['ES'],
    side: 'long' as const,
    accountIds: ['a'],
    strategyIds: ['s'],
    tagIds: ['t'],
  };
  expect(switchWorkspaceFilters(f)).toEqual({
    ...f,
    accountIds: [],
    strategyIds: [],
    tagIds: [],
  });
  expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
});

test('any dimension, the date range and accounts included, counts as active', () => {
  expect(hasActiveFilters({ ...EMPTY_FILTERS, side: 'long' })).toBe(true);
  expect(
    hasActiveFilters({ ...EMPTY_FILTERS, range: { preset: 'today' } }),
  ).toBe(true);
  expect(
    hasActiveFilters({ ...EMPTY_FILTERS, range: { from: '2026-11-01' } }),
  ).toBe(true);
  expect(hasActiveFilters({ ...EMPTY_FILTERS, accountIds: ['a'] })).toBe(true);
  expect(hasActiveFilters({ ...EMPTY_FILTERS, tagIds: ['t'] })).toBe(true);
});

test('account summary', () => {
  const accts = [
    { id: 'a', name: 'Futures live' },
    { id: 'b', name: 'Forex evaluation' },
  ] as Account[];
  expect(accountSummary(accts, EMPTY_FILTERS)).toBe('All accounts');
  expect(accountSummary(accts, { ...EMPTY_FILTERS, accountIds: ['b'] })).toBe(
    'Forex evaluation',
  );
  expect(
    accountSummary(accts, { ...EMPTY_FILTERS, accountIds: ['a', 'b'] }),
  ).toBe('2 accounts');
});

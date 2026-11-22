import { expect, test } from 'vitest';
import type { Strategy, Tag, TagCategory } from '@/domain/types';
import { isSearchShortcut, MAX_RESULTS, searchApp } from './search';

const src = {
  symbols: ['CL', 'ES', 'NQ'],
  strategies: [{ id: 's1', name: 'Range break' }] as Strategy[],
  tags: [{ id: 't1', name: 'Revenge trade', categoryId: 'c1' }] as Tag[],
  categories: [{ id: 'c1', name: 'Mistakes' }] as TagCategory[],
};

test('modules by word start, then symbols, strategies, tags', () => {
  expect(searchApp('re', src).map((r) => r.label)).toEqual([
    'Reports',
    'Replay',
    'Range break',
    'Revenge trade',
  ]);
  expect(searchApp('e', src).map((r) => r.kind)).toEqual([
    'symbol',
    'strategy',
    'tag',
  ]);
  expect(searchApp('  ', src)).toEqual([]);
  expect(searchApp('firms', src)[0]).toEqual({
    kind: 'module',
    id: 'prop-firms',
    label: 'Prop firms',
  });
});

test('symbols match by prefix, case-insensitively, and results are capped', () => {
  expect(searchApp('nq', src)).toEqual([
    { kind: 'symbol', value: 'NQ', label: 'NQ' },
  ]);
  expect(searchApp('q', { ...src, strategies: [], tags: [] })).toEqual([]);
  const many = Array.from({ length: 20 }, (_, i) => `A${i}`);
  expect(searchApp('a', { ...src, symbols: many })).toHaveLength(MAX_RESULTS);
});

test("a tag result carries its category's name", () => {
  expect(searchApp('revenge', src)).toEqual([
    { kind: 'tag', id: 't1', label: 'Revenge trade', category: 'Mistakes' },
  ]);
});

test('the shortcut follows the platform', () => {
  const k = { key: 'k', altKey: false, shiftKey: false };
  expect(isSearchShortcut({ ...k, metaKey: true, ctrlKey: false }, 'mac')).toBe(
    true,
  );
  expect(isSearchShortcut({ ...k, metaKey: false, ctrlKey: true }, 'mac')).toBe(
    false,
  );
  expect(
    isSearchShortcut({ ...k, metaKey: false, ctrlKey: true }, 'other'),
  ).toBe(true);
  expect(
    isSearchShortcut({ ...k, key: 'j', metaKey: true, ctrlKey: false }, 'mac'),
  ).toBe(false);
  expect(
    isSearchShortcut(
      { ...k, shiftKey: true, metaKey: true, ctrlKey: false },
      'mac',
    ),
  ).toBe(false);
});

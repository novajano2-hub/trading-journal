import { expect, test } from 'vitest';
import { EMPTY_FILTERS, type GlobalFilters } from '@/data/filters';
import type { Account } from '@/domain/types';
import {
  accountSummary,
  activeFilterCount,
  chipLabel,
  customRange,
  datesOf,
  detailChips,
  rangeText,
  hasActiveFilters,
  switchWorkspaceFilters,
  unshownFilters,
  withoutUnshown,
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

test('a range resolves to its dates, a preset only once today is known', () => {
  expect(datesOf({ preset: 'this-week' }, '2026-11-20')).toEqual({
    from: '2026-11-15',
    to: '2026-11-20',
  });
  expect(datesOf({ preset: 'this-week' }, '2026-11-20', 'monday')).toEqual({
    from: '2026-11-16',
    to: '2026-11-20',
  });
  expect(datesOf({ preset: 'this-week' }, '')).toEqual({});
  expect(datesOf({ from: '2026-11-01' }, '')).toEqual({ from: '2026-11-01' });
  expect(datesOf({}, '2026-11-20')).toEqual({});
});

test('a custom range keeps what was typed, swapping a reversed pair', () => {
  expect(customRange('2026-11-01', '2026-11-15')).toEqual({
    from: '2026-11-01',
    to: '2026-11-15',
  });
  expect(customRange('2026-11-15', '2026-11-01')).toEqual({
    from: '2026-11-01',
    to: '2026-11-15',
  });
  expect(customRange('2026-11-01', '')).toEqual({ from: '2026-11-01' });
  expect(customRange('', '2026-11-15')).toEqual({ to: '2026-11-15' });
  expect(customRange('', '')).toEqual({});
});

test('the filters a group has no chip for are listed by name, and can be cleared alone', () => {
  expect(unshownFilters(EMPTY_FILTERS)).toEqual([]);
  const f = {
    ...EMPTY_FILTERS,
    symbols: ['ES'],
    outcomes: ['win' as const],
    weekdays: [1, 2],
    excludeTagIds: ['t1'],
    r: { min: 1 },
    strategyMatch: 'all' as const,
  };
  // Symbol and outcome have chips; the rest do not.
  expect(unshownFilters(f)).toEqual([
    'Excluded tags',
    'Weekdays',
    'R',
    'Strategies, all',
  ]);
  const cleared = withoutUnshown(f);
  expect(unshownFilters(cleared)).toEqual([]);
  expect(cleared.symbols).toEqual(['ES']);
  expect(cleared.outcomes).toEqual(['win']);
});

test('activeFilterCount counts the chips in use plus the More filters fields', () => {
  expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  expect(
    activeFilterCount({
      ...EMPTY_FILTERS,
      range: { preset: 'last-30-days' },
      symbols: ['ES', 'NQ'],
      side: 'long',
      strategyIds: ['s1'],
      tagIds: ['t1', 't2'],
      outcomes: ['win'],
    }),
  ).toBe(6);
  // An account is the switcher's, not a filter chip.
  expect(activeFilterCount({ ...EMPTY_FILTERS, accountIds: ['a'] })).toBe(0);
});

test('ranges read in words, with an excluded bound as over or under', () => {
  expect(rangeText({ min: 5, max: 15, maxExclusive: true }, 'min')).toBe(
    '5 to under 15 min',
  );
  expect(rangeText({ min: 100, minExclusive: true })).toBe('over 100');
  expect(rangeText({ min: 2 })).toBe('at least 2');
  expect(rangeText({ max: 1, maxExclusive: true })).toBe('under 1');
  expect(rangeText({ max: 3 })).toBe('at most 3');
  expect(rangeText({ min: -2, max: -1 })).toBe('-2 to -1');
});

test('a filter with no chip of its own gets one in the log, and the chip clears it alone', () => {
  expect(detailChips(EMPTY_FILTERS)).toEqual([]);
  const f: GlobalFilters = {
    ...EMPTY_FILTERS,
    symbols: ['ES'],
    status: 'closed',
    weekdays: [1, 3],
    exitWeekdays: [6],
    exitMonths: [12],
    entryWindows: [{ from: '09:00', to: '09:59' }],
    duration: { min: 1, max: 5, maxExclusive: true },
    size: { min: 100, minExclusive: true },
    r: { min: -1, max: 0, maxExclusive: true },
    noStrategy: true,
    assetClasses: ['future', 'cfd'],
  };
  const chips = detailChips(f);
  expect(chips.map((c) => c.label)).toEqual([
    'No strategy',
    'Instrument: Futures, CFDs',
    'Entry weekday: Mon, Wed',
    'Exit weekday: Sat',
    'Exit month: Dec',
    'Entry time: 09:00-09:59',
    'Duration: 1 to under 5 min',
    'Size: over 100',
    'Realized R: -1 to under 0',
  ]);
  const weekday = chips.find((c) => c.id === 'weekdays')!;
  const next = weekday.clear(f);
  expect(next.weekdays).toEqual([]);
  expect(next.exitWeekdays).toEqual([6]);
  expect(detailChips(next).map((c) => c.id)).not.toContain('weekdays');
  // Every chip clears exactly its own filter.
  let rest = f;
  for (const c of chips) rest = c.clear(rest);
  expect(detailChips(rest)).toEqual([]);
  expect(rest.symbols).toEqual(['ES']);
  expect(rest.status).toBe('closed');
});

test('a currency filter has a chip that clears it', () => {
  const f: GlobalFilters = { ...EMPTY_FILTERS, currency: 'EUR' };
  const [chip] = detailChips(f);
  expect(chip!.label).toBe('Currency: EUR');
  expect(chip!.clear(f).currency).toBeUndefined();
});

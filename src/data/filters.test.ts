import { describe, expect, test } from 'vitest';
import { makeTrade } from '../domain/__fixtures__/trades';
import { resolveInstrument } from '../domain/instruments';
import type { Account } from '../domain/types';
import {
  applyFilters,
  EMPTY_FILTERS,
  mergeFilterParams,
  parseFilters,
  resolveRange,
  sanitizeFilters,
  selectedAccounts,
  serializeFilters,
  type DatePreset,
  type GlobalFilters,
} from './filters';

const acct = (id: string, status: Account['status'] = 'active') =>
  ({ id, status }) as Account;
const env = {
  timeZone: 'America/New_York',
  today: '2026-11-20',
  accounts: [acct('a'), acct('b', 'archived')],
};

describe('global filters', () => {
  test('presets resolve against today (weeks start Monday)', () => {
    const r = (preset: DatePreset) => resolveRange({ preset }, '2026-11-20');
    expect(r('today')).toEqual({ from: '2026-11-20', to: '2026-11-20' });
    expect(r('this-week')).toEqual({ from: '2026-11-16', to: '2026-11-20' });
    expect(r('last-week')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(r('this-month')).toEqual({ from: '2026-11-01', to: '2026-11-20' });
    expect(r('last-month')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(r('last-30-days')).toEqual({ from: '2026-10-22', to: '2026-11-20' });
    expect(r('ytd')).toEqual({ from: '2026-01-01', to: '2026-11-20' });
    expect(resolveRange({}, '2026-11-20')).toEqual({});
    expect(resolveRange({ from: '2026-01-01' }, '2026-11-20')).toEqual({
      from: '2026-01-01',
    });
  });

  test('a trade belongs to its local close day', () => {
    const t = makeTrade({
      net: 1,
      accountId: 'a',
      closedAt: '2026-03-03T02:00:00Z',
    }); // 21:00 on 2 Mar in New York
    const day = (d: string) =>
      applyFilters([t], { ...EMPTY_FILTERS, range: { from: d, to: d } }, env);
    expect(day('2026-03-02')).toHaveLength(1);
    expect(day('2026-03-03')).toHaveLength(0);
  });

  test('an open trade belongs to its local open day', () => {
    const t = makeTrade({
      net: 0,
      accountId: 'a',
      status: 'open',
      openedAt: '2026-03-03T02:00:00Z',
    });
    const day = (d: string) =>
      applyFilters([t], { ...EMPTY_FILTERS, range: { from: d, to: d } }, env);
    expect(day('2026-03-02')).toHaveLength(1);
    expect(day('2026-03-03')).toHaveLength(0);
  });

  test('a preset range filters trades against env.today', () => {
    const inRange = makeTrade({
      net: 1,
      accountId: 'a',
      closedAt: '2026-11-18T15:00:00Z',
    });
    const before = makeTrade({
      net: 1,
      accountId: 'a',
      closedAt: '2026-11-10T15:00:00Z',
    });
    const out = applyFilters(
      [inRange, before],
      { ...EMPTY_FILTERS, range: { preset: 'this-week' } },
      env,
    );
    expect(out).toEqual([inRange]);
  });

  test('no account filter means active accounts; an archived one counts when selected', () => {
    const ts = [
      makeTrade({ net: 1, accountId: 'a' }),
      makeTrade({ net: 1, accountId: 'b' }),
    ];
    expect(
      applyFilters(ts, EMPTY_FILTERS, env).map((t) => t.accountId),
    ).toEqual(['a']);
    expect(
      applyFilters(ts, { ...EMPTY_FILTERS, accountIds: ['b'] }, env).map(
        (t) => t.accountId,
      ),
    ).toEqual(['b']);
    expect(
      selectedAccounts(env.accounts, EMPTY_FILTERS).map((a) => a.id),
    ).toEqual(['a']);
    expect(
      selectedAccounts(env.accounts, {
        ...EMPTY_FILTERS,
        accountIds: ['b'],
      }).map((a) => a.id),
    ).toEqual(['b']);
  });

  test('symbol by root, side, strategy and any-of tags combine with AND', () => {
    const base = { net: 1, accountId: 'a' };
    const esz = makeTrade({
      ...base,
      instrument: resolveInstrument('ESZ5')!,
      strategyIds: ['s1'],
      tagIds: ['t1', 't2'],
    });
    const esh = makeTrade({
      ...base,
      instrument: resolveInstrument('ESH6')!,
      direction: 'short',
      strategyIds: ['s1'],
      tagIds: ['t3'],
    });
    const nq = makeTrade({
      ...base,
      instrument: resolveInstrument('NQZ5')!,
      strategyIds: ['s2', 's3'],
    });
    const ts = [esz, esh, nq];
    const run = (f: Partial<GlobalFilters>) =>
      applyFilters(ts, { ...EMPTY_FILTERS, ...f }, env);
    expect(run({ symbols: ['ES'] })).toEqual([esz, esh]);
    expect(run({ symbols: ['ES'], side: 'short' })).toEqual([esh]);
    expect(run({ strategyIds: ['s1'] })).toEqual([esz, esh]);
    // A trade in several strategies matches any of them.
    expect(run({ strategyIds: ['s3'] })).toEqual([nq]);
    expect(run({ strategyIds: ['s1', 's2'] })).toEqual(ts);
    expect(run({ tagIds: ['t2'] })).toEqual([esz]);
    expect(run({ tagIds: ['t2', 't3'] })).toEqual([esz, esh]);
    expect(
      run({ symbols: ['ES', 'NQ'], strategyIds: ['s1'], tagIds: ['t3'] }),
    ).toEqual([esh]);
    expect(run({ symbols: ['NQ'], side: 'short' })).toEqual([]);
  });

  test('URL round trip is canonical', () => {
    const f: GlobalFilters = {
      range: { from: '2026-01-01', to: '2026-03-31' },
      accountIds: ['b', 'a'],
      symbols: ['ES'],
      side: 'long',
      strategyIds: ['s1'],
      tagIds: ['t2', 't1'],
    };
    const qs =
      'from=2026-01-01&to=2026-03-31&account=a&account=b&symbol=ES&side=long&strategy=s1&tag=t1&tag=t2';
    expect(serializeFilters(f).toString()).toBe(qs);
    expect(
      serializeFilters(parseFilters(new URLSearchParams(qs))).toString(),
    ).toBe(qs);
    expect(serializeFilters(EMPTY_FILTERS).toString()).toBe('');
    expect(
      serializeFilters({
        ...EMPTY_FILTERS,
        range: { preset: 'ytd' },
      }).toString(),
    ).toBe('range=ytd');
  });

  test('garbage is dropped; reversed dates swap; presets win', () => {
    expect(
      parseFilters(
        new URLSearchParams(
          'side=up&from=2026-02-30&range=bogus&account=&tag=t1&tag=t1&symbol=es',
        ),
      ),
    ).toEqual({ ...EMPTY_FILTERS, tagIds: ['t1'], symbols: ['ES'] });
    expect(
      parseFilters(new URLSearchParams('from=2026-03-31&to=2026-01-01')).range,
    ).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(
      parseFilters(new URLSearchParams('range=ytd&from=2026-01-05')).range,
    ).toEqual({ preset: 'ytd' });
  });

  test('merging keeps other params', () => {
    const merged = mergeFilterParams(
      new URLSearchParams('by=hour&side=short&tag=x'),
      {
        ...EMPTY_FILTERS,
        side: 'long',
      },
    );
    expect(merged.toString()).toBe('by=hour&side=long');
  });

  test('ids unknown to the workspace are dropped (Review Focus 5)', () => {
    const f = {
      ...EMPTY_FILTERS,
      accountIds: ['a', 'ghost'],
      strategyIds: ['old'],
      tagIds: ['t1'],
      symbols: ['ES'],
    };
    expect(
      sanitizeFilters(f, {
        accountIds: new Set(['a']),
        strategyIds: new Set(),
        tagIds: new Set(['t1']),
      }),
    ).toEqual({ ...f, accountIds: ['a'], strategyIds: [] });
  });

  test('a link with only ghost ids shows data once sanitized', () => {
    const t = makeTrade({
      net: 1,
      accountId: 'a',
      strategyIds: ['s1'],
      tagIds: ['t1'],
    });
    const link = parseFilters(
      new URLSearchParams('account=ghost&strategy=old&tag=gone'),
    );
    expect(applyFilters([t], link, env)).toEqual([]);
    const clean = sanitizeFilters(link, {
      accountIds: new Set(['a']),
      strategyIds: new Set(['s1']),
      tagIds: new Set(['t1']),
    });
    expect(clean).toEqual(EMPTY_FILTERS);
    expect(applyFilters([t], clean, env)).toEqual([t]);
  });
});

import { describe, expect, test } from 'vitest';
import {
  breakdown,
  breakdown2D,
  type BreakdownKey,
  type BreakdownOptions,
} from '../domain/metrics/breakdowns';
import type { MetricContext } from '../domain/metrics/context';
import { makeTrade } from '../domain/__fixtures__/trades';
import type { Trade } from '../domain/types';
import { isClosed } from '../domain/trade-status';
import {
  applyFilters,
  EMPTY_FILTERS,
  parseFilters,
  type FilterEnv,
  type GlobalFilters,
} from './filters';
import {
  bucketFilters,
  bucketHref,
  calendarHref,
  cellHref,
  intersectRanges,
  type BucketOptions,
} from './report-links';
import { generateSampleWorkspace } from './seed/generate';

const ws = generateSampleWorkspace({ seed: 20261120, endDate: '2026-11-20' });
const TZ = 'America/New_York';
const env: FilterEnv = {
  timeZone: TZ,
  today: '2026-11-23',
  accounts: ws.accounts,
};
const ctxOf = (pnlBasis: 'net' | 'gross' = 'net'): MetricContext => ({
  timeZone: TZ,
  breakevenRange: { unit: 'amount', from: 0, to: 0 },
  pnlBasis,
});

/** The log's trades for a link: its address read back through the filter parser, closed only as the log shows by default. */
function logIds(href: string, trades = ws.trades, pnlBasis?: 'net' | 'gross') {
  const url = new URL(href, 'http://keel.test');
  expect(url.pathname).toBe('/app/trades');
  const f = parseFilters(url.searchParams);
  return applyFilters(trades, f, pnlBasis ? { ...env, pnlBasis } : env)
    .filter(isClosed)
    .map((t) => t.id)
    .sort();
}

const ALL: BreakdownKey[] = [
  'weekday',
  'hour',
  'time-of-day',
  'session',
  'duration',
  'side',
  'symbol',
  'strategy',
  'tag',
  'size',
  'r',
  'month',
  'dte',
  'instrument',
  'account',
  'entry-price',
  'exit-price',
  'exit-hour',
  'symbol-top',
  'symbol-bottom',
];
/** Buckets that have no filter, by design. */
const NO_LINK = (by: BreakdownKey, key: string) =>
  by === 'session' ||
  by === 'dte' ||
  (key === '__none__' && (by === 'r' || by === 'tag'));

describe('a bucket opens exactly the trades it counted', () => {
  const variants: { name: string; opts: BucketOptions }[] = [
    { name: 'by entry', opts: { timeBasis: 'entry', bucketMinutes: 30 } },
    { name: 'by exit', opts: { timeBasis: 'exit', bucketMinutes: 15 } },
  ];
  const bases: { name: string; base: GlobalFilters }[] = [
    { name: 'no filters', base: EMPTY_FILTERS },
    {
      name: 'a date range',
      base: {
        ...EMPTY_FILTERS,
        range: { from: '2026-10-01', to: '2026-11-13' },
      },
    },
    {
      name: 'a preset range',
      base: { ...EMPTY_FILTERS, range: { preset: 'last-30-days' } },
    },
    { name: 'long only', base: { ...EMPTY_FILTERS, side: 'long' } },
  ];
  for (const { name: vname, opts } of variants)
    for (const { name: bname, base } of bases)
      for (const by of ALL)
        test(`${by}, ${vname}, ${bname}`, () => {
          const set = applyFilters(ws.trades, base, env);
          const rows = breakdown(set, by, { ...ctxOf(), ...opts });
          let linked = 0;
          for (const row of rows) {
            const href = bucketHref(base, by, row.key, opts);
            if (NO_LINK(by, row.key)) {
              expect(href).toBeUndefined();
              continue;
            }
            // The page's own filters can leave a bucket empty: nothing to open.
            if (href === undefined && row.tradeIds.length === 0) continue;
            expect(href, `${by} ${row.key}`).toBeDefined();
            linked += 1;
            expect(logIds(href!), `${by} ${row.key}`).toEqual(
              [...row.tradeIds].sort(),
            );
          }
          if (!NO_LINK(by, 'x')) expect(linked).toBeGreaterThan(0);
        });

  test('the R buckets agree under the gross basis too', () => {
    const base = EMPTY_FILTERS;
    const rows = breakdown(ws.trades, 'r', ctxOf('gross'));
    for (const row of rows) {
      const href = bucketHref(base, 'r', row.key);
      if (row.key === '__none__') continue;
      expect(logIds(href!, ws.trades, 'gross')).toEqual(
        [...row.tradeIds].sort(),
      );
    }
  });
});

describe('the Task 29 buckets link to exactly their trades', () => {
  const closedIds = (f: GlobalFilters) =>
    applyFilters(ws.trades, f, env)
      .filter(isClosed)
      .map((t) => t.id)
      .sort();

  test('instrument sets the asset class filter and round-trips through the address', () => {
    const rows = breakdown(ws.trades, 'instrument', ctxOf());
    expect(rows.length).toBeGreaterThan(2);
    for (const row of rows) {
      const href = bucketHref(EMPTY_FILTERS, 'instrument', row.key)!;
      expect(new URL(href, 'http://x').searchParams.get('inst')).toBe(row.key);
      expect(logIds(href)).toEqual([...row.tradeIds].sort());
    }
  });

  test('price buckets include their lower edge and exclude the upper', () => {
    for (const by of ['entry-price', 'exit-price'] as const) {
      const rows = breakdown(ws.trades, by, ctxOf());
      for (const row of rows) {
        if (row.tradeIds.length === 0) continue;
        const f = bucketFilters(EMPTY_FILTERS, by, row.key)!;
        const r = by === 'entry-price' ? f.entryPrice : f.exitPrice;
        expect(r?.minExclusive).toBeUndefined();
        expect(r?.maxExclusive).toBe(true);
        expect(closedIds(f)).toEqual([...row.tradeIds].sort());
      }
    }
  });

  test('a price bucket inside a page price range is intersected', () => {
    const rows = breakdown(ws.trades, 'entry-price', ctxOf()).filter(
      (r) => r.tradeIds.length > 0,
    );
    const mid = rows[Math.floor(rows.length / 2)]!;
    const [from] = mid.key.split('_').map(Number) as [number, number];
    const base: GlobalFilters = { ...EMPTY_FILTERS, entryPrice: { min: from } };
    const set = applyFilters(ws.trades, base, env);
    for (const row of breakdown(set, 'entry-price', ctxOf())) {
      const f = bucketFilters(base, 'entry-price', row.key);
      if (!f) {
        expect(row.tradeIds).toEqual([]);
        continue;
      }
      expect(closedIds(f)).toEqual([...row.tradeIds].sort());
    }
  });

  test('account follows the page choice', () => {
    const [a, b] = ws.accounts;
    const only: GlobalFilters = { ...EMPTY_FILTERS, accountIds: [a!.id] };
    expect(bucketFilters(only, 'account', b!.id)).toBeNull();
    expect(bucketFilters(only, 'account', a!.id)?.accountIds).toEqual([a!.id]);
    const any = bucketFilters(EMPTY_FILTERS, 'account', b!.id);
    expect(any?.accountIds).toEqual([b!.id]);
  });

  test('exit hour reads the exit window even when the report buckets by entry', () => {
    const f = bucketFilters(EMPTY_FILTERS, 'exit-hour', '10', {
      timeBasis: 'entry',
    });
    expect(f?.exitWindows).toEqual([{ from: '10:00', to: '10:59' }]);
    expect(f?.entryWindows).toEqual([]);
  });

  test('top and bottom 10 symbols link by symbol', () => {
    expect(bucketFilters(EMPTY_FILTERS, 'symbol-top', 'ES')?.symbols).toEqual([
      'ES',
    ]);
    expect(
      bucketFilters(
        { ...EMPTY_FILTERS, symbols: ['NQ'] },
        'symbol-bottom',
        'ES',
      ),
    ).toBeNull();
  });

  test('cross cells with the new dimensions agree with the log', () => {
    const pairs: [BreakdownKey, BreakdownKey][] = [
      ['symbol', 'instrument'],
      ['account', 'entry-price'],
      ['exit-hour', 'size'],
      ['symbol-top', 'exit-price'],
      ['instrument', 'r'],
    ];
    for (const [rowBy, colBy] of pairs) {
      const m = breakdown2D(ws.trades, ctxOf(), rowBy, colBy, 'trades');
      let linked = 0;
      m.rows.forEach((row, r) =>
        m.cols.forEach((col, c) => {
          const href = cellHref(
            EMPTY_FILTERS,
            { by: rowBy, key: row.key },
            { by: colBy, key: col.key },
          );
          if (m.counts[r]![c] === null) return;
          if (href === undefined) return;
          linked += 1;
          expect(
            logIds(href),
            `${rowBy} ${row.key} x ${colBy} ${col.key}`,
          ).toEqual([...m.tradeIds[r]![c]!].sort());
        }),
      );
      expect(linked, `${rowBy} x ${colBy}`).toBeGreaterThan(0);
    }
  });

  test('with two currencies the link names one and the counts still agree', () => {
    // Every third trade is in euros: the report reads the dollar ones.
    const mixed = ws.trades.map((t, i) =>
      i % 3 === 0 ? { ...t, pnlCurrency: 'EUR' } : t,
    );
    const usd = mixed.filter((t) => t.pnlCurrency === 'USD');
    const base = { ...EMPTY_FILTERS, currency: 'USD' };
    const rows = breakdown(usd, 'instrument', ctxOf());
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      const href = bucketHref(base, 'instrument', row.key)!;
      expect(new URL(href, 'http://x').searchParams.get('ccy')).toBe('USD');
      // The log lists every currency; the link's own count is the bucket's.
      expect(logIds(href, mixed)).toEqual([...row.tradeIds].sort());
    }
  });
});

describe('the page filters stay in force', () => {
  const closedIds = (f: GlobalFilters) =>
    applyFilters(ws.trades, f, env)
      .filter(isClosed)
      .map((t) => t.id)
      .sort();
  const check = (
    base: GlobalFilters,
    by: BreakdownKey,
    opts?: BucketOptions,
  ) => {
    const set = applyFilters(ws.trades, base, env);
    let n = 0;
    for (const row of breakdown(set, by, { ...ctxOf(), ...opts })) {
      const f = bucketFilters(base, by, row.key, opts);
      if (!f) continue;
      n += 1;
      expect(closedIds(f), `${by} ${row.key}`).toEqual(
        [...row.tradeIds].sort(),
      );
    }
    return n;
  };

  test('a weekday and an hour inside a weekday and entry window filter', () => {
    const base: GlobalFilters = {
      ...EMPTY_FILTERS,
      weekdays: [1, 2, 3],
      entryWindows: [{ from: '09:00', to: '11:30' }],
    };
    expect(check(base, 'weekday')).toBeGreaterThan(0);
    expect(check(base, 'hour')).toBeGreaterThan(0);
    expect(check(base, 'time-of-day', { bucketMinutes: 5 })).toBeGreaterThan(0);
  });

  test('a window that wraps past midnight is cut, not lost', () => {
    const base: GlobalFilters = {
      ...EMPTY_FILTERS,
      entryWindows: [{ from: '22:00', to: '02:00' }],
    };
    const n = check(base, 'hour');
    expect(n).toBeGreaterThanOrEqual(0);
    const f = bucketFilters(base, 'hour', '23');
    expect(f?.entryWindows).toEqual([{ from: '23:00', to: '23:59' }]);
    expect(bucketFilters(base, 'hour', '12')).toBeNull();
  });

  test('a duration, size and R range on the page are intersected', () => {
    const base: GlobalFilters = {
      ...EMPTY_FILTERS,
      duration: { min: 2, max: 90 },
      size: { max: 10 },
      r: { min: -3 },
    };
    expect(check(base, 'duration')).toBeGreaterThan(0);
    expect(check(base, 'size')).toBeGreaterThan(0);
    expect(check(base, 'r')).toBeGreaterThan(0);
    expect(bucketFilters(base, 'duration', 'gt-1d')).toBeNull();
    expect(bucketFilters(base, 'duration', '5-15m')?.duration).toEqual({
      min: 5,
      max: 15,
      maxExclusive: true,
    });
  });

  test('strategy and tag buckets combine with the page choice', () => {
    const [a, b] = ws.strategies;
    const base: GlobalFilters = { ...EMPTY_FILTERS, strategyIds: [a!.id] };
    expect(check(base, 'strategy')).toBeGreaterThan(0);
    const both = bucketFilters(base, 'strategy', b!.id);
    expect(both?.strategyIds.sort()).toEqual([a!.id, b!.id].sort());
    expect(both?.strategyMatch).toBe('all');
    // Two strategies "any" on the page, a third in the bucket: no one filter says it.
    const c = ws.strategies[2]!;
    const two: GlobalFilters = {
      ...EMPTY_FILTERS,
      strategyIds: [a!.id, b!.id],
    };
    expect(bucketFilters(two, 'strategy', c.id)).toBeNull();
    expect(bucketFilters(two, 'strategy', a!.id)?.strategyIds).toEqual([a!.id]);
    const tag = ws.tags[0]!;
    expect(
      check({ ...EMPTY_FILTERS, tagIds: [tag.id] }, 'tag'),
    ).toBeGreaterThan(0);
  });

  test('no strategy: the bucket sets the flag, and a page that excludes them has none', () => {
    const f = bucketFilters(EMPTY_FILTERS, 'strategy', '__none__');
    expect(f).toMatchObject({ noStrategy: true, strategyIds: [] });
    expect(
      bucketFilters(
        { ...EMPTY_FILTERS, strategyIds: ['s1'] },
        'strategy',
        '__none__',
      ),
    ).toBeNull();
    expect(
      bucketFilters({ ...EMPTY_FILTERS, noStrategy: true }, 'strategy', 's1'),
    ).toBeNull();
  });

  test('a symbol or side outside the page choice is not a link', () => {
    expect(
      bucketFilters({ ...EMPTY_FILTERS, symbols: ['ES'] }, 'symbol', 'NQ'),
    ).toBeNull();
    expect(
      bucketFilters({ ...EMPTY_FILTERS, side: 'long' }, 'side', 'short'),
    ).toBeNull();
    expect(
      bucketFilters({ ...EMPTY_FILTERS, status: 'open' }, 'side', 'long'),
    ).toBeNull();
  });

  test('buckets with no filter are not links', () => {
    expect(bucketHref(EMPTY_FILTERS, 'dte', '2-7')).toBeUndefined();
    expect(bucketHref(EMPTY_FILTERS, 'session', 'london')).toBeUndefined();
    expect(bucketHref(EMPTY_FILTERS, 'r', '__none__')).toBeUndefined();
    expect(bucketHref(EMPTY_FILTERS, 'tag', '__none__')).toBeUndefined();
    expect(bucketHref(EMPTY_FILTERS, 'symbol', 'Other')).toBeUndefined();
  });

  test('the address keeps the page filters and the date range', () => {
    const base: GlobalFilters = {
      ...EMPTY_FILTERS,
      range: { preset: 'this-month' },
      accountIds: ['acct-1'],
      symbols: ['ES', 'NQ'],
    };
    const href = bucketHref(base, 'weekday', 'wed')!;
    const p = new URL(href, 'http://x').searchParams;
    expect(p.get('range')).toBe('this-month');
    expect(p.get('account')).toBe('acct-1');
    expect(p.get('wd')).toBe('3');
    expect(p.get('symbol')).toBe('ES,NQ');
  });
});

describe('a cross-analysis cell opens the trades in both buckets', () => {
  const pairs: [BreakdownKey, BreakdownKey][] = [
    ['weekday', 'side'],
    ['symbol', 'hour'],
    ['month', 'duration'],
    ['strategy', 'tag'],
    ['tag', 'weekday'],
    ['side', 'duration'],
  ];
  for (const [rows, cols] of pairs)
    for (const opts of [
      { timeBasis: 'entry' as const },
      { timeBasis: 'exit' as const },
    ])
      test(`${rows} by ${cols}, ${opts.timeBasis}`, () => {
        const m = breakdown2D(
          ws.trades,
          { ...ctxOf(), ...(opts as BreakdownOptions) },
          rows,
          cols,
          'trades',
        );
        let linked = 0;
        m.rows.forEach((r, ri) =>
          m.cols.forEach((c, ci) => {
            const ids = m.tradeIds[ri]?.[ci] ?? [];
            if (ids.length === 0) return;
            const href = cellHref(
              EMPTY_FILTERS,
              { by: rows, key: r.key },
              { by: cols, key: c.key },
              opts,
            );
            if (href === undefined) return;
            linked += 1;
            expect(logIds(href), `${r.key} x ${c.key}`).toEqual(
              [...ids].sort(),
            );
          }),
        );
        expect(linked).toBeGreaterThan(0);
      });

  test('a folded column or a bucket with no filter is not a link', () => {
    expect(
      cellHref(
        EMPTY_FILTERS,
        { by: 'symbol', key: 'ES' },
        { by: 'tag', key: 'Other' },
      ),
    ).toBeUndefined();
    expect(
      cellHref(
        EMPTY_FILTERS,
        { by: 'symbol', key: 'ES' },
        { by: 'session', key: 'asia' },
      ),
    ).toBeUndefined();
  });
});

describe('intersectRanges', () => {
  test('keeps the tighter bound and its exclusion', () => {
    expect(intersectRanges({ min: 1, max: 10 }, { min: 5, max: 20 })).toEqual({
      min: 5,
      max: 10,
    });
    expect(intersectRanges({ max: 5 }, { max: 5, maxExclusive: true })).toEqual(
      { max: 5, maxExclusive: true },
    );
    expect(
      intersectRanges({ min: 5 }, { max: 5, maxExclusive: true }),
    ).toBeNull();
    expect(intersectRanges({ min: 5, max: 5 }, { min: 5 })).toEqual({
      min: 5,
      max: 5,
    });
    expect(intersectRanges({ min: 6 }, { max: 5 })).toBeNull();
    expect(intersectRanges(undefined, { min: 1 })).toEqual({ min: 1 });
  });
});

describe('with trades in two currencies', () => {
  // Every third trade settles in EUR.
  const mixed = ws.trades.map((t, i) =>
    i % 3 === 0 ? { ...t, pnlCurrency: 'EUR' } : t,
  );
  for (const currency of ['USD', 'EUR'])
    test(`${currency} buckets open only that currency's trades`, () => {
      const own = mixed.filter((t) => t.pnlCurrency === currency);
      const base = { ...EMPTY_FILTERS, currency };
      for (const by of ['weekday', 'side', 'symbol'] as const)
        for (const row of breakdown(own, by, ctxOf())) {
          if (row.tradeIds.length === 0) continue;
          const href = bucketHref(base, by, row.key)!;
          expect(href).toContain(`ccy=${currency}`);
          expect(logIds(href, mixed), `${by} ${row.key}`).toEqual(
            [...row.tradeIds].sort(),
          );
        }
    });
});

describe('a bucket edge belongs to one bucket', () => {
  const rOf = (r: number) =>
    makeTrade({
      net: r * 100,
      initialRisk: 100,
      accountId: ws.accounts[0]!.id,
    });
  const filterOf = (by: BreakdownKey, key: string) =>
    bucketFilters(EMPTY_FILTERS, by, key)!;
  const hits = (t: Trade, by: BreakdownKey, keys: string[]) =>
    keys.filter(
      (k) =>
        applyFilters([t], filterOf(by, k), {
          ...env,
          today: '2030-01-01',
        }).length === 1,
    );
  const rKeys = ['le-5', '-5', '-4', '-1', '0', '1', '4', 'ge5'];
  for (const r of [-5, -4, 0, 1, 4, 5])
    test(`R of exactly ${r} is in one bucket, the one the report files it under`, () => {
      const t = rOf(r);
      const row = breakdown([t], 'r', ctxOf()).find(
        (x) => x.tradeIds.length === 1,
      )!;
      expect(hits(t, 'r', rKeys.concat(['-3', '-2', '2', '3']))).toEqual([
        row.key,
      ]);
    });

  const spanOf = (minutes: number) =>
    makeTrade({
      net: 1,
      accountId: ws.accounts[0]!.id,
      openedAt: '2026-11-18T15:00:00Z',
      closedAt: new Date(
        Date.parse('2026-11-18T15:00:00Z') + minutes * 60000,
      ).toISOString(),
    });
  const dKeys = ['lt-1m', '1-5m', '5-15m', '15-60m', '1-4h', '4h-1d', 'gt-1d'];
  for (const m of [0.5, 1, 5, 15, 60, 240, 1440, 2000])
    test(`a trade of ${m} minutes is in one duration bucket`, () => {
      const t = spanOf(m);
      const row = breakdown([t], 'duration', ctxOf()).find(
        (x) => x.tradeIds.length === 1,
      )!;
      expect(hits(t, 'duration', dKeys)).toEqual([row.key]);
    });

  const sKeys = [
    'lt-1',
    '1',
    '2-3',
    '4-5',
    '6-10',
    '11-25',
    '26-100',
    'gt-100',
  ];
  for (const q of [0.5, 1, 2, 4, 6, 11, 26, 100, 101])
    test(`a size of ${q} is in one size bucket`, () => {
      const t = makeTrade({
        net: 1,
        maxPosition: q,
        accountId: ws.accounts[0]!.id,
      });
      const row = breakdown([t], 'size', ctxOf()).find(
        (x) => x.tradeIds.length === 1,
      )!;
      expect(hits(t, 'size', sKeys)).toEqual([row.key]);
    });
});

describe('calendarHref', () => {
  test('opens the calendar on the month and the day', () => {
    expect(calendarHref(EMPTY_FILTERS, '2026-11-03')).toBe(
      '/app/calendar?month=2026-11&day=2026-11-03',
    );
  });
  test('keeps the page filters, so the calendar reads the same trades', () => {
    const href = calendarHref(
      { ...EMPTY_FILTERS, symbols: ['ES'], range: { preset: 'last-30-days' } },
      '2026-11-03',
    );
    const url = new URL(href, 'http://x');
    expect(url.pathname).toBe('/app/calendar');
    expect(url.searchParams.get('day')).toBe('2026-11-03');
    expect(url.searchParams.get('month')).toBe('2026-11');
    const read = parseFilters(url.searchParams);
    expect(read.symbols).toEqual(['ES']);
    expect(read.range).toEqual({ preset: 'last-30-days' });
  });
});

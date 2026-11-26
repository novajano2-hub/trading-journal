import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { resolveInstrument } from '../instruments';
import { defaultMetricContext } from './context';
import {
  breakdown,
  breakdown2D,
  highlights,
  rDistribution,
  winsVsLosses,
} from './breakdowns';

const ctx = defaultMetricContext('America/New_York');
const at = (openedAt: string, extra = {}) =>
  makeTrade({ net: 1000, openedAt, closedAt: openedAt, ...extra });

describe('breakdowns', () => {
  test('weekday and hour respect the user timezone', () => {
    const rows = breakdown([at('2026-03-09T13:45:00Z')], 'weekday', ctx);
    expect(rows.map((r) => r.key)).toEqual([
      'sun',
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
      'sat',
    ]);
    expect(
      breakdown([at('2026-03-09T13:45:00Z')], 'weekday', {
        ...ctx,
        weekStart: 'monday',
      }).map((r) => r.key),
    ).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(rows.find((r) => r.key === 'mon')!.summary.closedCount).toBe(1);
    expect(
      breakdown([at('2026-03-09T16:00:00Z')], 'weekday', {
        ...ctx,
        timeZone: 'Asia/Tokyo',
      }).find((r) => r.summary.closedCount)!.key,
    ).toBe('tue');
    const hours = breakdown([at('2026-03-09T13:45:00Z')], 'hour', ctx);
    expect(hours).toHaveLength(24);
    expect(hours.find((r) => r.summary.closedCount)!.key).toBe('9');
    expect(hours[9]!.label).toBe('09:00');
  });

  test('sessions use New York time regardless of user timezone', () => {
    const key = (iso: string) =>
      breakdown([at(iso)], 'session', { ...ctx, timeZone: 'Asia/Tokyo' }).find(
        (r) => r.summary.closedCount,
      )!.key;
    expect(key('2026-03-09T13:45:00Z')).toBe('new-york');
    expect(key('2026-03-09T07:00:00Z')).toBe('london');
    expect(key('2026-03-09T13:29:00Z')).toBe('london');
    expect(key('2026-03-09T20:30:00Z')).toBe('after-hours');
    expect(key('2026-03-09T23:00:00Z')).toBe('asia');
  });

  test('duration buckets are lower-inclusive', () => {
    const d = (secs: number) =>
      breakdown(
        [
          makeTrade({
            net: 1,
            openedAt: '2026-03-09T14:00:00Z',
            closedAt: new Date(
              Date.parse('2026-03-09T14:00:00Z') + secs * 1000,
            ).toISOString(),
          }),
        ],
        'duration',
        ctx,
      ).find((r) => r.summary.closedCount)!.key;
    expect([d(59), d(60), d(180)]).toEqual(['lt-1m', '1-5m', '1-5m']);
    expect(d(86400)).toBe('gt-1d');
  });

  test('open trades are skipped', () => {
    const rows = breakdown(
      [makeTrade({ net: 0, status: 'open' })],
      'side',
      ctx,
    );
    expect(rows.map((r) => r.key)).toEqual(['long', 'short']);
    expect(
      rows.every(
        (r) => r.summary.closedCount === 0 && r.summary.openCount === 0,
      ),
    ).toBe(true);
  });

  test('dynamic keys: tags multi-count, untagged and no-strategy rows, symbols by root', () => {
    const t = [
      makeTrade({ net: 3000, tagIds: ['orb', 'fomo'] }),
      makeTrade({ net: -1000 }),
    ];
    const tags = breakdown(t, 'tag', {
      ...ctx,
      tagNames: { orb: 'ORB', fomo: 'FOMO' },
    });
    expect(tags.map((r) => [r.key, r.label])).toEqual([
      ['orb', 'ORB'],
      ['fomo', 'FOMO'],
      ['__none__', 'Untagged'],
    ]);
    expect(breakdown(t, 'strategy', ctx).map((r) => r.label)).toContain(
      'No strategy',
    );
    // A trade counts under each of its strategies.
    const multi = breakdown(
      [
        makeTrade({ net: 3000, strategyIds: ['orb', 'trend'] }),
        makeTrade({ net: -1000, strategyIds: ['orb'] }),
      ],
      'strategy',
      { ...ctx, strategyNames: { orb: 'ORB', trend: 'Trend' } },
    );
    expect(
      multi.map((r) => [r.label, r.summary.closedCount, r.summary.netPnl]),
    ).toEqual([
      ['Trend', 1, 3000],
      ['ORB', 2, 2000],
    ]);
    const es = [
      makeTrade({ net: 1, instrument: resolveInstrument('ESZ5')! }),
      makeTrade({ net: 1, instrument: resolveInstrument('ESH6')! }),
    ];
    expect(breakdown(es, 'symbol', ctx).map((r) => r.key)).toEqual(['ES']);
  });

  test('tags group by category name, then P&L, untagged last', () => {
    const t = [
      makeTrade({ net: 500, tagIds: ['calm'] }),
      makeTrade({ net: -2000, tagIds: ['fomo', 'orb'] }),
      makeTrade({ net: 4000, tagIds: ['orb'] }),
      makeTrade({ net: 100 }),
    ];
    const rows = breakdown(t, 'tag', {
      ...ctx,
      tagNames: { orb: 'ORB', fomo: 'FOMO', calm: 'Calm' },
      tagCategoryNames: { orb: 'Setups', fomo: 'Mistakes', calm: 'Emotions' },
    });
    expect(rows.map((r) => [r.group, r.label])).toEqual([
      ['Emotions', 'Calm'],
      ['Mistakes', 'FOMO'],
      ['Setups', 'ORB'],
      [undefined, 'Untagged'],
    ]);
  });

  test('time-of-day buckets by entry or exit time', () => {
    const t = [
      makeTrade({
        net: 1,
        openedAt: '2026-03-09T13:47:00Z',
        closedAt: '2026-03-09T14:20:00Z',
      }),
    ];
    const key = (o: object) =>
      breakdown(t, 'time-of-day', { ...ctx, ...o }).find(
        (r) => r.summary.closedCount,
      )!.key;
    expect(key({ bucketMinutes: 15 })).toBe('09:45');
    expect(key({ bucketMinutes: 15, timeBasis: 'exit' })).toBe('10:15');
    expect(key({})).toBe('09:30');
    expect(key({ bucketMinutes: 60 })).toBe('09:00');
    expect(key({ bucketMinutes: 5 })).toBe('09:45');
    const rows = breakdown(t, 'time-of-day', { ...ctx, bucketMinutes: 30 });
    expect(rows).toHaveLength(48);
    expect(rows[0]).toMatchObject({ key: '00:00', label: '00:00' });
    expect(rows[47]!.key).toBe('23:30');
    expect(
      breakdown(t, 'time-of-day', { ...ctx, bucketMinutes: 5 }),
    ).toHaveLength(288);
  });

  test('timeBasis exit applies to hour, weekday and session', () => {
    const t = [
      makeTrade({
        net: 1,
        openedAt: '2026-03-09T13:47:00Z',
        closedAt: '2026-03-09T14:20:00Z',
      }),
    ];
    const exit = { ...ctx, timeBasis: 'exit' as const };
    expect(
      breakdown(t, 'hour', exit).find((r) => r.summary.closedCount)!.key,
    ).toBe('10');
    expect(
      breakdown(t, 'hour', ctx).find((r) => r.summary.closedCount)!.key,
    ).toBe('9');
    const overnight = [
      makeTrade({
        net: 1,
        openedAt: '2026-03-09T13:47:00Z',
        closedAt: '2026-03-10T13:47:00Z',
      }),
    ];
    expect(
      breakdown(overnight, 'weekday', exit).find((r) => r.summary.closedCount)!
        .key,
    ).toBe('tue');
    const lateExit = [
      makeTrade({
        net: 1,
        openedAt: '2026-03-09T13:47:00Z',
        closedAt: '2026-03-09T20:30:00Z',
      }),
    ];
    expect(
      breakdown(lateExit, 'session', exit).find((r) => r.summary.closedCount)!
        .key,
    ).toBe('after-hours');
    expect(
      breakdown(lateExit, 'session', ctx).find((r) => r.summary.closedCount)!
        .key,
    ).toBe('new-york');
  });

  test('R distribution has contiguous bins', () => {
    const t = [-1, -0.5, 0.2, 1.4, 2].map((r) =>
      makeTrade({ net: r * 1000, initialRisk: 1000 }),
    );
    expect(rDistribution(t).map((b) => [b.from, b.count])).toEqual([
      [-1, 1],
      [-0.5, 1],
      [0, 1],
      [0.5, 0],
      [1, 1],
      [1.5, 0],
      [2, 1],
    ]);
    expect(rDistribution([makeTrade({ net: 100 })])).toEqual([]);
  });

  test('R distribution follows the P&L basis', () => {
    const t = [
      makeTrade({ net: -500, gross: 1000, fees: 1500, initialRisk: 1000 }),
    ];
    expect(rDistribution(t).map((b) => [b.from, b.count])).toEqual([[-0.5, 1]]);
    expect(
      rDistribution(t, 0.5, 'gross').map((b) => [b.from, b.count]),
    ).toEqual([[1, 1]]);
  });

  test('dynamic rows rank by the basis P&L', () => {
    const t = [
      makeTrade({
        net: 100,
        gross: 200,
        fees: 100,
        instrument: resolveInstrument('ESZ5')!,
      }),
      makeTrade({
        net: 300,
        gross: 300,
        fees: 0,
        instrument: resolveInstrument('NQZ5')!,
      }),
    ];
    const order = (c: object) =>
      breakdown(t, 'symbol', { ...ctx, ...c }).map((r) => r.key);
    expect(order({})).toEqual(['NQ', 'ES']);
    expect(order({ pnlBasis: 'gross' })).toEqual(['NQ', 'ES']);
    const t2 = [
      makeTrade({
        net: 100,
        gross: 900,
        fees: 800,
        instrument: resolveInstrument('ESZ5')!,
      }),
      makeTrade({
        net: 300,
        gross: 300,
        fees: 0,
        instrument: resolveInstrument('NQZ5')!,
      }),
    ];
    expect(breakdown(t2, 'symbol', ctx).map((r) => r.key)).toEqual([
      'NQ',
      'ES',
    ]);
    expect(
      breakdown(t2, 'symbol', { ...ctx, pnlBasis: 'gross' }).map((r) => r.key),
    ).toEqual(['ES', 'NQ']);
  });

  test('status open with a closedAt is excluded from breakdowns and rDistribution', () => {
    const ghost = at('2026-03-09T13:45:00Z', {
      status: 'open',
      initialRisk: 1000,
    });
    const noClose = at('2026-03-09T13:45:00Z', { initialRisk: 1000 });
    delete (noClose as { closedAt?: string }).closedAt;
    expect(
      breakdown([ghost, noClose], 'side', ctx).every(
        (r) => r.summary.closedCount === 0,
      ),
    ).toBe(true);
    expect(rDistribution([ghost, noClose])).toEqual([]);
  });
});

describe('breakdown2D', () => {
  const es = resolveInstrument('ESZ5')!;
  const nq = resolveInstrument('NQZ5')!;
  const trade = (
    instrument: typeof es,
    direction: 'long' | 'short',
    net: number,
  ) => makeTrade({ net, instrument, direction });

  test('symbol by side on four trades is a 2 by 2 matrix of nets', () => {
    const t = [
      trade(es, 'long', 1000),
      trade(es, 'short', -400),
      trade(nq, 'long', 700),
      trade(nq, 'long', 300),
    ];
    const m = breakdown2D(t, ctx, 'symbol', 'side', 'net');
    // Symbols rank by P&L (NQ 1000, ES 600); the empty Short column of NQ is a null cell.
    expect(m.rows).toEqual([
      { key: 'NQ', label: 'NQ' },
      { key: 'ES', label: 'ES' },
    ]);
    expect(m.cols).toEqual([
      { key: 'long', label: 'Long' },
      { key: 'short', label: 'Short' },
    ]);
    expect(m.counts).toEqual([
      [2, null],
      [1, 1],
    ]);
    expect(m.tradeIds.map((r) => r.map((c) => c.length))).toEqual([
      [2, 0],
      [1, 1],
    ]);
    expect(m.tradeIds[0]![0]).toEqual([t[2]!.id, t[3]!.id]);
    expect(m.cells).toEqual([
      [1000, null],
      [1000, -400],
    ]);
    expect(breakdown2D(t, ctx, 'symbol', 'side', 'trades').cells).toEqual([
      [2, null],
      [1, 1],
    ]);
    expect(breakdown2D(t, ctx, 'symbol', 'side', 'win-rate').cells).toEqual([
      [1, null],
      [1, 0],
    ]);
  });

  test('14 symbols fold into 12 columns, the busiest kept and the rest in Other', () => {
    const roots = Array.from(
      { length: 14 },
      (_, i) => `S${String(i).padStart(2, '0')}`,
    );
    const t = roots.flatMap((root, i) =>
      Array.from({ length: i < 2 ? 1 : 2 }, () =>
        makeTrade({
          net: 100,
          instrument: { ...es, root, symbol: root },
        }),
      ),
    );
    const m = breakdown2D(t, ctx, 'side', 'symbol', 'trades');
    expect(m.cols).toHaveLength(12);
    expect(m.cols[11]).toEqual({ key: 'Other', label: 'Other' });
    // Three symbols fold (the two one-trade ones and one of the busy ties): 1 + 1 + 2.
    expect(m.cells[0]![11]).toBe(4);
    expect(m.cells[0]!.reduce((a, b) => a! + b!, 0)).toBe(26);
  });

  test('a range dimension shows every bucket and never folds: R has 13, each its own column (E148)', () => {
    // One trade in each R bucket: the two tails, ten whole-R steps, and a trade with no stop.
    const rs = [-6, -4.5, -3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5, 4.5, 6];
    const t = [
      ...rs.map((r) => makeTrade({ net: r * 1000, initialRisk: 1000 })),
      makeTrade({ net: 500 }),
    ];
    const m = breakdown2D(t, ctx, 'side', 'r', 'trades');
    expect(m.cols).toHaveLength(13);
    expect(m.cols.some((c) => c.key === 'Other')).toBe(false);
    expect(m.folded).toBeUndefined();
    expect(m.cells[0]!.every((c) => c === 1)).toBe(true);
    // A list dimension past the limit still folds.
    const roots = Array.from({ length: 13 }, (_, i) => `S${i}`);
    const many = roots.map((root) =>
      makeTrade({ net: 100, instrument: { ...es, root, symbol: root } }),
    );
    expect(
      breakdown2D(many, ctx, 'side', 'symbol', 'trades').cols,
    ).toHaveLength(12);
  });

  test('a trade with two strategies counts in each of them', () => {
    const t = [makeTrade({ net: 500, strategyIds: ['a', 'b'] })];
    const m = breakdown2D(t, ctx, 'strategy', 'side', 'net', {
      strategyNames: { a: 'Alpha', b: 'Beta' },
    });
    expect(m.rows.map((r) => r.label).sort()).toEqual(['Alpha', 'Beta']);
    expect(m.cells).toEqual([[500], [500]]);
  });
});

describe('same-named tags in two categories', () => {
  const t = [
    makeTrade({ net: 500, tagIds: ['m-fomo'] }),
    makeTrade({ net: -200, tagIds: ['e-fomo'] }),
    makeTrade({ net: -300, tagIds: ['e-fomo'] }),
  ];
  const tagNames = { 'm-fomo': 'fomo', 'e-fomo': 'fomo' };

  test('rows and columns carry their own keys, and cells follow the key', () => {
    const m = breakdown2D(t, ctx, 'tag', 'side', 'net', { tagNames });
    expect(m.rows.map((r) => r.label)).toEqual(['fomo', 'fomo']);
    expect(m.rows.map((r) => r.key).sort()).toEqual(['e-fomo', 'm-fomo']);
    const at = (key: string) => m.cells[m.rows.findIndex((r) => r.key === key)];
    expect(at('m-fomo')).toEqual([500]);
    expect(at('e-fomo')).toEqual([-500]);
  });

  test('breakdown rows carry the ids of their trades', () => {
    const r = breakdown(t, 'tag', { ...ctx, tagNames });
    expect(r.find((x) => x.key === 'e-fomo')!.tradeIds).toEqual([
      t[1]!.id,
      t[2]!.id,
    ]);
    expect(r.find((x) => x.key === 'm-fomo')!.tradeIds).toEqual([t[0]!.id]);
  });
});

describe('new dimensions', () => {
  test('an 8R trade lands in "+5R or more" and the distribution clamps there', () => {
    const t = [
      makeTrade({ net: 8000, initialRisk: 1000 }),
      makeTrade({ net: -7000, initialRisk: 1000 }),
      makeTrade({ net: 500, initialRisk: 1000 }),
    ];
    const bins = rDistribution(t);
    expect(bins[bins.length - 1]).toMatchObject({
      label: '+5R or more',
      count: 1,
    });
    expect(bins[0]).toMatchObject({ label: '−5R or less', count: 1 });
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(3);
    const rows = breakdown(t, 'r', ctx);
    expect(
      rows.find((r) => r.label === '+5R or more')!.summary.closedCount,
    ).toBe(1);
    expect(rows.find((r) => r.label === '0R to +1R')!.summary.closedCount).toBe(
      1,
    );
  });

  test('a trade without a stop files under No stop', () => {
    const rows = breakdown([makeTrade({ net: 100 })], 'r', ctx);
    expect(rows.find((r) => r.label === 'No stop')!.summary.closedCount).toBe(
      1,
    );
  });

  test('size buckets follow the largest position, and months follow the instant', () => {
    const t = [
      makeTrade({ net: 1, maxPosition: 1 }),
      makeTrade({ net: 1, maxPosition: 3 }),
      makeTrade({
        net: 1,
        maxPosition: 40,
        openedAt: '2026-07-01T15:00:00Z',
        closedAt: '2026-07-02T15:00:00Z',
      }),
    ];
    const size = breakdown(t, 'size', ctx);
    expect(
      size.filter((r) => r.summary.closedCount).map((r) => r.label),
    ).toEqual(['1', '2 to 3', '26 to 100']);
    const month = breakdown(t, 'month', ctx);
    expect(month.find((r) => r.label === 'Mar')!.summary.closedCount).toBe(2);
    expect(month.find((r) => r.label === 'Jul')!.summary.closedCount).toBe(1);
    // By exit: the same trade is in July again, and a month boundary can move it.
    expect(
      breakdown(t, 'month', { ...ctx, timeBasis: 'exit' }).find(
        (r) => r.label === 'Jul',
      )!.summary.closedCount,
    ).toBe(1);
  });

  test('days to expiry bucket at entry: 0, 1, 2 to 7, 8 to 30, 31+, and stock is left out', () => {
    const opt = (sym: string, openedAt: string) =>
      makeTrade({
        net: 100,
        instrument: resolveInstrument(sym)!,
        openedAt,
        closedAt: openedAt,
      });
    const t = [
      opt('SPY260302C00500000', '2026-03-02T15:00:00Z'),
      opt('SPY260303C00500000', '2026-03-02T15:00:00Z'),
      opt('SPY260309C00500000', '2026-03-02T15:00:00Z'),
      opt('SPY260401C00500000', '2026-03-02T15:00:00Z'),
      opt('SPY260601C00500000', '2026-03-02T15:00:00Z'),
      makeTrade({ net: 999 }),
    ];
    const rows = breakdown(t, 'dte', ctx);
    expect(rows.map((r) => [r.key, r.summary.closedCount])).toEqual([
      ['0', 1],
      ['1', 1],
      ['2-7', 1],
      ['8-30', 1],
      ['31+', 1],
    ]);
    expect(rows.reduce((n, r) => n + r.summary.netPnl, 0)).toBe(500);
  });
});

describe('winsVsLosses', () => {
  test('each side carries the ids of its trades', () => {
    const t = [
      makeTrade({ net: 1000 }),
      makeTrade({ net: -500 }),
      makeTrade({ net: 0 }),
    ];
    const w = winsVsLosses(t, ctx);
    expect(w.wins.tradeIds).toEqual([t[0]!.id]);
    expect(w.losses.tradeIds).toEqual([t[1]!.id]);
  });

  test('counts and averages follow classify, and breakevens are in neither', () => {
    const t = [
      makeTrade({
        net: 1000,
        initialRisk: 500,
        mae: -100,
        mfe: 1200,
        maxPosition: 2,
        openedAt: '2026-03-02T15:00:00Z',
        closedAt: '2026-03-02T15:10:00Z',
      }),
      makeTrade({
        net: 3000,
        maxPosition: 4,
        direction: 'short',
        openedAt: '2026-03-02T15:00:00Z',
        closedAt: '2026-03-02T15:30:00Z',
      }),
      makeTrade({ net: -500, initialRisk: 500, maxPosition: 1 }),
      makeTrade({ net: 0 }),
    ];
    const r = winsVsLosses(t, ctx);
    expect(r.wins).toMatchObject({
      count: 2,
      net: 4000,
      avgNet: 2000,
      avgDurationMin: 20,
      avgR: 2,
      avgSize: 3,
      avgMae: -100,
      avgMfe: 1200,
      longShare: 0.5,
    });
    expect(r.losses).toMatchObject({
      count: 1,
      net: -500,
      avgNet: -500,
      avgR: -1,
      longShare: 1,
    });
    // Gross basis reclassifies: a trade whose fees turn it from a win into a loss moves.
    const fee = makeTrade({ net: -100, gross: 200, fees: 300 });
    expect(winsVsLosses([fee], ctx).losses.count).toBe(1);
    expect(winsVsLosses([fee], { ...ctx, pnlBasis: 'gross' }).wins.count).toBe(
      1,
    );
    expect(winsVsLosses([], ctx).wins).toMatchObject({
      count: 0,
      avgNet: null,
      longShare: null,
    });
  });
});

describe('the Task 29 dimensions', () => {
  const fx = (accountId: string, symbol: string, net: number, extra = {}) =>
    makeTrade({
      net,
      accountId,
      instrument: resolveInstrument(symbol)!,
      openedAt: '2026-03-09T14:10:00Z',
      closedAt: '2026-03-09T15:40:00Z',
      ...extra,
    });

  test('instrument buckets by asset class, richest first', () => {
    const t = [
      fx('a1', 'ESZ5', 500),
      fx('a1', 'NQZ5', 700),
      fx('a1', 'SPY261109C00500000', -100),
      fx('a1', 'EURUSD', 50),
    ];
    const rows = breakdown(t, 'instrument', ctx);
    expect(rows.map((r) => [r.key, r.label, r.summary.closedCount])).toEqual([
      ['future', 'Futures', 2],
      ['forex', 'Forex', 1],
      ['option', 'Options', 1],
    ]);
  });

  test('account buckets by account id, named by the options', () => {
    const t = [fx('a1', 'ESZ5', 500), fx('a2', 'ESZ5', -200)];
    const rows = breakdown(t, 'account', {
      ...ctx,
      accountNames: { a1: 'Live', a2: 'Sim' },
    });
    expect(rows.map((r) => [r.key, r.label])).toEqual([
      ['a1', 'Live'],
      ['a2', 'Sim'],
    ]);
    // Unknown ids read as the id.
    expect(breakdown(t, 'account', ctx)[0]!.label).toBe('a1');
  });

  test('exit hour is the hour the trade closed, whatever the time basis', () => {
    const t = [fx('a1', 'ESZ5', 500)];
    const rows = breakdown(t, 'exit-hour', { ...ctx, timeBasis: 'entry' });
    expect(rows).toHaveLength(24);
    expect(rows.find((r) => r.summary.closedCount)!.key).toBe('11');
    expect(rows[11]!.label).toBe('11:00');
  });

  test('entry and exit price buckets are chosen from the set and are ascending', () => {
    const t = [
      fx('a1', 'ESZ5', 1, { avgEntry: 4410, avgExit: 4420 }),
      fx('a1', 'ESZ5', 1, { avgEntry: 4990, avgExit: 5010 }),
      fx('a1', 'ESZ5', 1, { avgEntry: 5300, avgExit: 5290 }),
    ];
    const entry = breakdown(t, 'entry-price', ctx);
    expect(entry.filter((r) => r.summary.closedCount > 0)).toHaveLength(3);
    const froms = entry.map((r) => Number(r.key.split('_')[0]));
    expect(froms).toEqual([...froms].sort((a, b) => a - b));
    const exit = breakdown(t, 'exit-price', ctx);
    expect(exit.reduce((n, r) => n + r.summary.closedCount, 0)).toBe(3);
    // Each trade sits in the bucket whose span holds its price.
    for (const r of entry)
      for (const id of r.tradeIds) {
        const p = t.find((x) => x.id === id)!.avgEntry;
        const [from, to] = r.key.split('_').map(Number) as [number, number];
        expect(p >= from && p < to).toBe(true);
      }
  });

  test('top and bottom 10 symbols keep ten by net, the worst first at the bottom', () => {
    const roots = [
      'ESZ5',
      'NQZ5',
      'CLZ5',
      'GCZ5',
      'YMZ5',
      'RTYZ5',
      'ZNZ5',
      'MESZ5',
      'MNQZ5',
      'SIZ5',
      '6EZ5',
      'NGZ5',
    ];
    const t = roots.map((s, i) => fx('a1', s, (i - 5) * 100));
    const all = breakdown(t, 'symbol', ctx);
    expect(all).toHaveLength(12);
    const top = breakdown(t, 'symbol-top', ctx);
    expect(top).toHaveLength(10);
    expect(top.map((r) => r.key)).toEqual(all.slice(0, 10).map((r) => r.key));
    const bottom = breakdown(t, 'symbol-bottom', ctx);
    expect(bottom).toHaveLength(10);
    expect(bottom[0]!.key).toBe(all[11]!.key);
    expect(new Set(bottom.map((r) => r.key))).toEqual(
      new Set(all.slice(2).map((r) => r.key)),
    );
    // A cross-analysis against the top 10 has only those rows.
    const m = breakdown2D(t, ctx, 'symbol-top', 'side', 'net');
    expect(m.rows.map((r) => r.key)).toEqual(top.map((r) => r.key));
  });

  test('a row carries its volume and trading days', () => {
    const t = [
      fx('a1', 'ESZ5', 500, { maxPosition: 2 }),
      fx('a1', 'ESZ5', 500, {
        maxPosition: 4,
        openedAt: '2026-03-10T14:10:00Z',
        closedAt: '2026-03-10T14:40:00Z',
      }),
      fx('a1', 'ESZ5', 500, {
        maxPosition: 1,
        openedAt: '2026-03-10T15:10:00Z',
        closedAt: '2026-03-10T15:40:00Z',
      }),
    ];
    const row = breakdown(t, 'symbol', ctx)[0]!;
    expect(row.volume).toBe(7);
    expect(row.tradingDays).toBe(2);
  });

  test('highlights: the most active bucket and the best win rate among buckets with 5 decided trades', () => {
    const many = (sym: string, wins: number, losses: number) => [
      ...Array.from({ length: wins }, () => fx('a1', sym, 100)),
      ...Array.from({ length: losses }, () => fx('a1', sym, -100)),
    ];
    // A 1-trade 100% bucket, a 6-trade 67% bucket, a 9-trade 56% bucket.
    const t = [
      ...many('CLZ5', 1, 0),
      ...many('NQZ5', 4, 2),
      ...many('ESZ5', 5, 4),
    ];
    const h = highlights(breakdown(t, 'symbol', ctx));
    expect(h.mostActive?.key).toBe('ES');
    expect(h.bestWinRate?.key).toBe('NQ');
    // Ties go to the busier bucket.
    const tie = [...many('ESZ5', 6, 6), ...many('NQZ5', 3, 3)];
    expect(highlights(breakdown(tie, 'symbol', ctx)).bestWinRate?.key).toBe(
      'ES',
    );
    // No bucket with 5 decided trades: no best win rate, but still a most active.
    const sparse = highlights(breakdown(many('ESZ5', 2, 2), 'symbol', ctx));
    expect(sparse.bestWinRate).toBeNull();
    expect(sparse.mostActive?.key).toBe('ES');
    expect(highlights([])).toEqual({ mostActive: null, bestWinRate: null });
    // Breakeven trades are not decided.
    const flat = [
      ...many('ESZ5', 3, 1),
      ...Array.from({ length: 4 }, () => fx('a1', 'ESZ5', 0)),
    ];
    expect(highlights(breakdown(flat, 'symbol', ctx)).bestWinRate).toBeNull();
  });
});

describe('bucket labels', () => {
  test('numeric ranges read "a to b", as the price ranges do (DESIGN.md, E122); the keys stay', () => {
    const labels = (by: 'duration' | 'size' | 'dte') =>
      breakdown([], by, ctx).map((r) => [r.key, r.label]);
    expect(labels('duration')).toEqual([
      ['lt-1m', '<1m'],
      ['1-5m', '1m to 5m'],
      ['5-15m', '5m to 15m'],
      ['15-60m', '15m to 60m'],
      ['1-4h', '1h to 4h'],
      ['4h-1d', '4h to 1d'],
      ['gt-1d', '>1d'],
    ]);
    expect(labels('size')).toEqual([
      ['lt-1', '<1'],
      ['1', '1'],
      ['2-3', '2 to 3'],
      ['4-5', '4 to 5'],
      ['6-10', '6 to 10'],
      ['11-25', '11 to 25'],
      ['26-100', '26 to 100'],
      ['gt-100', '101+'],
    ]);
    expect(labels('dte')).toEqual([
      ['0', '0'],
      ['1', '1'],
      ['2-7', '2 to 7'],
      ['8-30', '8 to 30'],
      ['31+', '31+'],
    ]);
  });
});

describe('the pattern breakdown', () => {
  // `byTrade` by trade id, `byDay` by the local date of the day's trades.
  const hits = (...ids: string[]) => ids.map((id) => ({ id }));
  const index = (
    byTrade: Record<string, string[]> = {},
    byDay: Record<string, string[]> = {},
  ) => ({
    byTrade: new Map(Object.entries(byTrade).map(([k, v]) => [k, hits(...v)])),
    byDay: new Map(Object.entries(byDay).map(([k, v]) => [k, hits(...v)])),
  });
  const rowsOf = (
    trades: ReturnType<typeof makeTrade>[],
    patterns: ReturnType<typeof index> | undefined,
  ) =>
    breakdown(trades, 'pattern', { ...ctx, patterns }).map((r) => [
      r.key,
      r.label,
      r.summary.closedCount,
      r.summary.netPnl,
    ]);

  test('a trade with two patterns counts in both rows', () => {
    const t = [
      makeTrade({ id: 'a', net: 3000 }),
      makeTrade({ id: 'b', net: -1000 }),
    ];
    expect(
      rowsOf(
        t,
        index({ a: ['large-size', 'added-to-position'], b: ['large-size'] }),
      ),
    ).toEqual([
      ['added-to-position', 'Added to the position', 1, 3000],
      ['large-size', 'Large size', 2, 2000],
    ]);
  });

  test("a day pattern counts that day's trades, read on the day each closed (the log's rule)", () => {
    // 2026-03-02 in New York: a close at 22:00 is that day, one at 01:00 UTC-5 the next morning is not.
    const t = [
      makeTrade({
        id: 'a',
        net: 500,
        openedAt: '2026-03-02T15:00:00Z',
        closedAt: '2026-03-02T15:30:00Z',
      }),
      makeTrade({
        id: 'b',
        net: -200,
        openedAt: '2026-03-03T02:50:00Z',
        closedAt: '2026-03-03T03:00:00Z',
      }),
      makeTrade({
        id: 'c',
        net: 900,
        openedAt: '2026-03-03T06:00:00Z',
        closedAt: '2026-03-03T06:10:00Z',
      }),
    ];
    // a and b closed on Mon 2 Mar (New York), c on Tue 3 Mar.
    expect(rowsOf(t, index({}, { '2026-03-02': ['more-trades'] }))).toEqual([
      ['more-trades', 'More trades than usual', 2, 300],
    ]);
  });

  test('a trade that a trade pattern and a day pattern both reach counts once in each row', () => {
    const t = [
      makeTrade({
        id: 'a',
        net: 100,
        openedAt: '2026-03-02T15:00:00Z',
        closedAt: '2026-03-02T15:30:00Z',
      }),
    ];
    expect(
      rowsOf(
        t,
        index({ a: ['large-size'] }, { '2026-03-02': ['more-trades'] }),
      ),
    ).toEqual([
      ['large-size', 'Large size', 1, 100],
      ['more-trades', 'More trades than usual', 1, 100],
    ]);
  });

  test('a trade with no pattern files under no row, and no index gives no rows', () => {
    const t = [
      makeTrade({ id: 'a', net: 100 }),
      makeTrade({ id: 'b', net: 1 }),
    ];
    expect(rowsOf(t, index({ a: ['large-size'] }))).toEqual([
      ['large-size', 'Large size', 1, 100],
    ]);
    expect(rowsOf(t, undefined)).toEqual([]);
    expect(rowsOf(t, index())).toEqual([]);
  });

  test('an open trade is not counted, even where a pattern fired on it', () => {
    const t = [
      makeTrade({
        id: 'o',
        status: 'open',
        net: 0,
        openedAt: '2026-03-02T15:00:00Z',
      }),
      makeTrade({ id: 'a', net: 100 }),
    ];
    expect(
      rowsOf(t, index({ o: ['added-to-position'], a: ['added-to-position'] })),
    ).toEqual([['added-to-position', 'Added to the position', 1, 100]]);
  });
});

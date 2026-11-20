import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { resolveInstrument } from '../instruments';
import { defaultMetricContext } from './context';
import { breakdown, rDistribution } from './breakdowns';

const ctx = defaultMetricContext('America/New_York');
const at = (openedAt: string, extra = {}) =>
  makeTrade({ net: 1000, openedAt, closedAt: openedAt, ...extra });

describe('breakdowns', () => {
  test('weekday and hour respect the user timezone', () => {
    const rows = breakdown([at('2026-03-09T13:45:00Z')], 'weekday', ctx);
    expect(rows.map((r) => r.key)).toEqual([
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
      'sat',
      'sun',
    ]);
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
    const es = [
      makeTrade({ net: 1, instrument: resolveInstrument('ESZ5')! }),
      makeTrade({ net: 1, instrument: resolveInstrument('ESH6')! }),
    ];
    expect(breakdown(es, 'symbol', ctx).map((r) => r.key)).toEqual(['ES']);
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

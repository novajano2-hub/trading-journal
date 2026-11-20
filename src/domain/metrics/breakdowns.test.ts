import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { resolveInstrument } from '../instruments';
import { breakdown, rDistribution } from './breakdowns';

const ctx = { timeZone: 'America/New_York', breakevenThreshold: 0 };
const at = (openedAt: string, extra = {}) => makeTrade({ net: 1000, openedAt, closedAt: openedAt, ...extra });

describe('breakdowns', () => {
  test('weekday and hour respect the user timezone', () => {
    const rows = breakdown([at('2026-03-09T13:45:00Z')], 'weekday', ctx);
    expect(rows.map((r) => r.key)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(rows.find((r) => r.key === 'mon')!.summary.closedCount).toBe(1);
    expect(
      breakdown([at('2026-03-09T16:00:00Z')], 'weekday', { ...ctx, timeZone: 'Asia/Tokyo' }).find(
        (r) => r.summary.closedCount,
      )!.key,
    ).toBe('tue');
    const hours = breakdown([at('2026-03-09T13:45:00Z')], 'hour', ctx);
    expect(hours).toHaveLength(24);
    expect(hours.find((r) => r.summary.closedCount)!.key).toBe('9');
    expect(hours[9]!.label).toBe('09:00');
  });

  test('sessions use New York time regardless of user timezone', () => {
    const key = (iso: string) =>
      breakdown([at(iso)], 'session', { ...ctx, timeZone: 'Asia/Tokyo' }).find((r) => r.summary.closedCount)!.key;
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
            closedAt: new Date(Date.parse('2026-03-09T14:00:00Z') + secs * 1000).toISOString(),
          }),
        ],
        'duration',
        ctx,
      ).find((r) => r.summary.closedCount)!.key;
    expect([d(59), d(60), d(180)]).toEqual(['lt-1m', '1-5m', '1-5m']);
    expect(d(86400)).toBe('gt-1d');
  });

  test('open trades are skipped', () => {
    const rows = breakdown([makeTrade({ net: 0, status: 'open' })], 'side', ctx);
    expect(rows.map((r) => r.key)).toEqual(['long', 'short']);
    expect(rows.every((r) => r.summary.closedCount === 0 && r.summary.openCount === 0)).toBe(true);
  });

  test('dynamic keys: tags multi-count, untagged and no-strategy rows, symbols by root', () => {
    const t = [makeTrade({ net: 3000, tagIds: ['orb', 'fomo'] }), makeTrade({ net: -1000 })];
    const tags = breakdown(t, 'tag', { ...ctx, tagNames: { orb: 'ORB', fomo: 'FOMO' } });
    expect(tags.map((r) => [r.key, r.label])).toEqual([
      ['orb', 'ORB'],
      ['fomo', 'FOMO'],
      ['__none__', 'Untagged'],
    ]);
    expect(breakdown(t, 'strategy', ctx).map((r) => r.label)).toContain('No strategy');
    const es = [
      makeTrade({ net: 1, instrument: resolveInstrument('ESZ5')! }),
      makeTrade({ net: 1, instrument: resolveInstrument('ESH6')! }),
    ];
    expect(breakdown(es, 'symbol', ctx).map((r) => r.key)).toEqual(['ES']);
  });

  test('R distribution has contiguous bins', () => {
    const t = [-1, -0.5, 0.2, 1.4, 2].map((r) => makeTrade({ net: r * 1000, initialRisk: 1000 }));
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
});

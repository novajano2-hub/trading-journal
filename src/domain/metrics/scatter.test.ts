import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { defaultMetricContext } from './context';
import { DURATION_TICKS, scatterPoints } from './scatter';

const ctx = defaultMetricContext('America/New_York');

// 2026-03-03 is winter time in New York (UTC-5): 14:31Z is 09:31 ET.
const morning = makeTrade({
  id: 'am',
  net: 12_500,
  openedAt: '2026-03-03T14:31:00Z',
  closedAt: '2026-03-03T15:05:00Z',
});

describe('scatterPoints', () => {
  test('entry and exit read as minutes of the day in the profile zone', () => {
    expect(scatterPoints([morning], ctx, 'entry')).toEqual([
      { tradeId: 'am', x: 9 * 60 + 31, pnl: 12_500 },
    ]);
    expect(scatterPoints([morning], ctx, 'exit')).toEqual([
      { tradeId: 'am', x: 10 * 60 + 5, pnl: 12_500 },
    ]);
  });

  test('a summer trade reads the same wall clock under daylight time', () => {
    // 2026-07-01 is UTC-4: 13:31Z is 09:31 ET.
    const t = makeTrade({
      id: 'summer',
      net: -300,
      openedAt: '2026-07-01T13:31:00Z',
      closedAt: '2026-07-01T14:05:00Z',
    });
    expect(scatterPoints([t], ctx, 'entry')[0]?.x).toBe(9 * 60 + 31);
    expect(scatterPoints([t], ctx, 'exit')[0]?.x).toBe(10 * 60 + 5);
  });

  test('the zone decides the clock, and a trade can cross midnight', () => {
    const t = makeTrade({
      id: 'night',
      net: 100,
      openedAt: '2026-03-03T23:50:00Z',
      closedAt: '2026-03-04T00:20:00Z',
    });
    const tokyo = defaultMetricContext('Asia/Tokyo'); // UTC+9
    expect(scatterPoints([t], tokyo, 'entry')[0]?.x).toBe(8 * 60 + 50);
    expect(scatterPoints([t], tokyo, 'exit')[0]?.x).toBe(9 * 60 + 20);
    expect(scatterPoints([t], ctx, 'entry')[0]?.x).toBe(18 * 60 + 50);
    expect(scatterPoints([t], ctx, 'exit')[0]?.x).toBe(19 * 60 + 20);
  });

  test('duration is log10 of the minutes held', () => {
    const at = (id: string, minutes: number) =>
      makeTrade({
        id,
        net: 1,
        openedAt: '2026-03-03T15:00:00Z',
        closedAt: new Date(
          Date.parse('2026-03-03T15:00:00Z') + minutes * 60_000,
        ).toISOString(),
      });
    const points = scatterPoints(
      [at('a', 10), at('b', 100), at('c', 1440), at('d', 4)],
      ctx,
      'duration',
    );
    expect(points.map((p) => p.tradeId)).toEqual(['d', 'a', 'b', 'c']);
    expect(points.find((p) => p.tradeId === 'a')?.x).toBeCloseTo(1, 10);
    expect(points.find((p) => p.tradeId === 'b')?.x).toBeCloseTo(2, 10);
    expect(points.find((p) => p.tradeId === 'c')?.x).toBeCloseTo(
      Math.log10(1440),
      10,
    );
    expect(points.find((p) => p.tradeId === 'd')?.x).toBeCloseTo(
      Math.log10(4),
      10,
    );
  });

  test('a trade held under a minute plots at one minute', () => {
    const t = makeTrade({
      id: 'blink',
      net: 5,
      openedAt: '2026-03-03T15:00:00Z',
      closedAt: '2026-03-03T15:00:20Z',
    });
    const same = makeTrade({
      id: 'same',
      net: 5,
      openedAt: '2026-03-03T15:00:00Z',
      closedAt: '2026-03-03T15:00:00Z',
    });
    expect(scatterPoints([t], ctx, 'duration')[0]?.x).toBe(0);
    expect(scatterPoints([same], ctx, 'duration')[0]?.x).toBe(0);
  });

  test('y is the net P&L, or the gross one on a gross basis', () => {
    const t = makeTrade({ id: 'f', net: 900, fees: 100 });
    expect(scatterPoints([t], ctx, 'exit')[0]?.pnl).toBe(900);
    expect(
      scatterPoints([t], { ...ctx, pnlBasis: 'gross' }, 'exit')[0]?.pnl,
    ).toBe(1000);
  });

  test('keeps losses and breakevens as they are', () => {
    const l = makeTrade({ id: 'loss', net: -4_000 });
    const z = makeTrade({ id: 'flat', net: 0 });
    expect(scatterPoints([l, z], ctx, 'exit').map((p) => p.pnl)).toEqual([
      -4_000, 0,
    ]);
  });

  test('closed trades only, in the order they closed', () => {
    const open = makeTrade({
      id: 'open',
      net: 0,
      status: 'open',
    });
    const late = makeTrade({
      id: 'late',
      net: 1,
      serial: 1,
      closedAt: '2026-03-03T20:00:00Z',
    });
    const early = makeTrade({
      id: 'early',
      net: 1,
      serial: 2,
      closedAt: '2026-03-03T16:00:00Z',
    });
    expect(
      scatterPoints([open, late, early], ctx, 'exit').map((p) => p.tradeId),
    ).toEqual(['early', 'late']);
    expect(scatterPoints([open], ctx, 'entry')).toEqual([]);
    expect(scatterPoints([], ctx, 'duration')).toEqual([]);
  });

  test('does not reorder the caller list', () => {
    const a = makeTrade({ id: 'a', net: 1, closedAt: '2026-03-03T20:00:00Z' });
    const b = makeTrade({ id: 'b', net: 1, closedAt: '2026-03-03T16:00:00Z' });
    const list = [a, b];
    scatterPoints(list, ctx, 'exit');
    expect(list.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('DURATION_TICKS', () => {
  test('are the twelve labels of the hold-time axis', () => {
    expect(DURATION_TICKS).toEqual([
      '4m',
      '8m',
      '15m',
      '30m',
      '1h',
      '2h',
      '4h',
      '7h',
      '14h',
      '1d',
      '2d',
      '4d',
    ]);
  });
});

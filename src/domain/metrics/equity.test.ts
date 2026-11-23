import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { defaultMetricContext } from './context';
import { drawdownSeries, equityCurve, maxDrawdown } from './equity';

const ctx = defaultMetricContext('America/New_York');

describe('equity', () => {
  test('equity and max drawdown', () => {
    const t = [100000, -300000, 50000, -100000, 400000].map((net, i) =>
      makeTrade({
        net,
        serial: i + 1,
        closedAt: `2026-03-0${i + 2}T15:00:00Z`,
      }),
    );
    expect(equityCurve(t, 5000000, ctx).map((p) => p.equity)).toEqual([
      5100000, 4800000, 4850000, 4750000, 5150000,
    ]);
    const dd = maxDrawdown(t, 5000000, ctx);
    expect(dd.amount).toBe(350000);
    expect(dd.pct).toBeCloseTo(0.0686, 4);
    expect([dd.peakAt, dd.troughAt]).toEqual([
      '2026-03-02T15:00:00Z',
      '2026-03-05T15:00:00Z',
    ]);
    expect(maxDrawdown([], 5000000, ctx)).toMatchObject({ amount: 0, pct: 0 });
    expect(
      maxDrawdown(
        [makeTrade({ net: 1000 }), makeTrade({ net: -500, serial: 2 })],
        0,
        ctx,
      ).pct,
    ).toBeCloseTo(0.5, 4);
    expect(maxDrawdown([makeTrade({ net: -500 })], 0, ctx)).toMatchObject({
      amount: 500,
      pct: null,
    });
  });

  test('ignores open trades; orders by closedAt then serial', () => {
    const t = [
      makeTrade({ net: 200, serial: 2, closedAt: '2026-03-02T15:00:00Z' }),
      makeTrade({ net: 100, serial: 1, closedAt: '2026-03-02T15:00:00Z' }),
      makeTrade({ net: 999, status: 'open' }),
    ];
    expect(equityCurve(t, 0, ctx).map((p) => p.equity)).toEqual([100, 300]);
  });

  test('gross basis feeds equity and drawdown', () => {
    const t = [makeTrade({ net: -500, gross: 1000, fees: 1500 })];
    const g = { ...ctx, pnlBasis: 'gross' as const };
    expect(equityCurve(t, 0, g).map((p) => p.equity)).toEqual([1000]);
    expect(maxDrawdown(t, 5000, g).amount).toBe(0);
    expect(maxDrawdown(t, 5000, ctx).amount).toBe(500);
  });
});

describe('drawdownSeries', () => {
  test('is the depth under the running peak, deepest of the day, from the starting balance', () => {
    const t = [100, -300, 50, 400].map((net, i) =>
      makeTrade({
        net,
        openedAt: `2026-03-0${2 + Math.floor(i / 2)}T14:00:00Z`,
        closedAt: `2026-03-0${2 + Math.floor(i / 2)}T15:0${i}:00Z`,
      }),
    );
    const eq = equityCurve(t, 1000, ctx);
    const s = drawdownSeries(eq, 1000, 'America/New_York');
    // Day 1: peak 1100, then 800 (-300). Day 2: 850 (-250), then 1250 a new peak (0).
    expect(s).toEqual([
      { key: '2026-03-02', value: -300 },
      { key: '2026-03-03', value: -250 },
    ]);
    expect(Math.min(...s.map((p) => p.value))).toBe(
      -maxDrawdown(t, 1000, ctx).amount,
    );
  });
});

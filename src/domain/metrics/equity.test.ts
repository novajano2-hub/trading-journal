import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { equityCurve, maxDrawdown } from './equity';

describe('equity', () => {
  test('equity and max drawdown', () => {
    const t = [100000, -300000, 50000, -100000, 400000].map((net, i) =>
      makeTrade({ net, serial: i + 1, closedAt: `2026-03-0${i + 2}T15:00:00Z` }),
    );
    expect(equityCurve(t, 5000000).map((p) => p.equity)).toEqual([
      5100000, 4800000, 4850000, 4750000, 5150000,
    ]);
    const dd = maxDrawdown(t, 5000000);
    expect(dd.amount).toBe(350000);
    expect(dd.pct).toBeCloseTo(0.0686, 4);
    expect([dd.peakAt, dd.troughAt]).toEqual(['2026-03-02T15:00:00Z', '2026-03-05T15:00:00Z']);
    expect(maxDrawdown([], 5000000)).toMatchObject({ amount: 0, pct: 0 });
    expect(
      maxDrawdown([makeTrade({ net: 1000 }), makeTrade({ net: -500, serial: 2 })], 0).pct,
    ).toBeCloseTo(0.5, 4);
    expect(maxDrawdown([makeTrade({ net: -500 })], 0)).toMatchObject({ amount: 500, pct: null });
  });

  test('ignores open trades; orders by closedAt then serial', () => {
    const t = [
      makeTrade({ net: 200, serial: 2, closedAt: '2026-03-02T15:00:00Z' }),
      makeTrade({ net: 100, serial: 1, closedAt: '2026-03-02T15:00:00Z' }),
      makeTrade({ net: 999, status: 'open' }),
    ];
    expect(equityCurve(t, 0).map((p) => p.equity)).toEqual([100, 300]);
  });
});

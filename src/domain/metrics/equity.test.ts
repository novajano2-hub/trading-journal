import { describe, expect, test } from 'vitest';
import { generateSampleWorkspace, SAMPLE_SEED } from '@/data/seed/generate';
import { makeTrade } from '../__fixtures__/trades';
import { defaultMetricContext } from './context';
import { dailyPnl, type DayStat } from './days';
import {
  avgDrawdown,
  drawdownSeries,
  equityCurve,
  maxDrawdown,
} from './equity';

const ctx = defaultMetricContext('America/New_York');

const day = (date: string, net: number): DayStat => ({
  date,
  net,
  tradeCount: 1,
  wins: net > 0 ? 1 : 0,
  losses: net < 0 ? 1 : 0,
  costBasis: 0,
});

describe('equity', () => {
  test('equity curve is the closed-trade running balance', () => {
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
  });

  test('ignores open trades; orders by closedAt then serial', () => {
    const t = [
      makeTrade({ net: 200, serial: 2, closedAt: '2026-03-02T15:00:00Z' }),
      makeTrade({ net: 100, serial: 1, closedAt: '2026-03-02T15:00:00Z' }),
      makeTrade({ net: 999, status: 'open' }),
    ];
    expect(equityCurve(t, 0, ctx).map((p) => p.equity)).toEqual([100, 300]);
  });
});

describe('maxDrawdown on the daily curve', () => {
  const days = [
    day('2026-03-02', 100000),
    day('2026-03-03', -300000),
    day('2026-03-04', 50000),
    day('2026-03-05', -100000),
    day('2026-03-06', 400000),
  ];
  test('is the deepest peak-to-trough of the cumulative daily P&L, with its peak and trough days', () => {
    const dd = maxDrawdown(days, 5000000);
    expect(dd.amount).toBe(350000);
    expect(dd.pct).toBeCloseTo(0.0686, 4);
    expect([dd.peakDay, dd.troughDay]).toEqual(['2026-03-02', '2026-03-05']);
    expect(maxDrawdown([], 5000000)).toMatchObject({ amount: 0, pct: 0 });
  });

  test('a fall inside one day does not count: only the day totals do', () => {
    // +500 then -400 in one day nets +100: no drawdown on the daily curve.
    const t = [500, -400].map((net, i) =>
      makeTrade({
        net,
        serial: i + 1,
        closedAt: `2026-03-02T15:0${i}:00Z`,
      }),
    );
    expect(maxDrawdown(dailyPnl(t, ctx), 5000).amount).toBe(0);
  });

  test('a fall from the starting balance has no peak day; a zero balance gives a null %', () => {
    expect(maxDrawdown([day('2026-03-02', -500)], 0)).toMatchObject({
      amount: 500,
      pct: null,
      troughDay: '2026-03-02',
    });
    expect(
      maxDrawdown([day('2026-03-02', -500)], 5000).peakDay,
    ).toBeUndefined();
    expect(
      maxDrawdown([day('2026-03-02', 1000), day('2026-03-03', -500)], 0).pct,
    ).toBeCloseTo(0.5, 4);
  });

  test('the % is the drawdown over the real balance at the peak, flows dated up to it included', () => {
    const d = [day('2026-03-02', 100000), day('2026-03-03', -300000)];
    // Peak 5,100,000 on 2 Mar, plus a 4,900,000 deposit on 1 Mar: 10,000,000.
    const dd = maxDrawdown(d, 5000000, [
      { date: '2026-03-01', amount: 4900000 },
      { date: '2026-03-03', amount: 7000000 },
    ]);
    expect(dd.amount).toBe(300000);
    expect(dd.pct).toBeCloseTo(0.03, 6);
    expect(
      maxDrawdown(d, 5000000, [{ date: '2026-03-03', amount: 7000000 }]).pct,
    ).toBeCloseTo(300000 / 5100000, 6);
    expect(maxDrawdown(d, 5000000).pct).toBeCloseTo(300000 / 5100000, 6);
  });

  test('the sample futures account (America/New_York, net) falls 2,168.55 on the daily curve, as TradeZella shows', () => {
    const s = generateSampleWorkspace({
      seed: SAMPLE_SEED,
      endDate: '2026-11-20',
    });
    const account = s.accounts.find((a) => a.id === 'sample-futures')!;
    const own = s.trades.filter((t) => t.accountId === account.id);
    const dd = maxDrawdown(dailyPnl(own, ctx), account.startingBalance);
    expect(dd.amount).toBe(216_855);
    expect(dd.pct).toBeGreaterThan(0);
    expect(dd.pct).toBeLessThan(0.1);
  });
});

describe('drawdownSeries', () => {
  test('is the depth under the running peak on the daily curve, one value per day', () => {
    const days = [
      day('2026-03-02', -300),
      day('2026-03-03', 100),
      day('2026-03-04', 400),
    ];
    const s = drawdownSeries(days);
    expect(s).toEqual([
      { key: '2026-03-02', value: -300 },
      { key: '2026-03-03', value: -200 },
      { key: '2026-03-04', value: 0 },
    ]);
    expect(Math.min(...s.map((p) => p.value))).toBe(
      -maxDrawdown(days, 1000).amount,
    );
  });
});

describe('avgDrawdown', () => {
  // Equity from 1000: 1100 (peak), 900, 1000, 1300 (peak), 1200.
  const days = [
    day('2026-03-02', 100),
    day('2026-03-03', -200),
    day('2026-03-04', 100),
    day('2026-03-05', 300),
    day('2026-03-06', -100),
  ];
  test('is the mean depth of the days that closed under their peak', () => {
    // Depths 200, 100 and 100 over three days in drawdown, not five days.
    expect(avgDrawdown(days, 1000)).toEqual({
      amount: 133,
      pct: (200 / 1100 + 100 / 1100 + 100 / 1300) / 3,
      days: 3,
    });
  });
  test('shares the deepest depth with the max drawdown', () => {
    expect(maxDrawdown(days, 1000).amount).toBe(200);
  });
  test('the share reads the real balance at the peak, flows included', () => {
    const r = avgDrawdown(
      [day('2026-03-02', 100), day('2026-03-03', -100)],
      900,
      [{ date: '2026-03-01', amount: 100 }],
    );
    // Peak 1000 plus the 100 deposited: 100 under 1100.
    expect(r.pct).toBeCloseTo(100 / 1100);
  });
  test('a range that never fell under a peak has none', () => {
    expect(avgDrawdown([day('2026-03-02', 100)], 1000)).toEqual({
      amount: null,
      pct: null,
      days: 0,
    });
    expect(avgDrawdown([], 1000)).toEqual({ amount: null, pct: null, days: 0 });
  });
  test('a zero balance gives no share', () => {
    expect(avgDrawdown([day('2026-03-02', -500)], 0).pct).toBeNull();
  });
});

import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import type { DrawdownType, Trade } from '../types';
import { evaluateProp } from './evaluate';

interface Opts {
  drawdownType?: DrawdownType;
  consistencyPct?: number;
  now?: string;
  day1?: number[];
  day2?: number;
  day3?: number;
}

function S(o: Opts = {}) {
  const day1 = o.day1 ?? [150000, -50000];
  const times1 = ['2026-03-02T15:00:00Z', '2026-03-02T16:00:00Z'];
  const trades: Trade[] = [];
  day1.forEach((net, i) =>
    trades.push(makeTrade({ net, serial: i + 1, closedAt: times1[i] })),
  );
  const day2 = o.day2 ?? -90000;
  if (day2 !== 0)
    trades.push(
      makeTrade({ net: day2, serial: 10, closedAt: '2026-03-03T15:00:00Z' }),
    );
  const day3 = o.day3 ?? 40000;
  if (day3 !== 0)
    trades.push(
      makeTrade({ net: day3, serial: 20, closedAt: '2026-03-04T15:00:00Z' }),
    );
  return {
    startingBalance: 5000000,
    rules: {
      firm: 'F',
      phase: 'evaluation' as const,
      profitTarget: 300000,
      dailyLossLimit: 100000,
      maxDrawdown: 200000,
      drawdownType: o.drawdownType ?? 'static',
      minTradingDays: 3,
      consistencyPct: o.consistencyPct ?? 0.4,
    },
    trades,
    timeZone: 'America/New_York',
    now: o.now ?? '2026-03-04T18:00:00Z',
  };
}

describe('evaluateProp', () => {
  test('scenario S across drawdown types', () => {
    const floors = (['static', 'trailing', 'eod-trailing'] as const).map(
      (type) => evaluateProp(S({ drawdownType: type })).drawdown,
    );
    expect(floors.map((d) => [d.floor, d.remaining, d.state])).toEqual([
      [4800000, 250000, 'clear'],
      [4950000, 100000, 'clear'],
      [4900000, 150000, 'clear'],
    ]);
    const s = evaluateProp(S());
    expect(s.equity).toBe(5050000);
    expect(s.profit.current).toBe(50000);
    expect(s.profit.progress).toBeCloseTo(0.1667, 4);
    expect(s.dailyLoss).toMatchObject({
      todayNet: 40000,
      remaining: 100000,
      state: 'clear',
      worstDay: { date: '2026-03-03', net: -90000 },
    });
    expect(s.tradingDays).toEqual({ count: 3, min: 3, met: true });
    expect(s.consistency).toMatchObject({ bestDayShare: 2, met: false });
    expect(s.overall).toBe('in-progress');
  });

  test('daily loss near and breached', () => {
    expect(
      evaluateProp(S({ day2: -95000, now: '2026-03-03T20:00:00Z' })).dailyLoss,
    ).toMatchObject({
      todayNet: -95000,
      remaining: 5000,
      state: 'near',
    });
    const b = evaluateProp(S({ day2: -120000 }));
    expect(b.dailyLoss).toMatchObject({
      state: 'breached',
      breachedOn: '2026-03-03',
    });
    expect(b.overall).toBe('breached');
  });

  test('trailing breach is permanent even after recovery', () => {
    const s = evaluateProp(
      S({ drawdownType: 'trailing', day2: -210000, day3: 300000 }),
    );
    expect(s.drawdown).toMatchObject({
      state: 'breached',
      breachedAt: '2026-03-03T15:00:00Z',
    });
    expect(s.overall).toBe('breached');
  });

  test('trailing floor locks at the starting balance', () => {
    expect(
      evaluateProp(
        S({ drawdownType: 'trailing', day1: [300000], day2: 0, day3: 0 }),
      ).drawdown.floor,
    ).toBe(5000000);
  });

  test('target reached', () => {
    expect(
      evaluateProp(
        S({ day1: [150000], day2: 100000, day3: 100000, consistencyPct: 0.5 }),
      ).overall,
    ).toBe('target-reached');
  });

  test('eod-trailing floor catches up once the trading day has ended', () => {
    const s = evaluateProp({
      ...S({ drawdownType: 'eod-trailing', day1: [300000], day2: 0, day3: 0 }),
      now: '2026-03-03T15:00:00Z',
    });
    expect(s.drawdown).toMatchObject({ floor: 5000000, remaining: 300000 });
  });

  test('eod-trailing breach is permanent', () => {
    const s = evaluateProp(
      S({
        drawdownType: 'eod-trailing',
        day1: [300000],
        day2: -310000,
        day3: 400000,
      }),
    );
    expect(s.drawdown).toMatchObject({
      state: 'breached',
      breachedAt: '2026-03-03T15:00:00Z',
    });
    expect(s.overall).toBe('breached');
  });

  test('drawdown near state', () => {
    const s = evaluateProp(
      S({ drawdownType: 'static', day1: [-100000], day2: -60000, day3: 0 }),
    );
    expect(s.drawdown).toMatchObject({
      floor: 4800000,
      remaining: 40000,
      state: 'near',
    });
  });

  test('daily loss breaches at the intraday dip even if the day recovers', () => {
    const s = evaluateProp(S({ day1: [-120000, 80000], day2: 0, day3: 0 }));
    expect(s.dailyLoss).toMatchObject({
      state: 'breached',
      breachedOn: '2026-03-02',
    });
    expect(s.overall).toBe('breached');
  });

  test('ignores trades after now; no days gives null worstDay', () => {
    const s = evaluateProp({ ...S(), now: '2026-03-01T00:00:00Z' });
    expect(s.equity).toBe(5000000);
    expect(s.dailyLoss.worstDay).toBeNull();
    expect(s.consistency).toMatchObject({ bestDayShare: null, met: false });
  });

  test('a period of 30 days ends with the target unmet: period-ended on day 31, not before', () => {
    const rules = { ...S().rules, periodDays: 30 };
    const input = { ...S(), rules };
    // The first trade is on 2 Mar, so day 30 is 31 Mar.
    const onDay30 = evaluateProp({ ...input, now: '2026-03-31T18:00:00Z' });
    expect(onDay30.overall).toBe('in-progress');
    expect(onDay30.period).toEqual({
      start: '2026-03-02',
      lastDay: '2026-03-31',
      daysLeft: 0,
      ended: false,
    });
    const onDay31 = evaluateProp({ ...input, now: '2026-04-01T18:00:00Z' });
    expect(onDay31.overall).toBe('breached');
    expect(onDay31.period).toMatchObject({
      lastDay: '2026-03-31',
      ended: true,
    });
    // A target met inside the period stands after it.
    const loose = S({ consistencyPct: 1 });
    const met = evaluateProp({
      ...loose,
      rules: { ...loose.rules, periodDays: 30 },
      trades: [
        ...loose.trades,
        makeTrade({
          net: 400000,
          serial: 30,
          closedAt: '2026-03-10T15:00:00Z',
        }),
      ],
      now: '2026-04-01T18:00:00Z',
    });
    expect(met.overall).toBe('target-reached');
    // No period: nothing ends.
    expect(evaluateProp(S({ now: '2026-09-01T18:00:00Z' })).period).toBeNull();
  });

  test('trades after the period are not counted', () => {
    const base = S();
    const late = makeTrade({
      net: 900000,
      serial: 40,
      closedAt: '2026-04-05T15:00:00Z',
    });
    const s = evaluateProp({
      ...base,
      rules: { ...base.rules, periodDays: 30 },
      trades: [...base.trades, late],
      now: '2026-04-06T18:00:00Z',
    });
    expect(s.profit.current).toBe(50000);
    expect(s.overall).toBe('breached');
  });

  test('a drawdown floor above the trailing limit holds the limit at that level', () => {
    const base = S({ drawdownType: 'trailing' });
    const floor = base.startingBalance + 100000;
    const trades = [
      makeTrade({ net: 300000, serial: 1, closedAt: '2026-03-02T15:00:00Z' }),
    ];
    const s = evaluateProp({
      ...base,
      rules: { ...base.rules, drawdownFloor: floor },
      trades,
    });
    // Unfloored, the trailing limit is min(peak - 200000, start) = start.
    expect(evaluateProp({ ...base, trades }).drawdown.floor).toBe(
      base.startingBalance,
    );
    expect(s.drawdown.floor).toBe(floor);
    expect(s.drawdown.remaining).toBe(s.equity - floor);
    // The limit never sits below the floor, at the start of the phase either.
    const fresh = evaluateProp({
      ...base,
      rules: { ...base.rules, drawdownFloor: base.startingBalance - 50000 },
      trades: [],
    });
    expect(fresh.drawdown.floor).toBe(base.startingBalance - 50000);
  });

  test('the daily loss and drawdown breaches say what the day or the fall came to', () => {
    const base = S({ day1: [-120000], day2: 0, day3: 0 });
    const s = evaluateProp(base);
    expect(s.dailyLoss.breachedOn).toBe('2026-03-02');
    expect(s.dailyLoss.breachedNet).toBe(-120000);
  });
});

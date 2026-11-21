import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { defaultMetricContext } from './context';
import { dailyPnl } from './days';
import { dailyLossProgress, goalWeek, weeklyGoalProgress } from './goals';

const day = (date: string, net: number) => ({
  date,
  net,
  tradeCount: 1,
  wins: 0,
  losses: 0,
  costBasis: 0,
});

describe('goals', () => {
  test('the goal week runs Monday to the range end or today, clipped to the range', () => {
    expect(goalWeek({}, '2026-11-20')).toEqual({
      from: '2026-11-16',
      to: '2026-11-20',
    });
    expect(goalWeek({}, '2026-11-22')).toEqual({
      from: '2026-11-16',
      to: '2026-11-22',
    });
    expect(goalWeek({}, '2026-11-23')).toEqual({
      from: '2026-11-23',
      to: '2026-11-23',
    });
    expect(
      goalWeek({ from: '2026-11-01', to: '2026-11-13' }, '2026-11-20'),
    ).toEqual({ from: '2026-11-09', to: '2026-11-13' });
    expect(
      goalWeek({ from: '2026-11-18', to: '2026-11-30' }, '2026-11-20'),
    ).toEqual({ from: '2026-11-18', to: '2026-11-20' });
    expect(goalWeek({ from: '2026-12-01' }, '2026-11-20')).toBeNull();
  });

  test('weekly progress sums the window only', () => {
    const days = [
      day('2026-11-13', 99999),
      day('2026-11-16', 120000),
      day('2026-11-19', -20000),
      day('2026-11-20', 172750),
    ];
    const w = { from: '2026-11-16', to: '2026-11-20' };
    expect(weeklyGoalProgress(days, 150000, w)).toEqual({
      target: 150000,
      net: 272750,
      window: w,
      reached: true,
      fraction: 1,
    });
    expect(weeklyGoalProgress(days, 400000, w).fraction).toBeCloseTo(
      272750 / 400000,
    );
    expect(
      weeklyGoalProgress([day('2026-11-16', -5000)], 150000, w),
    ).toMatchObject({ reached: false, fraction: 0 });
  });

  test('a day exactly at the limit keeps it; beyond breaks it', () => {
    const p = dailyLossProgress(
      [
        day('2026-11-09', -50000),
        day('2026-11-11', -50500),
        day('2026-11-12', 2000),
      ],
      50000,
    );
    expect(p).toMatchObject({ limit: 50000, tradingDays: 3, keptDays: 2 });
    expect(p.brokenDays.map((d) => d.date)).toEqual(['2026-11-11']);
  });

  test('a Sunday-evening New York close counts in that week (Review Focus 5)', () => {
    const t = makeTrade({ net: 30000, closedAt: '2026-11-23T02:00:00Z' }); // Sun 22 Nov 21:00 in New York
    const days = dailyPnl([t], defaultMetricContext('America/New_York'));
    expect(days.map((d) => d.date)).toEqual(['2026-11-22']);
    expect(
      weeklyGoalProgress(days, 10000, { from: '2026-11-16', to: '2026-11-22' })
        .net,
    ).toBe(30000);
    expect(
      weeklyGoalProgress(days, 10000, { from: '2026-11-23', to: '2026-11-29' })
        .net,
    ).toBe(0);
    expect(dailyLossProgress(days, 10000).tradingDays).toBe(1);
  });

  test('the daily loss limit uses local days, not UTC days', () => {
    // Two losses 3h apart straddle UTC midnight but share one New York day.
    const ts = [
      makeTrade({ net: -30000, closedAt: '2026-11-18T23:00:00Z' }),
      makeTrade({ net: -30000, closedAt: '2026-11-19T02:00:00Z' }),
    ];
    const p = dailyLossProgress(
      dailyPnl(ts, defaultMetricContext('America/New_York')),
      50000,
    );
    expect(p.tradingDays).toBe(1);
    expect(p.brokenDays.map((d) => [d.date, d.net])).toEqual([
      ['2026-11-18', -60000],
    ]);
  });

  test('goals always use net P&L, even when the view basis is gross', () => {
    const t = makeTrade({
      net: -40000,
      gross: -10000,
      closedAt: '2026-11-18T15:00:00Z',
    });
    const gross = {
      ...defaultMetricContext('America/New_York'),
      pnlBasis: 'gross' as const,
    };
    // Callers build goal days on net (the ruling): net -400 breaks a $300 limit, gross -100 would not.
    const netDays = dailyPnl([t], { ...gross, pnlBasis: 'net' });
    expect(dailyLossProgress(netDays, 30000).brokenDays).toHaveLength(1);
    expect(
      dailyLossProgress(dailyPnl([t], gross), 30000).brokenDays,
    ).toHaveLength(0);
  });
});

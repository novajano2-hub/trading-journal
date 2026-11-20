import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { outcomeOf } from '../outcome';
import { defaultMetricContext } from './context';
import { dailyPnl, dayStreaks, daySummary, type DayStat } from './days';

const ctx = defaultMetricContext('America/New_York');

describe('days', () => {
  test('daily P&L buckets by local close date across DST', () => {
    const t = [
      makeTrade({ net: 5000, closedAt: '2026-03-06T20:30:00Z' }),
      makeTrade({ net: -1000, closedAt: '2026-03-07T02:00:00Z' }),
      makeTrade({ net: -2000, closedAt: '2026-03-09T13:45:00Z' }),
      makeTrade({ net: 0, closedAt: '2026-03-10T03:30:00Z' }),
    ];
    const days = dailyPnl(t, ctx);
    expect(days).toEqual([
      {
        date: '2026-03-06',
        net: 4000,
        tradeCount: 2,
        wins: 1,
        losses: 1,
        costBasis: 45_000_000,
      },
      {
        date: '2026-03-09',
        net: -2000,
        tradeCount: 2,
        wins: 0,
        losses: 1,
        costBasis: 45_000_000,
      },
    ]);
    expect(daySummary(days, ctx)).toMatchObject({
      greenDays: 1,
      redDays: 1,
      flatDays: 0,
      greenPct: 0.5,
      best: { date: '2026-03-06' },
      worst: { date: '2026-03-09' },
    });
    expect(dayStreaks(days, ctx)).toMatchObject({ maxWin: 1, maxLoss: 1 });
  });
  test('empty summary; flat days neither extend nor break', () => {
    expect(daySummary([], ctx)).toEqual({
      greenDays: 0,
      redDays: 0,
      flatDays: 0,
      greenPct: null,
      best: null,
      worst: null,
    });
    const d = (date: string, net: number) => ({
      date,
      net,
      tradeCount: 1,
      wins: 0,
      losses: 0,
      costBasis: 0,
    });
    expect(
      dayStreaks([d('1', 1), d('2', 0), d('3', 1), d('4', -1)], ctx),
    ).toEqual({
      maxWin: 2,
      maxLoss: 1,
      current: { kind: 'loss', length: 1 },
    });
  });

  test('outcomeOf classifies against an amount range', () => {
    const r = { unit: 'amount', from: -100, to: 100 } as const;
    expect(outcomeOf(101, r)).toBe('win');
    expect(outcomeOf(100, r)).toBe('breakeven');
    expect(outcomeOf(-100, r)).toBe('breakeven');
    expect(outcomeOf(-101, r)).toBe('loss');
  });

  test('days inside the breakeven range are flat', () => {
    const c = {
      ...ctx,
      breakevenRange: { unit: 'amount', from: -1000, to: 1000 } as const,
    };
    const d = (date: string, net: number): DayStat => ({
      date,
      net,
      tradeCount: 1,
      wins: 0,
      losses: 0,
      costBasis: 0,
    });
    const days = [d('1', 500), d('2', 4000), d('3', -2000)];
    expect(daySummary(days, c)).toMatchObject({
      greenDays: 1,
      redDays: 1,
      flatDays: 1,
      greenPct: 1 / 3,
    });
    expect(
      dayStreaks([d('1', 4000), d('2', 500), d('3', 4000)], c),
    ).toMatchObject({ maxWin: 2 });
  });

  test('percent range on days uses the day cost basis; wins and losses use the range too', () => {
    const c = {
      ...ctx,
      breakevenRange: { unit: 'percent', from: -0.001, to: 0.001 } as const,
    };
    const day = (net: number): DayStat => ({
      date: 'x',
      net,
      tradeCount: 1,
      wins: 0,
      losses: 0,
      costBasis: 22_500_000,
    });
    expect(daySummary([day(20000), day(30000), day(-30000)], c)).toMatchObject({
      greenDays: 1,
      redDays: 1,
      flatDays: 1,
    });
    const t = [
      makeTrade({ net: 20000, closedAt: '2026-03-06T15:00:00Z' }),
      makeTrade({ net: 30000, closedAt: '2026-03-06T16:00:00Z' }),
    ];
    expect(dailyPnl(t, c)[0]).toMatchObject({
      wins: 1,
      losses: 0,
      costBasis: 45_000_000,
      net: 50000,
    });
  });

  test('gross basis sums gross into daily P&L', () => {
    const t = [makeTrade({ net: -500, gross: 1000, fees: 1500 })];
    expect(dailyPnl(t, { ...ctx, pnlBasis: 'gross' })[0]).toMatchObject({
      net: 1000,
      wins: 1,
    });
  });
});

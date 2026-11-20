import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { outcomeOf } from '../outcome';
import { dailyPnl, dayStreaks, daySummary } from './days';

describe('days', () => {
  test('daily P&L buckets by local close date across DST', () => {
    const t = [
      makeTrade({ net: 5000, closedAt: '2026-03-06T20:30:00Z' }),
      makeTrade({ net: -1000, closedAt: '2026-03-07T02:00:00Z' }),
      makeTrade({ net: -2000, closedAt: '2026-03-09T13:45:00Z' }),
      makeTrade({ net: 0, closedAt: '2026-03-10T03:30:00Z' }),
    ];
    const days = dailyPnl(t, 'America/New_York', 0);
    expect(days).toEqual([
      { date: '2026-03-06', net: 4000, tradeCount: 2, wins: 1, losses: 1 },
      { date: '2026-03-09', net: -2000, tradeCount: 2, wins: 0, losses: 1 },
    ]);
    expect(daySummary(days)).toMatchObject({
      greenDays: 1, redDays: 1, flatDays: 0, greenPct: 0.5,
      best: { date: '2026-03-06' }, worst: { date: '2026-03-09' },
    });
    expect(dayStreaks(days)).toMatchObject({ maxWin: 1, maxLoss: 1 });
  });
  test('empty summary; flat days neither extend nor break', () => {
    expect(daySummary([])).toEqual({
      greenDays: 0, redDays: 0, flatDays: 0, greenPct: null, best: null, worst: null,
    });
    const d = (date: string, net: number) => ({ date, net, tradeCount: 1, wins: 0, losses: 0 });
    expect(dayStreaks([d('1', 1), d('2', 0), d('3', 1), d('4', -1)])).toEqual({
      maxWin: 2, maxLoss: 1, current: { kind: 'loss', length: 1 },
    });
  });

  test('outcomeOf classifies against the breakeven threshold', () => {
    expect(outcomeOf(101, 100)).toBe('win');
    expect(outcomeOf(100, 100)).toBe('breakeven');
    expect(outcomeOf(-100, 100)).toBe('breakeven');
    expect(outcomeOf(-101, 100)).toBe('loss');
  });
});

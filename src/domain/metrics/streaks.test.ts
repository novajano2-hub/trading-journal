import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { defaultMetricContext } from './context';
import { tradeStreaks, winStreak } from './streaks';

const ctx = defaultMetricContext('America/New_York');

describe('streaks', () => {
  test('trade streaks skip breakevens', () => {
    const t = [1, 1, 0, 1, -1, -1, 0, -1, 1].map((s, i) =>
      makeTrade({ net: s * 1000, serial: i + 1 }),
    );
    expect(tradeStreaks(t, ctx)).toEqual({
      maxWin: 3,
      maxLoss: 3,
      current: { kind: 'win', length: 1 },
    });
  });
  test('empty and threshold', () => {
    expect(tradeStreaks([], ctx).current).toEqual({ kind: null, length: 0 });
    const t = [50, -50].map((net, i) => makeTrade({ net, serial: i + 1 }));
    expect(
      tradeStreaks(t, {
        ...ctx,
        breakevenRange: { unit: 'amount', from: -50, to: 50 },
      }),
    ).toEqual({ maxWin: 0, maxLoss: 0, current: { kind: null, length: 0 } });
  });
});

describe('winStreak', () => {
  const run = (...pnl: number[]) => winStreak(pnl.map((p) => ({ pnl: p })));

  test('counts the wins in a row ending at the last item', () => {
    expect(run(100, 200, 300)).toBe(3);
    expect(run(-100, 200)).toBe(1);
    expect(run(-100, 50, 60, 70)).toBe(3);
  });
  test('reads 0 when the last item is a loss or a breakeven', () => {
    expect(run(100, 200, -1)).toBe(0);
    expect(run(100, 200, 0)).toBe(0);
  });
  test('a breakeven or a loss in the middle ends the run behind it', () => {
    expect(run(100, 0, 100, 100)).toBe(2);
    expect(run(100, 100, -100, 100)).toBe(1);
  });
  test('nothing reads 0', () => {
    expect(winStreak([])).toBe(0);
  });
  test('a lone win is a run of one', () => {
    expect(run(1)).toBe(1);
  });
});

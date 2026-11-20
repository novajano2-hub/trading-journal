import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { tradeStreaks } from './streaks';

describe('streaks', () => {
  test('trade streaks skip breakevens', () => {
    const t = [1, 1, 0, 1, -1, -1, 0, -1, 1].map((s, i) =>
      makeTrade({ net: s * 1000, serial: i + 1 }),
    );
    expect(tradeStreaks(t, 0)).toEqual({
      maxWin: 3,
      maxLoss: 3,
      current: { kind: 'win', length: 1 },
    });
  });
  test('empty and threshold', () => {
    expect(tradeStreaks([], 0).current).toEqual({ kind: null, length: 0 });
    const t = [50, -50].map((net, i) => makeTrade({ net, serial: i + 1 }));
    expect(tradeStreaks(t, 50)).toEqual({ maxWin: 0, maxLoss: 0, current: { kind: null, length: 0 } });
  });
});

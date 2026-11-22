import { describe, expect, test } from 'vitest';
import type { DayStat } from './days';
import { riskRatios } from './risk';

const day = (date: string, net: number): DayStat => ({
  date,
  net,
  tradeCount: 1,
  wins: 0,
  losses: 0,
  costBasis: 0,
});

describe('riskRatios', () => {
  test('Sharpe and Sortino from daily returns on the running balance', () => {
    const r = riskRatios(
      [
        day('2026-11-16', 10000),
        day('2026-11-17', -5000),
        day('2026-11-18', 20000),
      ],
      1_000_000,
    );
    expect(r.sharpe).toBeCloseTo(10.5528, 3);
    expect(r.sortino).toBeCloseTo(46.1915, 3);
  });
  test('one day gives neither', () => {
    expect(riskRatios([day('2026-11-16', 10000)], 1_000_000)).toEqual({
      sharpe: null,
      sortino: null,
    });
  });
  test('no losing day gives no Sortino', () => {
    const r = riskRatios(
      [day('2026-11-16', 10000), day('2026-11-17', 20000)],
      1_000_000,
    );
    expect(r.sharpe).not.toBeNull();
    expect(r.sortino).toBeNull();
  });
});

import { describe, expect, test } from 'vitest';
import { getSampleView } from './sample-view';

describe('landing sample', () => {
  test('sample numbers come from the domain', () => {
    const v = getSampleView();
    expect(v.trades.map((t) => t.net)).toEqual([
      44500, -25000, 32000, -3900, 67000, -27500, -500, 37000,
    ]);
    expect(v.summary).toMatchObject({
      netPnl: 123600,
      grossPnl: 127250,
      fees: 3650,
      wins: 4,
      losses: 4,
      winRate: 0.5,
      expectancy: 15450,
    });
    expect(v.summary.profitFactor).toBeCloseTo(3.1722, 4);
    expect(v.days.map((d) => d.net)).toEqual([
      19500, 28100, 67000, -28000, 37000,
    ]);
    expect(v.drawdown.amount).toBe(28000);
    expect(v.prop).toMatchObject({
      overall: 'in-progress',
      drawdown: { floor: 4923600, remaining: 200000, state: 'clear' },
      tradingDays: { count: 5, met: true },
      consistency: { met: false },
    });
    expect(v.prop.consistency!.bestDayShare).toBeCloseTo(0.5421, 4);
    expect(v.heroTickets[0]).toMatchObject({
      serial: 8,
      side: 'buy',
      symbol: 'ESZ5',
      netPnl: '+$370.00',
    });
    expect(v.heroTickets.find((t) => t.serial === 6)!.stamp).toBe(
      'RULE BROKEN',
    );
  });

  test('hero tickets', () => {
    const v = getSampleView();
    expect(v.heroTickets.map((t) => t.serial)).toEqual([8, 6, 5, 3]);
    expect(v.heroTickets.find((t) => t.serial === 5)!.stamp).toBe('A+ SETUP');
    expect(v.heroTickets[0]).toMatchObject({
      time: '20 Nov 10:15:00',
      price: '6050.50',
      qty: 1,
    });
    expect(v.heroTickets[0]!.r).toBeUndefined();
  });
});

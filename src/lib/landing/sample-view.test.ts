import { describe, expect, test } from 'vitest';
import { formatPnl } from '@/lib/format';
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
      time: '20 NOV 10:15:00',
      price: '6050.50',
      qty: 1,
    });
    expect(v.heroTickets[0]!.r).toBeUndefined();
  });

  test('trades carry engine tags for setup and mistake', () => {
    const v = getSampleView();
    const name = (id: string) => v.tagNames[id];
    const setups = v.trades.map((t) =>
      t.tagIds
        .map(name)
        .filter((n) => v.tags.find((x) => x.name === n)?.category === 'setup'),
    );
    expect(setups.flat()).toEqual([
      'Opening range break',
      'Breakout',
      'Pullback',
      'Opening range break',
      'Fade',
      'Breakout',
      'Range',
      'Opening range break',
    ]);
    const six = v.trades.find((t) => t.serial === 6)!;
    expect(six.tagIds.map(name)).toContain('Moved stop');
    expect(v.heroTickets.find((t) => t.serial === 5)!.stamp).toBe('A+ SETUP');
  });

  test('breakdowns come from the engine', () => {
    const b = getSampleView().breakdowns;
    const net = (rows: { label: string; net: number }[]) =>
      Object.fromEntries(rows.map((r) => [r.label, r.net]));
    expect(b.hour.map((r) => r.label)).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
    ]);
    expect(net(b.hour)).toEqual({
      '09:00': 116000,
      '10:00': 12000,
      '11:00': -3900,
      '12:00': 0,
      '13:00': -500,
      '14:00': 0,
      '15:00': 0,
    });
    expect(b.setup.map((r) => [r.label, r.net])).toEqual([
      ['Opening range break', 77600],
      ['Fade', 67000],
      ['Pullback', 32000],
      ['Range', -500],
      ['Breakout', -52500],
    ]);
    expect(b.setup.reduce((a, r) => a + r.net, 0)).toBe(123600);
    expect(b.mistake.map((r) => [r.label, r.net])).toEqual([
      ['Moved stop', -27500],
      ['Untagged', 151100],
    ]);
    expect(b.session.find((r) => r.key === 'new-york')!.net).toBe(123600);
    expect(b.symbol.reduce((a, r) => a + r.net, 0)).toBe(123600);
  });

  test('ticker text equals the formatted net P&L', () => {
    expect(formatPnl(getSampleView().summary.netPnl)).toBe('+$1,236.00');
  });
});

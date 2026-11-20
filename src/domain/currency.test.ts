import { describe, expect, test } from 'vitest';
import { makeTrade } from './__fixtures__/trades';
import { partitionByCurrency, quoteToPnl } from './currency';
import { resolveInstrument } from './instruments';

describe('currency', () => {
  test('partitionByCurrency groups by pnlCurrency', () => {
    const a = makeTrade({ net: 1, pnlCurrency: 'USD' });
    const b = makeTrade({ net: 2, pnlCurrency: 'JPY' });
    const c = makeTrade({ net: 3, pnlCurrency: 'USD' });
    const m = partitionByCurrency([a, b, c]);
    expect([...m.keys()].sort()).toEqual(['JPY', 'USD']);
    expect(m.get('USD')).toEqual([a, c]);
    expect(m.get('JPY')).toEqual([b]);
  });

  test('quoteToPnl divides by the rate only for a base-currency pnl', () => {
    const usdjpy = resolveInstrument('USDJPY')!;
    expect(quoteToPnl(1542.1, usdjpy, 'USD', 154.21)).toBeCloseTo(10, 9);
    expect(quoteToPnl(1542.1, usdjpy, 'JPY', 154.21)).toBe(1542.1);
    expect(quoteToPnl(5, resolveInstrument('ESZ5')!, 'USD', 4500)).toBe(5);
  });
});

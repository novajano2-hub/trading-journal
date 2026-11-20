import { describe, expect, test } from 'vitest';
import { formatMoney, formatPnl } from './format';

describe('format', () => {
  test('formatPnl always signs gains and losses', () => {
    expect(formatPnl(421850)).toBe('+$4,218.50');
    expect(formatPnl(-31840)).toBe('−$318.40');
    expect(formatPnl(0)).toBe('$0.00');
    expect(formatPnl(100, 'EUR')).toBe('+€1.00');
  });
  test('formatMoney is unsigned for balances', () => {
    expect(formatMoney(5000000)).toBe('$50,000.00');
  });
});

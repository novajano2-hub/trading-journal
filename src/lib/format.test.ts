import { describe, expect, test } from 'vitest';
import { formatMoney, formatPct, formatPnl, formatRatio } from './format';

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
  test('formatPct takes a 0..1 ratio and a fixed number of decimals', () => {
    expect(formatPct(0.5, 1)).toBe('50.0%');
    expect(formatPct(0.412)).toBe('41%');
    expect(formatPct(0.5421)).toBe('54%');
    expect(formatPct(1)).toBe('100%');
  });
  test('formatRatio keeps two decimals', () => {
    expect(formatRatio(3.1722)).toBe('3.17');
    expect(formatRatio(2)).toBe('2.00');
  });
});

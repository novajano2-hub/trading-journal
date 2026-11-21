import { describe, expect, test } from 'vitest';
import {
  formatAdherence,
  formatMoney,
  formatPct,
  formatPnl,
  formatPnlWhole,
  formatRatio,
} from './format';

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
  test('formatAdherence never reads 100% or 0% short of it', () => {
    expect(formatAdherence(1)).toBe('100%');
    expect(formatAdherence(0)).toBe('0%');
    expect(formatAdherence(0.874)).toBe('87%');
    expect(formatAdherence(199 / 200)).toBe('99.5%');
    expect(formatAdherence(0.9996)).toBe('99.9%');
    expect(formatAdherence(1 / 300)).toBe('0.3%');
    expect(formatAdherence(0.0004)).toBe('0.1%');
    expect(formatAdherence(0.994)).toBe('99%');
    expect(formatAdherence(0.006)).toBe('1%');
  });
  test('formatRatio keeps two decimals', () => {
    expect(formatRatio(3.1722)).toBe('3.17');
    expect(formatRatio(2)).toBe('2.00');
  });

  test('formatPnlWhole signs whole dollars', () => {
    expect(formatPnlWhole(116000)).toBe('+1,160');
    expect(formatPnlWhole(-3900)).toBe('−39');
    expect(formatPnlWhole(-500)).toBe('−5');
    expect(formatPnlWhole(0)).toBe('0');
  });
});

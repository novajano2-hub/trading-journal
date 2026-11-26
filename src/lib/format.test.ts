import { describe, expect, test } from 'vitest';
import { resolveInstrument } from '@/domain/instruments';
import {
  adherenceDigits,
  formatAdherence,
  formatCount,
  formatDuration,
  formatInstrument,
  formatMoney,
  formatPct,
  formatPnl,
  formatPnlWhole,
  formatRatio,
  keepHyphens,
  plural,
} from './format';

describe('format', () => {
  test('formatCount puts a separator in a count over a thousand', () => {
    expect(formatCount(1515)).toBe('1,515');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(0)).toBe('0');
  });

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
  test('adherenceDigits is 1 only where a whole percentage would claim an edge', () => {
    expect([1, 0, 0.874, 0.994, 0.006].map(adherenceDigits)).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect([199 / 200, 0.9996, 1 / 300, 0.0004].map(adherenceDigits)).toEqual([
      1, 1, 1, 1,
    ]);
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

  describe('formatInstrument', () => {
    const at = '2026-11-19T15:00:00Z';
    const of = (symbol: string, tradedAt = at) =>
      formatInstrument(resolveInstrument(symbol)!, tradedAt);

    test('an option reads underlying, strike and right, with the expiry beside it', () => {
      expect(of('TSLA261120P00370000')).toEqual({
        name: 'TSLA 370 Put',
        detail: '20 Nov',
      });
      expect(of('TSLA261120C00385000')).toEqual({
        name: 'TSLA 385 Call',
        detail: '20 Nov',
      });
    });
    test('an option expiring the day it opened leaves the expiry out', () => {
      expect(of('TSLA261120P00370000', '2026-11-20T15:00:00Z')).toEqual({
        name: 'TSLA 370 Put',
      });
      // The day is the trader's: 23:30 on the 19th in New York is the 20th in UTC.
      const ny = (tz: string) =>
        formatInstrument(
          resolveInstrument('TSLA261120P00370000')!,
          '2026-11-20T04:30:00Z',
          tz,
        );
      expect(ny('America/New_York')).toEqual({
        name: 'TSLA 370 Put',
        detail: '20 Nov',
      });
      expect(ny('UTC')).toEqual({ name: 'TSLA 370 Put' });
    });
    test('a fractional strike keeps its decimals; a single-digit day has no padding', () => {
      expect(of('AAPL261106P00277500')).toEqual({
        name: 'AAPL 277.5 Put',
        detail: '6 Nov',
      });
    });
    test("an expiry in another year than the trade's says the year", () => {
      expect(of('SPY270115C00600000')).toEqual({
        name: 'SPY 600 Call',
        detail: '15 Jan 27',
      });
    });
    test('a future reads root and contract month, matching the Symbol filter by root', () => {
      expect(of('ESZ6')).toEqual({ name: 'ES Dec 26' });
      expect(of('MNQH7')).toEqual({ name: 'MNQ Mar 27' });
      expect(of('/CLF27')).toEqual({ name: 'CL Jan 27' });
      expect(of('6EM6')).toEqual({ name: '6E Jun 26' });
    });
    test("a one-digit contract year is the nearest year to the trade's", () => {
      expect(of('ESZ5')).toEqual({ name: 'ES Dec 25' });
      expect(of('ESH0', '2029-12-30T15:00:00Z')).toEqual({
        name: 'ES Mar 30',
      });
      expect(of('GCG0', '2026-11-20T15:00:00Z')).toEqual({
        name: 'GC Feb 30',
      });
    });
    test('stocks, forex and crypto keep their symbol', () => {
      expect(of('AAPL')).toEqual({ name: 'AAPL' });
      expect(of('BRK.B')).toEqual({ name: 'BRK.B' });
      expect(of('EURUSD')).toEqual({ name: 'EURUSD' });
      expect(of('EUR/USD')).toEqual({ name: 'EUR/USD' });
      expect(of('BTCUSD')).toEqual({ name: 'BTCUSD' });
      expect(of('ETH-USDT')).toEqual({ name: 'ETH-USDT' });
    });
    test('an instrument missing the fields to decode keeps its symbol', () => {
      const noStrike = { ...resolveInstrument('TSLA261120P00370000')! };
      delete noStrike.strike;
      expect(formatInstrument(noStrike, at)).toEqual({
        name: 'TSLA261120P00370000',
      });
      const future = resolveInstrument('ESZ6')!;
      expect(formatInstrument({ ...future, symbol: 'ES' }, at)).toEqual({
        name: 'ES',
      });
    });
  });

  test('keepHyphens joins hyphenated words so a line never breaks inside them', () => {
    expect(keepHyphens('Trend is intact on the 1-hour chart')).toBe(
      'Trend is intact on the 1\u2011hour chart',
    );
    expect(keepHyphens('Pullback holds the 20-period average')).toBe(
      'Pullback holds the 20\u2011period average',
    );
    expect(keepHyphens('Exit at the mid-point')).toBe(
      'Exit at the mid\u2011point',
    );
    // A hyphen with a space on either side is not inside a word.
    expect(keepHyphens('Risk - reward')).toBe('Risk - reward');
  });

  test('plural names one of a thing, or many', () => {
    expect(plural(1, 'trade')).toBe('trade');
    expect(plural(0, 'trade')).toBe('trades');
    expect(plural(2, 'day')).toBe('days');
    expect(plural(1, 'strategy', 'strategies')).toBe('strategy');
    expect(plural(3, 'strategy', 'strategies')).toBe('strategies');
  });

  test('formatDuration keeps the two largest units', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(1_519_000)).toBe('25m 19s');
    expect(formatDuration(5_640_000)).toBe('1h 34m');
    expect(formatDuration(3 * 86_400_000 + 5 * 3_600_000)).toBe('3d 5h');
    expect(formatDuration(0)).toBe('0s');
  });
});

test('trimmedPercent keeps up to two decimals and drops trailing zeros', async () => {
  const { trimmedPercent } = await import('./format');
  expect(trimmedPercent(0.5)).toBe('50%');
  expect(trimmedPercent(16 / 33)).toBe('48.48%');
  expect(trimmedPercent(4 / 7)).toBe('57.14%');
  expect(trimmedPercent(1)).toBe('100%');
  expect(trimmedPercent(0)).toBe('0%');
});

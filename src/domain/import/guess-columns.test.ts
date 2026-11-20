import { describe, expect, test } from 'vitest';
import { guessColumns, normalizeSide } from './guess-columns';

describe('guess-columns', () => {
  test('guessColumns across broker header styles', () => {
    expect(guessColumns(['Date/Time', 'Symbol', 'Buy/Sell', 'Quantity', 'Price', 'Commission']))
      .toEqual({ time: 0, symbol: 1, side: 2, qty: 3, price: 4 });
    expect(guessColumns(['Fill Time', 'Contract', 'B/S', 'Filled Qty', 'Avg Fill Price']))
      .toEqual({ time: 0, symbol: 1, side: 2, qty: 3, price: 4 });
    expect(guessColumns(['Order Type', 'Ticker'])).toEqual({ symbol: 1 });
    expect(guessColumns([])).toEqual({});
  });

  test('normalizeSide', () => {
    expect(['BOT', 'Buy to Open', 'long'].map(normalizeSide)).toEqual(['buy', 'buy', 'buy']);
    expect(['SLD', 'sell short', 'S'].map(normalizeSide)).toEqual(['sell', 'sell', 'sell']);
    expect(normalizeSide('cancel')).toBeNull();
  });
});

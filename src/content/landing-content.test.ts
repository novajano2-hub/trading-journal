import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { guessColumns } from '@/domain/import/guess-columns';
import { previewFromText } from '@/domain/import/preview';
import { resolveInstrument } from '@/domain/instruments';
import { ASSET_EXAMPLES } from './asset-examples';
import { sampleFillsCsv } from './landing-sample-csv';

describe('sample fills CSV', () => {
  const csv = sampleFillsCsv();

  test('is the e2e fixture, so the data lives in one place', () => {
    expect(csv).toBe(readFileSync('e2e/fixtures/sample-fills.csv', 'utf8'));
  });

  test('the importer maps every column of its header', () => {
    const preview = previewFromText(csv);
    expect(preview.headers).toEqual([
      'Date/Time',
      'Symbol',
      'Buy/Sell',
      'Quantity',
      'Price',
    ]);
    expect(guessColumns(preview.headers)).toEqual({
      time: 0,
      symbol: 1,
      side: 2,
      qty: 3,
      price: 4,
    });
    expect(preview.rows[0]).toEqual({
      rowIndex: 2,
      time: '2026-11-16 09:41:00',
      symbol: 'ESZ5',
      side: 'buy',
      qty: '2',
      price: '6010.00',
    });
  });
});

describe('asset examples', () => {
  test('five pills, each resolving to its own class in the registry', () => {
    expect(ASSET_EXAMPLES.map((a) => a.label)).toEqual([
      'Futures',
      'Stocks',
      'Options',
      'Forex',
      'Crypto',
    ]);
    for (const a of ASSET_EXAMPLES)
      expect(resolveInstrument(a.symbol)?.assetClass).toBe(a.assetClass);
    expect(ASSET_EXAMPLES.map((a) => a.display)).toEqual([
      'ES',
      'AAPL',
      'SPY 600C',
      'EUR/USD',
      'BTC-USD',
    ]);
  });
});

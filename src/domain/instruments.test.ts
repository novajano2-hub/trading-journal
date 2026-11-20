import { describe, expect, test } from 'vitest';
import { instrumentKey, resolveInstrument } from './instruments';

describe('resolveInstrument', () => {
  test('futures roots with month code and year', () => {
    expect(resolveInstrument('ESZ5')).toMatchObject({
      root: 'ES',
      assetClass: 'future',
      pointValue: 50,
      tickSize: 0.25,
      quoteCurrency: 'USD',
    });
    expect(resolveInstrument('MNQH26')).toMatchObject({
      root: 'MNQ',
      pointValue: 2,
    });
    expect(resolveInstrument('/CLF6')).toMatchObject({
      root: 'CL',
      pointValue: 1000,
      tickSize: 0.01,
    });
  });
  test('plain tickers are stocks, even when they look like a futures root', () => {
    expect(resolveInstrument('ES')).toMatchObject({
      assetClass: 'stock',
      pointValue: 1,
    });
    expect(resolveInstrument('AAPL')).toMatchObject({
      assetClass: 'stock',
      pointValue: 1,
      tickSize: 0.01,
      quoteCurrency: 'USD',
      root: 'AAPL',
    });
    expect(resolveInstrument('BRK.B')).toMatchObject({ assetClass: 'stock' });
  });
  test('OCC option symbols', () => {
    expect(resolveInstrument('AAPL  251219C00200000')).toMatchObject({
      assetClass: 'option',
      underlying: 'AAPL',
      root: 'AAPL',
      expiry: '2025-12-19',
      strike: 200,
      right: 'call',
      pointValue: 100,
    });
    expect(resolveInstrument('SPY251219P00450500')).toMatchObject({
      right: 'put',
      strike: 450.5,
    });
  });
  test('forex pairs, lots vs units, quote currency', () => {
    expect(resolveInstrument('EUR/USD')).toMatchObject({
      assetClass: 'forex',
      root: 'EURUSD',
      baseCurrency: 'EUR',
      quoteCurrency: 'USD',
      pointValue: 100000,
      tickSize: 0.00001,
    });
    expect(
      resolveInstrument('EURUSD', { forexQtyUnit: 'units' })?.pointValue,
    ).toBe(1);
    expect(resolveInstrument('USDJPY')).toMatchObject({
      quoteCurrency: 'JPY',
      tickSize: 0.001,
    });
  });
  test('crypto pairs', () => {
    for (const s of ['BTCUSD', 'BTC-USD', 'ETH/USDT'])
      expect(resolveInstrument(s)?.assetClass).toBe('crypto');
    expect(resolveInstrument('BTCUSD')).toMatchObject({
      root: 'BTCUSD',
      baseCurrency: 'BTC',
      quoteCurrency: 'USD',
      pointValue: 1,
      tickSize: 0.01,
    });
    expect(resolveInstrument('ETH/USDT')).toMatchObject({
      quoteCurrency: 'USD',
      baseCurrency: 'ETH',
    });
  });
  test('symbol is the trimmed input', () => {
    expect(resolveInstrument('  ESZ5 ')?.symbol).toBe('ESZ5');
  });
  test('unknown futures root needs an override', () => {
    expect(resolveInstrument('XYZZ5')).toBeNull();
    expect(
      resolveInstrument('XYZZ5', {
        overrides: { XYZ: { pointValue: 10, tickSize: 0.1 } },
      }),
    ).toMatchObject({ root: 'XYZ', assetClass: 'future', pointValue: 10 });
  });
  test('garbage resolves to null', () => {
    expect(resolveInstrument('')).toBeNull();
    expect(resolveInstrument('12345')).toBeNull();
  });
});

describe('remembered point values', () => {
  test('instrumentKey names what a point value is entered for', () => {
    expect(instrumentKey('/ESZ5')).toBe('ES');
    expect(instrumentKey(' zcz5 ')).toBe('ZC');
    expect(instrumentKey('M6EZ5')).toBe('M6E');
    expect(instrumentKey('xauusd')).toBe('XAUUSD');
    expect(instrumentKey('US30')).toBe('US30');
  });
  test('a remembered point value resolves a symbol no pattern knows', () => {
    expect(resolveInstrument('XAUUSD')).toBeNull();
    expect(
      resolveInstrument('xauusd', {
        overrides: { XAUUSD: { pointValue: 100, tickSize: 0.01 } },
      }),
    ).toEqual({
      symbol: 'xauusd',
      root: 'XAUUSD',
      assetClass: 'cfd',
      pointValue: 100,
      tickSize: 0.01,
      quoteCurrency: 'USD',
    });
  });
});

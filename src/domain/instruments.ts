import { canonicalSymbol } from './trade-builder';
import type { AssetClass, Instrument } from './types';

export interface ResolveOptions {
  forexQtyUnit?: 'lots' | 'units'; // default 'lots'
  overrides?: Record<
    string,
    { pointValue: number; tickSize: number; assetClass?: AssetClass }
  >; // keyed by instrumentKey(symbol)
}

export const FUTURES: Readonly<
  Record<string, { pointValue: number; tickSize: number }>
> = {
  ES: { pointValue: 50, tickSize: 0.25 },
  MES: { pointValue: 5, tickSize: 0.25 },
  NQ: { pointValue: 20, tickSize: 0.25 },
  MNQ: { pointValue: 2, tickSize: 0.25 },
  YM: { pointValue: 5, tickSize: 1 },
  MYM: { pointValue: 0.5, tickSize: 1 },
  RTY: { pointValue: 50, tickSize: 0.1 },
  M2K: { pointValue: 5, tickSize: 0.1 },
  CL: { pointValue: 1000, tickSize: 0.01 },
  MCL: { pointValue: 100, tickSize: 0.01 },
  GC: { pointValue: 100, tickSize: 0.1 },
  MGC: { pointValue: 10, tickSize: 0.1 },
  SI: { pointValue: 5000, tickSize: 0.005 },
  NG: { pointValue: 10000, tickSize: 0.001 },
  ZB: { pointValue: 1000, tickSize: 0.03125 },
  ZN: { pointValue: 1000, tickSize: 0.015625 },
  '6E': { pointValue: 125000, tickSize: 0.00005 },
};

export const FX_CODES: ReadonlySet<string> = new Set([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'SEK',
  'NOK',
  'SGD',
  'HKD',
  'MXN',
  'ZAR',
]);
export const CRYPTO_BASES: readonly string[] = [
  'BTC',
  'ETH',
  'SOL',
  'XRP',
  'ADA',
  'DOGE',
  'LTC',
  'AVAX',
  'LINK',
  'DOT',
];
export const CRYPTO_QUOTES: readonly string[] = ['USD', 'USDT', 'USDC'];

const OPTION_RE = /^([A-Z]{1,6})\s*(\d{6})([CP])(\d{8})$/;
const FUTURES_RE = /^\/?([A-Z0-9]{1,4}?)([FGHJKMNQUVXZ])(\d{1,2})$/;
const FOREX_RE = /^([A-Z]{3})\/?([A-Z]{3})$/;
const CRYPTO_RE = new RegExp(
  `^(${CRYPTO_BASES.join('|')})[-/]?(${CRYPTO_QUOTES.join('|')})$`,
);
const STOCK_RE = /^[A-Z]{1,5}(\.[A-Z])?$/;

/**
 * The key a point value is remembered under: a futures-pattern symbol's root
 * (ESZ5 and ESH6 are both ES), otherwise the canonical symbol.
 */
export function instrumentKey(symbol: string): string {
  const s = canonicalSymbol(symbol);
  return FUTURES_RE.exec(s)?.[1] ?? s;
}

function resolveFuture(
  symbol: string,
  s: string,
  opts: ResolveOptions,
): Instrument | null {
  const m = FUTURES_RE.exec(s);
  if (!m) return null;
  // Lazy root match can pick a shorter root than intended; try every split.
  const body = s.replace(/^\//, '');
  for (let len = 1; len <= 4; len++) {
    const root = body.slice(0, len);
    const rest = body.slice(len);
    if (!/^[FGHJKMNQUVXZ]\d{1,2}$/.test(rest)) continue;
    const spec = FUTURES[root] ?? opts.overrides?.[root];
    if (!spec) continue;
    const override = FUTURES[root] ? undefined : opts.overrides?.[root];
    const inst: Instrument = {
      symbol,
      root,
      assetClass: override?.assetClass ?? 'future',
      pointValue: spec.pointValue,
      tickSize: spec.tickSize,
      quoteCurrency: 'USD',
    };
    // 6E (Euro FX) is quoted in USD per EUR; record the base for reference.
    if (root === '6E') inst.baseCurrency = 'EUR';
    // An override that makes a futures symbol an option is an option on a future.
    if (inst.assetClass === 'option') inst.optionOn = 'future';
    return inst;
  }
  return null;
}

export function resolveInstrument(
  symbol: string,
  opts: ResolveOptions = {},
): Instrument | null {
  const trimmed = symbol.trim();
  const s = trimmed.toUpperCase();
  if (!s) return null;

  const opt = OPTION_RE.exec(s);
  if (opt) {
    const [, underlying = '', date = '', cp = '', strike = ''] = opt;
    return {
      symbol: trimmed,
      root: underlying,
      assetClass: 'option',
      pointValue: 100,
      tickSize: 0.01,
      quoteCurrency: 'USD',
      underlying,
      expiry: `20${date.slice(0, 2)}-${date.slice(2, 4)}-${date.slice(4, 6)}`,
      strike: Number(strike) / 1000,
      right: cp === 'C' ? 'call' : 'put',
    };
  }

  if (FUTURES_RE.test(s)) return resolveFuture(trimmed, s, opts);

  const fx = FOREX_RE.exec(s);
  const [, fxBase = '', fxQuote = ''] = fx ?? [];
  if (
    fx &&
    FX_CODES.has(fxBase) &&
    FX_CODES.has(fxQuote) &&
    fxBase !== fxQuote
  ) {
    return {
      symbol: trimmed,
      root: fxBase + fxQuote,
      assetClass: 'forex',
      pointValue: opts.forexQtyUnit === 'units' ? 1 : 100000,
      tickSize: fxQuote === 'JPY' ? 0.001 : 0.00001,
      quoteCurrency: fxQuote,
      baseCurrency: fxBase,
    };
  }

  const cr = CRYPTO_RE.exec(s);
  if (cr) {
    const [, coin = '', crQuote = ''] = cr;
    return {
      symbol: trimmed,
      root: coin + crQuote,
      assetClass: 'crypto',
      pointValue: 1,
      tickSize: 0.01,
      quoteCurrency: 'USD', // USDT/USDC treated as USD
      baseCurrency: coin,
    };
  }

  if (STOCK_RE.test(s)) {
    return {
      symbol: trimmed,
      root: s,
      assetClass: 'stock',
      pointValue: 1,
      tickSize: 0.01,
      quoteCurrency: 'USD',
    };
  }

  const key = instrumentKey(trimmed);
  const o = opts.overrides?.[key];
  if (o) {
    return {
      symbol: trimmed,
      root: key,
      assetClass: o.assetClass ?? 'cfd',
      pointValue: o.pointValue,
      tickSize: o.tickSize,
      quoteCurrency: 'USD',
    };
  }
  return null;
}

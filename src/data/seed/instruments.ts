import { toCents } from '@/domain/money';
import type { Account, AssetClass } from '@/domain/types';

export const WEEKDAYS = 126;
export const PROP_WEEKDAYS = 60; // the last 12 weeks

export interface InstSpec {
  key: string;
  cls: AssetClass;
  /** Price walks are shared by instruments with the same walk key. */
  walk: string;
  price0: number;
  vol: number;
  tick: number;
  dec: number;
  stopAbs?: number;
  stopPct?: number;
  qtyMin: number;
  qtyMax: number;
  step: number;
  weight: number;
  riskMult?: number;
}
export const fut = (
  key: string,
  walk: string,
  price0: number,
  tick: number,
  stopAbs: number,
  qtyMin: number,
  qtyMax: number,
  weight: number,
): InstSpec => ({
  key,
  cls: 'future',
  walk,
  price0,
  vol: 0.02,
  tick,
  dec: 2,
  stopAbs,
  qtyMin,
  qtyMax,
  step: 1,
  weight,
});
export const fx = (
  key: string,
  price0: number,
  stopPct: number,
  tick = 0.00001,
  dec = 5,
): InstSpec => ({
  key,
  cls: 'forex',
  walk: key,
  price0,
  vol: 0.008,
  tick,
  dec,
  stopPct,
  qtyMin: 0.1,
  qtyMax: 3,
  step: 0.1,
  weight: 1,
});
export const stock = (
  key: string,
  price0: number,
  stopPct: number,
  weight: number,
): InstSpec => ({
  key,
  cls: 'stock',
  walk: key,
  price0,
  vol: 0.035,
  tick: 0.01,
  dec: 2,
  stopPct,
  qtyMin: 5,
  qtyMax: 400,
  step: 1,
  weight,
});

export const FUTURES_SPECS: InstSpec[] = [
  fut('ES', 'ES', 5800, 0.25, 3, 1, 2, 30),
  fut('NQ', 'NQ', 20800, 0.25, 10, 1, 2, 25),
  fut('MES', 'ES', 5800, 0.25, 5, 2, 10, 20),
  fut('MNQ', 'NQ', 20800, 0.25, 20, 2, 8, 15),
  fut('CL', 'CL', 68, 0.01, 0.15, 1, 2, 6),
  fut('GC', 'GC', 2700, 0.1, 2, 1, 1, 4),
];
export const FOREX_SPECS: InstSpec[] = [
  fx('EURUSD', 1.08, 0.0011),
  fx('GBPUSD', 1.28, 0.0011),
  fx('AUDUSD', 0.66, 0.0016),
  fx('USDJPY', 150, 0.0012, 0.001, 3),
];
export const STOCK_SPECS: InstSpec[] = [
  stock('AAPL', 230, 0.005, 9),
  stock('NVDA', 140, 0.007, 9),
  stock('MSFT', 420, 0.005, 9),
  stock('TSLA', 330, 0.008, 9),
  stock('SPY', 590, 0.003, 9),
];
export const OPTION_SPEC: InstSpec = {
  key: 'OPT',
  cls: 'option',
  walk: 'OPT',
  price0: 0,
  vol: 0,
  tick: 0.01,
  dec: 2,
  qtyMin: 1,
  qtyMax: 10,
  step: 1,
  weight: 30,
};
// Crypto trades 24/7 in reality; it shares the 09:30-16:00 weekday session of
// the multi-asset account on purpose, so every day's trades sit in one window.
export const CRYPTO_SPECS: InstSpec[] = [
  {
    key: 'BTCUSD',
    cls: 'crypto',
    walk: 'BTCUSD',
    price0: 95000,
    vol: 0.06,
    tick: 0.01,
    dec: 2,
    stopPct: 0.015,
    qtyMin: 0.01,
    qtyMax: 1,
    step: 0.01,
    weight: 13,
    riskMult: 0.5,
  },
  {
    key: 'ETHUSD',
    cls: 'crypto',
    walk: 'ETHUSD',
    price0: 3300,
    vol: 0.07,
    tick: 0.01,
    dec: 2,
    stopPct: 0.02,
    qtyMin: 0.1,
    qtyMax: 20,
    step: 0.1,
    weight: 12,
    riskMult: 0.5,
  },
];
export const MULTI_SPECS: InstSpec[] = [
  ...STOCK_SPECS,
  OPTION_SPEC,
  ...CRYPTO_SPECS,
];
export const OPTION_UNDERLYINGS = STOCK_SPECS;

export const MONTH_CODES = 'FGHJKMNQUVXZ';
/** Front-month futures symbol on a date (index futures roll mid-quarter-month). */
export function frontMonth(root: string, date: string): string {
  const [y = 2026, m = 1, d = 1] = date.split('-').map(Number);
  let year = y;
  let month = m; // 1..12
  if (root === 'ES' || root === 'NQ' || root === 'MES' || root === 'MNQ') {
    month = Math.ceil(month / 3) * 3;
    if (m === month && d >= 15) month += 3;
  } else if (root === 'CL') {
    month += 1;
  } else {
    month = Math.ceil((month + 1) / 2) * 2; // GC: even months
  }
  if (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${root}${MONTH_CODES[month - 1]}${year % 10}`;
}

export function optionSymbol(
  underlying: string,
  expiry: string,
  right: 'C' | 'P',
  strike: number,
): string {
  return `${underlying}${expiry.slice(2, 4)}${expiry.slice(5, 7)}${expiry.slice(8, 10)}${right}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}

export function feesFor(
  cls: AssetClass,
  qty: number,
  price: number,
): { fees: number; commission: number } {
  switch (cls) {
    case 'future':
      return { commission: toCents(qty * 2.25), fees: toCents(qty * 0.35) };
    case 'forex':
      return { commission: toCents(qty * 3.5), fees: 0 };
    case 'stock':
      return { commission: Math.max(100, toCents(qty * 0.005)), fees: 0 };
    case 'option':
      return { commission: toCents(qty * 0.65), fees: 0 };
    default:
      return { commission: 0, fees: toCents(qty * price * 0.001) };
  }
}

export const snap = (x: number, tick: number, dec: number): number =>
  Number((Math.round(x / tick) * tick).toFixed(dec));
export const snapQty = (x: number, step: number): number =>
  Number((Math.round(x / step) * step).toFixed(2));

export interface AccountSpec {
  id: string;
  name: string;
  broker: string;
  type: Account['type'];
  startingBalance: number;
  specs: InstSpec[];
  openH: number;
  openM: number;
  sessionMin: number;
  activeProb: number;
  perDay: [number, number];
  /** Dollars risked per trade: about 0.25-0.4% of the starting balance. */
  risk: number;
  days: number;
}
export const ACCOUNT_SPECS: AccountSpec[] = [
  {
    id: 'sample-futures',
    name: 'Futures live',
    broker: 'Sample futures broker',
    type: 'live',
    startingBalance: 5_000_000,
    specs: FUTURES_SPECS,
    openH: 9,
    openM: 30,
    sessionMin: 390,
    activeProb: 0.95,
    perDay: [3, 6],
    risk: 115,
    days: WEEKDAYS,
  },
  {
    id: 'sample-forex-prop',
    name: 'Forex evaluation',
    broker: 'Sample prop firm',
    type: 'prop-evaluation',
    startingBalance: 10_000_000,
    specs: FOREX_SPECS,
    openH: 3,
    openM: 0,
    sessionMin: 510,
    activeProb: 0.95,
    perDay: [1, 4],
    risk: 215,
    days: PROP_WEEKDAYS,
  },
  {
    id: 'sample-multi',
    name: 'Stocks & options',
    broker: 'Sample multi-asset broker',
    type: 'live',
    startingBalance: 2_500_000,
    specs: MULTI_SPECS,
    openH: 9,
    openM: 30,
    sessionMin: 390,
    activeProb: 0.93,
    perDay: [3, 6],
    risk: 90,
    days: WEEKDAYS,
  },
];

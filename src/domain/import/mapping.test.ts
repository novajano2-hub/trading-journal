import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseCsv } from './csv';
import {
  applySavedMapping,
  detectDecimal,
  guessMapping,
  missingFields,
} from './mapping';

const ny = { sourceTimeZone: 'America/New_York' };
const g = (text: string) => guessMapping(parseCsv(text), ny);

test('the landing sample is a fills file', () => {
  expect(
    guessMapping(
      parseCsv(readFileSync('e2e/fixtures/sample-fills.csv', 'utf8')),
      ny,
    ),
  ).toEqual({
    kind: 'fills',
    columns: { time: 0, symbol: 1, side: 2, qty: 3, price: 4 },
    sourceTimeZone: 'America/New_York',
    dateOrder: 'mdy',
    decimal: '.',
    forexQtyUnit: 'lots',
    overrides: {},
  });
});

test('separate date and time columns, with commission, fees and order id', () => {
  expect(
    g(
      'Date,Time,Symbol,Buy/Sell,Quantity,Price,Commission,Fees,Order ID,Order Type\n',
    ).columns,
  ).toEqual({
    date: 0,
    time: 1,
    symbol: 2,
    side: 3,
    qty: 4,
    price: 5,
    commission: 6,
    fees: 7,
    orderId: 8,
  });
});

test('a MetaTrader 4 statement is a closed-trade file', () => {
  const m = g(
    'Ticket,Open Time,Type,Size,Item,Price,S / L,T / P,Close Time,Price,Commission,Taxes,Swap,Profit\n',
  );
  expect(m.kind).toBe('closed-trades');
  expect(m.columns).toEqual({
    openTime: 1,
    side: 2,
    qty: 3,
    symbol: 4,
    entryPrice: 5,
    closeTime: 8,
    exitPrice: 9,
    commission: 10,
    pnl: 13,
  });
});

test('a MetaTrader 5 positions report is a closed-trade file', () => {
  expect(
    g(
      'Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit\n',
    ).columns,
  ).toEqual({
    openTime: 0,
    symbol: 2,
    side: 3,
    qty: 4,
    entryPrice: 5,
    closeTime: 8,
    exitPrice: 9,
    commission: 10,
    pnl: 12,
  });
});

test('a semicolon file with day-first dates (Review Focus 3)', () => {
  expect(
    g('Time;Symbol;Side;Qty;Price\n16/11/2026 09:41;ESZ5;Buy;2;6010,25\n'),
  ).toMatchObject({ decimal: ',', dateOrder: 'dmy' });
});

test('missingFields lists unmapped required fields', () => {
  expect(missingFields(g('Symbol,Side\n'))).toEqual(['time', 'qty', 'price']);
});

test('named close columns make a closed-trade file', () => {
  const m = g(
    'Symbol,Side,Qty,Entry Price,Exit Price,Open Time,Close Time,Net P&L\n',
  );
  expect(m.kind).toBe('closed-trades');
  expect(m.columns).toEqual({
    symbol: 0,
    side: 1,
    qty: 2,
    entryPrice: 3,
    exitPrice: 4,
    openTime: 5,
    closeTime: 6,
    pnl: 7,
  });
  expect(missingFields(m)).toEqual([]);
});

test('a semicolon file with dot decimals is read as dot decimals', () => {
  expect(
    g(
      'Time;Symbol;Side;Qty;Price\n2026-11-16 09:41;EURUSD;Buy;1.052;1.08452\n',
    ),
  ).toMatchObject({ decimal: '.' });
});

test('a semicolon file with comma decimals is read as comma decimals', () => {
  expect(
    g('Time;Symbol;Side;Qty;Price\n2026-11-16 09:41;ESZ5;Buy;2;6010,25\n'),
  ).toMatchObject({ decimal: ',' });
});

test('a comma file with quoted European numbers is read as comma decimals', () => {
  expect(
    g('Time,Symbol,Side,Qty,Price\n2026-11-16 09:41,ESZ5,Buy,2,"1.234,56"\n'),
  ).toMatchObject({ decimal: ',' });
});

test('ambiguous numbers keep the delimiter rule', () => {
  const head = 'Time;Symbol;Side;Qty;Price\n';
  expect(g(`${head}2026-11-16 09:41;ESZ5;Buy;2;1.234\n`)).toMatchObject({
    decimal: ',',
  });
  expect(g(`${head}2026-11-16 09:41;ESZ5;Buy;2;6010\n`)).toMatchObject({
    decimal: ',',
  });
  expect(
    g('Time,Symbol,Side,Qty,Price\n2026-11-16 09:41,ESZ5,Buy,2,1.234\n'),
  ).toMatchObject({ decimal: '.' });
});

test('mixed evidence keeps the delimiter rule', () => {
  expect(
    g('Time;Symbol;Side;Qty;Price\n2026-11-16 09:41;ESZ5;Buy;1.5;6010,25\n'),
  ).toMatchObject({ decimal: ',' });
});

test('a header like "Exit Strategy" does not turn a fills file into closed trades (E36)', () => {
  const m = g('Date/Time,Symbol,Buy/Sell,Quantity,Price,Exit Strategy\n');
  expect(m.kind).toBe('fills');
  expect(m.columns).toEqual({ time: 0, symbol: 1, side: 2, qty: 3, price: 4 });
});

test('a bare "Exit" column still marks closed trades', () => {
  expect(g('Open Time,Symbol,Side,Qty,Entry,Exit,Close Time\n').kind).toBe(
    'closed-trades',
  );
});

test('the kind can be forced, and the columns follow it', () => {
  const parsed = parseCsv('Time,Symbol,Side,Qty,Price\n');
  expect(guessMapping(parsed, ny).kind).toBe('fills');
  const forced = guessMapping(parsed, { ...ny, kind: 'closed-trades' });
  expect(forced.kind).toBe('closed-trades');
  expect(forced.columns.symbol).toBe(1);
});

test('year-first dates are detected as YMD', () => {
  const m = g(
    'Time,Symbol,Side,Qty,Price\n2026/11/19 09:30:00,ESZ6,Buy,1,5000\n',
  );
  expect(m.dateOrder).toBe('ymd');
});

const saved = guessMapping(parseCsv('Time,Symbol,Side,Qty,Price\n'), {
  sourceTimeZone: 'Europe/London',
});

test('a saved mapping applies when the headers it was saved with are in the file', () => {
  const withHeaders = {
    ...saved,
    headers: ['Time', 'Symbol', 'Side', 'Qty', 'Price'],
  };
  expect(
    applySavedMapping(withHeaders, ['Time', 'Symbol', 'Side', 'Qty', 'Price']),
  ).toEqual(withHeaders);
  // The same columns in another order are found by name.
  const moved = applySavedMapping(withHeaders, [
    'Price',
    'Qty',
    'Side',
    'Symbol',
    'Time',
    'Extra',
  ]);
  expect(moved?.columns).toEqual({
    time: 4,
    symbol: 3,
    side: 2,
    qty: 1,
    price: 0,
  });
});

test('a saved mapping does not apply when one of its columns is gone', () => {
  const withHeaders = {
    ...saved,
    headers: ['Time', 'Symbol', 'Side', 'Qty', 'Price'],
  };
  expect(
    applySavedMapping(withHeaders, ['Time', 'Symbol', 'Side', 'Qty']),
  ).toBeNull();
  expect(
    applySavedMapping(withHeaders, ['Date', 'Symbol', 'Side', 'Qty', 'Fill']),
  ).toBeNull();
});

test('a saved mapping with no headers is never applied by position', () => {
  expect(applySavedMapping(saved, ['a', 'b', 'c', 'd', 'e'])).toBeNull();
  expect(
    applySavedMapping(saved, ['Time', 'Symbol', 'Side', 'Qty', 'Price']),
  ).toBeNull();
});

test('detectDecimal reads a mark off the mapped numeric columns, or says it cannot', () => {
  const dot = parseCsv('Time,Symbol,Side,Qty,Price\nx,ES,Buy,1,5000.25\n');
  const comma = parseCsv('Time,Symbol,Side,Qty,Price\nx,ES,Buy,1,"5000,25"\n');
  const none = parseCsv('Time,Symbol,Side,Qty,Price\nx,ES,Buy,1,5000\n');
  const m = guessMapping(dot, ny);
  expect(detectDecimal(dot, m)).toBe('.');
  expect(detectDecimal(comma, m)).toBe(',');
  expect(detectDecimal(none, m)).toBeNull();
});

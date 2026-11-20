import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseCsv } from './csv';
import { guessMapping, missingFields } from './mapping';

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

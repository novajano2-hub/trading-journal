import { expect, test } from 'vitest';
import { parseCsv } from './csv';
import { guessMapping } from './mapping';
import { unknownRoots } from './unknown-symbols';

const csv = [
  'Time,Symbol,Side,Qty,Price',
  '2026-11-19 09:30:00,HGZ6,Buy,1,4.1',
  '2026-11-19 09:35:00,HGZ6,Sell,1,4.2',
  '2026-11-19 09:40:00,HGH7,Buy,1,4.3',
  '2026-11-19 09:45:00,ESZ6,Buy,1,5000',
  '2026-11-19 09:50:00,AAPL,Buy,1,200',
].join('\n');
const parsed = parseCsv(csv);
const mapping = guessMapping(parsed, { sourceTimeZone: 'UTC' });

test('a futures root Keel does not know is listed with the file symbols and the row count', () => {
  expect(unknownRoots(parsed, mapping, {})).toEqual([
    { key: 'HG', symbols: ['HGZ6', 'HGH7'], rows: 3, tickSize: 0.1 },
  ]);
});

test('a root with a remembered point value is not asked for', () => {
  expect(
    unknownRoots(parsed, mapping, {
      HG: { pointValue: 25000, tickSize: 0.01 },
    }),
  ).toEqual([]);
});

test('no symbol column, no roots', () => {
  const none = {
    ...mapping,
    columns: { ...mapping.columns, symbol: undefined },
  };
  expect(unknownRoots(parsed, none, {})).toEqual([]);
});

const hg = (prices: readonly string[], decimal: '.' | ',' = '.') => {
  const p = parseCsv(
    [
      'Time,Symbol,Side,Qty,Price',
      ...prices.map((x) => `2026-11-19 09:30:00,HGZ6,Buy,1,"${x}"`),
    ].join('\n'),
  );
  return unknownRoots(
    p,
    { ...guessMapping(p, { sourceTimeZone: 'UTC' }), decimal },
    {},
  )[0]!.tickSize;
};

test('the default tick size follows the price precision', () => {
  // Four decimals, every one ending in 0 or 5: the half tick of copper.
  expect(hg(['4.1005', '4.2', '4.1050'])).toBe(0.0005);
  // Four decimals that do not: the last decimal.
  expect(hg(['4.1003'])).toBe(0.0001);
  expect(hg(['4.25', '4.30'])).toBe(0.01);
  expect(hg(['4'])).toBe(1);
  // The file's own mark.
  expect(hg(['4,1005'], ',')).toBe(0.0005);
});

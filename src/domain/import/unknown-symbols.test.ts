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
    { key: 'HG', symbols: ['HGZ6', 'HGH7'], rows: 3 },
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

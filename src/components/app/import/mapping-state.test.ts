import { expect, test } from 'vitest';
import type { ParsedCsv } from '@/domain/import/csv';
import { columnSample } from './mapping-state';

function file(rows: readonly (readonly string[])[]): ParsedCsv {
  return {
    headers: ['a', 'b'],
    rows: rows.map((cells, i) => ({ rowIndex: i + 2, cells: [...cells] })),
    delimiter: ',',
  };
}

test('a column sample is the first three values that are not empty, in file order', () => {
  const parsed = file([
    ['1', ''],
    ['2', 'x'],
    ['', ''],
    ['3', 'y'],
    ['4', 'z'],
    ['5', 'w'],
  ]);
  expect(columnSample(parsed, 0)).toEqual(['1', '2', '3']);
  expect(columnSample(parsed, 1)).toEqual(['x', 'y', 'z']);
  expect(columnSample(parsed, 1, 2)).toEqual(['x', 'y']);
});

test('a column that is not there, or is empty, or short, samples what it has', () => {
  const parsed = file([['1'], ['2']]);
  expect(columnSample(parsed, undefined)).toEqual([]);
  expect(columnSample(parsed, 1)).toEqual([]);
  expect(columnSample(parsed, 0)).toEqual(['1', '2']);
});

test('it stops reading rows once it has its values, so a huge file costs no more than a small one', () => {
  let read = 0;
  const rows = Array.from({ length: 150_000 }, (_, i) => ({
    rowIndex: i + 2,
    get cells() {
      read += 1;
      return ['v'];
    },
  }));
  const parsed = { headers: ['a'], rows, delimiter: ',' } as ParsedCsv;
  expect(columnSample(parsed, 0)).toEqual(['v', 'v', 'v']);
  expect(read).toBeLessThan(10);
});

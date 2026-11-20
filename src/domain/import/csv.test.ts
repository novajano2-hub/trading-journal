import { describe, expect, test } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  test('numbers rows by file row; blank lines are skipped but counted', () => {
    const p = parseCsv('﻿Time,Symbol\r\n09:41, ESZ5 \r\n\r\n  ,  \r\n09:42,NQZ5\r\n');
    expect(p.headers).toEqual(['Time', 'Symbol']);
    expect(p.rows).toEqual([
      { rowIndex: 2, cells: ['09:41', 'ESZ5'] },
      { rowIndex: 5, cells: ['09:42', 'NQZ5'] },
    ]);
    expect(p.delimiter).toBe(',');
  });
  test('a quoted cell holding a newline is one row', () => {
    expect(parseCsv('a,b\n"x\ny",1\n2,3\n').rows.map((r) => r.rowIndex)).toEqual([2, 3]);
  });
  test('detects semicolons and stops at the limit', () => {
    const big = ['a;b', ...Array.from({ length: 50000 }, (_, i) => `${i};x`)].join('\n');
    const p = parseCsv(big, { limit: 3 });
    expect(p.delimiter).toBe(';');
    expect(p.rows.map((r) => r.rowIndex)).toEqual([2, 3, 4]);
  });
  test('empty text', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [], delimiter: ',' });
  });
});

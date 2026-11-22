import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseCsv } from '@/domain/import/csv';
import { decodeFile, readSpreadsheet } from './decode';

const utf8 = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

test('UTF-8 bytes decode as UTF-8', () => {
  expect(decodeFile(utf8('Prix €'))).toEqual({
    text: 'Prix €',
    encoding: 'utf-8',
  });
});

test('windows-1252 bytes of "Prix €" decode as windows-1252 with the right text', () => {
  // 0x80 is the euro sign in windows-1252 and an invalid lead byte in UTF-8.
  const bytes = new Uint8Array([0x50, 0x72, 0x69, 0x78, 0x20, 0x80])
    .buffer as ArrayBuffer;
  expect(decodeFile(bytes)).toEqual({
    text: 'Prix €',
    encoding: 'windows-1252',
  });
});

test('a UTF-8 byte order mark is dropped', () => {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x2c, 0x42]).buffer;
  expect(decodeFile(bom as ArrayBuffer).text).toBe('A,B');
});

test('a two-row XLSX reads as the same rows as its CSV twin', async () => {
  const xlsx = new Blob([readFileSync('src/lib/__fixtures__/fills.xlsx')]);
  const rows = await readSpreadsheet(xlsx);
  const twin = parseCsv(readFileSync('src/lib/__fixtures__/fills.csv', 'utf8'));
  expect(rows).toEqual([twin.headers, ...twin.rows.map((r) => r.cells)]);
  expect(rows).toHaveLength(3);
});

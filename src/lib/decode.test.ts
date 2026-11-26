import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { parseCsv } from '@/domain/import/csv';
import {
  decodeFile,
  ImportFileError,
  MAX_IMPORT_BYTES,
  readImportFile,
  readSpreadsheet,
} from './decode';

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

const MB = 1024 * 1024;

/** A file that reports a size without holding the bytes, and says if anything reads them. */
function sized(name: string, size: number) {
  const file = new File(['Date/Time,Symbol\n2026-11-16 09:41:00,ESZ5\n'], name);
  const read = vi.fn(async () => new ArrayBuffer(0));
  Object.defineProperty(file, 'size', { value: size });
  Object.defineProperty(file, 'arrayBuffer', { value: read });
  return { file, read };
}

test('the limit is 20 MB', () => expect(MAX_IMPORT_BYTES).toBe(20 * MB));

test('a 21 MB file is refused with the sentence, before any byte is read', async () => {
  const { file, read } = sized('big.csv', 21 * MB);
  const err = await readImportFile(file).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ImportFileError);
  expect((err as Error).message).toBe('This file is larger than 20 MB');
  expect(read).not.toHaveBeenCalled();
});

test('a spreadsheet over the limit is refused too', async () => {
  const { file } = sized('big.xlsx', 21 * MB);
  await expect(readImportFile(file)).rejects.toBeInstanceOf(ImportFileError);
});

test('a file one byte over the limit is refused; one at the limit is not', async () => {
  await expect(
    readImportFile(sized('a.csv', MAX_IMPORT_BYTES + 1).file),
  ).rejects.toBeInstanceOf(ImportFileError);
  const edge = sized('b.csv', MAX_IMPORT_BYTES);
  edge.read.mockResolvedValue(
    new TextEncoder().encode('Date/Time,Symbol\n2026-11-16 09:41:00,ESZ5\n')
      .buffer as ArrayBuffer,
  );
  await expect(readImportFile(edge.file)).resolves.toMatchObject({
    name: 'b.csv',
  });
});

test('a 19 MB file is read and parsed', async () => {
  const head = 'Date/Time,Symbol,Buy/Sell,Quantity,Price\n';
  const row = '2026-11-16 09:41:00,ESZ5,Buy,1,6010.00\n';
  const body = row.repeat(Math.floor((19 * MB - head.length) / row.length));
  const file = new File([head, body], 'nineteen.csv');
  expect(file.size).toBeGreaterThan(18.9 * MB);
  expect(file.size).toBeLessThan(19 * MB);
  const opened = await readImportFile(file);
  expect(opened.parsed.rows).toHaveLength(
    Math.floor((19 * MB - head.length) / row.length),
  );
});

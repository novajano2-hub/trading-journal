import Papa from 'papaparse';
import { parseCsv, type ParsedCsv } from '@/domain/import/csv';

export type TextEncoding = 'utf-8' | 'windows-1252';

/**
 * File bytes as text. UTF-8 first; a file with bytes UTF-8 cannot read (U+FFFD
 * in the result) is read again as windows-1252, which is what Excel and many
 * brokers write for a CSV. A leading byte order mark is dropped.
 */
export function decodeFile(bytes: ArrayBuffer): {
  text: string;
  encoding: TextEncoding;
} {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('�')) return { text: utf8, encoding: 'utf-8' };
  return {
    text: new TextDecoder('windows-1252').decode(bytes),
    encoding: 'windows-1252',
  };
}

/** A spreadsheet cell as the text a CSV would hold. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Spreadsheet dates carry no zone: the wall clock is in the UTC fields.
    const iso = value.toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
  }
  return String(value).trim();
}

/**
 * The first sheet of an .xlsx file as rows of text. The reader is loaded on
 * use: it runs in the browser only and is no part of the page's first load.
 */
export async function readSpreadsheet(file: Blob): Promise<string[][]> {
  const { readSheet } = await import('read-excel-file/browser');
  const rows = await readSheet(file);
  return rows.map((row) => row.map(cellText));
}

export type ImportFileKind = 'csv' | 'xlsx';

/** A file opened for import: its rows, and what to say about it. */
export interface ImportFile {
  /** Distinguishes one opened file from the next, even with the same name. */
  id: string;
  name: string;
  size: number;
  kind: ImportFileKind;
  /** Of the text; spreadsheets are always UTF-8. */
  encoding: TextEncoding;
  parsed: ParsedCsv;
}

export class ImportFileError extends Error {}

let opened = 0;

/** Reads a chosen file into rows. Throws `ImportFileError` with a sentence for the visitor. */
export async function readImportFile(file: File): Promise<ImportFile> {
  const xlsx = /\.xlsx$/i.test(file.name);
  let text: string;
  let encoding: TextEncoding = 'utf-8';
  if (xlsx) {
    let rows: string[][];
    try {
      rows = await readSpreadsheet(file);
    } catch {
      throw new ImportFileError(
        "Keel couldn't open this spreadsheet. Save it as .xlsx or export it as CSV, then try again.",
      );
    }
    text = Papa.unparse(rows);
  } else {
    ({ text, encoding } = decodeFile(await file.arrayBuffer()));
  }
  const parsed = parseCsv(text);
  if (parsed.headers.length === 0 || parsed.rows.length === 0)
    throw new ImportFileError(
      parsed.headers.length === 0
        ? 'This file is empty.'
        : 'This file has a header row but no trades below it.',
    );
  opened += 1;
  return {
    id: `${opened}:${file.name}:${file.size}`,
    name: file.name,
    size: file.size,
    kind: xlsx ? 'xlsx' : 'csv',
    encoding,
    parsed,
  };
}

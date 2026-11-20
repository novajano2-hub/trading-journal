import Papa from 'papaparse';

export interface CsvRow {
  /** 1-based file row; the header is row 1. */
  rowIndex: number;
  /** Trimmed cells. */
  cells: string[];
}

export interface ParsedCsv {
  /** Trimmed header cells. */
  headers: string[];
  /** Non-blank rows only; blank rows are skipped but still counted. */
  rows: CsvRow[];
  delimiter: string;
}

/**
 * Parses CSV text, numbering each row by its position in the file so that
 * later messages can point at the visitor's own row. `limit` caps the data
 * rows collected and stops parsing early.
 */
export function parseCsv(text: string, opts: { limit?: number } = {}): ParsedCsv {
  const { limit } = opts;
  let headers: string[] = [];
  let delimiter = ',';
  const rows: CsvRow[] = [];
  let recordIndex = 0;

  Papa.parse<string[]>(text, {
    skipEmptyLines: false,
    step: (result, parser) => {
      recordIndex += 1;
      if (recordIndex === 1) delimiter = result.meta.delimiter || ',';
      const cells = result.data.map((c) => c.trim());
      if (cells.every((c) => c === '')) return;
      if (recordIndex === 1) {
        headers = cells;
        return;
      }
      rows.push({ rowIndex: recordIndex, cells });
      if (limit !== undefined && rows.length >= limit) parser.abort();
    },
  });

  return { headers, rows, delimiter };
}

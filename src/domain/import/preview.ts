import { parseCsv } from './csv';
import {
  guessColumns,
  normalizeSide,
  type PreviewField,
} from './guess-columns';

export interface PreviewRow {
  rowIndex: number;
  time?: string;
  symbol?: string;
  side?: 'buy' | 'sell';
  qty?: string;
  price?: string;
}

export interface Preview {
  headers: string[];
  guessed: Partial<Record<PreviewField, number>>;
  rows: PreviewRow[];
}

export class PreviewError extends Error {
  readonly reason: 'empty' | 'unrecognised';
  constructor(reason: 'empty' | 'unrecognised') {
    super(`Cannot preview file: ${reason}`);
    this.name = 'PreviewError';
    this.reason = reason;
  }
}

export function previewFromText(csv: string, limit = 4): Preview {
  const { headers, rows: records } = parseCsv(csv, { limit });
  if (headers.length === 0) throw new PreviewError('empty');

  const guessed = guessColumns(headers);
  if (Object.keys(guessed).length === 0) throw new PreviewError('unrecognised');

  const rows = records.map(({ rowIndex, cells }) => {
    const row: PreviewRow = { rowIndex };
    const cell = (field: PreviewField): string | undefined => {
      const index = guessed[field];
      return index === undefined ? undefined : (cells[index] ?? '');
    };
    const time = cell('time');
    const symbol = cell('symbol');
    const side = cell('side');
    const qty = cell('qty');
    const price = cell('price');
    if (time !== undefined) row.time = time;
    if (symbol !== undefined) row.symbol = symbol;
    if (side !== undefined) {
      const normalized = normalizeSide(side);
      if (normalized) row.side = normalized;
    }
    if (qty !== undefined) row.qty = qty;
    if (price !== undefined) row.price = price;
    return row;
  });

  return { headers, guessed, rows };
}

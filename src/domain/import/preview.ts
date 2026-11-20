import Papa from 'papaparse';
import {
  guessColumns,
  normalizeSide,
  type PreviewField,
} from './guess-columns';

export interface PreviewTicket {
  time?: string;
  symbol?: string;
  side?: 'buy' | 'sell';
  qty?: string;
  price?: string;
}

export interface Preview {
  headers: string[];
  guessed: Partial<Record<PreviewField, number>>;
  tickets: PreviewTicket[];
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
  const { data } = Papa.parse<string[]>(csv, {
    preview: limit + 1,
    skipEmptyLines: true,
  });
  const [headerRow, ...rows] = data;
  if (!headerRow) throw new PreviewError('empty');

  const headers = headerRow.map((h) => h.trim());
  const guessed = guessColumns(headers);
  if (Object.keys(guessed).length === 0) throw new PreviewError('unrecognised');

  const tickets = rows.map((row) => {
    const ticket: PreviewTicket = {};
    const cell = (field: PreviewField): string | undefined => {
      const index = guessed[field];
      return index === undefined ? undefined : (row[index] ?? '').trim();
    };
    const time = cell('time');
    const symbol = cell('symbol');
    const side = cell('side');
    const qty = cell('qty');
    const price = cell('price');
    if (time !== undefined) ticket.time = time;
    if (symbol !== undefined) ticket.symbol = symbol;
    if (side !== undefined) {
      const normalized = normalizeSide(side);
      if (normalized) ticket.side = normalized;
    }
    if (qty !== undefined) ticket.qty = qty;
    if (price !== undefined) ticket.price = price;
    return ticket;
  });

  return { headers, guessed, tickets };
}

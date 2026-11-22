import type { FillField, TradeRowField } from '@/domain/import/mapping';

export type FieldKey = FillField | TradeRowField;

/** The rows of the mapping table, in reading order. */
export const FIELD_ORDER = {
  fills: [
    'date',
    'time',
    'symbol',
    'side',
    'qty',
    'price',
    'fees',
    'commission',
    'orderId',
  ],
  'closed-trades': [
    'openTime',
    'closeTime',
    'symbol',
    'side',
    'qty',
    'entryPrice',
    'exitPrice',
    'fees',
    'commission',
    'pnl',
  ],
} as const satisfies {
  fills: readonly FillField[];
  'closed-trades': readonly TradeRowField[];
};

export const FIELD_LABEL: Record<FieldKey, string> = {
  date: 'Date',
  time: 'Time',
  symbol: 'Symbol',
  side: 'Side',
  qty: 'Quantity',
  price: 'Price',
  fees: 'Fees',
  commission: 'Commission',
  orderId: 'Order ID',
  openTime: 'Entry time',
  closeTime: 'Exit time',
  entryPrice: 'Entry price',
  exitPrice: 'Exit price',
  pnl: 'P&L',
};

/** One line under a field's name, for the fields that need one. */
export const FIELD_HINT: Partial<Record<FieldKey, string>> = {
  date: 'Only when the date is in its own column',
  time: 'Date and time of the fill',
  orderId: 'Keeps two fills of the same size apart',
  pnl: "To check Keel's figure",
};

/** 0 is A, 26 is AA: how a spreadsheet names the column. */
export function columnLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

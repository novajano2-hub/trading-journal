import type { FillField, TradeRowField } from '@/domain/import/mapping';
import type { RowIssueCode } from '@/domain/import/rows';

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

/** What is wrong with a value, to follow "the quantity \"x\"". */
export const ISSUE_REASON: Record<RowIssueCode, string> = {
  missing: 'is empty',
  'time-unparseable':
    'is not a date and time Keel can read with these settings',
  'qty-invalid': 'is not a valid quantity',
  'number-unparseable': 'is not a number with this decimal mark',
  'side-unrecognised': 'is not a buy or a sell',
  'close-before-open': 'closes before it opens',
};

/** The fields whose cells are money amounts: Privacy hides what the file holds for them. */
export const MONEY_FIELDS: ReadonlySet<FieldKey> = new Set<FieldKey>([
  'pnl',
  'fees',
  'commission',
]);

// The trade log's columns: which exist, their names and the default set. No React: the CSV export reads them too.

export type ColumnId =
  | 'open'
  | 'close'
  | 'instrument'
  | 'account'
  | 'side'
  | 'qty'
  | 'entry'
  | 'exit'
  | 'gross'
  | 'fees'
  | 'net'
  | 'roi'
  | 'realizedR'
  | 'plannedR'
  | 'duration'
  | 'strategies'
  | 'tags'
  | 'mistakes'
  | 'rules'
  | 'rating'
  | 'reviewed'
  | 'status';

/** Every column, in the order the Columns menu lists the ones that are off. */
export const ALL_COLUMNS: readonly ColumnId[] = [
  'open',
  'close',
  'instrument',
  'account',
  'side',
  'qty',
  'entry',
  'exit',
  'gross',
  'fees',
  'net',
  'roi',
  'realizedR',
  'plannedR',
  'duration',
  'strategies',
  'tags',
  'mistakes',
  'rules',
  'rating',
  'reviewed',
  'status',
];

/**
 * Comp 01's columns. 'tags' shows the mistakes first, in the warn tone, then the
 * other tags in their category colour; 'mistakes' is the same mistakes alone, off by default.
 */
export const DEFAULT_COLUMNS: ColumnId[] = [
  'open',
  'instrument',
  'side',
  'qty',
  'entry',
  'exit',
  'net',
  'roi',
  'realizedR',
  'duration',
  'strategies',
  'tags',
  'rules',
  'rating',
  'reviewed',
];

/** A column header as the table shows it, and as the CSV does where it differs. */
export const COLUMN_LABELS: Record<ColumnId, { label: string; csv?: string }> =
  {
    open: { label: 'Open' },
    close: { label: 'Close' },
    instrument: { label: 'Instrument' },
    account: { label: 'Account' },
    side: { label: 'Side' },
    qty: { label: 'Qty' },
    entry: { label: 'Entry' },
    exit: { label: 'Exit' },
    gross: { label: 'Gross P&L', csv: 'Gross' },
    fees: { label: 'Fees' },
    net: { label: 'Net P&L', csv: 'Net' },
    roi: { label: 'Net ROI', csv: 'Net ROI %' },
    realizedR: { label: 'R', csv: 'Realized R' },
    plannedR: { label: 'Planned R' },
    duration: { label: 'Duration', csv: 'Duration (seconds)' },
    strategies: { label: 'Strategy', csv: 'Strategies' },
    tags: { label: 'Tags' },
    mistakes: { label: 'Mistake', csv: 'Mistakes' },
    rules: { label: 'Rules' },
    rating: { label: 'Rating' },
    reviewed: { label: 'Reviewed' },
    status: { label: 'Status' },
  };

const KNOWN = new Set<string>(ALL_COLUMNS);

/** A saved column list cleaned: unknown and repeated ids dropped; the default when none is left. */
export function sanitizeColumns(
  saved: readonly string[] | undefined,
): ColumnId[] {
  if (saved === undefined) return [...DEFAULT_COLUMNS];
  const seen = new Set<string>();
  const out: ColumnId[] = [];
  for (const id of saved) {
    if (KNOWN.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id as ColumnId);
    }
  }
  return out.length > 0 ? out : [...DEFAULT_COLUMNS];
}

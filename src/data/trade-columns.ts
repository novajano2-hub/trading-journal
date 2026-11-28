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
  | 'patterns'
  | 'rules'
  | 'rating'
  | 'reviewed'
  | 'status'
  | 'ticker'
  | 'day';

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
  'patterns',
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
  'patterns',
  'rules',
  'rating',
  'reviewed',
];

/**
 * The Day view's columns, as TradeZella's: Open time, Ticker, Side, Instrument
 * (the contract), Net P&L, Net ROI, Realized R, Strategy, Tags. No asset class.
 */
export const DAY_COLUMNS: ColumnId[] = [
  'open',
  'ticker',
  'side',
  'instrument',
  'net',
  'roi',
  'realizedR',
  'strategies',
  'tags',
];

/** The Week view's: the same, led by the trade's day. */
export const WEEK_COLUMNS: ColumnId[] = ['day', ...DAY_COLUMNS];

/**
 * Columns the Day and Week views offer beyond the trade log's. 'ticker' and
 * 'day' are not in ALL_COLUMNS, so the trade log's menu and CSV are unchanged.
 * 'patterns' is the All view's alone: TradeZella's Day and Week tables don't
 * show it, and a Day table has no patterns to count.
 */
export const DAY_CHOICES: readonly ColumnId[] = [
  ...ALL_COLUMNS.filter((id) => id !== 'patterns'),
  'ticker',
];
export const WEEK_CHOICES: readonly ColumnId[] = ['day', ...DAY_CHOICES];

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
    patterns: { label: 'Patterns' },
    rules: { label: 'Rules' },
    rating: { label: 'Rating' },
    reviewed: { label: 'Reviewed' },
    status: { label: 'Status' },
    ticker: { label: 'Ticker' },
    day: { label: 'Day' },
  };

const KNOWN = new Set<string>(ALL_COLUMNS);

/** A saved column list cleaned: unknown and repeated ids dropped; the default when none is left. */
export function sanitizeColumns(
  saved: readonly string[] | undefined,
  fallback: readonly ColumnId[] = DEFAULT_COLUMNS,
  known: ReadonlySet<string> = KNOWN,
): ColumnId[] {
  if (saved === undefined) return [...fallback];
  const seen = new Set<string>();
  const out: ColumnId[] = [];
  for (const id of saved) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id as ColumnId);
    }
  }
  return out.length > 0 ? out : [...fallback];
}

/** The Day view's saved columns, cleaned; its own default when none is left. */
export const sanitizeDayColumns = (saved: readonly string[] | undefined) =>
  sanitizeColumns(saved, DAY_COLUMNS, new Set<string>(DAY_CHOICES));

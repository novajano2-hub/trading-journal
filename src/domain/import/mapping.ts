import type { ParsedCsv } from './csv';
import { guessDateOrder, type DateOrder } from './fill-time';
import { matchColumns, normalizeHeader } from './guess-columns';
import type { DecimalMark } from './numbers';
import type { ResolveOptions } from '../instruments';

export type FillField =
  | 'date'
  | 'time'
  | 'symbol'
  | 'side'
  | 'qty'
  | 'price'
  | 'fees'
  | 'commission'
  | 'orderId';
export type TradeRowField =
  | 'openTime'
  | 'closeTime'
  | 'symbol'
  | 'side'
  | 'qty'
  | 'entryPrice'
  | 'exitPrice'
  | 'fees'
  | 'commission'
  | 'pnl';
export type InstrumentOverrides = NonNullable<ResolveOptions['overrides']>;

export interface MappingOptions {
  sourceTimeZone: string;
  dateOrder: DateOrder;
  decimal: DecimalMark;
  forexQtyUnit: 'lots' | 'units';
  overrides: InstrumentOverrides;
}

export type ImportMapping =
  | ({
      kind: 'fills';
      columns: Partial<Record<FillField, number>>;
    } & MappingOptions)
  | ({
      kind: 'closed-trades';
      columns: Partial<Record<TradeRowField, number>>;
    } & MappingOptions);

export const REQUIRED_FIELDS: {
  fills: readonly FillField[];
  'closed-trades': readonly TradeRowField[];
} = {
  fills: ['time', 'symbol', 'side', 'qty', 'price'],
  'closed-trades': [
    'openTime',
    'closeTime',
    'symbol',
    'side',
    'qty',
    'entryPrice',
    'exitPrice',
  ],
};

const FEES = ['fees', 'fee', 'total fees'];
const COMMISSION = ['commission', 'commissions', 'comm'];
const PNL = [
  'profit',
  'pnl',
  'p l',
  'net p l',
  'realized p l',
  'profit loss',
  'net profit',
];
const SYMBOL = [
  'symbol',
  'ticker',
  'instrument',
  'contract',
  'market',
  'product',
  'security',
];
const QTY = [
  'qty',
  'quantity',
  'size',
  'volume',
  'lots',
  'filled qty',
  'filled',
  'shares',
  'contracts',
];
const SIDE = ['side', 'action', 'buy sell', 'b s', 'direction'];

const FILL_FIELDS: readonly FillField[] = [
  'time',
  'symbol',
  'side',
  'qty',
  'price',
  'fees',
  'commission',
  'orderId',
];
const FILL_SYNONYMS: Record<FillField, readonly string[]> = {
  date: [],
  time: [
    'time',
    'date',
    'datetime',
    'date time',
    'timestamp',
    'fill time',
    'filled time',
    'execution time',
    'exec time',
    'trade time',
    'open time',
  ],
  symbol: SYMBOL,
  side: SIDE,
  qty: QTY,
  price: [
    'price',
    'fill price',
    'avg price',
    'avg fill price',
    'execution price',
    'exec price',
    'trade price',
  ],
  fees: FEES,
  commission: COMMISSION,
  orderId: ['order id', 'order number', 'order no'],
};

const CLOSE_TIME = [
  'close time',
  'exit time',
  'closed',
  'close date',
  'exit date',
  'date closed',
];
const EXIT_PRICE = [
  'exit price',
  'close price',
  'closing price',
  'avg exit',
  'exit',
];

// Exit-side fields come first so that a loose "time" or "price" synonym on the
// open side cannot claim a close column.
const TRADE_FIELDS: readonly TradeRowField[] = [
  'closeTime',
  'exitPrice',
  'openTime',
  'entryPrice',
  'symbol',
  'side',
  'qty',
  'fees',
  'commission',
  'pnl',
];
const TRADE_SYNONYMS: Record<TradeRowField, readonly string[]> = {
  closeTime: CLOSE_TIME,
  exitPrice: EXIT_PRICE,
  openTime: [
    'open time',
    'entry time',
    'opened',
    'open date',
    'entry date',
    'date opened',
    'time',
    'date',
    'datetime',
    'date time',
    'timestamp',
  ],
  entryPrice: [
    'entry price',
    'open price',
    'opening price',
    'avg entry',
    'entry',
    'price',
    'avg price',
  ],
  symbol: [...SYMBOL, 'item'],
  side: [...SIDE, 'type'],
  qty: QTY,
  fees: FEES,
  commission: COMMISSION,
  pnl: PNL,
};

function containsPhrase(header: string, phrase: string): boolean {
  return ` ${header} `.includes(` ${phrase} `);
}

function indexesOf(norm: readonly string[], value: string): number[] {
  const out: number[] = [];
  norm.forEach((h, i) => {
    if (h === value) out.push(i);
  });
  return out;
}

/** Blank the given columns so matching cannot claim them. */
function without(headers: readonly string[], skip: Set<number>): string[] {
  return headers.map((h, i) => (skip.has(i) ? '' : h));
}

function guessClosedTrades(headers: readonly string[], norm: string[]) {
  const columns: Partial<Record<TradeRowField, number>> = {};
  const skip = new Set<number>();
  // MetaTrader repeats "Time" and "Price": first is open/entry, second close/exit.
  const times = indexesOf(norm, 'time');
  if (times.length >= 2) {
    columns.openTime = times[0]!;
    columns.closeTime = times[1]!;
    times.forEach((i) => skip.add(i));
  }
  const prices = indexesOf(norm, 'price');
  if (prices.length >= 2) {
    columns.entryPrice = prices[0]!;
    columns.exitPrice = prices[1]!;
    prices.forEach((i) => skip.add(i));
  }
  const rest = matchColumns(
    without(headers, skip),
    TRADE_FIELDS,
    TRADE_SYNONYMS,
  );
  return { ...rest, ...columns };
}

function guessFills(headers: readonly string[], norm: string[]) {
  const date = norm.indexOf('date');
  const time = norm.indexOf('time');
  const columns: Partial<Record<FillField, number>> = {};
  const skip = new Set<number>();
  if (date >= 0 && time >= 0) {
    columns.date = date;
    columns.time = time;
    skip.add(date).add(time);
  }
  const rest = matchColumns(without(headers, skip), FILL_FIELDS, FILL_SYNONYMS);
  return { ...rest, ...columns };
}

/** Which decimal mark a numeric cell proves, if it proves one. */
function decimalEvidence(raw: string): DecimalMark | null {
  const s = raw.replace(/[^0-9.,]/g, '');
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) return dot > comma ? '.' : ',';
  const mark = dot >= 0 ? '.' : comma >= 0 ? ',' : null;
  if (mark === null) return null;
  const parts = s.split(mark);
  // Repeated marks with groups of three are thousands separators, not decimals.
  if (parts.length > 2) return null;
  return parts[1]!.length === 3 ? null : mark;
}

/**
 * Read the decimal mark off the numeric columns; when the data cannot decide
 * (no evidence, or both marks), fall back on the delimiter: ';' files are
 * usually European.
 */
function guessDecimal(
  parsed: ParsedCsv,
  columns: readonly (number | undefined)[],
): DecimalMark {
  let dot = false;
  let comma = false;
  for (const row of parsed.rows.slice(0, 50)) {
    for (const c of columns) {
      if (c === undefined) continue;
      const mark = decimalEvidence(row.cells[c] ?? '');
      if (mark === '.') dot = true;
      else if (mark === ',') comma = true;
    }
  }
  if (dot !== comma) return dot ? '.' : ',';
  return parsed.delimiter === ';' ? ',' : '.';
}

export function guessMapping(
  parsed: ParsedCsv,
  defaults: { sourceTimeZone: string; overrides?: InstrumentOverrides },
): ImportMapping {
  const { headers } = parsed;
  const norm = headers.map(normalizeHeader);
  const closed =
    norm.some((h) =>
      [...CLOSE_TIME, ...EXIT_PRICE].some((s) => containsPhrase(h, s)),
    ) ||
    indexesOf(norm, 'price').length >= 2 ||
    indexesOf(norm, 'time').length >= 2;

  const options = (
    timeColumn: number | undefined,
    numericColumns: readonly (number | undefined)[],
  ) => ({
    sourceTimeZone: defaults.sourceTimeZone,
    dateOrder:
      timeColumn === undefined
        ? ('mdy' as const)
        : guessDateOrder(
            parsed.rows.slice(0, 50).map((r) => r.cells[timeColumn] ?? ''),
          ),
    decimal: guessDecimal(parsed, numericColumns),
    forexQtyUnit: 'lots' as const,
    overrides: defaults.overrides ?? {},
  });

  if (closed) {
    const columns = guessClosedTrades(headers, norm);
    return {
      kind: 'closed-trades',
      columns,
      ...options(columns.openTime, [
        columns.entryPrice,
        columns.exitPrice,
        columns.qty,
        columns.fees,
        columns.commission,
      ]),
    };
  }
  const columns = guessFills(headers, norm);
  return {
    kind: 'fills',
    columns,
    ...options(columns.date ?? columns.time, [
      columns.price,
      columns.qty,
      columns.fees,
      columns.commission,
    ]),
  };
}

export function missingFields(mapping: ImportMapping): string[] {
  const required: readonly string[] = REQUIRED_FIELDS[mapping.kind];
  const columns: Record<string, number | undefined> = mapping.columns;
  return required.filter((f) => columns[f] === undefined);
}

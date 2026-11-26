import type { Cents, Execution, Side } from '../types';
import { toCents } from '../money';
import { canonicalSymbol } from '../trade-builder';
import type { ParsedCsv } from './csv';
import { fillTimeToUtc } from './fill-time';
import { normalizeSide } from './guess-columns';
import type { FillField, ImportMapping, TradeRowField } from './mapping';
import { parseDecimal } from './numbers';

export type RowIssueCode =
  | 'missing'
  | 'time-unparseable'
  | 'qty-invalid'
  | 'number-unparseable'
  | 'side-unrecognised'
  | 'close-before-open';

export interface RowIssue {
  rowIndex: number;
  field: FillField | TradeRowField;
  code: RowIssueCode;
  value: string;
}

export interface ImportedFill {
  rowIndex: number;
  execution: Execution;
  fingerprint: string;
}

export interface ImportedTrip {
  rowIndex: number;
  entry: Execution;
  exit: Execution;
  filePnl?: Cents;
  /** Overnight financing as the file gives it: signed, a charge is negative. */
  swap?: Cents;
  fingerprint: string;
}

const FILL_ORDER: readonly FillField[] = [
  'date',
  'time',
  'symbol',
  'side',
  'qty',
  'price',
  'fees',
  'commission',
  'orderId',
];
const TRADE_ORDER: readonly TradeRowField[] = [
  'openTime',
  'closeTime',
  'symbol',
  'side',
  'qty',
  'entryPrice',
  'exitPrice',
  'fees',
  'commission',
  'swap',
  'pnl',
];

class Rejected {
  constructor(
    readonly field: FillField | TradeRowField,
    readonly code: RowIssueCode,
    readonly value: string,
  ) {}
}

/** Reads one row's cells; a failing field throws a Rejected. */
class RowReader {
  constructor(
    private readonly cells: readonly string[],
    private readonly columns: Partial<Record<string, number>>,
    private readonly mapping: ImportMapping,
  ) {}

  mapped(field: string): boolean {
    return this.columns[field] !== undefined;
  }

  raw(field: string): string {
    const i = this.columns[field];
    return i === undefined ? '' : (this.cells[i] ?? '').trim();
  }

  required(field: FillField | TradeRowField): string {
    const v = this.raw(field);
    if (!v) throw new Rejected(field, 'missing', v);
    return v;
  }

  time(field: FillField | TradeRowField, text: string, shown: string): string {
    const iso = fillTimeToUtc(text, {
      timeZone: this.mapping.sourceTimeZone,
      dateOrder: this.mapping.dateOrder,
    });
    if (!iso) throw new Rejected(field, 'time-unparseable', shown);
    return iso;
  }

  side(): Side {
    const v = this.required('side');
    const s = normalizeSide(v);
    if (!s) throw new Rejected('side', 'side-unrecognised', v);
    return s;
  }

  number(field: FillField | TradeRowField): number {
    const v = this.required(field);
    const n = parseDecimal(v, this.mapping.decimal);
    if (n === null) throw new Rejected(field, 'number-unparseable', v);
    return n + 0; // (0.00) parses as -0
  }

  qty(side: Side): number {
    const v = this.required('qty');
    const n = parseDecimal(v, this.mapping.decimal);
    const size = n !== null && n < 0 && side === 'sell' ? -n : n;
    if (size === null || !(size > 0))
      throw new Rejected('qty', 'qty-invalid', v);
    return size;
  }

  /** A blank optional cost is 0; a cost is always a positive amount. */
  cost(field: 'fees' | 'commission'): Cents {
    if (!this.raw(field)) return 0;
    return toCents(Math.abs(this.number(field)));
  }
}

function fingerprintOf(parts: readonly (string | number)[]): string {
  return parts.join('|');
}

export function readRows(
  parsed: ParsedCsv,
  mapping: ImportMapping,
  ids: { importId: string; accountId: string },
): { fills: ImportedFill[]; trips: ImportedTrip[]; issues: RowIssue[] } {
  const fills: ImportedFill[] = [];
  const trips: ImportedTrip[] = [];
  const issues: RowIssue[] = [];

  for (const { rowIndex, cells } of parsed.rows) {
    const reader = new RowReader(cells, mapping.columns, mapping);
    try {
      if (mapping.kind === 'fills') {
        fills.push(readFill(reader, rowIndex, ids));
      } else {
        trips.push(readTrip(reader, rowIndex, ids));
      }
    } catch (e) {
      if (!(e instanceof Rejected)) throw e;
      issues.push({
        rowIndex,
        field: e.field,
        code: e.code,
        value: e.value,
      });
    }
  }
  return { fills, trips, issues };
}

function readFill(
  r: RowReader,
  rowIndex: number,
  ids: { importId: string; accountId: string },
): ImportedFill {
  // Fields are read in FILL_ORDER so the first failing one is the one reported.
  let time = '';
  let symbol = '';
  let side: Side = 'buy';
  let qty = 0;
  let price = 0;
  let fees = 0;
  let commission = 0;
  let orderId: string | undefined;
  let timeIso = '';
  for (const field of FILL_ORDER) {
    switch (field) {
      case 'date':
        if (r.mapped('date')) r.required('date');
        break;
      case 'time': {
        const t = r.required('time');
        time = r.mapped('date') ? `${r.raw('date')} ${t}` : t;
        timeIso = r.time('time', time, t);
        break;
      }
      case 'symbol':
        symbol = r.required('symbol');
        break;
      case 'side':
        side = r.side();
        break;
      case 'qty':
        qty = r.qty(side);
        break;
      case 'price':
        price = r.number('price');
        break;
      case 'fees':
        fees = r.cost('fees');
        break;
      case 'commission':
        commission = r.cost('commission');
        break;
      case 'orderId':
        orderId = r.raw('orderId') || undefined;
        break;
    }
  }
  const execution: Execution = {
    id: `${ids.importId}:r${rowIndex}`,
    accountId: ids.accountId,
    symbol,
    side,
    qty,
    price,
    time: timeIso,
    fees,
    commission,
  };
  if (orderId) execution.orderId = orderId;
  return {
    rowIndex,
    execution,
    fingerprint: fingerprintOf([
      canonicalSymbol(symbol),
      side,
      qty,
      price,
      timeIso,
      orderId ?? '',
    ]),
  };
}

function readTrip(
  r: RowReader,
  rowIndex: number,
  ids: { importId: string; accountId: string },
): ImportedTrip {
  let openIso = '';
  let closeIso = '';
  let symbol = '';
  let side: Side = 'buy';
  let qty = 0;
  let entryPrice = 0;
  let exitPrice = 0;
  let fees = 0;
  let commission = 0;
  let filePnl: Cents | undefined;
  let swap: Cents | undefined;
  for (const field of TRADE_ORDER) {
    switch (field) {
      case 'openTime': {
        const v = r.required('openTime');
        openIso = r.time('openTime', v, v);
        break;
      }
      case 'closeTime': {
        const v = r.required('closeTime');
        closeIso = r.time('closeTime', v, v);
        if (closeIso < openIso)
          throw new Rejected('closeTime', 'close-before-open', v);
        break;
      }
      case 'symbol':
        symbol = r.required('symbol');
        break;
      case 'side':
        side = r.side();
        break;
      case 'qty':
        qty = r.qty(side);
        break;
      case 'entryPrice':
        entryPrice = r.number('entryPrice');
        break;
      case 'exitPrice':
        exitPrice = r.number('exitPrice');
        break;
      case 'fees':
        fees = r.cost('fees');
        break;
      case 'commission':
        commission = r.cost('commission');
        break;
      case 'swap':
        // Signed, unlike a cost: a charge is negative, a credit positive.
        if (r.raw('swap')) swap = toCents(r.number('swap'));
        break;
      case 'pnl':
        if (r.raw('pnl')) filePnl = toCents(r.number('pnl'));
        break;
    }
  }
  const base = `${ids.importId}:r${rowIndex}`;
  const entry: Execution = {
    id: `${base}:entry`,
    accountId: ids.accountId,
    symbol,
    side,
    qty,
    price: entryPrice,
    time: openIso,
    fees,
    commission,
  };
  const exit: Execution = {
    id: `${base}:exit`,
    accountId: ids.accountId,
    symbol,
    side: side === 'buy' ? 'sell' : 'buy',
    qty,
    price: exitPrice,
    time: closeIso,
    fees: 0,
    commission: 0,
  };
  const trip: ImportedTrip = {
    rowIndex,
    entry,
    exit,
    fingerprint: fingerprintOf([
      'trip',
      canonicalSymbol(symbol),
      side,
      qty,
      entryPrice,
      exitPrice,
      openIso,
      closeIso,
    ]),
  };
  if (filePnl !== undefined) trip.filePnl = filePnl;
  if (swap !== undefined) trip.swap = swap;
  return trip;
}

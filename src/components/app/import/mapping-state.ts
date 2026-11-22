import { guessDateOrder } from '@/domain/import/fill-time';
import {
  applySavedMapping,
  guessMapping,
  type ImportMapping,
  type MappingOptions,
} from '@/domain/import/mapping';
import type { ParsedCsv } from '@/domain/import/csv';
import type { Account } from '@/domain/types';
import type { FieldKey } from './fields';

/** The mapping being edited, and what is known about where it came from. */
export interface MapState {
  /** The file and account it was opened for; a new key reopens it. */
  key: string;
  mapping: ImportMapping;
  /** Fields Keel matched itself, until the visitor changes them. */
  matched: readonly string[];
  /** Opened from the account's saved mapping. */
  usedSaved: boolean;
  /** Options the visitor set: a new guess leaves them alone. */
  touched: { dateOrder: boolean; decimal: boolean };
}

const UNTOUCHED = { dateOrder: false, decimal: false };

/** The mapping a file opens with: the account's saved one when it fits, else Keel's guess. */
export function openMapState(
  key: string,
  parsed: ParsedCsv,
  account: Account | undefined,
  userTimeZone: string,
): MapState {
  const saved = account?.importMapping
    ? applySavedMapping(account.importMapping, parsed.headers)
    : null;
  if (saved)
    return {
      key,
      mapping: saved,
      matched: Object.keys(saved.columns),
      usedSaved: true,
      touched: { dateOrder: true, decimal: true },
    };
  const mapping = guessMapping(parsed, {
    sourceTimeZone: account?.timeZone ?? userTimeZone,
  });
  return {
    key,
    mapping,
    matched: Object.keys(mapping.columns),
    usedSaved: false,
    touched: UNTOUCHED,
  };
}

/** The column that holds the first date and time, whose samples say how dates are written. */
export function timeColumn(mapping: ImportMapping): number | undefined {
  return mapping.kind === 'fills'
    ? (mapping.columns.date ?? mapping.columns.time)
    : mapping.columns.openTime;
}

/** Fills or closed trades: the columns are guessed again for the kind. */
export function withKind(
  state: MapState,
  parsed: ParsedCsv,
  kind: ImportMapping['kind'],
): MapState {
  const { mapping, touched } = state;
  if (mapping.kind === kind) return state;
  const guessed = guessMapping(parsed, {
    sourceTimeZone: mapping.sourceTimeZone,
    overrides: mapping.overrides,
    kind,
  });
  return {
    ...state,
    mapping: {
      ...guessed,
      forexQtyUnit: mapping.forexQtyUnit,
      dateOrder: touched.dateOrder ? mapping.dateOrder : guessed.dateOrder,
      decimal: touched.decimal ? mapping.decimal : guessed.decimal,
    },
    matched: Object.keys(guessed.columns),
    usedSaved: false,
  };
}

/** Points a field at a file column, or at none. */
export function withColumn(
  state: MapState,
  parsed: ParsedCsv,
  field: FieldKey,
  index: number | undefined,
): MapState {
  const columns: Record<string, number> = {};
  for (const [f, i] of Object.entries(state.mapping.columns))
    if (f !== field && i !== undefined) columns[f] = i;
  if (index !== undefined) columns[field] = index;
  const mapping = { ...state.mapping, columns } as ImportMapping;
  const column = timeColumn(mapping);
  return {
    ...state,
    mapping:
      !state.touched.dateOrder && column !== undefined
        ? {
            ...mapping,
            dateOrder: guessDateOrder(
              parsed.rows.slice(0, 50).map((r) => r.cells[column] ?? ''),
            ),
          }
        : mapping,
    matched: state.matched.filter((f) => f !== field),
    usedSaved: false,
  };
}

/** Sets options the visitor chose; date order and decimal mark then stay as set. */
export function withOptions(
  state: MapState,
  patch: Partial<MappingOptions>,
): MapState {
  return {
    ...state,
    mapping: { ...state.mapping, ...patch } as ImportMapping,
    touched: {
      dateOrder: state.touched.dateOrder || patch.dateOrder !== undefined,
      decimal: state.touched.decimal || patch.decimal !== undefined,
    },
  };
}

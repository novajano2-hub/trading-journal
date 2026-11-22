import { instrumentKey, resolveInstrument } from '../instruments';
import { canonicalSymbol } from '../trade-builder';
import type { ParsedCsv } from './csv';
import type { ImportMapping, InstrumentOverrides } from './mapping';

export interface UnknownRoot {
  /** The key a point value is remembered under: the futures root. */
  key: string;
  /** The symbols the file writes for it, in file order. */
  symbols: string[];
  /** Rows that trade it. */
  rows: number;
}

/**
 * The futures roots in the file that Keel has no point value for. `known` holds
 * the values remembered from earlier imports; the mapping's own overrides are
 * left out, so a root stays listed while its value is being typed.
 */
export function unknownRoots(
  parsed: ParsedCsv,
  mapping: ImportMapping,
  known: InstrumentOverrides,
): UnknownRoot[] {
  const column = mapping.columns.symbol;
  if (column === undefined) return [];
  const roots = new Map<string, UnknownRoot>();
  for (const { cells } of parsed.rows) {
    const symbol = cells[column] ?? '';
    if (!symbol) continue;
    const key = instrumentKey(symbol);
    // Only a futures-pattern symbol can take a point value: its key is the root.
    if (key === canonicalSymbol(symbol)) continue;
    if (
      resolveInstrument(symbol, {
        forexQtyUnit: mapping.forexQtyUnit,
        overrides: known,
      })
    )
      continue;
    const root = roots.get(key) ?? { key, symbols: [], rows: 0 };
    root.rows += 1;
    if (!root.symbols.includes(symbol)) root.symbols.push(symbol);
    roots.set(key, root);
  }
  return [...roots.values()];
}

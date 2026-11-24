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
  /** The tick size its prices suggest: the last decimal they write (0.0005 for four decimals ending in 0 or 5). */
  tickSize: number;
}

/** The price columns a mapping reads. */
function priceColumns(mapping: ImportMapping): number[] {
  const c: Record<string, number | undefined> = mapping.columns;
  return (
    mapping.kind === 'fills' ? [c.price] : [c.entryPrice, c.exitPrice]
  ).filter((i): i is number => i !== undefined);
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
  const prices = priceColumns(mapping);
  const mark = mapping.decimal.replace('.', '\\.');
  const places = new RegExp(`${mark}(\\d+)$`);
  const roots = new Map<
    string,
    UnknownRoot & { places: number; halves: boolean }
  >();
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
    const root = roots.get(key) ?? {
      key,
      symbols: [],
      rows: 0,
      tickSize: 0.01,
      places: 0,
      halves: true,
    };
    root.rows += 1;
    for (const p of prices) {
      const digits = places.exec((cells[p] ?? '').trim())?.[1] ?? '';
      root.places = Math.max(root.places, Math.min(digits.length, 8));
      // A price written short ("4.2") reads as if padded with zeros.
      if (!'05'.includes(digits.padEnd(4, '0')[3]!)) root.halves = false;
    }
    if (!root.symbols.includes(symbol)) root.symbols.push(symbol);
    roots.set(key, root);
  }
  return [...roots.values()].map(({ places: n, halves, ...root }) => ({
    ...root,
    tickSize:
      n === 4 && halves ? 0.0005 : prices.length === 0 ? 0.01 : 10 ** -n,
  }));
}

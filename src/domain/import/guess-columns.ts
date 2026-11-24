import { FILL_SYNONYMS } from './mapping';

export type PreviewField = 'time' | 'symbol' | 'side' | 'qty' | 'price';

const FIELDS: readonly PreviewField[] = [
  'time',
  'symbol',
  'side',
  'qty',
  'price',
];

const BUY = new Set([
  'buy',
  'b',
  'bot',
  'bought',
  'long',
  'buy to open',
  'buy to close',
]);
const SELL = new Set([
  'sell',
  's',
  'sld',
  'sold',
  'short',
  'sell short',
  'sell to open',
  'sell to close',
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeHeader(value: string): string {
  return normalize(value);
}

/**
 * Match each field to a header column. Exact synonym matches win over
 * "contains" matches, and a column maps to at most one field.
 */
export function matchColumns<F extends string>(
  headers: readonly string[],
  fields: readonly F[],
  synonyms: Readonly<Record<F, readonly string[]>>,
): Partial<Record<F, number>> {
  const norm = headers.map(normalize);
  const result: Partial<Record<F, number>> = {};
  const used = new Set<number>();

  const pass = (matches: (header: string, synonym: string) => boolean) => {
    for (const field of fields) {
      if (result[field] !== undefined) continue;
      const index = norm.findIndex(
        (h, i) =>
          !used.has(i) && synonyms[field].some((syn) => matches(h, syn)),
      );
      if (index >= 0) {
        result[field] = index;
        used.add(index);
      }
    }
  };

  pass((h, syn) => h === syn);
  pass((h, syn) => ` ${h} `.includes(` ${syn} `));
  return result;
}

/** Guess which column holds each preview field. */
export function guessColumns(
  headers: readonly string[],
): Partial<Record<PreviewField, number>> {
  // The one synonym list lives in mapping.ts.
  return matchColumns(headers, FIELDS, FILL_SYNONYMS);
}

export function normalizeSide(value: string): 'buy' | 'sell' | null {
  const v = normalize(value);
  if (BUY.has(v)) return 'buy';
  if (SELL.has(v)) return 'sell';
  return null;
}

export type PreviewField = 'time' | 'symbol' | 'side' | 'qty' | 'price';

const FIELDS: readonly PreviewField[] = ['time', 'symbol', 'side', 'qty', 'price'];

const SYNONYMS: Record<PreviewField, readonly string[]> = {
  time: ['time', 'date', 'datetime', 'date time', 'timestamp', 'fill time', 'filled time', 'execution time', 'exec time', 'trade time', 'open time'],
  symbol: ['symbol', 'ticker', 'instrument', 'contract', 'market', 'product', 'security'],
  side: ['side', 'action', 'buy sell', 'b s', 'direction'],
  qty: ['qty', 'quantity', 'size', 'volume', 'lots', 'filled qty', 'filled', 'shares', 'contracts'],
  price: ['price', 'fill price', 'avg price', 'avg fill price', 'execution price', 'exec price', 'trade price'],
};

const BUY = new Set(['buy', 'b', 'bot', 'bought', 'long', 'buy to open', 'buy to close']);
const SELL = new Set(['sell', 's', 'sld', 'sold', 'short', 'sell short', 'sell to open', 'sell to close']);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Guess which column holds each preview field. Exact synonym matches win over "contains" matches. */
export function guessColumns(headers: readonly string[]): Partial<Record<PreviewField, number>> {
  const norm = headers.map(normalize);
  const result: Partial<Record<PreviewField, number>> = {};
  const used = new Set<number>();

  const pass = (matches: (header: string, synonym: string) => boolean) => {
    for (const field of FIELDS) {
      if (result[field] !== undefined) continue;
      const index = norm.findIndex(
        (h, i) => !used.has(i) && SYNONYMS[field].some((syn) => matches(h, syn)),
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

export function normalizeSide(value: string): 'buy' | 'sell' | null {
  const v = normalize(value);
  if (BUY.has(v)) return 'buy';
  if (SELL.has(v)) return 'sell';
  return null;
}

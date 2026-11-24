/**
 * Price ranges for the entry-price and exit-price breakdowns, cut to suit the
 * prices in the set. A bucket holds a price from its `from` up to, not
 * including, its `to`; the key `from_to` carries both, so a link can say the
 * same span the bucket counted.
 *
 * The rule, in two cases:
 * - Prices within a factor of 30 of each other (one asset class, in practice:
 *   stocks, or index futures, or one forex pair) get linear ranges: the
 *   smallest round step (1, 2, 2.5 or 5 times a power of ten) that makes no
 *   more than eight ranges, edges on multiples of the step.
 * - A wider spread (stocks with futures, forex with anything) gets log-scale
 *   ranges, since one linear step would put all the forex in the first bucket.
 *   Edges are 1, 2 and 5 times a power of ten; with more than eight ranges
 *   that way, 1 and 3; and past that, powers of ten.
 * Zero and negative prices have no place on either scale and file nowhere.
 */
export interface PriceBucket {
  key: string;
  from: number;
  to: number;
  label: string;
}

const MAX_BUCKETS = 8;
/** The widest spread (highest over lowest) that still reads on a linear scale. */
const LINEAR_RATIO = 30;

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });

/** "1,000-2,500", with a hyphen. */
export function priceLabel(from: number, to: number): string {
  return `${grouped.format(from)}-${grouped.format(to)}`;
}

const places = (step: number) => Math.max(0, 2 - Math.floor(Math.log10(step)));
const tidy = (n: number, dp: number) => Number(n.toFixed(Math.min(dp, 12)));

function linearEdges(lo: number, hi: number): number[] {
  const span = hi > lo ? hi - lo : hi / 10;
  const start = Math.floor(Math.log10(span / 8)) - 1;
  for (let exp = start; exp < start + 12; exp++) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = tidy(m * 10 ** exp, 12);
      const dp = places(step);
      const first = Math.floor(tidy(lo / step, 9));
      const last = Math.floor(tidy(hi / step, 9)) + 1;
      if (last - first > MAX_BUCKETS) continue;
      return Array.from({ length: last - first + 1 }, (_, i) =>
        tidy((first + i) * step, dp),
      );
    }
  }
  return [lo, hi];
}

function logEdges(lo: number, hi: number): number[] {
  const low = Math.floor(Math.log10(lo));
  const high = Math.floor(Math.log10(hi));
  let edges: number[] = [];
  for (const seq of [[1, 2, 5], [1, 3], [1]]) {
    const all: number[] = [];
    for (let d = low - 1; d <= high + 1; d++)
      for (const m of seq) all.push(tidy(m * 10 ** d, Math.max(0, 8 - d)));
    const below = all.filter((e) => e <= lo);
    const above = all.filter((e) => e > hi);
    edges = all.filter((e) => e >= below[below.length - 1]! && e <= above[0]!);
    if (edges.length - 1 <= MAX_BUCKETS) break;
  }
  return edges;
}

/** The ranges that cover `prices`, ascending, empty ones between included. */
export function priceBuckets(prices: readonly number[]): PriceBucket[] {
  const usable = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (usable.length === 0) return [];
  const lo = Math.min(...usable);
  const hi = Math.max(...usable);
  const edges = hi / lo > LINEAR_RATIO ? logEdges(lo, hi) : linearEdges(lo, hi);
  return edges.slice(0, -1).map((from, i) => {
    const to = edges[i + 1]!;
    return { key: `${from}_${to}`, from, to, label: priceLabel(from, to) };
  });
}

/** The key of the range holding `price`; undefined for a price no range holds. */
export function priceKeyOf(
  price: number,
  buckets: readonly PriceBucket[],
): string | undefined {
  if (!Number.isFinite(price) || price <= 0) return undefined;
  return buckets.find((b) => price >= b.from && price < b.to)?.key;
}

/** The span a range key holds, or null for a key that is not one. */
export function priceSpan(key: string): { from: number; to: number } | null {
  const [a, b, ...rest] = key.split('_');
  if (a === undefined || b === undefined || rest.length > 0) return null;
  const from = Number(a);
  const to = Number(b);
  return Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > from
    ? { from, to }
    : null;
}

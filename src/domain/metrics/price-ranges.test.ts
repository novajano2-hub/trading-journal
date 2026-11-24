import { describe, expect, test } from 'vitest';
import { priceBuckets, priceKeyOf, priceLabel } from './price-ranges';

const spread = (lo: number, hi: number, n = 200) =>
  Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

const check = (prices: number[]) => {
  const buckets = priceBuckets(prices);
  expect(buckets.length).toBeGreaterThanOrEqual(1);
  // Contiguous, ascending, and every price falls in exactly one bucket.
  buckets.forEach((b, i) => {
    expect(b.to).toBeGreaterThan(b.from);
    if (i > 0) expect(b.from).toBe(buckets[i - 1]!.to);
  });
  for (const p of prices) {
    const key = priceKeyOf(p, buckets);
    expect(key, String(p)).toBeDefined();
    expect(buckets.filter((b) => p >= b.from && p < b.to)).toHaveLength(1);
  }
  return buckets;
};

describe('price ranges suit the prices in the set', () => {
  test('stocks from 20 to 400 get five to eight round ranges', () => {
    const b = check(spread(20, 400));
    expect(b.length).toBeGreaterThanOrEqual(5);
    expect(b.length).toBeLessThanOrEqual(8);
    expect(b[0]!.from).toBeLessThanOrEqual(20);
    expect(b.map((x) => x.from).every((e) => e % 50 === 0)).toBe(true);
  });

  test('stocks in a narrow band get finer ranges', () => {
    const b = check(spread(180, 215));
    expect(b.length).toBeGreaterThanOrEqual(5);
    expect(b.length).toBeLessThanOrEqual(8);
  });

  test('index futures from 4,300 to 5,400 get ranges in hundreds', () => {
    const b = check(spread(4300, 5400));
    expect(b.length).toBeGreaterThanOrEqual(5);
    expect(b.length).toBeLessThanOrEqual(8);
    expect(b.every((x) => x.from % 100 === 0 && x.to % 100 === 0)).toBe(true);
  });

  test('forex from 1.05 to 1.12 gets ranges in hundredths', () => {
    const b = check(spread(1.05, 1.12));
    expect(b.length).toBeGreaterThanOrEqual(5);
    expect(b.length).toBeLessThanOrEqual(8);
    expect(b[0]!.from).toBe(1.05);
    // No float noise in an edge.
    expect(b.every((x) => Number(x.from.toFixed(4)) === x.from)).toBe(true);
  });

  test('a set that mixes forex, stocks and futures uses log-scale edges', () => {
    const prices = [1.08, 1.1, 150.2, 98.5, 412, 4400, 4980, 18250, 19100];
    const b = check(prices);
    expect(b.length).toBeLessThanOrEqual(8);
    // Forex does not share a bucket with futures.
    expect(priceKeyOf(1.08, b)).not.toBe(priceKeyOf(4400, b));
    expect(priceKeyOf(412, b)).not.toBe(priceKeyOf(4400, b));
    // Edges are powers of ten times 1, 2, 3 or 5.
    for (const e of b.map((x) => x.from)) {
      const m = e / 10 ** Math.floor(Math.log10(e));
      expect([1, 2, 3, 5]).toContain(Math.round(m * 1e6) / 1e6);
    }
  });

  test('two decades of stock prices use 1-2-5 edges', () => {
    const b = check(spread(4, 450));
    expect(b.map((x) => x.from)).toEqual([2, 5, 10, 20, 50, 100, 200]);
    expect(b[b.length - 1]!.to).toBe(500);
  });

  test('one price gives one range around it', () => {
    const b = check([123.4, 123.4]);
    expect(b).toHaveLength(1);
  });

  test('no usable price gives no ranges; zero and negative prices file nowhere', () => {
    expect(priceBuckets([])).toEqual([]);
    expect(priceBuckets([0, -3, Number.NaN])).toEqual([]);
    const b = priceBuckets([10, 20]);
    expect(priceKeyOf(0, b)).toBeUndefined();
    expect(priceKeyOf(-5, b)).toBeUndefined();
  });

  test('an edge belongs to the range above it', () => {
    const b = priceBuckets([100, 200, 300, 400, 500]);
    const key = priceKeyOf(300, b)!;
    expect(b.find((x) => x.key === key)!.from).toBe(300);
  });

  test('labels use a hyphen and group thousands', () => {
    expect(priceLabel(1000, 2500)).toBe('1,000-2,500');
    expect(priceLabel(1.05, 1.06)).toBe('1.05-1.06');
  });
});

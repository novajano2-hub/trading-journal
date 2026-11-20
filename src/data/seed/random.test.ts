import { describe, expect, test } from 'vitest';
import { createRandom } from './random';

describe('createRandom (mulberry32)', () => {
  test('the same seed gives the same first 1,000 values, all in [0, 1)', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const xs = Array.from({ length: 1000 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.next()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const c = createRandom(43);
    expect(Array.from({ length: 1000 }, () => c.next())).not.toEqual(xs);
  });

  test('int is inclusive at both ends', () => {
    const r = createRandom(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
    expect(r.int(5, 5)).toBe(5);
  });

  test('pick, chance and around stay in range', () => {
    const r = createRandom(9);
    const xs = ['a', 'b', 'c'] as const;
    expect(xs).toContain(r.pick(xs));
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
    for (let i = 0; i < 500; i++) {
      const v = r.around(10, 2);
      expect(v).toBeGreaterThanOrEqual(8);
      expect(v).toBeLessThanOrEqual(12);
    }
  });
});

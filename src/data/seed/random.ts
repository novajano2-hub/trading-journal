export interface Random {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  /** mean + spread × (sum of four next() − 2) / 2: bell-shaped within mean ± spread, using no transcendental functions. */
  around(mean: number, spread: number): number;
}

/** mulberry32: integer arithmetic only, so every engine produces the same stream. */
export function createRandom(seed: number): Random {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => {
      const x = xs[Math.floor(next() * xs.length)];
      if (x === undefined) throw new Error('pick from an empty list');
      return x;
    },
    chance: (p) => next() < p,
    around: (mean, spread) =>
      mean + (spread * (next() + next() + next() + next() - 2)) / 2,
  };
}

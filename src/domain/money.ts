import type { Cents } from './types';

const EPS = 1e-6;

/** Round to the nearest integer; ties (within float tolerance) go to even. */
export function roundHalfEven(x: number): number {
  const nearest = Math.round(x);
  if (Math.abs(x - nearest) < EPS) return nearest;
  const floor = Math.floor(x);
  const frac = x - floor;
  if (Math.abs(frac - 0.5) < EPS) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(x);
}

/** Major units to integer cents, half-even. */
export function toCents(amount: number): Cents {
  return roundHalfEven(amount * 100);
}

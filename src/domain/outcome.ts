import type { Cents } from './types';

/** Classify a net result against the breakeven threshold (inclusive band). */
export function outcomeOf(net: Cents, threshold: Cents): 'win' | 'loss' | 'breakeven' {
  return net > threshold ? 'win' : net < -threshold ? 'loss' : 'breakeven';
}

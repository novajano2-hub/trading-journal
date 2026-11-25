import type { Account, Challenge, Trade } from '@/domain/types';

export interface GettingStarted {
  steps: { id: 'prop' | 'challenge' | 'trade'; done: boolean }[];
  done: number;
  total: 3;
}

/**
 * Home's checklist, computed from the active workspace's rows (K50).
 * prop: a prop-evaluation or prop-funded account, or any challenge.
 * challenge: a challenge. trade: any trade.
 */
export function gettingStarted(
  accounts: readonly Account[],
  challenges: readonly Challenge[],
  trades: readonly Trade[],
): GettingStarted {
  const hasChallenge = challenges.length > 0;
  const steps: GettingStarted['steps'] = [
    {
      id: 'prop',
      done:
        hasChallenge ||
        accounts.some(
          (a) => a.type === 'prop-evaluation' || a.type === 'prop-funded',
        ),
    },
    { id: 'challenge', done: hasChallenge },
    { id: 'trade', done: trades.length > 0 },
  ];
  return { steps, done: steps.filter((s) => s.done).length, total: 3 };
}

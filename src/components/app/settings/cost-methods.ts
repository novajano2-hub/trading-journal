import type { Account, CostMethod } from '@/domain/types';

/**
 * The three ways an exit picks the lots it closes (C39), in the order the Edit
 * account dialog lists them: FIFO first, the default. Keel's own wording.
 */
export const COST_METHODS: readonly {
  value: CostMethod;
  /** The radio's label. */
  label: string;
  /** The radio's one line under it. */
  line: string;
  /** What the table and a phone row's second line read. */
  short: string;
  /** What a sentence calls it: "Switch to LIFO", "Switch to weighted average". */
  named: string;
}[] = [
  {
    value: 'fifo',
    label: 'FIFO, first in first out',
    line: 'An exit closes the oldest open lot first. The default.',
    short: 'FIFO',
    named: 'FIFO',
  },
  {
    value: 'lifo',
    label: 'LIFO, last in first out',
    line: 'An exit closes the newest open lot first.',
    short: 'LIFO',
    named: 'LIFO',
  },
  {
    value: 'average',
    label: 'Weighted average',
    line: 'An exit closes at the average cost of every lot held.',
    short: 'Average',
    named: 'weighted average',
  },
];

/** The account's method; unset reads FIFO (C39). */
export const methodOf = (account: Pick<Account, 'costMethod'>): CostMethod =>
  account.costMethod ?? 'fifo';

/** The entry for a method; the list always holds all three. */
export const costMethodInfo = (method: CostMethod) =>
  COST_METHODS.find((m) => m.value === method) ?? COST_METHODS[0]!;

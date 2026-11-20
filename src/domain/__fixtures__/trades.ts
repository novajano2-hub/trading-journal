import { resolveInstrument } from '../instruments';
import type { Cents, Trade } from '../types';

let counter = 0;

/** Test-only: a fully valid closed ES long; gross = net + fees (fees 0 by default). Overrides win. */
export function makeTrade(p: Partial<Trade> & { net: Cents }): Trade {
  counter += 1;
  const base: Trade = {
    id: `t-${counter}`,
    serial: 1,
    workspaceId: 'w',
    accountId: 'a1',
    instrument: resolveInstrument('ESZ5')!,
    direction: 'long',
    status: 'closed',
    openedAt: '2026-03-02T15:00:00Z',
    closedAt: '2026-03-02T15:05:00Z',
    executions: [],
    avgEntry: 4500,
    avgExit: 4500,
    maxPosition: 1,
    pnlCurrency: 'USD',
    gross: p.net + (p.fees ?? 0),
    fees: 0,
    tagIds: [],
    ruleChecks: [],
    ...p,
  };
  if (p.status === 'open' && p.closedAt === undefined) delete base.closedAt;
  return base;
}

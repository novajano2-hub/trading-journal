// Test-only: a workspace in which patterns fire. Closed ES longs in account
// `acc-a`, read in UTC (the tests set the zone):
//   Mon 2 Nov  q-1 -3000  15:00:00-15:10:00
//              q-2 -2000  15:10:20-15:20:00  entered in two fills (Added to the position),
//                                           20 s after q-1 closed (Loss after a loss)
//              q-3 -1000  15:20:30-15:30:00  30 s after q-2 closed (Loss after a loss)
//              The day: two losses entered within a minute of a loss (Quick re-entries after a loss).
//   Tue 3 Nov  q-4 +5000  15:00:00-15:30:00  no pattern, on a day with none.
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { Execution, Trade } from '@/domain/types';

const trade = (
  id: number,
  openedAt: string,
  closedAt: string,
  net: number,
  extra: Partial<Trade> = {},
): Trade =>
  makeTrade({
    id: `q-${id}`,
    serial: id,
    workspaceId: SAMPLE_WORKSPACE.id,
    accountId: 'acc-a',
    net,
    gross: net,
    fees: 0,
    openedAt,
    closedAt,
    ruleChecks: [],
    ...extra,
  });

/** Two half-size entries and one exit: size 1 in all, so Large size stays quiet. */
function inTwoFills(
  id: string,
  openedAt: string,
  closedAt: string,
): Execution[] {
  const fill = (
    n: number,
    side: 'buy' | 'sell',
    qty: number,
    time: string,
  ): Execution => ({
    id: `${id}-e${n}`,
    accountId: 'acc-a',
    symbol: 'ESZ5',
    side,
    qty,
    price: 4500,
    time,
    fees: 0,
    commission: 0,
  });
  const second = new Date(Date.parse(openedAt) + 60_000).toISOString();
  return [
    fill(1, 'buy', 0.5, openedAt),
    fill(2, 'buy', 0.5, second),
    fill(3, 'sell', 1, closedAt),
  ];
}

export function patternsReportSample(): SampleWorkspace {
  const s = fixtureSample();
  s.trades = [
    trade(1, '2026-11-02T15:00:00Z', '2026-11-02T15:10:00Z', -3000),
    trade(2, '2026-11-02T15:10:20Z', '2026-11-02T15:20:00Z', -2000, {
      executions: inTwoFills(
        'q-2',
        '2026-11-02T15:10:20Z',
        '2026-11-02T15:20:00Z',
      ),
    }),
    trade(3, '2026-11-02T15:20:30Z', '2026-11-02T15:30:00Z', -1000),
    trade(4, '2026-11-03T15:00:00Z', '2026-11-03T15:30:00Z', 5000),
  ];
  s.journal = [];
  s.days = [];
  return s;
}

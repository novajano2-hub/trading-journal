// Test-only: a small workspace for the reports tests, nine closed trades over
// four New York days (Mon 2 to Thu 5 Nov 2026), five long and four short.
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import { makeTrade } from '@/domain/__fixtures__/trades';

export const REPORT_TRADES: [
  date: string,
  direction: 'long' | 'short',
  net: number,
][] = [
  ['2026-11-02', 'long', 10000],
  ['2026-11-02', 'short', -4000],
  ['2026-11-03', 'long', 7000],
  ['2026-11-03', 'short', 3000],
  ['2026-11-04', 'long', -6000],
  ['2026-11-04', 'short', -2000],
  ['2026-11-05', 'short', 5000],
  ['2026-11-05', 'long', -1000],
  ['2026-11-05', 'long', 500],
];

export async function reportsSample(): Promise<SampleWorkspace> {
  const s = fixtureSample();
  const base = s.trades[0]!;
  s.trades = REPORT_TRADES.map(([date, direction, net], i) =>
    makeTrade({
      ...base,
      id: `r-${i}`,
      serial: i + 1,
      accountId: 'acc-a',
      direction,
      net,
      gross: net,
      fees: 0,
      openedAt: `${date}T15:00:00Z`,
      closedAt: `${date}T16:00:00Z`,
      ruleChecks: [],
      tagIds: [],
      strategyIds: [],
    }),
  );
  s.journal = [];
  return s;
}

// Test-only: a workspace for the breakdown reports. Closed trades in New York
// time (UTC-5 in November), over ES, NQ, SPY options and one option with no expiry:
//   b-1 ES long   +10000  10:05-10:50 Mon 2 Nov  str-1, tag-setup, 2R, size 2
//   b-2 ES short   -4000  11:20-11:40 Mon 2 Nov  no strategy, tag-fomo, -1R
//   b-3 NQ long    +7000  10:35-11:10 Tue 3 Nov  str-1 and str-2
//   b-4 NQ short   -2000  13:00-13:20 Tue 3 Nov  no strategy
//   b-5 SPY 0DTE   +3000  10:00-10:30 Wed 4 Nov  expires that day
//   b-6 SPY 5 days -1000  10:00-10:30 Wed 4 Nov  expires Mon 9 Nov
//   b-7 SPY option, no expiry -500
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import type { Trade } from '@/domain/types';

const spy = (symbol: string) => resolveInstrument(symbol)!;
const noExpiry = (() => {
  const i = { ...spy('SPY261109C00500000') };
  delete i.expiry;
  return i;
})();

export async function breakdownSample(): Promise<SampleWorkspace> {
  const s = fixtureSample();
  const day = (d: string, from: string, to: string) => ({
    openedAt: `${d}T${from}:00Z`,
    closedAt: `${d}T${to}:00Z`,
  });
  const t = (id: number, p: Partial<Trade> & { net: number }): Trade =>
    makeTrade({
      id: `b-${id}`,
      serial: id,
      workspaceId: SAMPLE_WORKSPACE.id,
      accountId: 'acc-a',
      fees: 0,
      gross: p.net,
      ruleChecks: [],
      ...p,
    });
  s.strategies.push({
    ...s.strategies[0]!,
    id: 'str-2',
    name: 'Pullback',
  });
  s.trades = [
    t(1, {
      net: 10000,
      instrument: resolveInstrument('ESZ5')!,
      ...day('2026-11-02', '15:05', '15:50'),
      strategyIds: ['str-1'],
      tagIds: ['tag-setup'],
      initialRisk: 5000,
      plannedStop: 4490,
      plannedTarget: 4520,
      mae: -2000,
      mfe: 12000,
      maxPosition: 2,
    }),
    t(2, {
      net: -4000,
      direction: 'short',
      instrument: resolveInstrument('ESZ5')!,
      ...day('2026-11-02', '16:20', '16:40'),
      tagIds: ['tag-fomo'],
      initialRisk: 4000,
    }),
    t(3, {
      net: 7000,
      instrument: resolveInstrument('NQZ5')!,
      ...day('2026-11-03', '15:35', '16:10'),
      strategyIds: ['str-1', 'str-2'],
    }),
    t(4, {
      net: -2000,
      direction: 'short',
      instrument: resolveInstrument('NQZ5')!,
      ...day('2026-11-03', '18:00', '18:20'),
    }),
    t(5, {
      net: 3000,
      instrument: spy('SPY261104C00500000'),
      ...day('2026-11-04', '15:00', '15:30'),
    }),
    t(6, {
      net: -1000,
      instrument: spy('SPY261109C00500000'),
      ...day('2026-11-04', '15:00', '15:30'),
    }),
    t(7, {
      net: -500,
      instrument: noExpiry,
      ...day('2026-11-04', '15:00', '15:30'),
    }),
  ];
  s.journal = [];
  return s;
}

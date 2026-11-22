// Test-only: the tiny sample workspace shaped for Dashboard tests.
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import type { Trade } from '@/domain/types';

type Patch = Partial<Trade>;

const GRADED: Record<string, Patch> = {
  'f-1': {
    net: -40_000,
    gross: -39_500,
    fees: 500,
    closedAt: '2026-11-19T15:00:00.000Z',
    strategyIds: ['str-1'],
    ruleChecks: [
      { ruleId: 'r-1', followed: false },
      { ruleId: 'r-2', followed: true },
    ],
    tagIds: ['tag-fomo'],
  },
  'f-2': {
    net: 60_000,
    gross: 60_500,
    fees: 500,
    closedAt: '2026-11-18T15:00:00.000Z',
    strategyIds: ['str-1'],
    ruleChecks: [
      { ruleId: 'r-1', followed: true },
      { ruleId: 'r-2', followed: true },
    ],
    tagIds: [],
  },
};

/**
 * `fixtureSample()` with `f-1` a −$400 FOMO loss that broke `r-1` and `f-2` a
 * +$600 win that kept both rules. Ungraded (`graded: false`), both carry no
 * strategy and no checks, as every import starts. Fresh objects on every call.
 */
export function dashboardFixture(
  opts: { graded?: boolean } = {},
): SampleWorkspace {
  const graded = opts.graded ?? true;
  const fx = fixtureSample();
  return {
    ...fx,
    trades: fx.trades.map((t) => {
      const patch = GRADED[t.id];
      if (!patch) return t;
      const next: Trade = { ...t, ...patch };
      if (!graded) {
        next.strategyIds = [];
        next.ruleChecks = [];
      }
      return next;
    }),
  };
}

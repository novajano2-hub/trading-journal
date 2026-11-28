import { beforeAll, describe, expect, test } from 'vitest';
import { computePatterns, PATTERNS, type PatternEnv } from '@/domain/patterns';
import { dayOfTrade } from './day-log';
import { applyFilters, EMPTY_FILTERS, type FilterEnv } from './filters';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from './seed/generate';

const NY = 'America/New_York';

let s: SampleWorkspace;
let patternEnv: PatternEnv;
let env: FilterEnv;
beforeAll(() => {
  s = generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' });
  patternEnv = {
    timeZone: NY,
    breakevenRange: { unit: 'amount', from: 0, to: 0 },
    sessions: new Map(
      s.days.flatMap((d) => (d.session ? [[d.id, d.session] as const] : [])),
    ),
  };
  env = { timeZone: NY, today: '2026-11-20', accounts: s.accounts };
}, 30_000);

describe('the Patterns filter on the sample workspace', () => {
  test('a pick keeps the trades where it fired, and a day pattern the trades of its days', () => {
    const patterns = computePatterns(s.trades, patternEnv);
    const active = new Set(s.accounts.map((a) => a.id));
    const everyTrade = s.trades.filter((t) => active.has(t.accountId));
    const keep = (ids: Parameters<typeof applyFilters>[1]['patterns']) =>
      applyFilters(
        s.trades,
        { ...EMPTY_FILTERS, patterns: ids },
        { ...env, patterns },
      );

    const tradeLevel = PATTERNS.find((p) => p.level === 'trade')!.id;
    const kept = keep([tradeLevel]);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(everyTrade.length);
    for (const t of kept)
      expect(patterns.byTrade.get(t.id)?.some((h) => h.id === tradeLevel)).toBe(
        true,
      );

    const dayLevel = PATTERNS.find(
      (p) =>
        p.level === 'day' &&
        [...patterns.byDay.values()].some((hits) =>
          hits.some((h) => h.id === p.id),
        ),
    )!.id;
    const days = new Set(
      [...patterns.byDay]
        .filter(([, hits]) => hits.some((h) => h.id === dayLevel))
        .map(([date]) => date),
    );
    const byDay = keep([dayLevel]);
    expect(byDay.length).toBeGreaterThan(0);
    // Exactly the trades dated to those days, none more and none fewer.
    expect(byDay.map((t) => t.id).sort()).toEqual(
      everyTrade
        .filter((t) => days.has(dayOfTrade(t, NY)))
        .map((t) => t.id)
        .sort(),
    );
  });

  test('every pattern computed and a pick applied to all sample trades in under 50 ms', () => {
    expect(s.trades.length).toBeGreaterThan(1000);
    const ids = PATTERNS.slice(0, 8).map((p) => p.id);
    const run = () => {
      const patterns = computePatterns(s.trades, patternEnv);
      return applyFilters(
        s.trades,
        { ...EMPTY_FILTERS, patterns: ids },
        { ...env, patterns },
      );
    };
    run();
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      run();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[2]!).toBeLessThan(50);
  });
});

import { beforeAll, describe, expect, test } from 'vitest';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from '@/data/seed/generate';
import type { PatternEnv } from './defs';
import { computePatterns } from './index';

const NY = 'America/New_York';

let s: SampleWorkspace;
let env: PatternEnv;
beforeAll(() => {
  s = generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' });
  env = {
    timeZone: NY,
    breakevenRange: { unit: 'amount', from: 0, to: 0 },
    sessions: new Map(
      s.days.flatMap((d) => (d.session ? [[d.id, d.session] as const] : [])),
    ),
  };
}, 30_000);

describe('on the sample workspace', () => {
  test('flags a spread of patterns, and not every trade', () => {
    const r = computePatterns(s.trades, env);
    const seen = new Set<string>();
    for (const hits of r.byTrade.values()) for (const h of hits) seen.add(h.id);
    for (const hits of r.byDay.values()) for (const h of hits) seen.add(h.id);
    // The sample is seeded as a plausible trader, not for these patterns:
    // many of the 17 fire, and some trades carry none.
    expect(seen.size).toBeGreaterThanOrEqual(8);
    expect(r.byTrade.size).toBeGreaterThan(0);
    expect(r.byTrade.size).toBeLessThan(s.trades.length);
  });

  test('a later trade never changes an earlier result', () => {
    // Everything entered before a cutoff, then the same with the rest added.
    const cutoff = Date.parse('2026-09-01T04:00:00Z'); // 00:00 New York
    const cutoffDate = '2026-09-01';
    const head = s.trades.filter((t) => Date.parse(t.openedAt) < cutoff);
    expect(head.length).toBeGreaterThan(100);
    expect(head.length).toBeLessThan(s.trades.length);
    const part = computePatterns(head, env);
    const whole = computePatterns(s.trades, env);
    for (const t of head)
      expect(whole.byTrade.get(t.id)).toEqual(part.byTrade.get(t.id));
    for (const [date, hits] of part.byDay)
      if (date < cutoffDate) expect(whole.byDay.get(date)).toEqual(hits);
    for (const [date, hits] of whole.byDay)
      if (date < cutoffDate) expect(part.byDay.get(date)).toEqual(hits);
  });

  test('the order the trades are listed in changes nothing', () => {
    const a = computePatterns(s.trades, env);
    const b = computePatterns([...s.trades].reverse(), env);
    expect(b.byTrade).toEqual(a.byTrade);
    expect(b.byDay).toEqual(a.byDay);
  });

  test('all sample trades in under 50 ms', () => {
    expect(s.trades.length).toBeGreaterThan(1000);
    const run = () => computePatterns(s.trades, env);
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

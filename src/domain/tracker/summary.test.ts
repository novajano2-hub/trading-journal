import { describe, expect, test } from 'vitest';
import type { DayScore, RuleKey, RuleResult } from './score';
import { gridStep, periodScore, ruleStats, streaks } from './summary';

const day = (date: string, met: number, active: number): DayScore => ({
  date,
  rules: [],
  met,
  active,
  perfect: active > 0 && met === active,
  finished: false,
});
const unscored = (date: string): DayScore => ({
  date,
  unscored: 'not-trading-day',
  rules: [],
  met: 0,
  active: 0,
  perfect: false,
  finished: false,
});
const res = (
  key: RuleKey,
  status: RuleResult['status'],
  score: number | null,
): RuleResult => ({
  key,
  stage: 'trade',
  status,
  points: status === 'met' ? 1 : 0,
  score,
  value: { kind: 'tick', ticked: status === 'met' },
});
const withRules = (date: string, rules: RuleResult[]): DayScore => ({
  ...day(date, rules.filter((r) => r.status === 'met').length, rules.length),
  rules,
});

describe('periodScore', () => {
  test('period score is the mean over scored days', () => {
    const days = [
      day('2026-11-16', 2, 4),
      day('2026-11-17', 4, 4),
      unscored('2026-11-18'),
      day('2026-11-19', 1, 2),
    ];
    expect(periodScore(days)).toBeCloseTo((0.5 + 1 + 0.5) / 3);
    expect(periodScore(days, '2026-11-17', '2026-11-17')).toBe(1);
  });

  test('period score is null with no scored day', () => {
    expect(periodScore([])).toBeNull();
    expect(periodScore([unscored('2026-11-18')])).toBeNull();
  });
});

describe('streaks', () => {
  const run = [
    day('2026-11-16', 3, 3),
    day('2026-11-17', 3, 3),
    day('2026-11-18', 3, 3),
  ];
  test('today never breaks the streak early', () => {
    const pending = [...run, day('2026-11-19', 1, 3)];
    expect(streaks(pending, '2026-11-19').current).toBe(3);
    const perfect = [...run, day('2026-11-19', 3, 3)];
    expect(streaks(perfect, '2026-11-19').current).toBe(4);
  });

  test('a no-trade trading day breaks the streak', () => {
    const days = [...run, day('2026-11-19', 0, 3), day('2026-11-20', 1, 3)];
    expect(streaks(days, '2026-11-20').current).toBe(0);
    expect(streaks(days, '2026-11-20').best).toBe(3);
  });

  test('non-trading days are skipped, not broken', () => {
    const days = [
      day('2026-11-20', 2, 2),
      unscored('2026-11-21'),
      day('2026-11-23', 2, 2),
    ];
    expect(streaks(days, '2026-11-23').current).toBe(2);
  });

  test('best and perfect count over all scored days', () => {
    const days = [
      day('2026-11-10', 2, 2),
      day('2026-11-11', 2, 2),
      day('2026-11-12', 0, 2),
      unscored('2026-11-13'),
      day('2026-11-16', 2, 2),
      day('2026-11-17', 1, 2),
      day('2026-11-18', 2, 2),
      day('2026-11-19', 2, 2),
      day('2026-11-20', 2, 2),
    ];
    expect(streaks(days, '2026-11-20')).toEqual({
      current: 3,
      best: 3,
      perfect: 6,
      scored: 8,
    });
  });
});

describe('ruleStats', () => {
  test('rule stats', () => {
    const mk = (d: string, st: RuleResult['status'], sc: number | null) =>
      withRules(d, [res('lossPerTrade', st, sc), res('lossPerDay', 'met', 0)]);
    const base = [
      mk('2026-11-16', 'failed', 10_000),
      mk('2026-11-17', 'met', 5_000),
      mk('2026-11-18', 'met', null),
      mk('2026-11-19', 'met', 3_000),
    ];
    const stat = (days: DayScore[], today: string, key: RuleKey) => {
      const s = ruleStats(days, today).find((r) => r.key === key);
      if (!s) throw new Error(key);
      return s;
    };
    // today met: counts today, running back to the failure
    expect(stat(base, '2026-11-19', 'lossPerTrade').streak).toBe(3);
    // today failed: 0
    const failed = [...base.slice(0, 3), mk('2026-11-19', 'failed', 9_000)];
    expect(stat(failed, '2026-11-19', 'lossPerTrade').streak).toBe(0);
    // today pending: runs from yesterday (P6A-05)
    const pending = [...base.slice(0, 3), mk('2026-11-19', 'pending', null)];
    const p = stat(pending, '2026-11-19', 'lossPerTrade');
    expect(p.streak).toBe(2);
    expect(p.scoredDays).toBe(3);
    // follow rate: met over scored days
    const all = stat(base, '2026-11-19', 'lossPerTrade');
    expect(all.followRate).toBe(3 / 4);
    expect(all.scoredDays).toBe(4);
    // K6: a positive mean of the non-null scores
    expect(all.average).toBeCloseTo((10_000 + 5_000 + 3_000) / 3);
    expect(all.stage).toBe('trade');
  });

  test('the daily cap averages the mean daily loss', () => {
    const days = [
      withRules('2026-11-16', [res('lossPerDay', 'met', 0)]),
      withRules('2026-11-17', [res('lossPerDay', 'failed', 40_710)]),
    ];
    const s = ruleStats(days, '2026-11-17')[0];
    expect(s?.average).toBe(20_355);
  });

  test("the start rule's average is None with no logged start, else the mean start time", () => {
    const none = [
      withRules('2026-11-16', [res('startBy', 'failed', null)]),
      withRules('2026-11-17', [res('startBy', 'failed', null)]),
    ];
    expect(ruleStats(none, '2026-11-17')[0]?.average).toBeNull();
    const some = [
      withRules('2026-11-16', [res('startBy', 'met', 9 * 60)]),
      withRules('2026-11-17', [res('startBy', 'failed', 10 * 60)]),
    ];
    expect(ruleStats(some, '2026-11-17')[0]?.average).toBe(9 * 60 + 30);
  });

  test('range limits the rates and averages', () => {
    const days = [
      withRules('2026-11-16', [res('hours', 'failed', 0)]),
      withRules('2026-11-17', [res('hours', 'met', 1)]),
    ];
    const s = ruleStats(days, '2026-11-17', '2026-11-17')[0];
    expect(s?.followRate).toBe(1);
    expect(s?.scoredDays).toBe(1);
  });
});

describe('gridStep', () => {
  test('grid steps', () => {
    expect(gridStep(day('d', 0, 5))).toBe(0);
    expect(gridStep(day('d', 1, 5))).toBe(1);
    expect(gridStep(day('d', 1, 2))).toBe(2);
    expect(gridStep(day('d', 9, 10))).toBe(3);
    expect(gridStep(day('d', 5, 5))).toBe(4);
    expect(gridStep(unscored('d'))).toBeNull();
    expect(gridStep(day('d', 0, 0))).toBeNull();
  });
});

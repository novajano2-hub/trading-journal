import { addDays, eachWeekOfInterval, format, startOfWeek } from 'date-fns';
import { expect, test } from 'vitest';
import { dailyPnl } from '@/domain/metrics/days';
import { defaultMetricContext } from '@/domain/metrics/context';
import { dailyLossProgress, weeklyGoalProgress } from '@/domain/metrics/goals';
import { goalsFor, parseGoalAmount, SAMPLE_GOALS, withGoals } from './goals';
import { defaultPrefs } from './repository';
import { generateSampleWorkspace, SAMPLE_SEED } from './seed/generate';
import { SAMPLE_WORKSPACE, USER_WORKSPACE } from './workspaces';

test('sample goals until edited; none for My workspace', () => {
  const prefs = defaultPrefs();
  expect(goalsFor(prefs, SAMPLE_WORKSPACE)).toEqual(SAMPLE_GOALS);
  expect(goalsFor(prefs, USER_WORKSPACE)).toEqual({});
  const edited = {
    ...prefs,
    ...withGoals('sample', { weeklyNet: 100000 }),
  };
  expect(goalsFor(edited, SAMPLE_WORKSPACE)).toEqual({ weeklyNet: 100000 });
  expect(goalsFor(edited, USER_WORKSPACE)).toEqual({});
});

test('withGoals names only the edited workspace and drops undefined fields', () => {
  const patch = withGoals('sample', {
    weeklyNet: 100000,
    dailyLossLimit: undefined,
  });
  expect(patch).toEqual({ goals: { sample: { weeklyNet: 100000 } } });
  expect(Object.keys(patch.goals?.sample ?? {})).toEqual(['weeklyNet']);
});

test('goal amounts parse to cents', () => {
  expect(parseGoalAmount('')).toEqual({ ok: true, cents: undefined });
  expect(parseGoalAmount(' $1,500.50 ')).toEqual({ ok: true, cents: 150050 });
  expect(parseGoalAmount('500')).toEqual({ ok: true, cents: 50000 });
  expect(parseGoalAmount('-5')).toEqual({
    ok: false,
    message: 'Enter an amount above zero, or leave it empty.',
  });
  expect(parseGoalAmount('0')).toEqual({
    ok: false,
    message: 'Enter an amount above zero, or leave it empty.',
  });
  expect(parseGoalAmount('abc')).toEqual({
    ok: false,
    message: 'Enter an amount, like 1,500.',
  });
});

test(
  'sample goals are kept on some days and weeks and missed on others',
  { timeout: 30_000 },
  () => {
    const s = generateSampleWorkspace({
      seed: SAMPLE_SEED,
      endDate: '2026-11-19',
    });
    const days = dailyPnl(s.trades, defaultMetricContext('America/New_York'));
    const loss = dailyLossProgress(days, SAMPLE_GOALS.dailyLossLimit);
    expect(loss.brokenDays.length).toBeGreaterThanOrEqual(1);
    expect(loss.brokenDays.length / loss.tradingDays).toBeLessThanOrEqual(0.25);

    const first = days[0]?.date as string;
    const last = days[days.length - 1]?.date as string;
    const mondays = eachWeekOfInterval(
      {
        start: new Date(`${first}T12:00:00`),
        end: new Date(`${last}T12:00:00`),
      },
      { weekStartsOn: 1 },
    ).map((d) => startOfWeek(d, { weekStartsOn: 1 }));
    const reached = mondays.map((m) => {
      const from = format(m, 'yyyy-MM-dd');
      const to = format(addDays(m, 6), 'yyyy-MM-dd');
      return weeklyGoalProgress(days, SAMPLE_GOALS.weeklyNet, { from, to })
        .reached;
    });
    const n = reached.filter(Boolean).length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n / reached.length).toBeLessThanOrEqual(0.75);
  },
);

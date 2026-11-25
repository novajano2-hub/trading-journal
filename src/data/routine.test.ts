import { describe, expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { defaultVersion } from '@/domain/tracker/defaults';
import type { Account, DayRecord, Trade, Tracker } from '@/domain/types';
import { generateSampleWorkspace, SAMPLE_SEED } from './seed/generate';
import {
  freezeDay,
  scoreHistory,
  sessionLength,
  type RoutineEnv,
} from './routine';

const NY = 'America/New_York';
const acct = (id: string): Account => ({
  id,
  workspaceId: 'w',
  name: id,
  broker: 'b',
  type: 'live',
  currency: 'USD',
  startingBalance: 10_000_00,
  status: 'active',
});
const tracker = (over: Partial<Tracker> = {}): Tracker => ({
  id: 'tracker',
  workspaceId: 'w',
  startedOn: '2026-11-16',
  versions: [defaultVersion('2026-11-16')],
  ...over,
});
const env = (over: Partial<RoutineEnv> = {}): RoutineEnv => ({
  timeZone: NY,
  baseCurrency: 'USD',
  now: '2026-11-19T21:00:00Z',
  today: '2026-11-19',
  ...over,
});
/** 10:00 New York on 2026-11-18. */
const wed = (p: Partial<Trade> & { net: number }): Trade =>
  makeTrade({
    openedAt: '2026-11-18T15:00:00Z',
    closedAt: '2026-11-18T15:10:00Z',
    strategyIds: ['s'],
    plannedStop: 10,
    ...p,
  });

describe('scoreHistory', () => {
  test('a finished day rebuilds the same score under any account selection (K3)', () => {
    const accounts = [acct('A'), acct('B')];
    const trades = [
      wed({ accountId: 'A', net: -5_000 }),
      wed({ accountId: 'B', net: -3_000, strategyIds: [] }),
    ];
    const t = tracker();
    const record: DayRecord = {
      id: '2026-11-18',
      workspaceId: 'w',
      noteStartedAt: '2026-11-18T13:00:00Z',
      ticks: {},
    };
    const live = (ids?: string[]) =>
      scoreHistory(
        t,
        [record],
        trades,
        accounts,
        [],
        env({ accountIds: ids }),
      ).scoreOn('2026-11-18');
    const liveA = live(['A']);
    const liveB = live(['B']);
    const liveAll = live();
    expect(liveA.rules).not.toEqual(liveB.rules);
    // The daily cap reads every account, whatever the selection: A's 5,000 plus B's 3,000.
    for (const d of [liveA, liveB, liveAll]) {
      const cap = d.rules.find((r) => r.key === 'lossPerDay')!;
      expect(cap.value).toMatchObject({ kind: 'money', cents: 8_000 });
    }

    const locked = freezeDay(
      '2026-11-18',
      t,
      record,
      trades,
      accounts,
      [],
      env(),
    );
    const finished: DayRecord = {
      ...record,
      finishedAt: '2026-11-18T21:00:00Z',
      locked,
    };
    // The day's trades change after finishing.
    const edited = trades.map((x) => ({
      ...x,
      net: -90_000_00,
      strategyIds: [],
    }));
    const after = (ids?: string[]) =>
      scoreHistory(
        t,
        [finished],
        edited,
        accounts,
        [],
        env({ accountIds: ids }),
      ).scoreOn('2026-11-18');
    for (const [ids, before] of [
      [['A'], liveA],
      [['B'], liveB],
      [undefined, liveAll],
    ] as const) {
      const d = after(ids ? [...ids] : undefined);
      expect(d.rules).toEqual(before.rules);
      expect(d.met).toBe(before.met);
      expect(d.active).toBe(before.active);
      expect(d.finished).toBe(true);
    }
  });

  test('a day finished today keeps its locked version after a save replaces the version', () => {
    const accounts = [acct('A')];
    const trades = [
      makeTrade({
        accountId: 'A',
        net: -20_000,
        openedAt: '2026-11-19T15:00:00Z',
        closedAt: '2026-11-19T15:10:00Z',
        strategyIds: ['s'],
        plannedStop: 10,
      }),
    ];
    const before = tracker();
    const record: DayRecord = {
      id: '2026-11-19',
      workspaceId: 'w',
      noteStartedAt: '2026-11-19T13:00:00Z',
      ticks: {},
    };
    const locked = freezeDay(
      '2026-11-19',
      before,
      record,
      trades,
      accounts,
      [],
      env(),
    );
    const finished: DayRecord = {
      ...record,
      finishedAt: '2026-11-19T21:00:00Z',
      locked,
    };
    const cap = (t: Tracker) =>
      scoreHistory(t, [finished], trades, accounts, [], env())
        .scoreOn('2026-11-19')
        .rules.find((r) => r.key === 'lossPerDay')!;
    const was = cap(before);
    expect(was.value).toMatchObject({ kind: 'money', limit: 10_000 });
    // A save today replaces today's version with a far looser cap.
    const today = {
      ...defaultVersion('2026-11-19'),
      builtIn: {
        ...defaultVersion('2026-11-19').builtIn,
        lossPerDay: { on: true, amount: 9_000_000 },
      },
    };
    const after = tracker({ versions: [before.versions[0]!, today] });
    expect(cap(after)).toEqual(was);
    // The same edit on an unfinished day changes the verdict.
    const open = scoreHistory(after, [record], trades, accounts, [], env())
      .scoreOn('2026-11-19')
      .rules.find((r) => r.key === 'lossPerDay')!;
    expect(open.value).toMatchObject({ limit: 9_000_000 });
  });

  test('unfinished past days score live with the version in effect that day', () => {
    const v1 = defaultVersion('2026-11-16');
    const v2 = {
      ...defaultVersion('2026-11-18'),
      builtIn: {
        ...defaultVersion('2026-11-18').builtIn,
        lossPerDay: { on: true, amount: 50_000 },
      },
    };
    const t = tracker({ versions: [v1, v2] });
    const trades = [
      makeTrade({
        net: -20_000,
        openedAt: '2026-11-17T15:00:00Z',
        closedAt: '2026-11-17T15:10:00Z',
      }),
      makeTrade({
        net: -20_000,
        openedAt: '2026-11-19T15:00:00Z',
        closedAt: '2026-11-19T15:10:00Z',
      }),
    ];
    const h = scoreHistory(t, [], trades, [acct('a1')], [], env());
    const cap = (date: string) =>
      h.scoreOn(date).rules.find((r) => r.key === 'lossPerDay')!;
    expect(cap('2026-11-17').status).toBe('failed');
    expect(cap('2026-11-19').status).toBe('met');
    expect(h.days.map((d) => d.date)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
    ]);
    expect(h.byDate.get('2026-11-18')).toBe(h.scoreOn('2026-11-18'));
  });

  test('a mixed-currency day keeps other currencies out of the money rules', () => {
    const trades = [
      wed({ net: 1_000 }),
      wed({ net: -500_000, pnlCurrency: 'EUR' }),
    ];
    const h = scoreHistory(tracker(), [], trades, [acct('a1')], [], env());
    const rules = h.scoreOn('2026-11-18').rules;
    const day = rules.find((r) => r.key === 'lossPerDay')!;
    const per = rules.find((r) => r.key === 'lossPerTrade')!;
    expect(day.status).toBe('met');
    expect(day.value).toEqual({ kind: 'money', cents: 0, limit: 10_000 });
    expect(per.value).toEqual({ kind: 'share', x: 1, y: 1 });
  });

  test('dates outside the history score as unscored', () => {
    const h = scoreHistory(tracker(), [], [], [acct('a1')], [], env());
    expect(h.scoreOn('2026-11-01').unscored).toBe('before-start');
    expect(h.scoreOn('2026-12-01').unscored).toBe('future');
  });

  test('scores the sample history in under 50 ms', () => {
    const s = generateSampleWorkspace({
      seed: SAMPLE_SEED,
      endDate: '2026-11-19',
    });
    const run = () =>
      scoreHistory(s.tracker, s.days, s.trades, s.accounts, [], {
        timeZone: NY,
        baseCurrency: 'USD',
        now: '2026-11-19T21:00:00Z',
        today: '2026-11-19',
      });
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

describe('sessionLength', () => {
  const start = '2026-11-18T14:00:00Z';
  test('an ended session is end minus start', () => {
    expect(
      sessionLength(
        { start, end: '2026-11-18T16:30:00Z' },
        '2026-11-18',
        '2026-11-18',
        '2026-11-18T20:00:00Z',
        NY,
      ),
    ).toBe(9_000_000);
  });
  test('a running session today runs to now', () => {
    expect(
      sessionLength(
        { start },
        '2026-11-18',
        '2026-11-18',
        '2026-11-18T15:00:00Z',
        NY,
      ),
    ).toBe(3_600_000);
  });
  test('a running session on a past date is capped at local midnight (K30)', () => {
    // 2026-11-19 00:00 in New York is 05:00Z.
    expect(
      sessionLength(
        { start },
        '2026-11-18',
        '2026-11-20',
        '2026-11-20T15:00:00Z',
        NY,
      ),
    ).toBe(15 * 3_600_000);
  });
  test("a session on the routine's today runs to now, even when the real clock is days later (the sample)", () => {
    expect(
      sessionLength(
        { start },
        '2026-11-18',
        '2026-11-18',
        '2026-11-18T15:00:00Z',
        NY,
      ),
    ).toBe(3_600_000);
    // The real date is later than the routine's today: still today's date, so no midnight cap.
    expect(
      sessionLength(
        { start },
        '2026-11-18',
        '2026-11-18',
        '2026-11-25T15:00:00Z',
        NY,
      ),
    ).toBe(Date.parse('2026-11-25T15:00:00Z') - Date.parse(start));
  });
  test('null when never started', () => {
    expect(
      sessionLength(
        undefined,
        '2026-11-18',
        '2026-11-18',
        '2026-11-18T15:00:00Z',
        NY,
      ),
    ).toBeNull();
  });
});

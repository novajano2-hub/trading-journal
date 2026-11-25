import { describe, expect, test } from 'vitest';
import type { AccountDayInputs } from '../types';
import { defaultVersion } from './defaults';
import { scoreDay, type RuleKey, type ScoreArgs } from './score';

const none: AccountDayInputs = {
  opened: 0,
  withStrategy: 0,
  withStop: 0,
  inHours: 0,
  moneyOpened: 0,
  withinTradeLoss: 0,
  largestLoss: 0,
  dayNet: 0,
  booked: false,
  otherCurrency: 0,
};
const inp = (o: Partial<AccountDayInputs>): AccountDayInputs => ({
  ...none,
  ...o,
});

// 2026-11-19 is a Thursday.
const args = (o: Partial<ScoreArgs> = {}): ScoreArgs => ({
  date: '2026-11-19',
  today: '2026-11-20',
  nowTime: '10:00',
  startedOn: '2026-11-02',
  version: defaultVersion('2026-11-02'),
  inputs: none,
  allInputs: none,
  ticks: {},
  finished: false,
  ...o,
});
const rule = (a: ScoreArgs, key: RuleKey) => {
  const r = scoreDay(a).rules.find((x) => x.key === key);
  if (!r) throw new Error(`no rule ${key}`);
  return r;
};

describe('scoreDay', () => {
  test('a trading day with no trades fails every trade rule once ended (spec 6.2)', () => {
    const s = scoreDay(args());
    for (const k of [
      'strategy',
      'stop',
      'lossPerTrade',
      'lossPerDay',
    ] as const) {
      const r = s.rules.find((x) => x.key === k)!;
      expect(r.status).toBe('failed');
      expect(r.points).toBe(0);
    }
    expect(s.perfect).toBe(false);
    expect(s.rules.map((r) => r.key)).toEqual([
      'startBy',
      'hours',
      'strategy',
      'stop',
      'lossPerTrade',
      'lossPerDay',
    ]);
    expect(s.active).toBe(6);
  });

  test('today with no trades leaves trade rules pending', () => {
    const s = scoreDay(args({ today: '2026-11-19' }));
    for (const k of [
      'hours',
      'strategy',
      'stop',
      'lossPerTrade',
      'lossPerDay',
    ] as const) {
      expect(s.rules.find((x) => x.key === k)!.status).toBe('pending');
    }
  });

  test('a loss at the limit passes both loss rules (K7)', () => {
    const at = args({
      inputs: inp({
        opened: 1,
        moneyOpened: 1,
        withinTradeLoss: 1,
        largestLoss: 10_000,
        dayNet: -10_000,
        booked: true,
      }),
      allInputs: inp({ dayNet: -10_000, booked: true }),
    });
    expect(rule(at, 'lossPerTrade').status).toBe('met');
    expect(rule(at, 'lossPerDay').status).toBe('met');
    const over = args({
      inputs: inp({
        opened: 1,
        moneyOpened: 1,
        withinTradeLoss: 0,
        largestLoss: 10_001,
        dayNet: -10_001,
        booked: true,
      }),
      allInputs: inp({ dayNet: -10_001, booked: true }),
    });
    expect(rule(over, 'lossPerTrade').status).toBe('failed');
    expect(rule(over, 'lossPerDay').status).toBe('failed');
  });

  test("the daily cap scores the day's loss, 0 on a green day (P6A-02)", () => {
    const green = rule(
      args({ allInputs: inp({ dayNet: 26_690, booked: true }) }),
      'lossPerDay',
    );
    expect(green.value).toEqual({ kind: 'money', cents: 0, limit: 10_000 });
    expect(green.score).toBe(0);
    expect(green.status).toBe('met');
    const red = rule(
      args({ allInputs: inp({ dayNet: -40_710, booked: true }) }),
      'lossPerDay',
    );
    expect(red.value).toMatchObject({ kind: 'money', cents: 40_710 });
    expect(red.score).toBe(40_710);
    expect(red.status).toBe('failed');
  });

  test('the daily cap shows failed while the day is past it and met again when it is back within', () => {
    const live = (dayNet: number) =>
      rule(
        args({
          today: '2026-11-19',
          allInputs: inp({ dayNet, booked: true }),
        }),
        'lossPerDay',
      ).status;
    expect(live(-12_000)).toBe('failed');
    expect(live(-8_000)).toBe('met');
  });

  test('the daily cap counts every account whatever the selection (P6A-01)', () => {
    const a = args({
      inputs: inp({
        opened: 1,
        withStrategy: 1,
        dayNet: 5_000,
        booked: true,
      }),
      allInputs: inp({ opened: 3, dayNet: -20_000, booked: true }),
    });
    expect(rule(a, 'lossPerDay').status).toBe('failed');
    expect(rule(a, 'strategy').value).toEqual({ kind: 'share', x: 1, y: 1 });
    expect(rule(a, 'strategy').status).toBe('met');
  });

  test('winners count toward the per-trade pair (K5)', () => {
    const r = rule(
      args({
        inputs: inp({
          opened: 3,
          moneyOpened: 3,
          withinTradeLoss: 2,
          largestLoss: 15_000,
        }),
      }),
      'lossPerTrade',
    );
    expect(r.value).toEqual({ kind: 'share', x: 2, y: 3 });
    expect(r.status).toBe('failed');
    expect(r.score).toBe(15_000);
  });

  test('the time rule needs the first edit on its own date by the limit (K9)', () => {
    const at = (
      noteStartedAt?: string,
      nowTime = '10:00',
      today = '2026-11-19',
    ) => rule(args({ today, nowTime, noteStartedAt }), 'startBy');
    expect(at('09:30').status).toBe('met');
    expect(at('09:30').score).toBe(570);
    expect(at('09:31').status).toBe('failed');
    expect(at(undefined, '09:00').status).toBe('pending');
    expect(at(undefined, '09:00').score).toBeNull();
    expect(at(undefined, '09:31').status).toBe('failed');
    expect(at(undefined, '09:00', '2026-11-20').status).toBe('failed');
    expect(at('09:30').value).toEqual({
      kind: 'time',
      at: '09:30',
      limit: '09:30',
    });
  });

  test('trading hours count trades opened in the window (K10)', () => {
    const r = (opened: number, inHours: number, today = '2026-11-19') =>
      rule(args({ today, inputs: inp({ opened, inHours }) }), 'hours');
    expect(r(4, 3).value).toEqual({ kind: 'share', x: 3, y: 4 });
    expect(r(4, 3).status).toBe('failed');
    expect(r(4, 3).score).toBe(0.75);
    expect(r(2, 2).status).toBe('met');
    expect(r(2, 2).score).toBe(1);
    expect(r(0, 0).status).toBe('pending');
    expect(r(0, 0, '2026-11-20').status).toBe('failed');
  });

  test('a custom rule on a non-trading weekday is never active (K11)', () => {
    const version = defaultVersion('2026-11-02');
    version.custom = [
      {
        id: 'c1',
        name: 'Review levels',
        stage: 'prepare',
        days: [false, false, false, false, false, false, true],
      },
    ];
    const s = scoreDay(
      args({ date: '2026-11-21', today: '2026-11-23', version }),
    );
    expect(s.unscored).toBe('not-trading-day');
    expect(s.active).toBe(0);
    expect(s.rules).toEqual([]);
  });

  test('custom rules are met by a tick, only on their days, ordered by stage', () => {
    const version = defaultVersion('2026-11-02');
    const days = (on: number[]) =>
      [0, 1, 2, 3, 4, 5, 6].map((d) => on.includes(d)) as [
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
      ];
    version.custom = [
      { id: 'r', name: 'Reflect', stage: 'reflect', days: days([4]) },
      { id: 'p', name: 'Prepare', stage: 'prepare', days: days([4]) },
      { id: 'x', name: 'Not Thursday', stage: 'trade', days: days([1]) },
    ];
    const s = scoreDay(args({ version, ticks: { p: true } }));
    expect(s.rules.map((r) => r.key)).toEqual([
      'startBy',
      'custom:p',
      'hours',
      'strategy',
      'stop',
      'lossPerTrade',
      'lossPerDay',
      'custom:r',
    ]);
    const p = s.rules.find((r) => r.key === 'custom:p')!;
    expect(p).toMatchObject({
      status: 'met',
      points: 1,
      score: 1,
      value: { kind: 'tick', ticked: true },
      stage: 'prepare',
    });
    expect(s.rules.find((r) => r.key === 'custom:r')).toMatchObject({
      status: 'failed',
      score: 0,
    });
  });

  test('switched-off built-ins are not active', () => {
    const version = defaultVersion('2026-11-02');
    version.builtIn.startBy.on = false;
    version.builtIn.lossPerDay.on = false;
    const s = scoreDay(args({ version }));
    expect(s.active).toBe(4);
    expect(s.rules.some((r) => r.key === 'startBy')).toBe(false);
  });

  test('unscored dates (K20)', () => {
    const before = scoreDay(args({ date: '2026-11-01' }));
    expect(before).toMatchObject({
      unscored: 'before-start',
      rules: [],
      active: 0,
      met: 0,
      perfect: false,
    });
    const future = scoreDay(args({ date: '2026-11-23' }));
    expect(future.unscored).toBe('future');
    expect(future.rules).toEqual([]);
    const weekend = scoreDay(args({ date: '2026-11-21', today: '2026-11-23' }));
    expect(weekend.unscored).toBe('not-trading-day');
    expect(weekend.active).toBe(0);
    const noVersion = scoreDay(args({ version: undefined }));
    expect(noVersion.unscored).toBe('before-start');
  });

  test('a perfect day meets every active rule', () => {
    const good = inp({
      opened: 2,
      withStrategy: 2,
      withStop: 2,
      inHours: 2,
      moneyOpened: 2,
      withinTradeLoss: 2,
      largestLoss: 500,
      dayNet: 4_000,
      booked: true,
    });
    const s = scoreDay(
      args({ inputs: good, allInputs: good, noteStartedAt: '09:10' }),
    );
    expect(s.met).toBe(6);
    expect(s.active).toBe(6);
    expect(s.perfect).toBe(true);
  });

  test('finishing turns pending into failed', () => {
    const live = args({ today: '2026-11-19', nowTime: '08:00' });
    expect(scoreDay(live).rules.every((r) => r.status === 'pending')).toBe(
      true,
    );
    const done = scoreDay({ ...live, finished: true });
    expect(done.finished).toBe(true);
    expect(done.rules.every((r) => r.status === 'failed')).toBe(true);
  });

  test('strategy and stop stay pending today until every trade has one (K19)', () => {
    const r = (withStrategy: number, withStop: number) =>
      scoreDay(
        args({
          today: '2026-11-19',
          inputs: inp({ opened: 2, withStrategy, withStop }),
        }),
      );
    expect(r(1, 1).rules.find((x) => x.key === 'strategy')!.status).toBe(
      'pending',
    );
    expect(r(1, 1).rules.find((x) => x.key === 'stop')!.status).toBe('pending');
    expect(r(2, 1).rules.find((x) => x.key === 'strategy')!.status).toBe('met');
    expect(r(2, 1).rules.find((x) => x.key === 'stop')!.status).toBe('pending');
  });
});

import { describe, expect, test } from 'vitest';
import {
  MON_TO_FRI,
  defaultVersion,
  routineToday,
  versionOn,
  weekdayOf,
} from './defaults';

describe('tracker defaults', () => {
  test('versionOn picks the version in effect that date', () => {
    const t = {
      startedOn: '2026-11-02',
      versions: [defaultVersion('2026-11-02'), defaultVersion('2026-11-20')],
    };
    expect(versionOn(t, '2026-11-19')).toBe(t.versions[0]);
    expect(versionOn(t, '2026-11-20')).toBe(t.versions[1]);
    expect(versionOn(t, '2026-12-01')).toBe(t.versions[1]);
    expect(versionOn(t, '2026-11-01')).toBeUndefined();
  });

  test("defaults match TradeZella's", () => {
    expect(MON_TO_FRI).toEqual([false, true, true, true, true, true, false]);
    expect(defaultVersion('2026-11-02')).toEqual({
      from: '2026-11-02',
      tradingDays: [false, true, true, true, true, true, false],
      builtIn: {
        startBy: { on: true, time: '09:30' },
        hours: { on: true, from: '09:00', to: '12:00' },
        strategy: { on: true },
        stop: { on: true },
        lossPerTrade: { on: true, unit: 'amount', value: 10_000 },
        lossPerDay: { on: true, amount: 10_000 },
      },
      custom: [],
    });
  });

  test('versions never share their weekday arrays', () => {
    const a = defaultVersion('2026-11-02');
    a.tradingDays[0] = true;
    expect(defaultVersion('2026-11-02').tradingDays[0]).toBe(false);
    expect(MON_TO_FRI[0]).toBe(false);
  });

  test('weekdayOf is 0 on Sunday', () => {
    expect(weekdayOf('2026-11-22')).toBe(0);
    expect(weekdayOf('2026-11-21')).toBe(6);
  });

  test("today is the sample's asOf, else the local date", () => {
    const now = '2026-11-20T03:30:00Z';
    expect(routineToday({ asOf: '2026-03-01' }, now, 'America/New_York')).toBe(
      '2026-03-01',
    );
    expect(routineToday({}, now, 'America/New_York')).toBe('2026-11-19');
  });
});

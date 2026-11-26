import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { realizations } from '../metrics/realized';
import type { Execution, TrackerVersion } from '../types';
import { defaultVersion } from './defaults';
import { dayInputs, stampTime, sumInputs, type InputsEnv } from './inputs';

const NY = 'America/New_York';
const withHours = (v: TrackerVersion): TrackerVersion => ({
  ...v,
  builtIn: { ...v.builtIn, hours: { ...v.builtIn.hours, on: true } },
});
const env = (over: Partial<InputsEnv> = {}): InputsEnv => ({
  timeZone: NY,
  baseCurrency: 'USD',
  version: withHours(defaultVersion('2026-11-02')),
  balanceAtDayStart: () => 50_000_00,
  ...over,
});

const fill = (
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  time: string,
): Execution => ({
  id: `${side}-${time}`,
  accountId: 'a1',
  symbol: 'ESZ5',
  side,
  qty,
  price,
  time,
  fees: 0,
  commission: 0,
});

describe('dayInputs', () => {
  test('rules read trades opened on the date in the profile zone', () => {
    const t = makeTrade({
      net: 100,
      openedAt: '2026-11-20T03:30:00Z',
      closedAt: '2026-11-20T03:40:00Z',
    });
    expect(dayInputs([t], '2026-11-19', env()).a1?.opened).toBe(1);
    expect(dayInputs([t], '2026-11-20', env()).a1).toBeUndefined();
  });

  test('a multi-day trade counts toward trade rules on its open date and the daily cap on each exit date', () => {
    const t = makeTrade({
      net: 5000,
      openedAt: '2026-11-18T15:00:00Z',
      closedAt: '2026-11-19T16:00:00Z',
      executions: [
        fill('buy', 2, 100, '2026-11-18T15:00:00Z'),
        fill('sell', 1, 150, '2026-11-18T20:00:00Z'),
        fill('sell', 1, 100, '2026-11-19T16:00:00Z'),
      ],
    });
    const [first, second] = realizations(t);
    const d18 = dayInputs([t], '2026-11-18', env()).a1!;
    expect(d18.opened).toBe(1);
    expect(d18.dayNet).toBe(first!.net);
    const d19 = dayInputs([t], '2026-11-19', env()).a1!;
    expect(d19.opened).toBe(0);
    expect(d19.booked).toBe(true);
    expect(d19.dayNet).toBe(second!.net);
  });

  test('other currencies stay out of the money rules', () => {
    const t = makeTrade({
      net: -5000,
      pnlCurrency: 'EUR',
      openedAt: '2026-11-19T15:00:00Z',
      closedAt: '2026-11-19T15:05:00Z',
    });
    const i = dayInputs([t], '2026-11-19', env()).a1!;
    expect(i.opened).toBe(1);
    expect(i.moneyOpened).toBe(0);
    expect(i.otherCurrency).toBe(1);
    expect(i.dayNet).toBe(0);
    expect(i.largestLoss).toBe(0);
  });

  test("a percent per-trade cap reads the balance at the day's start", () => {
    const version = defaultVersion('2026-11-02');
    version.builtIn.lossPerTrade = { on: true, unit: 'percent', value: 0.01 };
    const seen: string[] = [];
    const e = env({
      version,
      balanceAtDayStart: (id) => {
        seen.push(id);
        return 50_000_00;
      },
    });
    const mk = (net: number) =>
      makeTrade({
        net,
        openedAt: '2026-11-19T15:00:00Z',
        closedAt: '2026-11-19T15:05:00Z',
      });
    expect(dayInputs([mk(-49_999)], '2026-11-19', e).a1?.withinTradeLoss).toBe(
      1,
    );
    expect(dayInputs([mk(-50_000)], '2026-11-19', e).a1?.withinTradeLoss).toBe(
      1,
    );
    expect(dayInputs([mk(-50_001)], '2026-11-19', e).a1?.withinTradeLoss).toBe(
      0,
    );
    expect(seen.every((id) => id === 'a1')).toBe(true);
  });

  test('strategy, stop and hours counts, and the largest loss', () => {
    const base = {
      openedAt: '2026-11-19T15:00:00Z', // 10:00 in New York
      closedAt: '2026-11-19T15:05:00Z',
    };
    const trades = [
      makeTrade({ net: -3000, strategyIds: ['s'], plannedStop: 4490, ...base }),
      makeTrade({
        net: 2000,
        // 18:00 in New York: outside 09:00 to 12:00
        openedAt: '2026-11-19T23:00:00Z',
        closedAt: '2026-11-19T23:05:00Z',
      }),
    ];
    const i = dayInputs(trades, '2026-11-19', env()).a1!;
    expect(i).toMatchObject({
      opened: 2,
      withStrategy: 1,
      withStop: 1,
      inHours: 1,
      moneyOpened: 2,
      withinTradeLoss: 2,
      largestLoss: 3000,
      dayNet: -1000,
      booked: true,
      otherCurrency: 0,
    });
  });

  test('a trade that exits outside the hours the same day is out of hours', () => {
    const t = makeTrade({
      net: 0,
      openedAt: '2026-11-19T16:00:00Z', // 11:00
      closedAt: '2026-11-19T18:00:00Z', // 13:00
    });
    expect(dayInputs([t], '2026-11-19', env()).a1?.inHours).toBe(0);
  });
});

describe('sumInputs', () => {
  test('sumInputs adds counts, keeps the largest loss and ORs booked', () => {
    const a = {
      opened: 2,
      withStrategy: 1,
      withStop: 2,
      inHours: 2,
      moneyOpened: 2,
      withinTradeLoss: 1,
      largestLoss: 3000,
      dayNet: -1000,
      booked: false,
      otherCurrency: 0,
    };
    const b = {
      opened: 1,
      withStrategy: 1,
      withStop: 0,
      inHours: 0,
      moneyOpened: 0,
      withinTradeLoss: 0,
      largestLoss: 7000,
      dayNet: 500,
      booked: true,
      otherCurrency: 1,
    };
    expect(sumInputs({ a, b })).toEqual({
      opened: 3,
      withStrategy: 2,
      withStop: 2,
      inHours: 2,
      moneyOpened: 2,
      withinTradeLoss: 1,
      largestLoss: 7000,
      dayNet: -500,
      booked: true,
      otherCurrency: 1,
    });
    expect(sumInputs({ a, b }, ['a'])).toEqual(a);
    expect(sumInputs({ a, b }, ['zzz']).opened).toBe(0);
    expect(sumInputs({}).booked).toBe(false);
  });
});

describe('stampTime', () => {
  test('is HH:mm for a stamp on the date, undefined for another day', () => {
    expect(stampTime('2026-11-19T14:12:00Z', '2026-11-19', NY)).toBe('09:12');
    expect(stampTime('2026-11-19T14:12:00Z', '2026-11-20', NY)).toBeUndefined();
    expect(stampTime(undefined, '2026-11-19', NY)).toBeUndefined();
  });
});

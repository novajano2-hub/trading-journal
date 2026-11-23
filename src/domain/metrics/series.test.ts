import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { defaultMetricContext } from './context';
import { bucketKey, timeSeries } from './series';

const ctx = defaultMetricContext('America/New_York');

// Two days (NY): Mon 2 Nov has +100 and -40, Tue 3 Nov has +70.
const three = [
  makeTrade({ net: 10000, closedAt: '2026-11-02T16:00:00Z', serial: 1 }),
  makeTrade({ net: -4000, closedAt: '2026-11-02T17:00:00Z', serial: 2 }),
  makeTrade({ net: 7000, closedAt: '2026-11-03T16:00:00Z', serial: 3 }),
];

describe('timeSeries', () => {
  test('net is the realized P&L of each day', () => {
    expect(timeSeries(three, ctx, 'net', 'day')).toEqual([
      { key: '2026-11-02', value: 6000 },
      { key: '2026-11-03', value: 7000 },
    ]);
  });

  test('cumulative-net runs through the days', () => {
    expect(timeSeries(three, ctx, 'cumulative-net', 'day')).toEqual([
      { key: '2026-11-02', value: 6000 },
      { key: '2026-11-03', value: 13000 },
    ]);
  });

  test('trade metrics are per close date; trades counts them', () => {
    expect(timeSeries(three, ctx, 'trades', 'day').map((p) => p.value)).toEqual(
      [2, 1],
    );
    expect(
      timeSeries(three, ctx, 'win-rate', 'day').map((p) => p.value),
    ).toEqual([0.5, 1]);
    expect(
      timeSeries(three, ctx, 'avg-win', 'day').map((p) => p.value),
    ).toEqual([10000, 7000]);
    expect(
      timeSeries(three, ctx, 'avg-loss', 'day').map((p) => p.value),
    ).toEqual([-4000, null]);
    expect(
      timeSeries(three, ctx, 'profit-factor', 'day').map((p) => p.value),
    ).toEqual([2.5, null]);
  });

  test('win-rate on a day with exits but no closed trade is null', () => {
    // Opens on the 2nd, scales out on the 2nd, closes on the 3rd.
    const held = makeTrade({
      net: 5000,
      openedAt: '2026-11-02T15:00:00Z',
      closedAt: '2026-11-03T16:00:00Z',
      executions: [
        ex('buy', 2, 100, '2026-11-02T15:00:00Z'),
        ex('sell', 1, 150, '2026-11-02T20:00:00Z'),
        ex('sell', 1, 100, '2026-11-03T16:00:00Z'),
      ],
    });
    const net = timeSeries([held], ctx, 'net', 'day');
    expect(net.map((p) => p.key)).toEqual(['2026-11-02', '2026-11-03']);
    const rate = timeSeries([held], ctx, 'win-rate', 'day');
    expect(rate[0]).toEqual({ key: '2026-11-02', value: null });
    expect(rate[1]!.value).toBe(1);
  });

  test('the date range clips both kinds of figure', () => {
    const clipped = { ...ctx, range: { from: '2026-11-03' } };
    expect(timeSeries(three, clipped, 'net', 'day')).toEqual([
      { key: '2026-11-03', value: 7000 },
    ]);
    expect(timeSeries(three, clipped, 'trades', 'day')).toEqual([
      { key: '2026-11-03', value: 1 },
    ]);
  });

  test('weeks start Monday and months are YYYY-MM', () => {
    const more = [
      ...three,
      makeTrade({ net: 1000, closedAt: '2026-11-09T16:00:00Z', serial: 4 }),
    ];
    expect(timeSeries(more, ctx, 'net', 'week')).toEqual([
      { key: '2026-11-02', value: 13000 },
      { key: '2026-11-09', value: 1000 },
    ]);
    expect(timeSeries(more, ctx, 'net', 'month')).toEqual([
      { key: '2026-11', value: 14000 },
    ]);
    expect(bucketKey('2026-11-08', 'week')).toBe('2026-11-02');
    expect(bucketKey('2026-11-02', 'week')).toBe('2026-11-02');
  });

  test('fees come from the exits; an empty set has no points', () => {
    const f = makeTrade({
      net: 9000,
      fees: 1000,
      closedAt: '2026-11-02T16:00:00Z',
    });
    expect(timeSeries([f], ctx, 'fees', 'day')).toEqual([
      { key: '2026-11-02', value: 1000 },
    ]);
    expect(timeSeries([], ctx, 'net', 'day')).toEqual([]);
  });
});

function ex(side: 'buy' | 'sell', qty: number, price: number, time: string) {
  return {
    id: `${time}-${side}`,
    accountId: 'a1',
    symbol: 'ESZ5',
    side,
    qty,
    price,
    time,
    fees: 0,
    commission: 0,
  };
}

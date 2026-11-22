import { describe, expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import { defaultMetricContext } from '@/domain/metrics/context';
import { buildTrades } from '@/domain/trade-builder';
import type { Execution, JournalEntry } from '@/domain/types';
import { calendarMonth, calendarYear } from './calendar';

const ctx = defaultMetricContext('America/New_York');

function fill(
  id: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  time: string,
  fees: number,
): Execution {
  return {
    id,
    accountId: 'a1',
    symbol: 'ESZ5',
    side,
    qty,
    price,
    time,
    fees,
    commission: 0,
  };
}

/** The Task 3 trade: two ES contracts, one out on 16 Nov, one on 17 Nov. */
const heldTwoDays = () =>
  buildTrades(
    [
      fill('e1', 'buy', 2, 5000, '2026-11-16T15:00:00Z', 300),
      fill('x1', 'sell', 1, 5010, '2026-11-16T20:00:00Z', 150),
      fill('x2', 'sell', 1, 5020, '2026-11-17T15:00:00Z', 150),
    ],
    {
      workspaceId: 'w',
      startSerial: 1,
      resolve: () => resolveInstrument('ESZ5'),
      accountCurrency: () => 'USD',
    },
  ).trades;

const note = (
  date: string,
  over: Partial<JournalEntry> = {},
): JournalEntry => ({
  id: `n-${date}`,
  workspaceId: 'w',
  kind: 'daily-review',
  date,
  title: 'Review',
  body: {},
  linkedTradeIds: [],
  tags: [],
  updatedAt: '2026-11-20T00:00:00Z',
  ...over,
});

const dayOf = (m: ReturnType<typeof calendarMonth>, date: string) =>
  m.weeks.flatMap((w) => w.days).find((d) => d?.date === date) ?? null;

describe('calendarMonth', () => {
  test('a trade held over two days books each exit on its own day', () => {
    const m = calendarMonth(heldTwoDays(), [], '2026-11', ctx);
    expect(dayOf(m, '2026-11-16')).toMatchObject({
      net: 49700,
      gross: 50000,
      fees: 300,
      trades: 1,
    });
    expect(dayOf(m, '2026-11-17')).toMatchObject({ net: 99700, trades: 1 });
  });

  test('November 2026 runs Monday to Sunday over six weeks, outside days empty', () => {
    const m = calendarMonth([], [], '2026-11', ctx);
    expect(m.weeks).toHaveLength(6);
    expect(m.weeks.every((w) => w.days.length === 7)).toBe(true);
    // 1 Nov is a Sunday: the first week holds only it, in the last column.
    expect(m.weeks[0]!.days.slice(0, 6)).toEqual(Array(6).fill(null));
    expect(m.weeks[0]!.days[6]!.date).toBe('2026-11-01');
    expect(m.weeks[5]!.days[0]!.date).toBe('2026-11-30');
  });

  test('a day inside the breakeven range is flat, outside it gain or loss', () => {
    const wide = {
      ...ctx,
      breakevenRange: { unit: 'amount' as const, from: -5000, to: 5000 },
    };
    const t = [
      makeTrade({ net: 3000, closedAt: '2026-11-02T15:00:00Z' }),
      makeTrade({ net: -5001, closedAt: '2026-11-03T15:00:00Z' }),
      makeTrade({ net: 5001, closedAt: '2026-11-04T15:00:00Z' }),
    ];
    const m = calendarMonth(t, [], '2026-11', wide);
    expect(dayOf(m, '2026-11-02')!.tone).toBe('flat');
    expect(dayOf(m, '2026-11-03')!.tone).toBe('loss');
    expect(dayOf(m, '2026-11-04')!.tone).toBe('gain');
    expect(dayOf(m, '2026-11-05')!.tone).toBe('none');
    expect(m.summary.greenDays).toBe(1);
  });

  test('week totals equal the sum of their days, with a trading-day count', () => {
    const t = [
      ...heldTwoDays(),
      makeTrade({ net: -2500, closedAt: '2026-11-16T18:00:00Z' }),
      makeTrade({ net: 1000, closedAt: '2026-11-24T18:00:00Z' }),
    ];
    const m = calendarMonth(t, [], '2026-11', ctx);
    for (const w of m.weeks)
      expect(w.net).toBe(w.days.reduce((s, d) => s + (d?.net ?? 0), 0));
    const week = m.weeks[3]!; // 16-22 Nov
    expect(week.net).toBe(49700 - 2500 + 99700);
    expect(week.tradingDays).toBe(2);
    expect(dayOf(m, '2026-11-16')!.trades).toBe(2);
    expect(m.summary.net).toBe(49700 - 2500 + 99700 + 1000);
    expect(m.summary.tradingDays).toBe(3);
    expect(m.summary.best!.date).toBe('2026-11-17');
    expect(m.summary.worst!.date).toBe('2026-11-24');
  });

  test('an open trade adds nothing until it exits', () => {
    const open = makeTrade({
      net: 0,
      status: 'open',
      closedAt: undefined,
      executions: [],
    });
    const m = calendarMonth([open], [], '2026-11', ctx);
    expect(m.summary.tradingDays).toBe(0);
    expect(m.summary.best).toBeNull();
  });

  test('hasNote is true on a date with a live daily note only', () => {
    const m = calendarMonth(
      [],
      [
        note('2026-11-05'),
        note('2026-11-06', { deletedAt: '2026-11-07T00:00:00Z' }),
        note('2026-11-09', { kind: 'pre-market' }),
      ],
      '2026-11',
      ctx,
    );
    expect(dayOf(m, '2026-11-05')!.hasNote).toBe(true);
    expect(dayOf(m, '2026-11-06')!.hasNote).toBe(false);
    expect(dayOf(m, '2026-11-09')!.hasNote).toBe(false);
  });

  test('day R sums realized R, leaving out trades without risk', () => {
    const t = [
      makeTrade({
        net: 20000,
        initialRisk: 10000,
        closedAt: '2026-11-02T15:00:00Z',
      }),
      makeTrade({
        net: -5000,
        initialRisk: 10000,
        closedAt: '2026-11-02T16:00:00Z',
      }),
      makeTrade({ net: 9000, closedAt: '2026-11-02T17:00:00Z' }),
      makeTrade({ net: 9000, closedAt: '2026-11-03T17:00:00Z' }),
    ];
    const m = calendarMonth(t, [], '2026-11', ctx);
    expect(dayOf(m, '2026-11-02')!.r).toBeCloseTo(1.5);
    expect(dayOf(m, '2026-11-03')!.r).toBeNull();
  });

  test('wins and losses follow the trade outcome on the basis', () => {
    const t = [
      makeTrade({ net: 3000, closedAt: '2026-11-02T15:00:00Z' }),
      makeTrade({ net: -1000, closedAt: '2026-11-02T16:00:00Z' }),
      makeTrade({ net: -1000, closedAt: '2026-11-02T17:00:00Z' }),
    ];
    const d = dayOf(calendarMonth(t, [], '2026-11', ctx), '2026-11-02')!;
    expect([d.wins, d.losses, d.trades]).toEqual([1, 2, 3]);
  });
});

describe('calendarYear', () => {
  test('twelve months, each with its net and every day', () => {
    const y = calendarYear(heldTwoDays(), 2026, ctx);
    expect(y.map((m) => m.month)).toEqual(
      Array.from(
        { length: 12 },
        (_, i) => `2026-${String(i + 1).padStart(2, '0')}`,
      ),
    );
    const nov = y[10]!;
    expect(nov.net).toBe(149400);
    expect(nov.days).toHaveLength(30);
    expect(y[0]!.net).toBe(0);
    expect(y[0]!.days).toHaveLength(31);
  });
});

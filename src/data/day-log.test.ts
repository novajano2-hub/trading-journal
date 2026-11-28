import { beforeAll, describe, expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { defaultMetricContext } from '@/domain/metrics/context';
import type { Execution, Trade } from '@/domain/types';
import {
  dayOfTrade,
  daySpan,
  groupDays,
  groupWeeks,
  startOfLocalDay,
  weekRows,
  type DayLogEnv,
} from './day-log';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from './seed/generate';

const NY = 'America/New_York';
const env = (over: Partial<DayLogEnv> = {}): DayLogEnv => ({
  timeZone: NY,
  baseCurrency: 'USD',
  ctx: defaultMetricContext(NY),
  weekStart: 'sunday',
  noteDates: new Set(),
  ...over,
});
const fill = (side: 'buy' | 'sell', qty: number): Execution => ({
  id: `e-${side}-${qty}`,
  accountId: 'a1',
  symbol: 'ESZ5',
  side,
  qty,
  price: 4500,
  time: '2026-03-02T15:00:00Z',
  fees: 0,
  commission: 0,
});
// Noon New York time on a date (EST in winter, so 17:00Z).
const at = (date: string, hhmm = '17:00') => `${date}T${hhmm}:00Z`;

describe('day grouping', () => {
  test('a trade belongs to its close date, or its open date while open', () => {
    const closed = makeTrade({
      net: 1,
      openedAt: at('2026-03-02', '15:00'),
      closedAt: at('2026-03-03', '15:00'),
    });
    const open = makeTrade({
      net: 0,
      status: 'open',
      openedAt: at('2026-03-04', '15:00'),
    });
    expect(dayOfTrade(closed, NY)).toBe('2026-03-03');
    expect(dayOfTrade(open, NY)).toBe('2026-03-04');
    const days = groupDays([closed, open], env());
    expect(days.map((d) => d.date)).toEqual(['2026-03-04', '2026-03-03']);
    expect(days[1]!.trades).toEqual([closed]);
  });

  test('rows run newest open time first', () => {
    const a = makeTrade({
      net: 1,
      openedAt: at('2026-03-02', '14:00'),
      closedAt: at('2026-03-02', '20:00'),
    });
    const b = makeTrade({
      net: 1,
      openedAt: at('2026-03-02', '16:00'),
      closedAt: at('2026-03-02', '17:00'),
    });
    const c = makeTrade({
      net: 1,
      openedAt: at('2026-03-02', '15:00'),
      closedAt: at('2026-03-02', '18:00'),
    });
    const [day] = groupDays([a, b, c], env());
    expect(day!.trades).toEqual([b, c, a]);
  });

  const fixture = (): Trade[] => [
    makeTrade({
      net: 100,
      fees: 10,
      gross: 110,
      executions: [fill('buy', 2), fill('sell', 2)],
    }),
    makeTrade({
      net: -50,
      fees: 5,
      gross: -45,
      executions: [fill('buy', 1), fill('sell', 1)],
    }),
    makeTrade({
      net: 0,
      gross: 5,
      fees: 5,
      executions: [fill('buy', 3), fill('sell', 3)],
    }),
    makeTrade({
      net: 0,
      gross: 0,
      status: 'open',
      openedAt: at('2026-03-02', '19:00'),
      executions: [fill('buy', 4)],
    }),
  ];

  test('stats match the rules on a fixture', () => {
    const [day] = groupDays(fixture(), env());
    expect(day!.stats).toEqual({
      trades: 4,
      wins: 1,
      losses: 1,
      winRate: 0.5,
      net: 50,
      gross: 70,
      commissions: 20,
      profitFactor: 2,
      volume: 2 + 2 + 1 + 1 + 3 + 3 + 4,
    });
    expect(day!.series.map((p) => p.cumulative)).toEqual([100, 50, 50]);
  });

  test("swap is not a commission: the day carries the trades' fees, with net below gross by fees and swap", () => {
    const [day] = groupDays(
      [
        // Gross 530.00, fees 14.00, swap -4.86: net 511.14.
        makeTrade({ gross: 53000, fees: 1400, swap: -486, net: 51114 }),
        makeTrade({ gross: 1000, fees: 100, swap: 120, net: 1020 }),
      ],
      env(),
    );
    expect(day!.stats).toMatchObject({
      gross: 54000,
      net: 52134,
      commissions: 1500,
    });
  });

  test('a fee credit is a negative commission: it lowers the day’s commissions and raises its net over its gross', () => {
    const [day] = groupDays(
      [
        // A $5.00 credit in the fees: gross 95.00, net 100.00.
        makeTrade({ gross: 9500, fees: -500, net: 10000 }),
        makeTrade({ gross: 1000, fees: 100, net: 900 }),
      ],
      env(),
    );
    expect(day!.stats).toMatchObject({
      gross: 10500,
      net: 10900,
      commissions: -400,
    });
  });

  test('a day without a loss has profit factor null', () => {
    const [day] = groupDays([makeTrade({ net: 100 })], env());
    expect(day!.stats.profitFactor).toBeNull();
    expect(day!.stats.winRate).toBe(1);
  });

  test('an open-only day has net null and an empty series', () => {
    const [day] = groupDays(
      [makeTrade({ net: 0, status: 'open', openedAt: at('2026-03-02') })],
      env(),
    );
    expect(day!.stats.trades).toBe(1);
    expect(day!.stats.net).toBeNull();
    expect(day!.stats.gross).toBeNull();
    expect(day!.stats.winRate).toBeNull();
    expect(day!.series).toEqual([]);
  });

  test('a mixed-currency day keeps other currencies apart', () => {
    const usd = makeTrade({ net: 100 });
    const gbp = makeTrade({ net: 900, pnlCurrency: 'GBP' });
    const [day] = groupDays([usd, gbp], env());
    expect(day!.trades).toEqual([usd]);
    expect(day!.otherCurrency).toEqual([gbp]);
    expect(day!.stats.net).toBe(100);
    expect(day!.series).toHaveLength(1);
    const only = groupDays(
      [
        makeTrade({
          net: 5,
          pnlCurrency: 'GBP',
          openedAt: at('2026-04-01'),
          closedAt: at('2026-04-01'),
        }),
      ],
      env(),
    );
    expect(only).toHaveLength(1);
    expect(only[0]!.trades).toEqual([]);
    expect(only[0]!.stats.net).toBeNull();
  });

  test('note-only days get a group with empty stats', () => {
    const t = makeTrade({ net: 10 });
    const days = groupDays(
      [t],
      env({ noteDates: new Set(['2026-03-02', '2026-03-05']) }),
    );
    expect(days.map((d) => d.date)).toEqual(['2026-03-05', '2026-03-02']);
    expect(days[0]).toEqual({
      date: '2026-03-05',
      trades: [],
      stats: {
        trades: 0,
        wins: 0,
        losses: 0,
        net: null,
        gross: null,
        commissions: 0,
        winRate: null,
        profitFactor: null,
        volume: 0,
      },
      series: [],
      otherCurrency: [],
      hasNote: true,
    });
    expect(days[1]!.hasNote).toBe(true);
    expect(groupDays([t], env())[0]!.hasNote).toBe(false);
  });
});

describe('week grouping', () => {
  // 2026-03-01 is a Sunday.
  const trades = () => [
    makeTrade({
      net: 100,
      openedAt: at('2026-03-01'),
      closedAt: at('2026-03-01'),
    }),
    makeTrade({
      net: -40,
      openedAt: at('2026-03-02'),
      closedAt: at('2026-03-02'),
    }),
    makeTrade({
      net: 30,
      openedAt: at('2026-03-07'),
      closedAt: at('2026-03-07'),
    }),
    makeTrade({
      net: 20,
      openedAt: at('2026-03-08'),
      closedAt: at('2026-03-08'),
    }),
  ];

  test('tiles follow the week start', () => {
    const sun = groupWeeks(groupDays(trades(), env()), env());
    expect(sun.map((w) => [w.start, w.end])).toEqual([
      ['2026-03-08', '2026-03-14'],
      ['2026-03-01', '2026-03-07'],
    ]);
    const w = sun[1]!;
    expect(w.days).toHaveLength(7);
    expect(w.days.map((d) => d?.date ?? null)).toEqual([
      '2026-03-01',
      '2026-03-02',
      null,
      null,
      null,
      null,
      '2026-03-07',
    ]);
    expect(w.dailyNet).toEqual([100, -40, null, null, null, null, 30]);
    expect(w.stats.net).toBe(90);
    expect(w.stats.trades).toBe(3);
    expect(w.trades).toHaveLength(3);

    const monEnv = env({ weekStart: 'monday' });
    const mon = groupWeeks(groupDays(trades(), monEnv), monEnv);
    expect(mon.map((x) => x.start)).toEqual(['2026-03-02', '2026-02-23']);
    expect(mon[0]!.days.map((d) => d?.date ?? null)).toEqual([
      '2026-03-02',
      null,
      null,
      null,
      null,
      '2026-03-07',
      '2026-03-08',
    ]);
    expect(mon[0]!.end).toBe('2026-03-08');
  });

  test('gap weeks and an empty current week are left out', () => {
    const t = [
      makeTrade({
        net: 1,
        openedAt: at('2026-03-02'),
        closedAt: at('2026-03-02'),
      }),
      makeTrade({
        net: 1,
        openedAt: at('2026-03-23'),
        closedAt: at('2026-03-23'),
      }),
    ];
    const e = env({ noteDates: new Set(['2026-03-31']) });
    const weeks = groupWeeks(groupDays(t, e), e);
    expect(weeks.map((w) => w.start)).toEqual(['2026-03-22', '2026-03-01']);
  });
});

describe('week grouping, other currencies and closed trades', () => {
  test('a GBP-only week stays, with its trades apart', () => {
    const gbp = makeTrade({
      net: 5,
      pnlCurrency: 'GBP',
      openedAt: at('2026-03-10'),
      closedAt: at('2026-03-10'),
    });
    const [w] = groupWeeks(groupDays([gbp], env()), env());
    expect(w!.start).toBe('2026-03-08');
    expect(w!.trades).toEqual([]);
    expect(w!.otherCurrency).toEqual([gbp]);
    expect(w!.stats.net).toBeNull();
  });

  test('a mixed week keeps a GBP-only tile apart from the sums', () => {
    const usd = makeTrade({
      net: 10,
      openedAt: at('2026-03-09'),
      closedAt: at('2026-03-09'),
    });
    const gbp = makeTrade({
      net: 7,
      pnlCurrency: 'GBP',
      openedAt: at('2026-03-10'),
      closedAt: at('2026-03-10'),
    });
    const [w] = groupWeeks(groupDays([usd, gbp], env()), env());
    expect(w!.trades).toEqual([usd]);
    expect(w!.otherCurrency).toEqual([gbp]);
    expect(w!.stats.net).toBe(10);
    expect(w!.days[2]!.trades).toEqual([]);
    expect(w!.days[2]!.otherCurrency).toEqual([gbp]);
  });

  test('closed status without a close time counts as open everywhere', () => {
    const t = makeTrade({ net: 9, openedAt: at('2026-03-02') });
    delete t.closedAt;
    const [d] = groupDays([t], env());
    expect(d!.date).toBe('2026-03-02');
    expect(d!.stats.net).toBeNull();
    expect(d!.series).toEqual([]);
  });
});

describe('the chart span (R19)', () => {
  test('startOfLocalDay is 00:00 of the date in the zone', () => {
    expect(startOfLocalDay('2026-03-02', NY)).toBe('2026-03-02T05:00:00.000Z');
    // Summer: UTC-4.
    expect(startOfLocalDay('2026-07-02', NY)).toBe('2026-07-02T04:00:00.000Z');
    expect(startOfLocalDay('2026-03-02', 'UTC')).toBe(
      '2026-03-02T00:00:00.000Z',
    );
  });

  test('the span runs from the first open of the day to the last close', () => {
    const a = makeTrade({
      net: 1,
      openedAt: at('2026-03-02', '14:00'),
      closedAt: at('2026-03-02', '15:00'),
    });
    const b = makeTrade({
      net: 1,
      openedAt: at('2026-03-02', '16:00'),
      closedAt: at('2026-03-02', '18:30'),
    });
    expect(daySpan([a, b], '2026-03-02', NY)).toEqual({
      from: at('2026-03-02', '14:00').replace(':00Z', ':00.000Z'),
      to: at('2026-03-02', '18:30').replace(':00Z', ':00.000Z'),
    });
  });

  test('a trade opened two days before it closes starts the span at 00:00 of the day', () => {
    const swing = makeTrade({
      net: 1,
      openedAt: at('2026-02-28', '15:00'),
      closedAt: at('2026-03-02', '15:00'),
    });
    expect(daySpan([swing], '2026-03-02', NY)).toEqual({
      from: '2026-03-02T05:00:00.000Z',
      to: '2026-03-02T15:00:00.000Z',
    });
  });

  test('a day with no closed trade has no span', () => {
    const open = makeTrade({
      net: 0,
      status: 'open',
      openedAt: at('2026-03-02', '15:00'),
    });
    expect(daySpan([open], '2026-03-02', NY)).toBeUndefined();
  });
});

describe('week rows (R5)', () => {
  // 2026-03-01 is a Sunday.
  const week = [
    makeTrade({
      id: 'x1',
      serial: 1,
      net: 1,
      openedAt: at('2026-03-02', '14:00'),
      closedAt: at('2026-03-02', '15:00'),
    }),
    makeTrade({
      id: 'x2',
      serial: 2,
      net: 1,
      openedAt: at('2026-03-03', '14:00'),
      closedAt: at('2026-03-03', '15:00'),
    }),
    makeTrade({
      id: 'x3',
      serial: 3,
      net: 1,
      pnlCurrency: 'GBP',
      openedAt: at('2026-03-04', '14:00'),
      closedAt: at('2026-03-04', '15:00'),
    }),
    makeTrade({
      id: 'x4',
      serial: 4,
      net: 1,
      openedAt: at('2026-03-10', '14:00'),
      closedAt: at('2026-03-10', '15:00'),
    }),
  ];

  test('buckets by week start, base currency apart from the rest, newest open first', () => {
    const rows = weekRows(week, env());
    expect([...rows.keys()].sort()).toEqual(['2026-03-01', '2026-03-08']);
    const first = rows.get('2026-03-01')!;
    expect(first.trades.map((t) => t.id)).toEqual(['x2', 'x1']);
    expect(first.otherCurrency.map((t) => t.id)).toEqual(['x3']);
    expect(rows.get('2026-03-08')!.trades.map((t) => t.id)).toEqual(['x4']);
  });

  test('follows the week start preference', () => {
    const rows = weekRows(week, env({ weekStart: 'monday' }));
    expect([...rows.keys()].sort()).toEqual(['2026-03-02', '2026-03-09']);
  });

  test('is empty with no trades', () => {
    expect(weekRows([], env()).size).toBe(0);
  });
});

describe('performance', () => {
  let s: SampleWorkspace;
  beforeAll(() => {
    s = generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' });
  }, 30_000);

  test('groups the sample in under 50 ms (bound 150)', () => {
    const e = env();
    const run = () => groupWeeks(groupDays(s.trades, e), e);
    run();
    const ms = Array.from({ length: 5 }, () => {
      const t = performance.now();
      run();
      return performance.now() - t;
    }).sort((x, y) => x - y);
    // 3x the spec's 50 ms so a loaded suite cannot flake it.
    expect(ms[2]!).toBeLessThan(150);
  });
});

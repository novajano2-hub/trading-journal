import { describe, expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import { defaultMetricContext } from '@/domain/metrics/context';
import { buildTrades } from '@/domain/trade-builder';
import type {
  Execution,
  JournalEntry,
  Strategy,
  Tag,
  TagCategory,
} from '@/domain/types';
import { dailyPnl, daySummary } from '@/domain/metrics/days';
import { exitShare } from '@/domain/metrics/realized';
import { summarize } from '@/domain/metrics/summary';
import { calendarMonth, calendarYear, dayExits, dayGrading } from './calendar';

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

  test('November 2026 runs Sunday to Saturday over five weeks by default', () => {
    const m = calendarMonth([], [], '2026-11', ctx);
    expect(m.weeks).toHaveLength(5);
    expect(m.weeks.every((w) => w.days.length === 7)).toBe(true);
    // 1 Nov is a Sunday: it opens the first week, in the first column.
    expect(m.weeks[0]!.days[0]!.date).toBe('2026-11-01');
    expect(m.weeks[0]!.start).toBe('2026-11-01');
    expect(m.weeks[4]!.days[1]!.date).toBe('2026-11-30');
    expect(m.weeks[4]!.days.slice(2)).toEqual(Array(5).fill(null));
  });

  test('with Monday weeks, November 2026 has six rows, outside days empty', () => {
    const m = calendarMonth([], [], '2026-11', {
      ...ctx,
      weekStart: 'monday',
    });
    expect(m.weeks).toHaveLength(6);
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
    const week = m.weeks[2]!; // 15-21 Nov, Sunday to Saturday
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

describe('trades that cross the month edge (U4)', () => {
  /** Two ES contracts in on 29 Oct: one out on 30 Oct, one out on 2 Nov. */
  const crossesIn = () =>
    buildTrades(
      [
        fill('e1', 'buy', 2, 5000, '2026-10-29T15:00:00Z', 300),
        fill('x1', 'sell', 1, 5010, '2026-10-30T15:00:00Z', 150),
        fill('x2', 'sell', 1, 5020, '2026-11-02T15:00:00Z', 150),
      ],
      {
        workspaceId: 'w',
        startSerial: 1,
        resolve: () => resolveInstrument('ESZ5'),
        accountCurrency: () => 'USD',
      },
    ).trades;

  test('a trade opened before the month books only its in-month exits, on their own day', () => {
    const m = calendarMonth(crossesIn(), [], '2026-11', ctx);
    expect(dayOf(m, '2026-11-02')).toMatchObject({
      trades: 1,
      gross: 100000,
      // Half the entry fee and the exit's own: the same split as a 2-day hold.
      fees: 300,
      net: 99700,
    });
    expect(m.summary).toMatchObject({ trades: 1, tradingDays: 1 });
    expect(m.summary.net).toBe(dayOf(m, '2026-11-02')!.net);
    // October's exit stays in October.
    const oct = calendarMonth(crossesIn(), [], '2026-10', ctx);
    expect(dayOf(oct, '2026-10-30')).toMatchObject({ trades: 1, gross: 50000 });
    expect(dayOf(oct, '2026-10-29')!.trades).toBe(0);
  });

  test('an open trade with a partial exit books that exit on its day', () => {
    const open = buildTrades(
      [
        fill('e1', 'buy', 2, 5000, '2026-11-16T15:00:00Z', 300),
        fill('x1', 'sell', 1, 5010, '2026-11-17T15:00:00Z', 150),
      ],
      {
        workspaceId: 'w',
        startSerial: 1,
        resolve: () => resolveInstrument('ESZ5'),
        accountCurrency: () => 'USD',
      },
    ).trades;
    expect(open[0]!.status).toBe('open');
    const m = calendarMonth(open, [], '2026-11', ctx);
    expect(dayOf(m, '2026-11-17')).toMatchObject({
      trades: 1,
      gross: 50000,
      net: 49700,
    });
    expect(dayOf(m, '2026-11-16')!.trades).toBe(0);
    expect(dayExits(open, '2026-11-17', ctx)).toHaveLength(1);
  });
});

describe('the date range does not clip the month', () => {
  const trades = [
    makeTrade({ net: 1000, closedAt: '2026-11-02T15:00:00Z' }),
    makeTrade({ net: 2000, closedAt: '2026-11-12T15:00:00Z' }),
    makeTrade({ net: -500, closedAt: '2026-11-15T15:00:00Z' }),
    makeTrade({ net: 4000, closedAt: '2026-11-25T15:00:00Z' }),
  ];
  const ranged = { ...ctx, range: { from: '2026-11-10', to: '2026-11-20' } };

  test('every day of the month carries its figures, and the totals cover the whole month', () => {
    const m = calendarMonth(trades, [], '2026-11', ranged);
    expect(dayOf(m, '2026-11-02')).toMatchObject({ trades: 1, net: 1000 });
    expect(dayOf(m, '2026-11-25')).toMatchObject({ trades: 1, net: 4000 });
    expect(dayOf(m, '2026-11-12')).toMatchObject({ net: 2000 });
    expect(m.summary).toMatchObject({ net: 6500, trades: 4, tradingDays: 4 });
    expect(m.weeks.reduce((s, w) => s + w.net, 0)).toBe(6500);
    expect(m).toEqual(calendarMonth(trades, [], '2026-11', ctx));
  });

  test('a range that misses the month changes nothing either', () => {
    const away = { ...ctx, range: { from: '2026-12-01', to: '2026-12-31' } };
    const m = calendarMonth(trades, [], '2026-11', away);
    expect(m.summary).toMatchObject({ trades: 4, net: 6500 });
    expect(calendarMonth(trades, [], '2026-11', away)).toEqual(
      calendarMonth(trades, [], '2026-11', ctx),
    );
  });
});

describe('dayGrading (I1)', () => {
  const strategy = {
    id: 's1',
    workspaceId: 'w',
    name: 'S',
    description: '',
    assetClasses: [],
    checklist: [],
    status: 'active',
    groups: [
      {
        id: 'g',
        title: 'G',
        rules: [
          { id: 'r1', text: 'Always', showWhen: 'always' },
          { id: 'r2', text: 'Loser only', showWhen: 'loser' },
        ],
      },
    ],
  } as Strategy;
  const categories = [
    { id: 'cm', role: 'mistake' },
    { id: 'cs' },
  ] as TagCategory[];
  const tags = [
    { id: 'mist', categoryId: 'cm' },
    { id: 'setup', categoryId: 'cs' },
  ] as Tag[];
  const win = makeTrade({
    id: 'w1',
    net: 10000,
    closedAt: '2026-11-02T15:00:00Z',
    strategyIds: ['s1'],
    // r2 is graded on losers only: this winner's mark doesn't count.
    ruleChecks: [
      { ruleId: 'r1', followed: true },
      { ruleId: 'r2', followed: false },
    ],
    tagIds: ['setup'],
  });
  const loss = makeTrade({
    id: 'l1',
    net: -5000,
    closedAt: '2026-11-02T16:00:00Z',
    strategyIds: ['s1'],
    ruleChecks: [
      { ruleId: 'r1', followed: false },
      { ruleId: 'r2', followed: true },
    ],
    tagIds: ['mist', 'setup'],
  });

  test('rules kept counts graded checks of applying rules; mistakes counts mistake-tagged trades and their day P&L', () => {
    const exits = dayExits([win, loss], '2026-11-02', ctx);
    expect(dayGrading(exits, [strategy], tags, categories, ctx)).toEqual({
      rules: { kept: 2, checked: 3 },
      mistakes: { trades: 1, pnl: -5000 },
    });
  });

  test('a trade with two exits that day counts once, and a day with none grades nothing', () => {
    const exits = dayExits([loss, loss], '2026-11-02', ctx);
    expect(
      dayGrading(exits, [strategy], tags, categories, ctx).mistakes.trades,
    ).toBe(1);
    expect(dayGrading([], [strategy], tags, categories, ctx)).toEqual({
      rules: { kept: 0, checked: 0 },
      mistakes: { trades: 0, pnl: 0 },
    });
  });
});

describe('the day and month figures (Task 30)', () => {
  const day = '2026-11-17';
  const es = (id: string, net: number, avgExit: number, maxPosition: number) =>
    makeTrade({
      id,
      net,
      gross: net,
      avgEntry: 5000,
      avgExit,
      maxPosition,
      closedAt: `${day}T16:00:00Z`,
    });
  const eur = makeTrade({
    id: 'fx',
    net: 1000,
    gross: 1000,
    instrument: resolveInstrument('EURUSD')!,
    avgEntry: 1.1,
    avgExit: 1.1012,
    maxPosition: 1.5,
    closedAt: `${day}T16:00:00Z`,
  });
  // +40 ticks x1, -8 ticks (a 1-point loss on two contracts), +12 pips on 1.5 lots.
  const trades = [es('w', 5000, 5010, 1), es('l', -2000, 4999, 2), eur];
  const d = () => dayOf(calendarMonth(trades, [], '2026-11', ctx), day)!;

  test('a day sums ticks and points over its futures trades and pips over its forex trades', () => {
    expect(d()).toMatchObject({ ticks: 32, points: 8, pips: 12 });
  });

  test('a day with no eligible trade has null, so the cell can say None', () => {
    const only = calendarMonth([eur], [], '2026-11', ctx);
    expect(dayOf(only, day)).toMatchObject({
      ticks: null,
      points: null,
      pips: 12,
    });
    const fut = calendarMonth([trades[0]!], [], '2026-11', ctx);
    expect(dayOf(fut, day)).toMatchObject({
      ticks: 40,
      points: 10,
      pips: null,
    });
  });

  test('volume counts each trade once and the profit factor is won over lost', () => {
    expect(d().volume).toBe(4.5);
    expect(d().profitFactor).toBe(3);
    expect(d().wins).toBe(2);
    expect(d().losses).toBe(1);
  });

  test('a day with no loss has no profit factor', () => {
    const m = calendarMonth([trades[0]!], [], '2026-11', ctx);
    expect(dayOf(m, day)!.profitFactor).toBeNull();
  });

  test('a trade held over two days books each exit by its own move (final review ruling 2)', () => {
    const m = calendarMonth(heldTwoDays(), [], '2026-11', ctx);
    // 1 ES contract out each day from 5000: at 5010 (+40 ticks), then at 5020
    // (+80 ticks). The trade's 120 ticks are their sum.
    expect(dayOf(m, '2026-11-16')!.ticks).toBe(40);
    expect(dayOf(m, '2026-11-17')!.ticks).toBe(80);
    expect(dayOf(m, '2026-11-16')!.volume).toBe(1);
    expect(dayOf(m, '2026-11-17')!.volume).toBe(1);
  });

  test('the month counts winners and losers and the trade win rate', () => {
    const { summary } = calendarMonth(trades, [], '2026-11', ctx);
    expect(summary).toMatchObject({ wins: 2, losses: 1 });
    expect(summary.winRate).toBeCloseTo(2 / 3, 6);
    expect(calendarMonth([], [], '2026-11', ctx).summary.winRate).toBeNull();
  });
});

describe('Task 30 fix round 1', () => {
  const day = '2026-11-17';
  const at = (id: string, net: number, avgExit: number, maxPosition = 1) =>
    makeTrade({
      id,
      net,
      gross: net,
      avgEntry: 5000,
      avgExit,
      maxPosition,
      closedAt: `${day}T16:00:00Z`,
    });
  const pf = (trades: ReturnType<typeof at>[], c = ctx) =>
    dayOf(calendarMonth(trades, [], '2026-11', c), day)!.profitFactor;

  test('the day profit factor leaves breakeven trades out, as the summary does', () => {
    const wide = {
      ...ctx,
      breakevenRange: { unit: 'amount' as const, from: -1000, to: 1000 },
    };
    const t = [at('w', 5000, 5010), at('l', -2000, 4999), at('b', -500, 5000)];
    // 5000 / 2000, not 5000 / 2500.
    expect(pf(t, wide)).toBe(2.5);
  });

  test('under Ticks the day profit factor reads ticks', () => {
    const t = [at('w', 5000, 5010), at('l', -2000, 4999, 2)];
    expect(pf(t)).toBe(2.5);
    expect(pf(t, { ...ctx, unit: 'ticks' })).toBe(5);
  });

  test('a split exit shares its volume by exited size, so days sum to the quantity', () => {
    const m = calendarMonth(heldTwoDays(), [], '2026-11', ctx);
    expect(dayOf(m, '2026-11-16')!.volume).toBe(1);
    expect(dayOf(m, '2026-11-17')!.volume).toBe(1);
    const total = m.weeks
      .flatMap((w) => w.days)
      .reduce((n, d) => n + (d?.volume ?? 0), 0);
    expect(total).toBe(2);
  });

  test('a quantity that is not finite or is zero splits equally, never in full', () => {
    expect(exitShare(Infinity, Infinity, 2)).toBe(0.5);
    expect(exitShare(0, 0, 4)).toBe(0.25);
    expect(exitShare(1, 4, 2)).toBe(0.25);
  });

  test('the month counts a trade once, by its close, however many days it exited on', () => {
    const { summary } = calendarMonth(heldTwoDays(), [], '2026-11', ctx);
    expect(summary).toMatchObject({ wins: 1, losses: 0, winRate: 1 });
  });
});

describe('the month reads the shared day and trade figures (M8)', () => {
  // A win and a breakeven on the 16th (green), a loss on the 17th (red),
  // a breakeven alone on the 18th (flat).
  const at = (id: string, net: number, day: string) =>
    makeTrade({ id, net, gross: net, closedAt: `${day}T16:00:00Z` });
  const trades = [
    at('w', 10000, '2026-11-16'),
    at('b1', 0, '2026-11-16'),
    at('l', -4000, '2026-11-17'),
    at('b2', 0, '2026-11-18'),
  ];
  test('its day win rate is the one daySummary gives, and its trade win rate the one summarize gives', () => {
    const { summary } = calendarMonth(trades, [], '2026-11', ctx);
    const scoped = { ...ctx, range: { from: '2026-11-01', to: '2026-11-30' } };
    const days = daySummary(dailyPnl(trades, scoped), scoped);
    const sum = summarize(trades, ctx);
    expect(summary.dayWinRate).toBe(days.greenPct);
    expect(summary.dayWinRate).toBeCloseTo(1 / 3, 10);
    expect([summary.greenDays, summary.redDays, summary.flatDays]).toEqual([
      days.greenDays,
      days.redDays,
      days.flatDays,
    ]);
    expect([summary.wins, summary.losses, summary.winRate]).toEqual([
      sum.wins,
      sum.losses,
      sum.winRate,
    ]);
  });
});

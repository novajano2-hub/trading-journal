import { beforeAll, describe, expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { DEFAULT_TEMPLATE } from '@/domain/dashboard/templates';
import { WIDGETS } from '@/domain/dashboard/widgets';
import { balanceAt, balanceSeries } from '@/domain/metrics/balance';
import { dailyPnl, daySummary } from '@/domain/metrics/days';
import {
  avgDrawdown,
  drawdownSeries,
  equityCurve,
  maxDrawdown,
} from '@/domain/metrics/equity';
import { scatterPoints } from '@/domain/metrics/scatter';
import { scoreOf } from '@/domain/metrics/score';
import { winStreak } from '@/domain/metrics/streaks';
import { summarize } from '@/domain/metrics/summary';
import { throughDay } from '@/domain/metrics/through-day';
import type { WidgetKey } from '@/domain/types';
import { applyFilters, EMPTY_FILTERS, selectedAccounts } from './filters';
import { generateSampleWorkspace, SAMPLE_SEED } from './seed/generate';
import type { SampleWorkspace } from './seed/generate';
import { widgetData, type WidgetEnv } from './widget-data';

const NY = 'America/New_York';
const TODAY = '2026-11-20';
const CTX = {
  timeZone: NY,
  breakevenRange: { unit: 'amount' as const, from: 0, to: 0 },
  pnlBasis: 'net' as const,
  weekStart: 'sunday' as const,
};

function envOf(s: SampleWorkspace, over: Partial<WidgetEnv> = {}): WidgetEnv {
  const matched = applyFilters(s.trades, EMPTY_FILTERS, {
    timeZone: NY,
    today: TODAY,
    accounts: s.accounts,
    breakevenRange: CTX.breakevenRange,
    pnlBasis: 'net',
  });
  return {
    matched,
    trades: matched,
    dayTrades: matched,
    accounts: selectedAccounts(s.accounts, EMPTY_FILTERS),
    flows: [],
    balanceTrades: s.trades,
    ctx: CTX,
    baseCurrency: 'USD',
    today: TODAY,
    ...over,
  };
}

describe('widgetData', () => {
  let s: SampleWorkspace;
  beforeAll(() => {
    s = generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' });
  });

  test('only the listed widgets are computed', () => {
    const { values } = widgetData(['net-pnl', 'score'], envOf(s));
    expect(Object.keys(values).sort()).toEqual(['net-pnl', 'score']);
  });

  test('a widget whose series is not built yet reads undefined', () => {
    // The challenge reads its own challenges, and the progress tracker is 6A's card.
    const { values } = widgetData(['challenge', 'progress'], envOf(s));
    expect(values.challenge).toBeUndefined();
    expect(values.progress).toBeUndefined();
  });

  test('every key of the catalogue is accepted, and the built ones are read', () => {
    const keys = Object.keys(WIDGETS) as WidgetKey[];
    const { values } = widgetData(keys, envOf(s));
    const unbuilt = ['challenge', 'progress'];
    for (const k of keys)
      expect(Object.hasOwn(values, k), k).toBe(!unbuilt.includes(k));
  });

  describe('the list, calendar and report widgets (#46, 9B)', () => {
    const usd = (trades: readonly { pnlCurrency: string }[]) =>
      trades.filter((t) => t.pnlCurrency === 'USD');

    test('recent reads the trades the filters match, in the one currency', () => {
      const env = envOf(s, {
        trades: envOf(s).trades.slice(0, 40),
      });
      const { values } = widgetData(['recent'], env);
      expect(values.recent).toEqual(usd(env.trades));
    });

    test('the four calendars read every filter but the date: the day trades, whatever the range', () => {
      const env = envOf(s, {
        trades: envOf(s).trades.slice(0, 10),
        ctx: { ...CTX, range: { from: '2026-11-19', to: '2026-11-19' } },
      });
      const { values } = widgetData(
        ['calendar', 'calendar-mini', 'calendar-adv', 'year'],
        env,
      );
      for (const k of [
        'calendar',
        'calendar-mini',
        'calendar-adv',
        'year',
      ] as const) {
        expect(values[k], k).toEqual(usd(env.dayTrades));
        expect(values[k], k).not.toEqual(usd(env.trades));
      }
    });

    test('the report reads the day trades and the balance before the range, as Performance does', () => {
      const env = envOf(s, {
        ctx: { ...CTX, range: { from: '2026-10-01', to: '2026-11-19' } },
      });
      const { values } = widgetData(['report'], env);
      const accounts = env.accounts.filter((a) => a.currency === 'USD');
      expect(values.report).toEqual({
        dayTrades: usd(env.dayTrades),
        riskStart: balanceAt(
          accounts,
          [],
          env.balanceTrades,
          '2026-09-30',
          env.ctx,
        ),
        riskFlows: [],
      });
    });
  });

  test('the figure widgets read the summary and the day figures of the base currency', () => {
    const env = envOf(s);
    const { values, currency, currencies } = widgetData(
      [
        'net-pnl',
        'trade-win',
        'profit-factor',
        'win-loss-ratio',
        'expectancy',
        'day-win',
      ],
      env,
    );
    expect(currency).toBe('USD');
    expect(currencies).toEqual(['USD']);
    const usd = env.trades.filter((t) => t.pnlCurrency === 'USD');
    const summary = summarize(usd, CTX);
    for (const k of [
      'net-pnl',
      'trade-win',
      'profit-factor',
      'win-loss-ratio',
      'expectancy',
    ] as const)
      expect(values[k], k).toEqual(summary);
    expect(values['day-win']).toEqual(daySummary(dailyPnl(usd, CTX), CTX));
  });

  test('drawdown and equity read the daily curve from the balance before the range', () => {
    const env = envOf(s, {
      ctx: { ...CTX, range: { from: '2026-10-01', to: '2026-11-19' } },
    });
    const { values } = widgetData(
      ['max-drawdown', 'avg-drawdown', 'drawdown', 'balance'],
      env,
    );
    const ctx = env.ctx;
    const days = dailyPnl(env.dayTrades, ctx);
    const accounts = env.accounts.filter((a) => a.currency === 'USD');
    const start = balanceAt(accounts, [], env.balanceTrades, '2026-09-30', ctx);
    expect(values['max-drawdown']).toEqual(maxDrawdown(days, start, []));
    expect(values['avg-drawdown']).toMatchObject(avgDrawdown(days, start, []));
    expect(values.drawdown).toEqual(drawdownSeries(days));
    const startingBalance = accounts.reduce((n, a) => n + a.startingBalance, 0);
    // `points` (the balance a day at a time) has its own test below.
    expect(values.balance).toMatchObject({
      startingBalance,
      equity: equityCurve(
        env.trades.filter((t) => t.pnlCurrency === 'USD'),
        startingBalance,
        ctx,
      ),
      flows: [],
    });
  });

  test('the average drawdown also reads today when no range is set (C18)', () => {
    const { values } = widgetData(['avg-drawdown'], envOf(s));
    const days = dailyPnl(
      envOf(s).dayTrades.filter((t) => t.pnlCurrency === 'USD'),
      CTX,
    );
    const curve = drawdownSeries(days);
    expect(values['avg-drawdown']?.current).toBe(
      curve[curve.length - 1]!.value,
    );
  });

  test('account balance and P&L: the balance at the range end and the net in the range', () => {
    const env = envOf(s, {
      ctx: { ...CTX, range: { from: '2026-10-01', to: '2026-11-10' } },
    });
    const { values } = widgetData(['balance-pnl'], env);
    const accounts = env.accounts.filter((a) => a.currency === 'USD');
    expect(values['balance-pnl']).toEqual({
      balance: balanceAt(
        accounts,
        [],
        env.balanceTrades.filter((t) => t.pnlCurrency === 'USD'),
        '2026-11-10',
        env.ctx,
      ),
      net: summarize(
        env.trades.filter((t) => t.pnlCurrency === 'USD'),
        env.ctx,
      ).netPnl,
      startingBalance: accounts.reduce((n, a) => n + a.startingBalance, 0),
    });
    // With no range the balance is today's.
    const open = widgetData(['balance-pnl'], envOf(s)).values['balance-pnl']!;
    expect(open.balance).toBe(
      balanceAt(
        accounts,
        [],
        env.balanceTrades.filter((t) => t.pnlCurrency === 'USD'),
        TODAY,
        CTX,
      ),
    );
  });

  test('the daily widgets read the day figures', () => {
    const env = envOf(s);
    const { values } = widgetData(['daily-pnl', 'daily-cum', 'cum-pnl'], env);
    const days = dailyPnl(
      env.dayTrades.filter((t) => t.pnlCurrency === 'USD'),
      CTX,
    );
    expect(values['daily-pnl']).toEqual(days);
    expect(values['daily-cum']).toEqual(days);
    expect(values['cum-pnl']).toEqual(days);
  });

  test('win rate, average win and average loss read the closed trades through the day (C14)', () => {
    const env = envOf(s);
    const { values } = widgetData(['win-avg'], env);
    const usd = env.trades.filter((t) => t.pnlCurrency === 'USD');
    expect(values['win-avg']).toEqual(throughDay(usd, CTX));
    expect(values['win-avg']!.length).toBeGreaterThan(100);
    const minutes = values['win-avg']!.map((p) => p.minute);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  describe('the balance chart (C75)', () => {
    const flow = (
      id: string,
      accountId: string,
      date: string,
      amount: number,
    ) => ({
      id,
      workspaceId: 'w',
      accountId,
      date,
      amount,
    });

    test('a point a day, the balance as balanceAt has it, and the net flows', () => {
      const accounts = selectedAccounts(s.accounts, EMPTY_FILTERS);
      const usd = accounts.filter((a) => a.currency === 'USD');
      const flows = [
        flow('f1', usd[0]!.id, '2026-10-05', 1_000_00),
        flow('f2', usd[0]!.id, '2026-10-20', -400_00),
        flow('f3', usd[0]!.id, '2026-11-30', 9_999_00),
      ];
      const range = { from: '2026-10-01', to: '2026-11-19' };
      const env = envOf(s, { flows, ctx: { ...CTX, range } });
      const { balance } = widgetData(['balance'], env).values;
      const points = balance!.points;
      const everyTrade = env.balanceTrades.filter(
        (t) => t.pnlCurrency === 'USD',
      );
      expect(points.length).toBeGreaterThan(20);
      // Inside the range and in date order, with the two flows' days among them.
      expect(points[0]!.date >= range.from).toBe(true);
      expect(points[points.length - 1]!.date <= range.to).toBe(true);
      expect(points.map((p) => p.date)).toEqual(
        [...new Set(points.map((p) => p.date))].sort(),
      );
      expect(points.some((p) => p.date === '2026-10-05')).toBe(true);
      // Every point is the balance on its date.
      for (const p of [points[0]!, points[7]!, points[points.length - 1]!])
        expect(p.balance, p.date).toBe(
          balanceAt(usd, flows, everyTrade, p.date, CTX),
        );
      // The flow dated after the range is not in the line; the two inside are, net.
      expect(points[points.length - 1]!.flows).toBe(1_000_00 - 400_00);
      expect(points[0]!.flows).toBe(0);
      // What `balance` held before is still there.
      expect(balance!.startingBalance).toBe(
        usd.reduce((n, a) => n + a.startingBalance, 0),
      );
    });

    test('is the series balanceSeries makes from every trade of the accounts', () => {
      const env = envOf(s);
      const { balance } = widgetData(['balance'], env).values;
      const accounts = env.accounts.filter((a) => a.currency === 'USD');
      const start = accounts.reduce((n, a) => n + a.startingBalance, 0);
      const days = dailyPnl(
        env.balanceTrades.filter((t) => t.pnlCurrency === 'USD'),
        { ...CTX, pnlBasis: 'net' },
      );
      expect(balance!.points).toEqual(balanceSeries(days, start, []));
    });

    test('a narrowing unit leaves the line empty: a balance has no value in it', () => {
      const env = envOf(s, { ctx: { ...CTX, unit: 'ticks' } });
      expect(widgetData(['balance'], env).values.balance!.points).toEqual([]);
    });
  });

  test('the scatters read both times, and the hold', () => {
    const env = envOf(s);
    const { values } = widgetData(['trade-time', 'trade-duration'], env);
    const usd = env.trades.filter((t) => t.pnlCurrency === 'USD');
    expect(values['trade-time']).toEqual({
      entry: scatterPoints(usd, CTX, 'entry'),
      exit: scatterPoints(usd, CTX, 'exit'),
    });
    expect(values['trade-duration']).toEqual(
      scatterPoints(usd, CTX, 'duration'),
    );
  });

  test('the score follows the filters and not the unit', () => {
    // A unit that narrows the trades leaves the score on all of them.
    const env = envOf(s);
    const narrowed = env.trades.filter((t) => t.id.endsWith('1'));
    const { values } = widgetData(['score'], {
      ...env,
      trades: narrowed,
      dayTrades: narrowed,
      ctx: { ...CTX, unit: 'ticks' },
    });
    const usd = env.matched.filter((t) => t.pnlCurrency === 'USD');
    expect(values.score).toEqual(scoreOf(usd, CTX));
    expect(values.score!.total).toBeGreaterThan(0);
    // No closed trade, no score.
    const none = widgetData(['score'], {
      ...env,
      matched: [],
      trades: [],
      dayTrades: [],
    });
    expect(none.values.score).toBeNull();
  });

  describe('streaks (C16)', () => {
    const on = (date: string, net: number) =>
      makeTrade({
        accountId: 'a1',
        net,
        openedAt: `${date}T15:00:00Z`,
        closedAt: `${date}T15:30:00Z`,
        serial: Number(date.slice(8)),
      });
    const small = (trades: ReturnType<typeof on>[]): WidgetEnv => ({
      matched: trades,
      trades,
      dayTrades: trades,
      accounts: [],
      flows: [],
      balanceTrades: trades,
      ctx: CTX,
      baseCurrency: 'USD',
      today: TODAY,
    });
    const read = (trades: ReturnType<typeof on>[]) =>
      widgetData(['day-streak', 'trade-streak', 'streaks'], small(trades))
        .values;

    test('wins in a row ending on the last day and the last trade', () => {
      const v = read([
        on('2026-11-02', -100),
        on('2026-11-03', 200),
        on('2026-11-04', 300),
        on('2026-11-05', 50),
      ]);
      expect(v['day-streak']).toBe(3);
      expect(v['trade-streak']).toBe(3);
      expect(v.streaks).toEqual({ day: 3, trade: 3 });
    });

    test('a loss or a flat day or trade ends the run', () => {
      expect(
        read([on('2026-11-03', 200), on('2026-11-04', -50)])['day-streak'],
      ).toBe(0);
      expect(
        read([on('2026-11-03', 200), on('2026-11-04', 0)])['trade-streak'],
      ).toBe(0);
      expect(
        read([
          on('2026-11-03', 200),
          on('2026-11-04', 0),
          on('2026-11-05', 10),
        ])['day-streak'],
      ).toBe(1);
    });

    test('a win inside the breakeven range is a flat one', () => {
      const trades = [on('2026-11-03', 200), on('2026-11-04', 40)];
      const v = widgetData(['day-streak', 'trade-streak'], {
        ...small(trades),
        ctx: {
          ...CTX,
          breakevenRange: { unit: 'amount', from: -50, to: 50 },
        },
      }).values;
      expect(v['day-streak']).toBe(0);
      expect(v['trade-streak']).toBe(0);
    });

    test('with no trade both are 0', () => {
      expect(read([]).streaks).toEqual({ day: 0, trade: 0 });
    });

    test('the streak helper agrees on the sample', () => {
      const env = envOf(s);
      const days = dailyPnl(
        env.dayTrades.filter((t) => t.pnlCurrency === 'USD'),
        CTX,
      );
      const { values } = widgetData(['day-streak'], env);
      expect(values['day-streak']).toBe(
        winStreak(days.map((d) => ({ pnl: d.net }))),
      );
    });
  });

  describe('currencies (C58)', () => {
    const t = (id: string, currency: string, net: number) =>
      makeTrade({
        id,
        net,
        pnlCurrency: currency,
        accountId: 'a1',
        openedAt: '2026-11-03T15:00:00Z',
        closedAt: '2026-11-03T15:30:00Z',
      });
    const trades = [t('u1', 'USD', 1_000), t('e1', 'EUR', 5_000)];
    const env: WidgetEnv = {
      matched: trades,
      trades,
      dayTrades: trades,
      accounts: [],
      flows: [],
      balanceTrades: trades,
      ctx: CTX,
      baseCurrency: 'USD',
      today: TODAY,
    };

    test('the base currency comes first and is read by default; the others follow', () => {
      const r = widgetData(['net-pnl'], env);
      expect(r.currencies).toEqual(['USD', 'EUR']);
      expect(r.currency).toBe('USD');
      expect(r.values['net-pnl']!.netPnl).toBe(1_000);
    });

    test('the chosen currency is the one every widget reads', () => {
      const r = widgetData(['net-pnl', 'score'], { ...env, currency: 'EUR' });
      expect(r.currency).toBe('EUR');
      expect(r.values['net-pnl']!.netPnl).toBe(5_000);
      expect(r.values.score).toEqual(scoreOf([trades[1]!], CTX));
    });

    test('an unknown currency falls back to the base', () => {
      expect(
        widgetData(['net-pnl'], { ...env, currency: 'JPY' }).currency,
      ).toBe('USD');
    });

    test('the base currency is present with no trade in it', () => {
      const r = widgetData(['net-pnl'], {
        ...env,
        matched: [trades[1]!],
        trades: [trades[1]!],
        dayTrades: [trades[1]!],
      });
      expect(r.currencies).toEqual(['USD', 'EUR']);
      expect(r.values['net-pnl']!.closedCount).toBe(0);
    });
  });

  test('default template data budget: the sample in under 100 ms', () => {
    const keys = [...DEFAULT_TEMPLATE.upper, ...DEFAULT_TEMPLATE.lower].map(
      (r) => r.key as WidgetKey,
    );
    expect(keys.length).toBeGreaterThanOrEqual(14);
    const env = envOf(s, {
      ctx: { ...CTX, range: { from: '2026-09-01', to: '2026-11-19' } },
    });
    widgetData(keys, env); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      widgetData(keys, env);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[2]!).toBeLessThan(100);
  });
});

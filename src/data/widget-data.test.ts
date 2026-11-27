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
import {
  applyFilters,
  EMPTY_FILTERS,
  selectedAccounts,
  narrowToUnit,
  resolveRange,
  type GlobalFilters,
} from './filters';
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

/** The env `useWidgetData` builds: the filters' trades and accounts, and every trade of the workspace for the balance. */
function envOf(
  s: SampleWorkspace,
  over: Partial<WidgetEnv> = {},
  filters: GlobalFilters = EMPTY_FILTERS,
): WidgetEnv {
  const matched = applyFilters(s.trades, filters, {
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
    accounts: selectedAccounts(s.accounts, filters),
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
      unfunded: false,
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

  describe('unfunded: the balance widgets ask for a starting balance only when there is none and no cash flow by the range end', () => {
    const flowOn = (accountId: string, date: string, amount: number) => ({
      id: `f-${date}`,
      workspaceId: 'w',
      accountId,
      date,
      amount,
    });
    /** The sample's accounts with no starting balance. */
    const bare = () => {
      const accounts = selectedAccounts(s.accounts, EMPTY_FILTERS).map((a) => ({
        ...a,
        startingBalance: 0,
      }));
      return { accounts, usd: accounts.find((a) => a.currency === 'USD')! };
    };
    const both = (env: WidgetEnv) => {
      const { values } = widgetData(['balance-pnl', 'balance'], env);
      return [values['balance-pnl']!.unfunded, values.balance!.unfunded];
    };

    test('with a starting balance it is funded, flows or not', () => {
      expect(both(envOf(s))).toEqual([false, false]);
    });

    test('with none and no deposit or withdrawal it is not', () => {
      const { accounts } = bare();
      expect(both(envOf(s, { accounts }))).toEqual([true, true]);
    });

    test('a deposit dated by the range end funds the account (a withdrawal counts as a cash flow too)', () => {
      const { accounts, usd } = bare();
      const range = { from: '2026-10-01', to: '2026-11-10' };
      for (const amount of [1_000_00, -400_00])
        expect(
          both(
            envOf(s, {
              accounts,
              flows: [flowOn(usd.id, '2026-11-10', amount)],
              ctx: { ...CTX, range },
            }),
          ),
        ).toEqual([false, false]);
    });

    test('a flow dated after the range end, or on another currency, does not', () => {
      const { accounts, usd } = bare();
      const other = accounts.find((a) => a.currency !== 'USD');
      const range = { from: '2026-10-01', to: '2026-11-10' };
      expect(
        both(
          envOf(s, {
            accounts,
            flows: [flowOn(usd.id, '2026-11-11', 1_000_00)],
            ctx: { ...CTX, range },
          }),
        ),
      ).toEqual([true, true]);
      if (other)
        expect(
          both(
            envOf(s, {
              accounts,
              flows: [flowOn(other.id, '2026-10-05', 1_000_00)],
            }),
          ),
        ).toEqual([true, true]);
    });

    test('with no range end the flows count up to today', () => {
      const { accounts, usd } = bare();
      expect(
        both(envOf(s, { accounts, flows: [flowOn(usd.id, TODAY, 5_00)] })),
      ).toEqual([false, false]);
      expect(
        both(
          envOf(s, { accounts, flows: [flowOn(usd.id, '2026-11-21', 5_00)] }),
        ),
      ).toEqual([true, true]);
    });
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
      // One account of several: the line is that account's, not the workspace's.
      const one = selectedAccounts(s.accounts, EMPTY_FILTERS).find(
        (a) => a.currency === 'USD',
      )!;
      const usd = [one];
      const flows = [
        flow('f1', one.id, '2026-10-05', 1_000_00),
        flow('f2', one.id, '2026-10-20', -400_00),
        flow('f3', one.id, '2026-11-30', 9_999_00),
      ];
      const range = { from: '2026-10-01', to: '2026-11-19' };
      const env = envOf(
        s,
        { flows, ctx: { ...CTX, range } },
        {
          ...EMPTY_FILTERS,
          accountIds: [one.id],
        },
      );
      const { balance } = widgetData(['balance'], env).values;
      const points = balance!.points;
      expect(points.length).toBeGreaterThan(20);
      // Inside the range and in date order, with the two flows' days among them.
      expect(points[0]!.date >= range.from).toBe(true);
      expect(points[points.length - 1]!.date <= range.to).toBe(true);
      expect(points.map((p) => p.date)).toEqual(
        [...new Set(points.map((p) => p.date))].sort(),
      );
      expect(points.some((p) => p.date === '2026-10-05')).toBe(true);
      // Every point is the selected account's balance on its date.
      for (const p of points)
        expect(p.balance, p.date).toBe(
          balanceAt(usd, flows, env.balanceTrades, p.date, CTX),
        );
      // The flow dated after the range is not in the line; the two inside are, net.
      expect(points[points.length - 1]!.flows).toBe(1_000_00 - 400_00);
      expect(points[0]!.flows).toBe(0);
      // What `balance` held before is still there.
      expect(balance!.startingBalance).toBe(one.startingBalance);
    });

    test('is the series balanceSeries makes from every trade of the selected accounts', () => {
      const one = selectedAccounts(s.accounts, EMPTY_FILTERS)[1]!;
      const env = envOf(s, {}, { ...EMPTY_FILTERS, accountIds: [one.id] });
      const { balance } = widgetData(['balance'], env).values;
      const days = dailyPnl(
        env.balanceTrades.filter(
          (t) => t.pnlCurrency === 'USD' && t.accountId === one.id,
        ),
        { ...CTX, pnlBasis: 'net' },
      );
      expect(balance!.points).toEqual(
        balanceSeries(days, one.startingBalance, []),
      );
    });

    describe('only the accounts the filters select (F1)', () => {
      const range = { from: '2026-10-01', to: '2026-11-19' };
      const tradesOf = (id: string) =>
        s.trades.filter((t) => t.accountId === id && t.pnlCurrency === 'USD');

      test('two accounts in one currency, one selected: every point is that account alone', () => {
        const [a, b] = selectedAccounts(s.accounts, EMPTY_FILTERS).filter(
          (x) => x.currency === 'USD' && tradesOf(x.id).length > 50,
        );
        expect(a && b).toBeTruthy();
        const env = envOf(
          s,
          { ctx: { ...CTX, range } },
          { ...EMPTY_FILTERS, accountIds: [a!.id] },
        );
        expect(env.accounts).toEqual([a]);
        const { points } = widgetData(['balance'], env).values.balance!;
        expect(points.length).toBeGreaterThan(20);
        for (const p of points)
          expect(p.balance, p.date).toBe(
            balanceAt([a!], [], s.trades, p.date, CTX),
          );
        // The other account trades inside the range, so leaving it out is what is being checked.
        const last = points[points.length - 1]!;
        expect(last.balance).not.toBe(
          balanceAt([a!, b!], [], s.trades, last.date, CTX),
        );
        expect(
          tradesOf(b!.id).some((t) => (t.closedAt ?? '') >= range.from),
        ).toBe(true);
      });

      test('an archived account with trades next to an active one: its P&L is not in the line', () => {
        const [a, b] = s.accounts.filter(
          (x) => x.currency === 'USD' && tradesOf(x.id).length > 50,
        );
        const accounts = s.accounts.map((x) =>
          x.id === b!.id ? { ...x, status: 'archived' as const } : x,
        );
        const sample = { ...s, accounts };
        const env = envOf(sample, { ctx: { ...CTX, range } });
        // With no account filter only the active accounts are selected.
        expect(env.accounts.some((x) => x.id === b!.id)).toBe(false);
        expect(env.accounts.some((x) => x.id === a!.id)).toBe(true);
        const { points } = widgetData(['balance'], env).values.balance!;
        expect(points.length).toBeGreaterThan(20);
        const selected = env.accounts.filter((x) => x.currency === 'USD');
        for (const p of points)
          expect(p.balance, p.date).toBe(
            balanceAt(selected, [], s.trades, p.date, CTX),
          );
        expect(tradesOf(b!.id).length).toBeGreaterThan(50);
      });
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

  test('default template data budget: a filter change, filtered and computed, in under 100 ms on the sample', () => {
    const keys = [...DEFAULT_TEMPLATE.upper, ...DEFAULT_TEMPLATE.lower].map(
      (r) => r.key as WidgetKey,
    );
    expect(keys.length).toBeGreaterThanOrEqual(14);
    const filterEnv = {
      timeZone: NY,
      today: TODAY,
      accounts: s.accounts,
      breakevenRange: CTX.breakevenRange,
      pnlBasis: 'net' as const,
    };
    // What `useTradeSet` and `useWidgetData` do when the filters change: the trades the
    // filters match, with and without the date range, narrowed to the unit, then the series.
    const recompute = (filters: GlobalFilters) => {
      const matched = applyFilters(s.trades, filters, filterEnv);
      const dayMatched = applyFilters(
        s.trades,
        { ...filters, range: {} },
        filterEnv,
      );
      return widgetData(keys, {
        matched,
        trades: narrowToUnit(matched, 'dollar'),
        dayTrades: narrowToUnit(dayMatched, 'dollar'),
        accounts: selectedAccounts(s.accounts, filters),
        flows: [],
        balanceTrades: s.trades,
        ctx: { ...CTX, range: resolveRange(filters.range, TODAY) },
        baseCurrency: 'USD',
        today: TODAY,
      });
    };
    const changes: GlobalFilters[] = [
      { ...EMPTY_FILTERS, range: { from: '2026-09-01', to: '2026-11-19' } },
      {
        ...EMPTY_FILTERS,
        range: { from: '2026-10-01', to: '2026-11-19' },
        accountIds: [s.accounts[0]!.id],
      },
      {
        ...EMPTY_FILTERS,
        range: { from: '2026-08-01', to: '2026-11-19' },
        outcomes: ['win', 'loss'],
        weekdays: [1, 2, 3, 4, 5],
      },
    ];
    for (const f of changes) recompute(f); // warm-up
    for (const f of changes) {
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        recompute(f);
        times.push(performance.now() - t0);
      }
      // The median of five: one slow run on a busy machine does not fail it.
      times.sort((a, b) => a - b);
      expect(times[2]!, JSON.stringify(f)).toBeLessThan(100);
    }
  });
});

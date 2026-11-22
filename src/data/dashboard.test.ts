import { beforeAll, describe, expect, test } from 'vitest';
import { SAMPLE_GOALS } from './goals';
import { makeTrade } from '@/domain/__fixtures__/trades';
import {
  defaultMetricContext,
  type MetricContext,
} from '@/domain/metrics/context';
import {
  strategyRules,
  type RuleCheck,
  type Strategy,
  type Trade,
} from '@/domain/types';
import {
  buildDashboard,
  pickPartition,
  RECENT_TRADE_COUNT,
  tradeRulesSummary,
  type DashboardEnv,
} from './dashboard';
import { metricsByCurrency, type CurrencyMetrics } from './metrics';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from './seed/generate';

const NY = 'America/New_York';
let s: SampleWorkspace;
beforeAll(() => {
  s = generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' });
}, 30_000);
const usd = (ctx: MetricContext) =>
  metricsByCurrency(s.trades, {
    accounts: s.accounts,
    ctx,
    baseCurrency: 'USD',
  })[0]!;
const env = (ctx: MetricContext): DashboardEnv => ({
  strategies: s.strategies,
  tags: s.tags,
  tagCategories: s.tagCategories,
  goals: { weeklyNet: 150000, dailyLossLimit: 50000 },
  baseCurrency: 'USD',
  ctx,
  range: {},
  today: '2026-11-20',
});

test('the dashboard is the engine, sorted by cost', () => {
  const ctx = defaultMetricContext(NY),
    m = usd(ctx),
    d = buildDashboard(m, env(ctx));
  const kept = d.plan.rules.reduce((n, r) => n + r.kept, 0);
  expect(d.plan.adherence).toBe(kept / d.plan.checks);
  const broken = d.plan.rules.filter((r) => r.broken > 0);
  expect(broken.map((r) => r.brokenPnl)).toEqual(
    broken.map((r) => r.brokenPnl).sort((a, b) => a - b),
  );
  expect(d.plan.rules.slice(broken.length).every((r) => r.broken === 0)).toBe(
    true,
  );
  expect(d.recent).toHaveLength(RECENT_TRADE_COUNT);
  expect(d.recent.every((r) => r.trade.status === 'closed')).toBe(true);
  expect(d.recent[0]!.trade.closedAt! >= d.recent[1]!.trade.closedAt!).toBe(
    true,
  );
  expect(d.performance.equity[0]).toBe(17_500_000);
  expect(d.performance.equity).toHaveLength(m.summary.closedCount + 1);
  expect(d.goals.unavailable).toBeNull();
  expect(d.goals.weekly!.window).toEqual({
    from: '2026-11-16',
    to: '2026-11-20',
  });
  expect(d.goals.dailyLoss!.limit).toBe(50000);
  expect(d.tradesById.size).toBe(m.trades.length);
  expect(d.closedCount).toBe(m.summary.closedCount);
});

test('a recent trade in two strategies names both', () => {
  const ctx = defaultMetricContext(NY);
  const [a, b] = s.strategies;
  const [m] = metricsByCurrency(
    [
      makeTrade({
        net: 100,
        closedAt: '2026-11-18T15:00:00Z',
        strategyIds: [a!.id, 'deleted', b!.id],
      }),
    ],
    { accounts: s.accounts, ctx, baseCurrency: 'USD' },
  );
  expect(buildDashboard(m!, env(ctx)).recent[0]!.strategyNames).toEqual([
    a!.name,
    b!.name,
  ]);
});

test('goals need the base currency, and are absent when unset', () => {
  const ctx = defaultMetricContext(NY),
    m = usd(ctx);
  const other = buildDashboard(m, { ...env(ctx), baseCurrency: 'GBP' });
  expect(other.goals.weekly).toBeNull();
  expect(other.goals.dailyLoss).toBeNull();
  expect(other.goals.unavailable).toMatch(/base currency/);
  const unset = buildDashboard(m, { ...env(ctx), goals: {} });
  expect(unset.goals).toEqual({
    weekly: null,
    dailyLoss: null,
    unavailable: null,
  });
  const past = buildDashboard(m, {
    ...env(ctx),
    range: { from: '2026-11-25' },
  });
  expect(past.goals.weekly).toBeNull();
});

test('Gross/Net moves costs and performance, never goals (Review Focus 3)', () => {
  const net = defaultMetricContext(NY),
    gross = { ...net, pnlBasis: 'gross' as const };
  const a = buildDashboard(usd(net), env(net)),
    b = buildDashboard(usd(gross), env(gross));
  expect(b.basis).toBe('gross');
  expect(b.performance.pnl).toBe(usd(gross).summary.grossPnl);
  expect(a.performance.pnl).toBe(usd(net).summary.netPnl);
  expect(b.performance.pnl).toBeGreaterThan(a.performance.pnl);
  expect(b.plan.cost.pnl).toBeGreaterThan(a.plan.cost.pnl);
  expect(b.mistakes.reduce((n, x) => n + x.pnl, 0)).toBeGreaterThan(
    a.mistakes.reduce((n, x) => n + x.pnl, 0),
  );
  expect(b.performance.equity.at(-1)).toBeGreaterThan(
    a.performance.equity.at(-1)!,
  );
  expect(b.goals).toEqual(a.goals);
});

test('goals use net even when the dashboard is on gross', () => {
  const t = (id: string, net: number, gross: number, closedAt: string) =>
    makeTrade({ id, net, gross, closedAt });
  const trades = [
    t('a', -48000, -40000, '2026-11-17T15:00:00Z'),
    t('b', 20000, 30000, '2026-11-18T15:00:00Z'),
  ];
  const mk = (pnlBasis: 'net' | 'gross') => {
    const ctx = { ...defaultMetricContext(NY), pnlBasis };
    const [m] = metricsByCurrency(trades, {
      accounts: [],
      ctx,
      baseCurrency: 'USD',
    });
    return buildDashboard(m!, {
      ...env(ctx),
      goals: { weeklyNet: 100000, dailyLossLimit: 45000 },
    });
  };
  const net = mk('net'),
    gross = mk('gross');
  expect(gross.goals.weekly!.net).toBe(-28000);
  expect(gross.goals.dailyLoss!.brokenDays).toHaveLength(1);
  expect(gross.goals).toEqual(net.goals);
});

test('dashboard metrics for the sample compute in under 50 ms (spec §10)', () => {
  const ctx = defaultMetricContext(NY);
  const run = () => buildDashboard(usd(ctx), env(ctx));
  run();
  const ms = Array.from({ length: 5 }, () => {
    const t = performance.now();
    run();
    return performance.now() - t;
  }).sort((x, y) => x - y);
  expect(ms[2]!).toBeLessThan(50);
});

test('one currency at a time', () => {
  const part = (currency: string, n: number) =>
    ({ currency, summary: { closedCount: n } }) as CurrencyMetrics;
  expect(
    pickPartition([part('USD', 0), part('GBP', 3)], undefined, 'USD').currency,
  ).toBe('GBP');
  expect(
    pickPartition([part('USD', 5), part('GBP', 3)], 'GBP', 'USD').currency,
  ).toBe('GBP');
  expect(
    pickPartition([part('USD', 5), part('GBP', 3)], 'JPY', 'USD').currency,
  ).toBe('USD');
  expect(pickPartition([part('USD', 0)], undefined, 'USD').currency).toBe(
    'USD',
  );
  expect(() => pickPartition([], undefined, 'USD')).toThrow(RangeError);
});

test('a trade’s rules column', () => {
  const strategy: Strategy = {
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
          {
            id: 'r1',
            text: 'Stop stays where it was placed',
            showWhen: 'always',
          },
          { id: 'r2', text: 'Max 6 trades a day', showWhen: 'always' },
          { id: 'r4', text: 'Let the winner run', showWhen: 'winner' },
        ],
      },
    ],
  };
  const ctx = defaultMetricContext(NY);
  const t = (checks: RuleCheck[], o: Partial<Trade> = {}) =>
    makeTrade({
      net: -5000,
      status: 'closed',
      strategyIds: ['s1'],
      ruleChecks: checks,
      ...o,
    });
  const summary = (tr: Trade) => tradeRulesSummary(tr, [strategy], ctx);
  expect(
    summary(
      t([
        { ruleId: 'r1', followed: true },
        { ruleId: 'r2', followed: true },
        { ruleId: 'r3', followed: null },
      ]),
    ),
  ).toEqual({ kind: 'kept', kept: 2, checked: 2, broken: [] });
  expect(
    summary(
      t([
        { ruleId: 'r1', followed: false },
        { ruleId: 'r2', followed: true },
      ]),
    ),
  ).toEqual({
    kind: 'broke',
    kept: 1,
    checked: 2,
    broken: ['Stop stays where it was placed'],
  });
  expect(summary(t([])).kind).toBe('ungraded');
});

test('a trade’s rules column leaves out rules that do not apply or are not its strategies’', () => {
  const strategy: Strategy = {
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
          { id: 'r1', text: 'Always rule', showWhen: 'always' },
          { id: 'r4', text: 'Let the winner run', showWhen: 'winner' },
        ],
      },
    ],
  };
  const ctx = defaultMetricContext(NY);
  const checks: RuleCheck[] = [
    { ruleId: 'r1', followed: true },
    // The trade lost, so this winner rule does not apply to it.
    { ruleId: 'r4', followed: false },
    // No strategy of the trade owns this rule.
    { ruleId: 'gone', followed: false },
  ];
  const loser = makeTrade({
    net: -5000,
    status: 'closed',
    strategyIds: ['s1'],
    ruleChecks: checks,
  });
  expect(tradeRulesSummary(loser, [strategy], ctx)).toEqual({
    kind: 'kept',
    kept: 1,
    checked: 1,
    broken: [],
  });
  const winner = { ...loser, net: 5000 };
  expect(tradeRulesSummary(winner, [strategy], ctx)).toMatchObject({
    kind: 'broke',
    checked: 2,
    broken: ['Let the winner run'],
  });
  // A strategy the trade is not in contributes nothing.
  expect(
    tradeRulesSummary({ ...winner, strategyIds: [] }, [strategy], ctx).kind,
  ).toBe('ungraded');
});

test('the sample at its default view: weekly goal in progress, loss limit kept this week', () => {
  const ctx = defaultMetricContext(NY),
    d = buildDashboard(usd(ctx), { ...env(ctx), goals: SAMPLE_GOALS });
  const week = d.goals.weekly!;
  expect(week.window).toEqual({ from: '2026-11-16', to: '2026-11-20' });
  expect(week.reached).toBe(false);
  expect(week.net).toBe(12919);
  expect(week.fraction).toBeCloseTo(0.258, 3);
  const loss = d.goals.dailyLoss!;
  expect(loss.limit).toBe(SAMPLE_GOALS.dailyLossLimit);
  expect(
    loss.brokenDays.filter(
      (x) => x.date >= week.window.from && x.date <= week.window.to,
    ),
  ).toEqual([]);
});

test('imported trades with no strategy and no rule checks (Review Focus 1)', () => {
  const ctx = defaultMetricContext(NY);
  const trades = [
    makeTrade({
      id: 'a',
      net: 12000,
      gross: 12500,
      closedAt: '2026-11-18T15:00:00Z',
    }),
    makeTrade({
      id: 'b',
      net: -4000,
      gross: -3500,
      closedAt: '2026-11-19T15:00:00Z',
    }),
  ];
  const [m] = metricsByCurrency(trades, {
    accounts: s.accounts,
    ctx,
    baseCurrency: 'USD',
  });
  const d = buildDashboard(m!, {
    ...env(ctx),
    strategies: [],
    tags: [],
    tagCategories: [],
  });
  expect(d.plan.adherence).toBeNull();
  expect(d.plan.checks).toBe(0);
  expect(d.plan.rules).toEqual([]);
  expect(d.plan.cost).toEqual({ pnl: 0, tradeCount: 0 });
  expect(d.mistakes).toEqual([]);
  expect(
    d.recent.every(
      (r) => r.rules.kind === 'ungraded' && r.strategyNames.length === 0,
    ),
  ).toBe(true);
  const p = d.performance;
  for (const n of [p.pnl, ...p.equity]) expect(Number.isFinite(n)).toBe(true);
  for (const n of [p.winRate, p.profitFactor, p.expectancy])
    if (n !== null) expect(Number.isFinite(n)).toBe(true);
  expect(p.equity).toHaveLength(3);
});

describe('the headline adherence is the rule rows added up', () => {
  const ctx = defaultMetricContext(NY);
  const build = (ruleChecks: RuleCheck[][]) => {
    const strategy = s.strategies[0]!;
    const trades = ruleChecks.map((checks, i) =>
      makeTrade({
        id: `h-${i}`,
        net: 1000,
        closedAt: `2026-11-1${i}T15:00:00Z`,
        strategyIds: [strategy.id],
        ruleChecks: checks,
      }),
    );
    const [m] = metricsByCurrency(trades, {
      accounts: s.accounts,
      ctx,
      baseCurrency: 'USD',
    });
    return { m: m!, d: buildDashboard(m!, env(ctx)) };
  };
  const ruleId = (i: number) => strategyRules(s.strategies[0]!)[i]!.id;

  test('a check on an unknown rule id counts in no row, so not in the headline', () => {
    const { m, d } = build([
      [
        { ruleId: ruleId(0), followed: true },
        { ruleId: 'deleted-rule', followed: false },
      ],
      [
        { ruleId: ruleId(1), followed: true },
        { ruleId: 'deleted-rule', followed: false },
      ],
    ]);
    expect(m.summary.ruleAdherence).toBe(2 / 4); // the engine counts every check
    expect(d.plan.checks).toBe(2);
    expect(d.plan.adherence).toBe(1);
  });

  test("a trade's repeat check on a rule counts once, as in its row", () => {
    const { m, d } = build([
      [
        { ruleId: ruleId(0), followed: true },
        { ruleId: ruleId(0), followed: false },
        { ruleId: ruleId(0), followed: false },
      ],
      [{ ruleId: ruleId(1), followed: true }],
    ]);
    expect(m.summary.ruleAdherence).toBe(2 / 4);
    const row = d.plan.rules.find((r) => r.ruleId === ruleId(0))!;
    expect([row.kept, row.broken]).toEqual([1, 0]);
    expect(d.plan.checks).toBe(2);
    expect(d.plan.adherence).toBe(1);
  });

  test('no decisive check on a known rule reads as no adherence', () => {
    const { m, d } = build([
      [
        { ruleId: 'deleted-rule', followed: true },
        { ruleId: ruleId(0), followed: null },
      ],
    ]);
    expect(m.summary.ruleAdherence).toBe(1);
    expect(d.plan.checks).toBe(0);
    expect(d.plan.adherence).toBeNull();
  });
});

import { beforeAll, expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import {
  defaultMetricContext,
  type MetricContext,
} from '@/domain/metrics/context';
import { type RuleCheck, type Strategy, type Trade } from '@/domain/types';
import {
  pickPartition,
  RECENT_TRADE_COUNT,
  recentAndOpen,
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
  ctx,
});

test('the recent trades are the newest closed ones, newest first', () => {
  const ctx = defaultMetricContext(NY),
    m = usd(ctx),
    d = recentAndOpen(m.trades, env(ctx));
  expect(d.recent).toHaveLength(RECENT_TRADE_COUNT);
  expect(d.recent.every((r) => r.trade.status === 'closed')).toBe(true);
  expect(d.recent[0]!.trade.closedAt! >= d.recent[1]!.trade.closedAt!).toBe(
    true,
  );
  expect(d.open.every((o) => o.trade.status === 'open')).toBe(true);
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
  expect(recentAndOpen(m!.trades, env(ctx)).recent[0]!.strategyNames).toEqual([
    a!.name,
    b!.name,
  ]);
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
  const d = recentAndOpen(trades, {
    ...env(ctx),
    strategies: [],
    tags: [],
    tagCategories: [],
  });
  expect(d.recent).toHaveLength(2);
  expect(
    d.recent.every(
      (r) => r.rules.kind === 'ungraded' && r.strategyNames.length === 0,
    ),
  ).toBe(true);
});

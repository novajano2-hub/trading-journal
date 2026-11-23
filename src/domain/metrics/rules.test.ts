import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import type { Rule, Strategy } from '../types';
import { brokenRulesCost, ruleScorecard, ruleStats } from './rules';
import { defaultMetricContext } from './context';
import { summarize } from './summary';

const ctx = defaultMetricContext('America/New_York');
const strat = (id: string, name: string, rules: Rule[]) =>
  ({
    id,
    name,
    // The first two rules open the strategy's first group, the rest its second.
    groups: [
      { id: `${id}-a`, title: 'Risk', rules: rules.slice(0, 2) },
      { id: `${id}-b`, title: 'Management', rules: rules.slice(2) },
    ],
    workspaceId: 'w',
    description: '',
    assetClasses: [],
    checklist: [],
    status: 'active',
  }) as Strategy;
const strategies = [
  strat('s1', 'Range break', [
    {
      id: 'r-stop',
      text: 'Stop stays where it was placed',
      showWhen: 'always',
    },
    {
      id: 'r-size',
      text: 'Risk no more than 1R per trade',
      showWhen: 'always',
    },
    { id: 'r-max', text: 'Max 6 trades a day', showWhen: 'always' },
  ]),
];
const chk = (ruleId: string, followed: boolean | null) => ({
  ruleId,
  followed,
});
const trades = [
  makeTrade({
    id: 'a',
    net: -40000,
    fees: 500,
    closedAt: '2026-11-18T15:00:00Z',
    ruleChecks: [
      chk('r-stop', false),
      chk('r-size', false),
      chk('r-max', true),
    ],
  }),
  makeTrade({
    id: 'b',
    net: -10000,
    closedAt: '2026-11-19T15:00:00Z',
    ruleChecks: [
      chk('r-stop', false),
      chk('r-max', true),
      chk('r-gone', false),
    ],
  }),
  makeTrade({
    id: 'c',
    net: 30000,
    closedAt: '2026-11-19T16:00:00Z',
    ruleChecks: [chk('r-stop', true), chk('r-size', null), chk('r-max', true)],
  }),
  makeTrade({
    id: 'd',
    net: 5000,
    status: 'open',
    ruleChecks: [chk('r-stop', false)],
  }),
];

describe('ruleScorecard', () => {
  test('per rule: kept of checked, adherence, cost when broken, newest broken first', () => {
    const [stop, size, max] = ruleScorecard(trades, strategies, ctx);
    expect(stop).toMatchObject({
      ruleId: 'r-stop',
      group: 'Risk',
      strategyName: 'Range break',
      kept: 1,
      broken: 2,
      brokenPnl: -50000,
      keptPnl: 30000,
      brokenTradeIds: ['b', 'a'],
    });
    expect(stop!.adherence).toBeCloseTo(1 / 3);
    expect(size).toMatchObject({
      ruleId: 'r-size',
      kept: 0,
      broken: 1,
      brokenPnl: -40000,
    });
    expect(max).toMatchObject({
      ruleId: 'r-max',
      group: 'Management',
      kept: 3,
      broken: 0,
      brokenPnl: 0,
      adherence: 1,
    });
  });

  test('each row says when its rule is graded, so a losers-only rule can be told apart', () => {
    const only = [
      strat('s1', 'Range break', [
        { id: 'r-stop', text: 'Stop stays', showWhen: 'loser' },
        { id: 'r-size', text: 'Risk no more than 1R', showWhen: 'always' },
      ]),
    ];
    const rows = ruleScorecard(trades, only, ctx);
    expect(rows.find((r) => r.ruleId === 'r-stop')?.showWhen).toBe('loser');
    expect(rows.find((r) => r.ruleId === 'r-size')?.showWhen).toBe('always');
  });

  test('unknown rule ids and open trades are ignored', () => {
    expect(ruleScorecard(trades, strategies, ctx).map((r) => r.ruleId)).toEqual(
      ['r-stop', 'r-size', 'r-max'],
    );
  });

  test('a rule with only undecided checks has no row', () => {
    const only = [makeTrade({ net: 100, ruleChecks: [chk('r-size', null)] })];
    expect(ruleScorecard(only, strategies, ctx)).toEqual([]);
  });

  test('the first check wins when a trade carries two for one rule', () => {
    const dup = [
      makeTrade({
        id: 'x',
        net: -100,
        ruleChecks: [chk('r-stop', false), chk('r-stop', true)],
      }),
    ];
    expect(ruleScorecard(dup, strategies, ctx)[0]).toMatchObject({
      kept: 0,
      broken: 1,
    });
  });

  test('never-broken rules follow broken ones, by adherence then text', () => {
    const ss = [
      strat('s1', 'S', [
        { id: 'a', text: 'B rule', showWhen: 'always' },
        { id: 'b', text: 'A rule', showWhen: 'always' },
        { id: 'c', text: 'C rule', showWhen: 'always' },
        { id: 'd', text: 'Broken', showWhen: 'always' },
      ]),
    ];
    const ts = [
      makeTrade({
        net: -5,
        ruleChecks: [
          chk('d', false),
          chk('a', true),
          chk('b', true),
          chk('c', true),
        ],
      }),
    ];
    expect(ruleScorecard(ts, ss, ctx).map((r) => r.ruleId)).toEqual([
      'd',
      'b',
      'a',
      'c',
    ]);
  });

  test('costs follow the Gross/Net basis', () => {
    expect(
      ruleScorecard(trades, strategies, { ...ctx, pnlBasis: 'gross' })[0]!
        .brokenPnl,
    ).toBe(-49500);
  });

  test('the scorecard agrees with summarize when every check resolves', () => {
    const known = trades.map((t) => ({
      ...t,
      ruleChecks: t.ruleChecks.filter((c) => c.ruleId !== 'r-gone'),
    }));
    const rows = ruleScorecard(known, strategies, ctx);
    const kept = rows.reduce((n, r) => n + r.kept, 0);
    const all = rows.reduce((n, r) => n + r.kept + r.broken, 0);
    expect(kept / all).toBe(summarize(known, ctx).ruleAdherence);
  });

  test('two strategies with the same rule text stay separate rows', () => {
    const two = [
      ...strategies,
      strat('s2', 'Pullback', [
        {
          id: 'r2-stop',
          text: 'Stop stays where it was placed',
          showWhen: 'always',
        },
      ]),
    ];
    const ts = [
      ...trades,
      makeTrade({ id: 'e', net: -200, ruleChecks: [chk('r2-stop', false)] }),
    ];
    const rows = ruleScorecard(ts, two, ctx).filter(
      (r) => r.text === 'Stop stays where it was placed',
    );
    expect(rows.map((r) => r.strategyName).sort()).toEqual([
      'Pullback',
      'Range break',
    ]);
  });
});

describe('brokenRulesCost', () => {
  test('the headline counts a trade that broke two rules once (Review Focus 4)', () => {
    expect(brokenRulesCost(trades, strategies, ctx)).toEqual({
      pnl: -50000,
      tradeCount: 2,
    });
  });

  test('the rows can add up to more than the headline', () => {
    const rowSum = ruleScorecard(trades, strategies, ctx).reduce(
      (n, r) => n + r.brokenPnl,
      0,
    );
    expect(rowSum).toBe(-90000);
    expect(rowSum).toBeLessThan(brokenRulesCost(trades, strategies, ctx).pnl);
  });

  test('skips unknown rule ids, open trades, and follows the basis', () => {
    const onlyGone = [
      makeTrade({ net: -1, ruleChecks: [chk('r-gone', false)] }),
    ];
    expect(brokenRulesCost(onlyGone, strategies, ctx)).toEqual({
      pnl: 0,
      tradeCount: 0,
    });
    expect(
      brokenRulesCost(trades, strategies, { ...ctx, pnlBasis: 'gross' }).pnl,
    ).toBe(-49500);
  });
});

describe('ruleStats', () => {
  const loserRule: Rule = {
    id: 'r-loser',
    text: 'No re-entry after a stop-out',
    showWhen: 'loser',
  };
  const strategy = strat('s2', 'Fade', [loserRule]);
  const at = (id: string, net: number, followed: boolean | null, p = {}) =>
    makeTrade({
      id,
      net,
      closedAt: '2026-11-18T15:00:00Z',
      strategyIds: ['s2'],
      ruleChecks: [chk('r-loser', followed)],
      ...p,
    });

  test('a loser rule counts only the losses: kept on 2, broken on 1, with 3 wins present', () => {
    const set = [
      at('w1', 20000, true),
      at('w2', 30000, false),
      at('w3', 10000, true),
      at('l1', -10000, true),
      at('l2', -25000, true),
      at('l3', -40000, false),
    ];
    const [row] = ruleStats(set, strategy, ctx);
    expect(row).toMatchObject({
      ruleId: 'r-loser',
      applies: 3,
      kept: 2,
      broken: 1,
      followedNet: -35000,
      brokenNet: -40000,
    });
    expect(row!.followRate).toBeCloseTo(0.667, 3);
  });

  test('win rate and profit factor when followed read the trades that kept it; open trades never apply', () => {
    const always = strat('s3', 'Plain', [
      { id: 'r-a', text: 'Plan the trade', showWhen: 'always' },
    ]);
    const set = [
      makeTrade({ id: 'x1', net: 30000, ruleChecks: [chk('r-a', true)] }),
      makeTrade({ id: 'x2', net: -10000, ruleChecks: [chk('r-a', true)] }),
      makeTrade({ id: 'x3', net: -5000, ruleChecks: [chk('r-a', false)] }),
      makeTrade({
        id: 'x4',
        net: 9000,
        status: 'open',
        ruleChecks: [chk('r-a', true)],
      }),
      makeTrade({ id: 'x5', net: 1000, ruleChecks: [] }),
    ];
    const [row] = ruleStats(set, always, ctx);
    expect(row).toMatchObject({
      applies: 4,
      kept: 2,
      broken: 1,
      followedNet: 20000,
      followedWinRate: 0.5,
      followedProfitFactor: 3,
      brokenNet: -5000,
    });
    expect(row!.followRate).toBeCloseTo(2 / 3);
  });

  test('a rule that applies to no trade has no follow rate and no figures to divide', () => {
    const [row] = ruleStats([at('w1', 100, null)], strategy, ctx);
    expect(row).toMatchObject({
      applies: 0,
      followRate: null,
      followedWinRate: null,
      followedProfitFactor: null,
      followedNet: 0,
      brokenNet: 0,
    });
  });
});

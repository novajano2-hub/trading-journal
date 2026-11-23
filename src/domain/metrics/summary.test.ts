import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { resolveInstrument } from '../instruments';
import { costBasis, defaultMetricContext, pnlOf } from './context';
import { plannedR, riskFromStop, rExpectancy, summarize } from './summary';

const ctx = defaultMetricContext('America/New_York');

const nets = [10000, -5000, 0, 2500, -2500, 7500].map((net) =>
  makeTrade({ net }),
);

describe('summarize', () => {
  test('core summary at threshold 0', () => {
    expect(summarize(nets, ctx)).toMatchObject({
      closedCount: 6,
      wins: 3,
      losses: 2,
      breakevens: 1,
      netPnl: 12500,
      winRate: 0.6,
      avgWin: 6667,
      avgLoss: -3750,
      expectancy: 2500,
      largestWin: 10000,
      largestLoss: -5000,
    });
    const s = summarize(nets, ctx);
    expect(s.profitFactor).toBeCloseTo(2.6667, 4);
    expect(s.winLossRatio).toBeCloseTo(1.7778, 4);
  });
  test('breakeven threshold moves small trades out of wins and losses', () => {
    const s = summarize(nets, {
      ...ctx,
      breakevenRange: { unit: 'amount', from: -2500, to: 2500 },
    });
    expect(s).toMatchObject({
      wins: 2,
      losses: 1,
      breakevens: 3,
      profitFactor: 3.5,
      avgWin: 8750,
      avgLoss: -5000,
      expectancy: 4167,
    });
    expect(s.winRate).toBeCloseTo(0.6667, 4);
  });
  test('empty and open-only selections return nulls, never NaN', () => {
    for (const set of [[], [makeTrade({ net: -1000, status: 'open' })]]) {
      const s = summarize(set, ctx);
      expect(s).toMatchObject({
        closedCount: 0,
        netPnl: 0,
        winRate: null,
        profitFactor: null,
        avgWin: null,
        avgLoss: null,
        winLossRatio: null,
        expectancy: null,
        avgRealizedR: null,
        largestWin: null,
        largestLoss: null,
        ruleAdherence: null,
      });
    }
  });
  test('open trades are counted but excluded from metrics', () => {
    const s = summarize(
      [makeTrade({ net: 100 }), makeTrade({ net: -1000, status: 'open' })],
      ctx,
    );
    expect(s).toMatchObject({ closedCount: 1, openCount: 1, netPnl: 100 });
  });
  test('no losses gives a null profit factor', () => {
    expect(
      summarize([makeTrade({ net: 5000 }), makeTrade({ net: 3000 })], ctx),
    ).toMatchObject({ profitFactor: null, winRate: 1 });
  });
  test('R metrics and risk from stop', () => {
    const t = [
      makeTrade({ net: 10000, initialRisk: 5000 }),
      makeTrade({ net: -5000, initialRisk: 5000 }),
      makeTrade({ net: 2500 }),
    ];
    expect(summarize(t, ctx)).toMatchObject({
      avgRealizedR: 0.5,
      realizedRTradeCount: 2,
      noRiskCount: 1,
    });
    expect(
      riskFromStop(
        makeTrade({ net: 0, avgEntry: 4510.5, maxPosition: 2 }),
        4508.5,
      ),
    ).toBe(20000);
  });
  test('rule adherence ignores unanswered checks', () => {
    const t = makeTrade({
      net: 0,
      ruleChecks: [true, true, false, null].map((f, i) => ({
        ruleId: `r${i}`,
        followed: f,
      })),
    });
    expect(summarize([t], ctx).ruleAdherence).toBeCloseTo(0.6667, 4);
  });

  test('riskFromStop converts quote-currency risk into the trade pnl currency', () => {
    const usdjpy = makeTrade({
      net: 0,
      instrument: resolveInstrument('USDJPY')!,
      avgEntry: 154.21,
      maxPosition: 1,
      pnlCurrency: 'USD',
    });
    expect(riskFromStop(usdjpy, 154.0)).toBe(13618);
  });

  test('currencies lists the sorted distinct pnl currencies of closed trades', () => {
    const mixed = [
      makeTrade({ net: 100, pnlCurrency: 'USD' }),
      makeTrade({ net: 100, pnlCurrency: 'EUR' }),
      makeTrade({ net: 100, pnlCurrency: 'USD' }),
      makeTrade({ net: 100, pnlCurrency: 'JPY', status: 'open' }),
    ];
    expect(summarize(mixed, ctx).currencies).toEqual(['EUR', 'USD']);
    expect(summarize([], ctx).currencies).toEqual([]);
  });

  test('a closed trade without closedAt is not counted as closed', () => {
    const odd = makeTrade({ net: 500, closedAt: undefined });
    delete (odd as { closedAt?: string }).closedAt;
    const s = summarize([odd], ctx);
    expect(s).toMatchObject({ closedCount: 0, openCount: 1, netPnl: 0 });
  });

  test('expectancy is null with no decisive trades', () => {
    expect(summarize([makeTrade({ net: 0 })], ctx).expectancy).toBeNull();
  });

  test('breakeven range: amount range is inclusive and asymmetric', () => {
    const c = {
      ...ctx,
      breakevenRange: { unit: 'amount', from: -1000, to: 500 } as const,
    };
    const s = summarize(
      [600, 500, -1000, -1001].map((net) => makeTrade({ net })),
      c,
    );
    expect(s).toMatchObject({ wins: 1, losses: 1, breakevens: 2 });
  });

  test('breakeven range: percent range uses ROI on cost basis', () => {
    const c = {
      ...ctx,
      breakevenRange: { unit: 'percent', from: -0.001, to: 0.001 } as const,
    };
    const es = (net: number) =>
      makeTrade({ net, avgEntry: 4500, maxPosition: 1 });
    expect(costBasis(es(0))).toBe(22_500_000);
    const s = summarize([es(20000), es(30000), es(-30000)], c);
    expect(s).toMatchObject({ wins: 1, losses: 1, breakevens: 1 });
  });

  test('percent range with zero cost basis falls back to amount 0..0', () => {
    const c = {
      ...ctx,
      breakevenRange: { unit: 'percent', from: -0.001, to: 0.001 } as const,
    };
    const free = (net: number) => makeTrade({ net, avgEntry: 0 });
    expect(summarize([free(5), free(0), free(-5)], c)).toMatchObject({
      wins: 1,
      losses: 1,
      breakevens: 1,
    });
  });

  test('gross/net switch changes classification and sums', () => {
    const t = makeTrade({ net: -500, gross: 1000, fees: 1500 });
    expect(summarize([t], ctx)).toMatchObject({
      losses: 1,
      wins: 0,
      basis: 'net',
      netPnl: -500,
      grossPnl: 1000,
      fees: 1500,
    });
    const g = summarize([t], { ...ctx, pnlBasis: 'gross' });
    expect(g).toMatchObject({
      wins: 1,
      losses: 0,
      basis: 'gross',
      netPnl: -500,
      grossPnl: 1000,
      largestWin: 1000,
    });
    expect(pnlOf(t, 'gross')).toBe(1000);
    expect(pnlOf(t, 'net')).toBe(-500);
  });

  test('realized R follows the basis', () => {
    const t = makeTrade({
      net: -500,
      gross: 1000,
      fees: 1500,
      initialRisk: 500,
    });
    expect(summarize([t], ctx).avgRealizedR).toBe(-1);
    expect(summarize([t], { ...ctx, pnlBasis: 'gross' }).avgRealizedR).toBe(2);
  });

  test('planned R needs target and a stop distinct from entry', () => {
    const t = (extra: object) =>
      makeTrade({ net: 0, avgEntry: 4500, ...extra });
    expect(plannedR(t({ plannedStop: 4490, plannedTarget: 4520 }))).toBe(2);
    expect(plannedR(t({ plannedStop: 4490 }))).toBeUndefined();
    expect(plannedR(t({ plannedTarget: 4520 }))).toBeUndefined();
    expect(
      plannedR(t({ plannedStop: 4500, plannedTarget: 4520 })),
    ).toBeUndefined();
    const s = summarize(
      [
        t({ plannedStop: 4490, plannedTarget: 4520 }),
        t({ plannedStop: 4490, plannedTarget: 4510 }),
        t({}),
      ],
      ctx,
    );
    expect(s).toMatchObject({ avgPlannedR: 1.5, plannedRTradeCount: 2 });
    expect(summarize([t({})], ctx)).toMatchObject({
      avgPlannedR: null,
      plannedRTradeCount: 0,
    });
  });
});

describe('netRoi', () => {
  test('net over cost basis of closed trades; null when empty', () => {
    const a = makeTrade({ net: 10000 });
    const b = makeTrade({ net: -4000 });
    expect(summarize([a, b], ctx).netRoi).toBeCloseTo(
      6000 / (costBasis(a) + costBasis(b)),
      10,
    );
    expect(summarize([], ctx).netRoi).toBeNull();
  });
});

describe('rExpectancy', () => {
  test('is win share times average win R plus loss share times average loss R', () => {
    const r = (net: number, initialRisk?: number) =>
      makeTrade({ net, ...(initialRisk ? { initialRisk } : {}) });
    // 3R, 1R, -1R, a breakeven, and a trade with no stop: 2 wins at 2R on average, 1 loss at -1R.
    const out = rExpectancy(
      [r(3000, 1000), r(1000, 1000), r(-1000, 1000), r(0, 1000), r(5000)],
      defaultMetricContext('America/New_York'),
    );
    expect(out.count).toBe(3);
    expect(out.value).toBeCloseTo((2 / 3) * 2 + (1 / 3) * -1, 10);
    expect(rExpectancy([r(100)], defaultMetricContext('UTC'))).toEqual({
      value: null,
      count: 0,
    });
  });
});

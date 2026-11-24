import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { resolveInstrument } from '../instruments';
import { costBasis, defaultMetricContext, pnlOf } from './context';
import {
  costsOf,
  expectancyIn,
  expectancyOf,
  holdTimes,
  largestInUnit,
  largestTrade,
  plannedR,
  riskFromStop,
  rExpectancy,
  summarize,
  tradeVolume,
  volumeOf,
} from './summary';

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

describe('in a trade unit', () => {
  // ES: 4 ticks a point. Wins of 8 and 4 ticks, a loss of 6: the money differs.
  const es = (net: number, avgExit: number, maxPosition = 1) =>
    makeTrade({ net, avgEntry: 4500, avgExit, maxPosition });
  const set = [es(30000, 4502), es(100, 4501), es(-20000, 4498.5)];

  test('profit factor and the win/loss ratio read the unit, the counts stay on money', () => {
    const money = summarize(set, ctx);
    expect(money.profitFactor).toBeCloseTo(30100 / 20000, 10);
    const ticks = summarize(set, { ...ctx, unit: 'ticks' });
    expect(ticks.profitFactor).toBeCloseTo(12 / 6, 10);
    expect(ticks.winLossRatio).toBeCloseTo(6 / 6, 10);
    // Wins and losses are classified on the P&L, as the win rate is.
    expect(ticks).toMatchObject({ wins: 2, losses: 1, winRate: 2 / 3 });
    expect(ticks.avgWin).toBe(money.avgWin);
  });
  test('ticks count every contract: two contracts double the move', () => {
    const s = summarize([es(30000, 4502, 2), es(-20000, 4498.5)], {
      ...ctx,
      unit: 'ticks',
    });
    expect(s.profitFactor).toBeCloseTo(16 / 6, 10);
  });
  test('no loss in the unit has no profit factor', () => {
    const s = summarize([es(30000, 4502)], { ...ctx, unit: 'points' });
    expect(s.profitFactor).toBeNull();
    expect(s.winLossRatio).toBeNull();
  });
  test('the largest win and loss are the largest in the unit, not in money', () => {
    // A one-lot +$300 win of 8 ticks against a three-lot +$200 win of 12.
    const one = es(30000, 4502);
    const three = es(20000, 4501, 3);
    const loss = es(-20000, 4498.5);
    const set2 = [one, three, loss];
    expect(summarize(set2, ctx).largestWin).toBe(30000);
    expect(largestInUnit(set2, { ...ctx, unit: 'ticks' }, 'win')).toBe(three);
    expect(largestInUnit(set2, { ...ctx, unit: 'ticks' }, 'loss')).toBe(loss);
    expect(largestInUnit(set2, ctx, 'win')).toBeUndefined();
    expect(largestInUnit([one], { ...ctx, unit: 'ticks' }, 'loss')).toBe(
      undefined,
    );
  });
  test('R reads realized R', () => {
    const s = summarize(
      [
        makeTrade({ net: 3000, initialRisk: 1000 }),
        makeTrade({ net: -2000, initialRisk: 4000 }),
      ],
      { ...ctx, unit: 'r' },
    );
    expect(s.profitFactor).toBeCloseTo(3 / 0.5, 10);
  });
});

describe('volume', () => {
  const fill = (side: 'buy' | 'sell', qty: number) => ({
    id: `${side}-${qty}`,
    accountId: 'a1',
    symbol: 'ESZ5',
    side,
    qty,
    price: 4500,
    time: '2026-03-02T15:00:00Z',
    fees: 0,
    commission: 0,
  });
  test('a trade counts its quantity once: the side it opened, not every fill', () => {
    const t = makeTrade({
      net: 0,
      maxPosition: 3,
      executions: [fill('buy', 2), fill('buy', 1), fill('sell', 3)],
    });
    expect(tradeVolume(t)).toBe(3);
    const short = makeTrade({
      net: 0,
      direction: 'short',
      executions: [fill('sell', 2), fill('buy', 1), fill('buy', 1)],
    });
    expect(tradeVolume(short)).toBe(2);
  });
  test('a trade without fills counts its size', () => {
    expect(tradeVolume(makeTrade({ net: 0, maxPosition: 4 }))).toBe(4);
  });
  test('lots add without binary noise: 1.8, 1.5, 1.6 and 1.9 make 6.8', () => {
    const lots = [1.7999999999999998, 1.5, 1.6, 1.9].map((maxPosition) =>
      makeTrade({ net: 0, maxPosition }),
    );
    expect(volumeOf(lots)).toBe(6.8);
    expect(volumeOf([])).toBe(0);
  });
});

describe('holdTimes', () => {
  const held = (net: number, minutes: number) =>
    makeTrade({
      net,
      openedAt: '2026-03-02T15:00:00Z',
      closedAt: new Date(
        Date.parse('2026-03-02T15:00:00Z') + minutes * 60_000,
      ).toISOString(),
    });
  test('averages the minutes held over all closed trades, winners, losers and breakevens', () => {
    const trades = [
      held(100, 10),
      held(100, 30),
      held(-100, 60),
      held(0, 5),
      makeTrade({ net: 0, status: 'open' }),
    ];
    expect(holdTimes(trades, ctx)).toEqual({
      all: 26.25,
      wins: 20,
      losses: 60,
      breakevens: 5,
    });
  });
  test('a side with no trades has none', () => {
    expect(holdTimes([held(100, 10)], ctx)).toEqual({
      all: 10,
      wins: 10,
      losses: null,
      breakevens: null,
    });
    expect(holdTimes([], ctx).all).toBeNull();
  });
});

describe('costsOf', () => {
  const fill = (fees: number, commission: number) => ({
    id: 'e',
    accountId: 'a1',
    symbol: 'ESZ5',
    side: 'buy' as const,
    qty: 1,
    price: 4500,
    time: '2026-03-02T15:00:00Z',
    fees,
    commission,
  });
  test('adds the commissions and the fees of the fills apart', () => {
    const a = makeTrade({
      net: 0,
      fees: 450,
      executions: [fill(50, 100), fill(100, 200)],
    });
    const b = makeTrade({ net: 0, fees: 25, executions: [fill(5, 20)] });
    expect(costsOf([a, b])).toEqual({ commissions: 320, fees: 155 });
  });
  test('a trade with no fills carries its total as fees', () => {
    expect(costsOf([makeTrade({ net: 0, fees: 40 })])).toEqual({
      commissions: 0,
      fees: 40,
    });
  });
  test('open trades are left out, as in gross to net', () => {
    const open = makeTrade({
      net: 0,
      status: 'open',
      fees: 25,
      executions: [fill(5, 20)],
    });
    expect(costsOf([open])).toEqual({ commissions: 0, fees: 0 });
  });
});

describe('largestTrade', () => {
  test('is the trade itself, so a link can name its id', () => {
    const a = makeTrade({ net: 5000 });
    const b = makeTrade({ net: 9000 });
    const c = makeTrade({ net: -7000 });
    const d = makeTrade({ net: -2000 });
    const all = [a, b, c, d, makeTrade({ net: 0, status: 'open' })];
    expect(largestTrade(all, ctx, 'win')?.id).toBe(b.id);
    expect(largestTrade(all, ctx, 'loss')?.id).toBe(c.id);
    expect(largestTrade([a], ctx, 'loss')).toBeUndefined();
  });
});

describe('expectancy: one definition, in money and in every unit', () => {
  // ES, tick 0.25: a win of 8 ticks, a loss of 4, and a breakeven that moved
  // 1 tick but netted nothing. Each risked $100.
  const es = (net: number, avgExit: number) =>
    makeTrade({ net, avgEntry: 4500, avgExit, initialRisk: 10000 });
  const set = [es(10000, 4502), es(-5000, 4499), es(0, 4500.25)];

  test('expectancyOf is win rate times average win plus loss rate times average loss', () => {
    expect(expectancyOf({ n: 2, sum: 300 }, { n: 1, sum: -60 })).toBe(80);
    expect(expectancyOf({ n: 0, sum: 0 }, { n: 1, sum: -60 })).toBe(-60);
    expect(expectancyOf({ n: 0, sum: 0 }, { n: 0, sum: 0 })).toBeNull();
  });

  test('the summary reads it over the decided trades, a breakeven left out', () => {
    // (100 - 50) / 2, not (100 - 50 + 0) / 3.
    expect(summarize(set, ctx).expectancy).toBe(2500);
  });

  test('in a unit it reads the same decided trades: +8 and -4 ticks are +2, never the average trade', () => {
    expect(expectancyIn(set, ctx, 'ticks')).toBe(2);
    expect(expectancyIn(set, ctx, 'r')).toBe(0.25);
    // No forex trade: no pips.
    expect(expectancyIn(set, ctx, 'pips')).toBeNull();
    expect(expectancyIn([es(0, 4500.25)], ctx, 'ticks')).toBeNull();
  });
});

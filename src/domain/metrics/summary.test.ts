import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { riskFromStop, summarize } from './summary';

const nets = [10000, -5000, 0, 2500, -2500, 7500].map((net) => makeTrade({ net }));

describe('summarize', () => {
  test('core summary at threshold 0', () => {
    expect(summarize(nets, { breakevenThreshold: 0 })).toMatchObject({
      closedCount: 6, wins: 3, losses: 2, breakevens: 1, netPnl: 12500, winRate: 0.6,
      avgWin: 6667, avgLoss: -3750, expectancy: 2083, largestWin: 10000, largestLoss: -5000,
    });
    const s = summarize(nets, { breakevenThreshold: 0 });
    expect(s.profitFactor).toBeCloseTo(2.6667, 4);
    expect(s.winLossRatio).toBeCloseTo(1.7778, 4);
  });
  test('breakeven threshold moves small trades out of wins and losses', () => {
    const s = summarize(nets, { breakevenThreshold: 2500 });
    expect(s).toMatchObject({ wins: 2, losses: 1, breakevens: 3, profitFactor: 3.5, avgWin: 8750, avgLoss: -5000 });
    expect(s.winRate).toBeCloseTo(0.6667, 4);
  });
  test('empty and open-only selections return nulls, never NaN', () => {
    for (const set of [[], [makeTrade({ net: -1000, status: 'open' })]]) {
      const s = summarize(set, { breakevenThreshold: 0 });
      expect(s).toMatchObject({
        closedCount: 0, netPnl: 0, winRate: null, profitFactor: null, avgWin: null, avgLoss: null,
        winLossRatio: null, expectancy: null, expectancyR: null, largestWin: null, largestLoss: null,
        ruleAdherence: null,
      });
    }
  });
  test('open trades are counted but excluded from metrics', () => {
    const s = summarize([makeTrade({ net: 100 }), makeTrade({ net: -1000, status: 'open' })], { breakevenThreshold: 0 });
    expect(s).toMatchObject({ closedCount: 1, openCount: 1, netPnl: 100 });
  });
  test('no losses gives a null profit factor', () => {
    expect(summarize([makeTrade({ net: 5000 }), makeTrade({ net: 3000 })], { breakevenThreshold: 0 }))
      .toMatchObject({ profitFactor: null, winRate: 1 });
  });
  test('R metrics and risk from stop', () => {
    const t = [makeTrade({ net: 10000, initialRisk: 5000 }), makeTrade({ net: -5000, initialRisk: 5000 }), makeTrade({ net: 2500 })];
    expect(summarize(t, { breakevenThreshold: 0 })).toMatchObject({ expectancyR: 0.5, rTradeCount: 2, noRiskCount: 1 });
    expect(riskFromStop(makeTrade({ net: 0, avgEntry: 4510.5, maxPosition: 2 }), 4508.5)).toBe(20000);
  });
  test('rule adherence ignores unanswered checks', () => {
    const t = makeTrade({ net: 0, ruleChecks: [true, true, false, null].map((f, i) => ({ ruleId: `r${i}`, followed: f })) });
    expect(summarize([t], { breakevenThreshold: 0 }).ruleAdherence).toBeCloseTo(0.6667, 4);
  });
});

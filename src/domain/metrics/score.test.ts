import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { generateSampleWorkspace, SAMPLE_SEED } from '@/data/seed/generate';
import { makeTrade } from '../__fixtures__/trades';
import { parseCsv } from '../import/csv';
import { guessMapping } from '../import/mapping';
import { planImport } from '../import/plan';
import type { Trade } from '../types';
import { defaultMetricContext } from './context';
import {
  SCORE_WEIGHTS,
  ratioScore,
  recoveryScore,
  scoreOf,
  winRateScore,
} from './score';

const NY = 'America/New_York';
const ctx = defaultMetricContext(NY);

/** The 2 Nov 2026 fills of the forex sample file, imported with the generic fills mapping. */
function forexTrades(): Trade[] {
  const parsed = parseCsv(
    readFileSync(
      new URL('./__fixtures__/forex-2026-11-02.csv', import.meta.url),
      'utf8',
    ),
  );
  const plan = planImport(
    parsed,
    guessMapping(parsed, { sourceTimeZone: NY }),
    {
      workspaceId: 'mine',
      accountId: 'acc1',
      accountCurrency: 'USD',
      nextSerial: 1,
      openTrades: [],
      fingerprints: [],
      overrides: {},
      importRevision: 0,
    },
    { importId: 'imp1', fileName: 'f.csv', now: '2026-11-25T00:00:00.000Z' },
  );
  expect(plan.blocked).toBeNull();
  return plan.trades;
}

const nets = (...cents: number[]): Trade[] =>
  cents.map((net, i) =>
    makeTrade({
      net,
      serial: i + 1,
      closedAt: `2026-03-02T15:0${i}:00Z`,
    }),
  );

describe('ratioScore', () => {
  test.each([
    [1.2, 40],
    [1.21, 40.33],
    [1.45, 48.33],
    [0.5, 20],
    [1.79, 59.67],
    [1.8, 50],
    [1.85, 55],
    [2.3, 85],
    [2.6, 100],
    [4.36, 100],
  ])('%s scores %s', (r, expected) =>
    expect(ratioScore(r)).toBeCloseTo(expected, 2),
  );

  test('the help bands: each starts at its own score and rises through the next', () => {
    expect(ratioScore(1.9)).toBeCloseTo(60, 6);
    expect(ratioScore(2.0)).toBeCloseTo(70, 6);
    expect(ratioScore(2.2)).toBeCloseTo(80, 6);
    expect(ratioScore(2.4)).toBeCloseTo(90, 6);
    expect(ratioScore(2.5)).toBeCloseTo(95, 6);
  });

  test('never under 20, and never over 100', () => {
    expect(ratioScore(0)).toBe(20);
    expect(ratioScore(-3)).toBe(20);
    expect(ratioScore(Infinity)).toBe(100);
  });
});

describe('winRateScore', () => {
  test.each([
    [25, 41.67],
    [49.79, 82.98],
    [42.47, 70.78],
    [75, 100],
  ])('%s% scores %s', (pct, expected) =>
    expect(winRateScore(pct)).toBeCloseTo(expected, 2),
  );

  test('60% is full marks, and nothing scores under 0', () => {
    expect(winRateScore(60)).toBe(100);
    expect(winRateScore(0)).toBe(0);
  });
});

describe('recoveryScore', () => {
  test('null (no drawdown) scores 0', () =>
    expect(recoveryScore(null)).toBe(0));
  test('under 1.0 scores 0', () => {
    expect(recoveryScore(0.9)).toBe(0);
    expect(recoveryScore(-2)).toBe(0);
  });
  test('1.0 scores 1', () => expect(recoveryScore(1.0)).toBe(1));
  test('3.49 scores 89', () =>
    expect(Math.abs(recoveryScore(3.49) - 89)).toBeLessThanOrEqual(0.1));
  test('3.5 and up scores 100', () => {
    expect(recoveryScore(3.5)).toBe(100);
    expect(recoveryScore(4.04)).toBe(100);
  });
  test('each band starts at its own score', () => {
    expect(recoveryScore(1.5)).toBe(30);
    expect(recoveryScore(2.0)).toBe(50);
    expect(recoveryScore(2.5)).toBe(60);
    expect(recoveryScore(3.0)).toBe(70);
  });
  test('rises inside a band and never falls with the ratio', () => {
    let last = -1;
    for (let r = 0; r <= 4; r += 0.01) {
      const s = recoveryScore(r);
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });
});

describe('SCORE_WEIGHTS', () => {
  test('are the help weights and add up to 1', () => {
    expect(SCORE_WEIGHTS).toEqual({
      profitFactor: 0.25,
      winLoss: 0.2,
      drawdown: 0.2,
      winRate: 0.15,
      recovery: 0.1,
      consistency: 0.1,
    });
    expect(Object.values(SCORE_WEIGHTS).reduce((s, w) => s + w, 0)).toBeCloseTo(
      1,
      12,
    );
  });
});

describe('scoreOf', () => {
  test("the 2 Nov forex trades score 76.43, within 0.2 of TradeZella's 76.3", () => {
    const trades = forexTrades();
    expect(trades.map((t) => t.net).sort((a, b) => a - b)).toEqual([
      -19380, 20100, 31175, 33280,
    ]);
    const r = scoreOf(trades, ctx)!;
    expect(r).not.toBeNull();
    // The total is to two decimals: count hundredths so 76.44 reads as 1 off
    // 76.43, not as 0.01000000000000001 (the method gives 76.4434; the
    // research's 76.43 reads the under-1.8 slope as 33.3 where the ratio
    // tests above pin 100 / 3).
    expect(Math.abs(Math.round(r.total * 100) - 7643)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.total - 76.3)).toBeLessThanOrEqual(0.2);
    const { parts } = r;
    expect(parts.winRate.score).toBe(100);
    expect(parts.profitFactor.score).toBe(100);
    expect(parts.profitFactor.why).toBeUndefined();
    expect(parts.winLoss.score).toBeCloseTo(48.48, 1);
    expect(parts.drawdown.score).toBe(100);
    expect(parts.recovery.score).toBe(0);
    expect(parts.recovery.why).toBe('no-drawdown');
    expect(parts.recovery.plotted).toBe(100);
    expect(parts.consistency.score).toBeCloseTo(67.48, 1);
  });

  test('the raw values are the figures the screen shows', () => {
    const { parts } = scoreOf(forexTrades(), ctx)!;
    expect(parts.winRate.raw).toBeCloseTo(75, 6);
    expect(parts.winLoss.raw).toBeCloseTo(1.4543, 3);
    expect(parts.profitFactor.raw).toBeCloseTo(4.363, 3);
    expect(parts.drawdown.raw).toBe(0);
    expect(parts.recovery.raw).toBeNull();
    // The population deviation of the trade nets, over the net: 32.5%.
    expect(parts.consistency.raw).toBeCloseTo(0.3252, 3);
  });

  test('every part but recovery plots where it scores', () => {
    const { parts } = scoreOf(forexTrades(), ctx)!;
    for (const k of [
      'winRate',
      'profitFactor',
      'winLoss',
      'drawdown',
      'consistency',
    ] as const)
      expect(parts[k].plotted).toBe(parts[k].score);
  });

  test('the total is the weighted parts, to two decimals', () => {
    const r = scoreOf(forexTrades(), ctx)!;
    const sum = (Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[])
      .map((k) => SCORE_WEIGHTS[k] * r.parts[k].score)
      .reduce((a, b) => a + b, 0);
    expect(r.total).toBe(Math.round(sum * 100) / 100);
  });

  test('a mixed set reads its ratios and its drawdown', () => {
    // Two days: +400 then -100 (dd 25% of the 400 peak), then +300.
    const trades = [
      makeTrade({ net: 40000, serial: 1, closedAt: '2026-03-02T15:00:00Z' }),
      makeTrade({ net: -10000, serial: 2, closedAt: '2026-03-03T15:00:00Z' }),
      makeTrade({ net: 30000, serial: 3, closedAt: '2026-03-04T15:00:00Z' }),
    ];
    const { parts } = scoreOf(trades, ctx)!;
    expect(parts.profitFactor.raw).toBeCloseTo(7, 6);
    expect(parts.winLoss.raw).toBeCloseTo(3.5, 6);
    expect(parts.drawdown.raw).toBeCloseTo(25, 6);
    expect(parts.drawdown.score).toBeCloseTo(75, 6);
    // net 600 over a 100 drawdown: 6.
    expect(parts.recovery.raw).toBeCloseTo(6, 6);
    expect(parts.recovery.score).toBe(100);
    expect(parts.recovery.why).toBeUndefined();
    expect(parts.winRate.raw).toBeCloseTo((2 / 3) * 100, 6);
  });

  test('a drop from a peak at or under zero scores the drawdown 0', () => {
    const { parts } = scoreOf(nets(-10000, 5000), ctx)!;
    expect(parts.drawdown.score).toBe(0);
    expect(parts.drawdown.raw).toBeNull();
  });

  test('a drop of more than the whole peak clamps the drawdown at 0', () => {
    const { parts } = scoreOf(
      [
        makeTrade({ net: 1000, serial: 1, closedAt: '2026-03-02T15:00:00Z' }),
        makeTrade({ net: -9000, serial: 2, closedAt: '2026-03-03T15:00:00Z' }),
      ],
      ctx,
    )!;
    expect(parts.drawdown.raw).toBeCloseTo(900, 6);
    expect(parts.drawdown.score).toBe(0);
  });

  test('a net loss scores consistency 0', () => {
    const { parts } = scoreOf(nets(-30000, 10000, 5000), ctx)!;
    expect(parts.consistency).toMatchObject({
      score: 0,
      plotted: 0,
      raw: null,
      why: 'net-loss',
    });
  });

  test('a flat net scores consistency 0, without calling it a loss', () => {
    const { parts } = scoreOf(nets(10000, -10000), ctx)!;
    expect(parts.consistency.score).toBe(0);
    expect(parts.consistency.why).toBeUndefined();
  });

  test('trades that all net the same score consistency 100', () => {
    const { parts } = scoreOf(nets(10000, 10000, 10000), ctx)!;
    expect(parts.consistency.score).toBe(100);
    expect(parts.consistency.raw).toBe(0);
  });

  test('no losses: profit factor 100, why no-losses', () => {
    const { parts } = scoreOf(nets(10000, 20000), ctx)!;
    expect(parts.profitFactor).toMatchObject({
      score: 100,
      plotted: 100,
      raw: null,
      why: 'no-losses',
    });
    expect(parts.winLoss).toMatchObject({
      score: 100,
      plotted: 100,
      raw: null,
      why: 'no-losses',
    });
  });

  test('losses and no win: both ratios are 0 and score the floor of 20', () => {
    const { parts } = scoreOf(nets(-10000, -20000), ctx)!;
    expect(parts.profitFactor).toMatchObject({ raw: 0, score: 20 });
    expect(parts.winLoss).toMatchObject({ raw: 0, score: 20 });
    expect(parts.winRate).toMatchObject({ raw: 0, score: 0 });
  });

  test('no decided trade has no win rate and scores 0 for it', () => {
    const { parts } = scoreOf(nets(0, 0), ctx)!;
    expect(parts.winRate).toMatchObject({ raw: null, score: 0 });
  });

  test('the pnl basis picks the figures: gross ignores the fees', () => {
    // net -20, gross +30: a loss on the net basis, a win on the gross one.
    const t = makeTrade({
      net: -2000,
      gross: 3000,
      fees: 5000,
      serial: 1,
      closedAt: '2026-03-02T15:00:00Z',
    });
    const u = makeTrade({
      net: 10000,
      serial: 2,
      closedAt: '2026-03-03T15:00:00Z',
    });
    const net = scoreOf([t, u], ctx)!;
    expect(net.parts.profitFactor.raw).toBeCloseTo(5, 6);
    const gross = scoreOf([t, u], { ...ctx, pnlBasis: 'gross' })!;
    expect(gross.parts.profitFactor.why).toBe('no-losses');
  });

  test('open trades are not scored', () => {
    const open = makeTrade({
      net: -999999,
      gross: -999999,
      status: 'open',
      serial: 9,
    });
    const closed = nets(10000, 20000);
    expect(scoreOf([...closed, open], ctx)).toEqual(scoreOf(closed, ctx));
  });

  test('the unit does not change the score', () => {
    const trades = forexTrades();
    expect(scoreOf(trades, { ...ctx, unit: 'pips' })).toEqual(
      scoreOf(trades, ctx),
    );
  });

  test('no closed trade: null', () => {
    expect(scoreOf([], ctx)).toBeNull();
    expect(
      scoreOf([makeTrade({ net: 0, status: 'open', serial: 1 })], ctx),
    ).toBeNull();
  });

  test('every total is within 0 to 100', () => {
    // A seeded generator: the same sets on every run.
    let seed = 20261125;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let n = 0; n < 300; n++) {
      const count = 1 + Math.floor(rand() * 30);
      const scale = [1, 100, 100000][Math.floor(rand() * 3)]!;
      const bias = rand() * 0.8 - 0.3;
      const trades = Array.from({ length: count }, (_, i) =>
        makeTrade({
          net: Math.round((rand() - 0.5 + bias) * 2000 * scale),
          serial: i + 1,
          closedAt: `2026-03-${String(2 + Math.floor(rand() * 20)).padStart(2, '0')}T15:00:00Z`,
        }),
      );
      const r = scoreOf(trades, ctx)!;
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeLessThanOrEqual(100);
      expect(Number.isFinite(r.total)).toBe(true);
      for (const p of Object.values(r.parts)) {
        expect(p.score).toBeGreaterThanOrEqual(0);
        expect(p.score).toBeLessThanOrEqual(100);
        expect(p.plotted).toBeGreaterThanOrEqual(0);
        expect(p.plotted).toBeLessThanOrEqual(100);
      }
    }
  });

  test('score budget: the sample in under 20 ms', () => {
    const ws = generateSampleWorkspace({
      seed: SAMPLE_SEED,
      endDate: '2026-11-19',
    });
    const run = () => scoreOf(ws.trades, ctx);
    expect(run()).not.toBeNull(); // the warm-up
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      run();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[2]!).toBeLessThan(20);
  });
});

import { describe, expect, test } from 'vitest';
import { makeTrade } from './__fixtures__/trades';
import { resolveInstrument } from './instruments';
import { plannedR, riskFromStop } from './metrics/summary';
import {
  hasStop,
  levelMoney,
  levelPrice,
  levelProblems,
  pipSize,
  plannedReward,
  plannedRisk,
  plannedRMultiple,
  sidesOf,
  tradeRisk,
  unitsFor,
} from './risk';
import type { Execution, Instrument, LevelSide, Trade } from './types';

const inst = (symbol: string): Instrument => resolveInstrument(symbol)!;

const buy = (id: string, qty: number, price: number): Execution => ({
  id,
  accountId: 'a1',
  symbol: 'AAPL',
  side: 'buy',
  qty,
  price,
  time: '2026-03-02T15:00:00Z',
  fees: 0,
  commission: 0,
});

const side = (
  unit: LevelSide['unit'],
  ...levels: [value: number, qty: number][]
): LevelSide => ({
  unit,
  levels: levels.map(([value, qty]) => ({ value, qty })),
});

/** A long stock position of 20 shares averaging 102.50, the help's worked example. */
const helpExample = (): Trade =>
  makeTrade({
    net: 0,
    instrument: inst('AAPL'),
    executions: [buy('e1', 10, 100), buy('e2', 10, 105)],
    avgEntry: 102.5,
    maxPosition: 20,
    targets: side('price', [110, 7], [120, 3], [125, 10]),
    stops: side('price', [95, 15], [90, 5]),
  });

describe('pipSize', () => {
  test('a JPY quote moves in hundredths, every other quote in ten thousandths', () => {
    expect(pipSize(inst('USDJPY'))).toBe(0.01);
    expect(pipSize(inst('EURUSD'))).toBe(0.0001);
    expect(pipSize(inst('GBPUSD'))).toBe(0.0001);
  });
});

describe('unitsFor', () => {
  test('a future reads every unit but pips', () => {
    expect(unitsFor(inst('ESZ5'))).toEqual([
      'price',
      'movement',
      'ticks',
      'points',
      'amount',
    ]);
  });
  test('forex reads price, movement, amount and pips', () => {
    expect(unitsFor(inst('EURUSD'))).toEqual([
      'price',
      'movement',
      'amount',
      'pips',
    ]);
  });
  test('a stock reads price, movement and amount', () => {
    const base = ['price', 'movement', 'amount'];
    expect(unitsFor(inst('AAPL'))).toEqual(base);
    expect(unitsFor(inst('BTCUSD'))).toEqual(base);
  });
  test('an option on a future adds ticks and points; any other option does not', () => {
    const option = inst('AAPL260119C00150000');
    expect(option.assetClass).toBe('option');
    expect(unitsFor({ ...option, optionOn: 'future' })).toEqual([
      'price',
      'movement',
      'ticks',
      'points',
      'amount',
    ]);
    expect(unitsFor({ ...option, optionOn: 'stock' })).toEqual([
      'price',
      'movement',
      'amount',
    ]);
    expect(unitsFor(option)).toEqual(['price', 'movement', 'amount']);
  });
});

describe('levelPrice and levelMoney', () => {
  test('a Price level is the price itself', () => {
    const t = helpExample();
    expect(levelPrice(t, 'target', 'price', { value: 110, qty: 7 })).toBe(110);
    expect(levelPrice(t, 'stop', 'price', { value: 95, qty: 15 })).toBe(95);
  });

  test('price movement and points add to the average entry for a target and subtract for a stop', () => {
    const t = makeTrade({ net: 0 }); // an ES long at 4500
    for (const unit of ['movement', 'points'] as const) {
      expect(levelPrice(t, 'target', unit, { value: 10, qty: 1 })).toBe(4510);
      expect(levelPrice(t, 'stop', unit, { value: 6, qty: 1 })).toBe(4494);
    }
  });

  test('a short reverses the sides', () => {
    const t = makeTrade({
      net: 0,
      instrument: inst('AAPL'),
      direction: 'short',
      avgEntry: 100,
      maxPosition: 10,
      targets: side('price', [90, 10]),
      stops: side('price', [105, 10]),
    });
    for (const unit of ['movement', 'points'] as const) {
      expect(levelPrice(t, 'target', unit, { value: 10, qty: 10 })).toBe(90);
      expect(levelPrice(t, 'stop', unit, { value: 5, qty: 10 })).toBe(105);
    }
    expect(plannedReward(t)).toBe(10000);
    expect(plannedRisk(t)).toBe(5000);
    expect(plannedRMultiple(t)).toBe(2);
    expect(levelProblems(t, sidesOf(t))).toEqual([]);
  });

  test('ticks, points and pips convert (ES, EURUSD, USDJPY)', () => {
    // ES: 0.25 a tick, $50 a point; two contracts.
    const es = makeTrade({ net: 0, maxPosition: 2 });
    expect(levelPrice(es, 'target', 'ticks', { value: 8, qty: 2 })).toBe(4502);
    expect(levelPrice(es, 'stop', 'ticks', { value: 4, qty: 2 })).toBe(4499);
    expect(levelMoney(es, 'target', 'ticks', { value: 8, qty: 2 })).toBe(20000); // 2 contracts x 2 points x $50
    expect(levelMoney(es, 'stop', 'points', { value: 3, qty: 1 })).toBe(15000);

    // EURUSD: 0.0001 a pip, 100,000 a lot, quoted in the P&L currency.
    const eur = makeTrade({
      net: 0,
      instrument: inst('EURUSD'),
      avgEntry: 1.075,
      maxPosition: 1,
    });
    expect(levelPrice(eur, 'target', 'pips', { value: 20, qty: 1 })).toBe(
      1.077,
    );
    expect(levelPrice(eur, 'stop', 'pips', { value: 10, qty: 1 })).toBe(1.074);
    expect(levelMoney(eur, 'target', 'pips', { value: 20, qty: 1 })).toBe(
      20000,
    );
    expect(levelMoney(eur, 'stop', 'pips', { value: 10, qty: 1 })).toBe(10000);

    // USDJPY: 0.01 a pip, quoted in yen, so the money converts at the entry.
    const jpy = makeTrade({
      net: 0,
      instrument: inst('USDJPY'),
      avgEntry: 154.21,
      maxPosition: 1,
      pnlCurrency: 'USD',
    });
    expect(levelPrice(jpy, 'target', 'pips', { value: 30, qty: 1 })).toBe(
      154.51,
    );
    // 0.30 yen x 100,000 over 154.21 is $194.54.
    expect(levelMoney(jpy, 'target', 'pips', { value: 30, qty: 1 })).toBe(
      19454,
    );
    // 21 pips is the stop at 154.00 that summary.test.ts prices at 13618.
    expect(levelPrice(jpy, 'stop', 'pips', { value: 21, qty: 1 })).toBe(154);
    expect(levelMoney(jpy, 'stop', 'pips', { value: 21, qty: 1 })).toBe(13618);
  });

  test('an Amount level is the money on its own quantity', () => {
    const mnq = makeTrade({
      net: 0,
      instrument: inst('MNQZ5'),
      avgEntry: 21000,
      maxPosition: 2,
    });
    // $2 a point a contract: $300 on one contract is 150 points, on two it is 75.
    expect(levelPrice(mnq, 'target', 'amount', { value: 300, qty: 1 })).toBe(
      21150,
    );
    expect(levelPrice(mnq, 'target', 'amount', { value: 300, qty: 2 })).toBe(
      21075,
    );
    expect(levelPrice(mnq, 'stop', 'amount', { value: 150, qty: 2 })).toBe(
      20962.5,
    );
    expect(levelMoney(mnq, 'target', 'amount', { value: 300, qty: 2 })).toBe(
      30000,
    );
  });

  test('an Amount level converts back through the trade money per price unit', () => {
    const jpy = makeTrade({
      net: 0,
      instrument: inst('USDJPY'),
      avgEntry: 154.21,
      maxPosition: 1,
      pnlCurrency: 'USD',
    });
    const stop = { value: 100, qty: 1 };
    const price = levelPrice(jpy, 'stop', 'amount', stop);
    expect(price).toBeLessThan(154.21);
    // The price it lands on is worth the amount typed, in the legacy path too.
    expect(riskFromStop(jpy, price)).toBe(10000);
    expect(levelMoney(jpy, 'stop', 'amount', stop)).toBe(10000);
  });

  test('money is positive on either side of the entry', () => {
    const t = makeTrade({ net: 0, instrument: inst('AAPL'), avgEntry: 100 });
    expect(levelMoney(t, 'stop', 'price', { value: 105, qty: 10 })).toBe(5000);
    expect(levelMoney(t, 'stop', 'price', { value: 95, qty: 10 })).toBe(5000);
  });
});

describe('planned figures', () => {
  test('the help worked example', () => {
    const t = helpExample();
    expect(plannedReward(t)).toBe(33000); // 7 x 7.5 + 3 x 17.5 + 10 x 22.5
    expect(plannedRisk(t)).toBe(17500); // 15 x 7.5 + 5 x 12.5
    expect(tradeRisk(t)).toBe(17500);
    expect(plannedRMultiple(t)).toBeCloseTo(1.886, 3);
    expect(hasStop(t)).toBe(true);
  });

  test('an MNQ amount rule gives 2R', () => {
    const t = makeTrade({
      net: 0,
      instrument: inst('MNQZ5'),
      avgEntry: 21000,
      maxPosition: 1,
      targets: side('amount', [300, 1]),
      stops: side('amount', [150, 1]),
    });
    expect(plannedReward(t)).toBe(30000);
    expect(plannedRisk(t)).toBe(15000);
    expect(plannedRMultiple(t)).toBe(2);
  });

  test('one side only shows nothing planned', () => {
    const stopsOnly = makeTrade({
      net: 0,
      instrument: inst('AAPL'),
      avgEntry: 100,
      maxPosition: 10,
      stops: side('price', [95, 10]),
    });
    expect(plannedReward(stopsOnly)).toBeUndefined();
    expect(plannedRisk(stopsOnly)).toBeUndefined();
    expect(plannedRMultiple(stopsOnly)).toBeUndefined();
    expect(tradeRisk(stopsOnly)).toBe(5000);
    expect(hasStop(stopsOnly)).toBe(true);

    const targetsOnly = makeTrade({
      net: 0,
      instrument: inst('AAPL'),
      avgEntry: 100,
      maxPosition: 10,
      targets: side('price', [110, 10]),
    });
    expect(plannedReward(targetsOnly)).toBeUndefined();
    expect(plannedRisk(targetsOnly)).toBeUndefined();
    expect(plannedRMultiple(targetsOnly)).toBeUndefined();
    expect(tradeRisk(targetsOnly)).toBeUndefined();
    expect(hasStop(targetsOnly)).toBe(false);
  });

  test('a trade with no levels has nothing', () => {
    const t = makeTrade({ net: 0 });
    expect(sidesOf(t)).toEqual({});
    expect(tradeRisk(t)).toBeUndefined();
    expect(plannedRMultiple(t)).toBeUndefined();
    expect(hasStop(t)).toBe(false);
  });

  test('a stop at the entry is a risk of nothing, and there is no R over it', () => {
    const t = makeTrade({
      net: 0,
      instrument: inst('AAPL'),
      avgEntry: 100,
      maxPosition: 10,
      targets: side('price', [110, 10]),
      stops: side('price', [100, 10]),
    });
    expect(tradeRisk(t)).toBe(0);
    expect(plannedReward(t)).toBe(10000);
    expect(plannedRMultiple(t)).toBeUndefined();
  });

  test('a shortfall counts only the covered quantities', () => {
    const t = makeTrade({
      net: 0,
      instrument: inst('AAPL'),
      avgEntry: 100,
      maxPosition: 20,
      stops: side('price', [95, 5]),
    });
    expect(tradeRisk(t)).toBe(2500); // 5 of the 20 shares, 5 each
  });

  test('a side with no levels is no side', () => {
    const t = makeTrade({
      net: 0,
      instrument: inst('AAPL'),
      avgEntry: 100,
      maxPosition: 10,
      stops: side('price'),
      targets: side('price', [110, 10]),
    });
    expect(hasStop(t)).toBe(false);
    expect(tradeRisk(t)).toBeUndefined();
    expect(plannedRMultiple(t)).toBeUndefined();
  });
});

describe('a trade without levels (B14)', () => {
  test('a legacy stop reads as one Price level at full size, and tradeRisk equals riskFromStop', () => {
    const t = makeTrade({
      net: 0,
      avgEntry: 4510.5,
      maxPosition: 2,
      plannedStop: 4508.5,
      plannedTarget: 4516.5,
    });
    expect(sidesOf(t)).toEqual({
      targets: { unit: 'price', levels: [{ value: 4516.5, qty: 2 }] },
      stops: { unit: 'price', levels: [{ value: 4508.5, qty: 2 }] },
    });
    expect(tradeRisk(t)).toBe(riskFromStop(t, 4508.5));
    expect(tradeRisk(t)).toBe(20000);
    expect(plannedReward(t)).toBe(60000);
    expect(plannedRMultiple(t)).toBeCloseTo(plannedR(t)!, 10);
    expect(hasStop(t)).toBe(true);
  });

  test('a legacy stop in another currency reads the same as riskFromStop', () => {
    const t = makeTrade({
      net: 0,
      instrument: inst('USDJPY'),
      avgEntry: 154.21,
      maxPosition: 1,
      pnlCurrency: 'USD',
      plannedStop: 154,
    });
    expect(tradeRisk(t)).toBe(riskFromStop(t, 154));
    expect(tradeRisk(t)).toBe(13618);
  });

  test('a legacy target alone reads as a side, with no stop', () => {
    const t = makeTrade({ net: 0, plannedTarget: 4510 });
    expect(sidesOf(t)).toEqual({
      targets: { unit: 'price', levels: [{ value: 4510, qty: 1 }] },
    });
    expect(hasStop(t)).toBe(false);
  });

  test('stored levels win over the single-level fields', () => {
    const t = makeTrade({
      net: 0,
      instrument: inst('AAPL'),
      avgEntry: 100,
      maxPosition: 10,
      plannedStop: 90,
      stops: side('price', [98, 10]),
    });
    expect(sidesOf(t).stops).toEqual(side('price', [98, 10]));
    expect(tradeRisk(t)).toBe(2000);
  });

  test('stored levels emptied by hand do not fall back to the old single stop', () => {
    const t = makeTrade({
      net: 0,
      avgEntry: 4500,
      plannedStop: 4490,
      stops: side('price'),
    });
    expect(hasStop(t)).toBe(false);
    expect(tradeRisk(t)).toBeUndefined();
  });
});

describe('levelProblems', () => {
  const long = (): Trade =>
    makeTrade({
      net: 0,
      instrument: inst('AAPL'),
      avgEntry: 100,
      maxPosition: 20,
    });

  test("a long's stop above the average entry is on the wrong side", () => {
    expect(
      levelProblems(long(), { stops: side('price', [95, 10], [101, 10]) }),
    ).toEqual([{ side: 'stop', index: 1, kind: 'wrong-side' }]);
  });

  test("a long's target below the average entry is on the wrong side", () => {
    expect(
      levelProblems(long(), { targets: side('price', [99, 10], [110, 10]) }),
    ).toEqual([{ side: 'target', index: 0, kind: 'wrong-side' }]);
  });

  test("a short's sides are the other way round", () => {
    const short = { ...long(), direction: 'short' as const };
    expect(
      levelProblems(short, {
        targets: side('price', [105, 10]),
        stops: side('price', [95, 10]),
      }),
    ).toEqual([
      { side: 'target', index: 0, kind: 'wrong-side' },
      { side: 'stop', index: 0, kind: 'wrong-side' },
    ]);
  });

  test('a stop at the entry is a break-even stop, not a wrong side', () => {
    expect(levelProblems(long(), { stops: side('price', [100, 20]) })).toEqual(
      [],
    );
  });

  test('every unit reads its side from the price it lands on', () => {
    // 4 ticks of 0.25 above a long is a fine target; a negative movement flips it.
    const es = makeTrade({ net: 0, maxPosition: 2 });
    expect(levelProblems(es, { targets: side('ticks', [4, 2]) })).toEqual([]);
    expect(levelProblems(es, { stops: side('movement', [-3, 2]) })).toEqual([
      { side: 'stop', index: 0, kind: 'wrong-side' },
    ]);
    expect(levelProblems(es, { stops: side('amount', [-100, 2]) })).toEqual([
      { side: 'stop', index: 0, kind: 'wrong-side' },
    ]);
  });

  test('quantities over the position are over-size, flagged at the level that crosses it', () => {
    expect(
      levelProblems(long(), {
        targets: side('price', [110, 10], [120, 8], [130, 5], [140, 5]),
      }),
    ).toEqual([{ side: 'target', index: 2, kind: 'over-size' }]);
  });

  test('each side is counted against the position on its own', () => {
    expect(
      levelProblems(long(), {
        targets: side('price', [110, 20]),
        stops: side('price', [95, 12], [90, 12]),
      }),
    ).toEqual([{ side: 'stop', index: 1, kind: 'over-size' }]);
  });

  test('a shortfall, an exact fill and float sums of lots are none', () => {
    expect(levelProblems(long(), { stops: side('price', [95, 5]) })).toEqual(
      [],
    );
    expect(
      levelProblems(long(), { stops: side('price', [95, 12], [90, 8]) }),
    ).toEqual([]);
    const lots = makeTrade({
      net: 0,
      instrument: inst('EURUSD'),
      avgEntry: 1.075,
      maxPosition: 0.3,
    });
    expect(
      levelProblems(lots, { stops: side('price', [1.07, 0.1], [1.06, 0.2]) }),
    ).toEqual([]);
  });

  test('a level can be both on the wrong side and over-size', () => {
    expect(
      levelProblems(long(), { stops: side('price', [95, 15], [103, 15]) }),
    ).toEqual([
      { side: 'stop', index: 1, kind: 'wrong-side' },
      { side: 'stop', index: 1, kind: 'over-size' },
    ]);
  });

  test('it checks the sides it is given, not the stored ones', () => {
    const t = helpExample();
    expect(levelProblems(t, sidesOf(t))).toEqual([]);
    expect(levelProblems(t, { stops: side('price', [110, 20]) })).toEqual([
      { side: 'stop', index: 0, kind: 'wrong-side' },
    ]);
    expect(levelProblems(t, {})).toEqual([]);
  });
});

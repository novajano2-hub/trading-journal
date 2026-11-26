import { describe, expect, test } from 'vitest';
import { resolveInstrument } from '../instruments';
import { levelProblems, plannedRMultiple, sidesOf } from '../risk';
import { buildTrades, type BuildOptions } from '../trade-builder';
import type {
  Execution,
  FeeRule,
  LevelUnit,
  Side,
  TargetRule,
  Trade,
} from '../types';
import {
  applyTargetRule,
  pickRule,
  qtyStep,
  ruleMatches,
  targetRuleError,
  targetRulePatch,
  unitsForRule,
} from './target-rules';

const opts: BuildOptions = {
  workspaceId: 'w',
  startSerial: 1,
  resolve: (s) => resolveInstrument(s),
  accountCurrency: () => 'USD',
};

let n = 0;
/** One trade of the fills `[side, qty, price]` in `symbol`, in the account `a1`. */
function trade(
  symbol: string,
  fills: [Side, number, number][],
  patch: Partial<Trade> = {},
): Trade {
  const executions: Execution[] = fills.map(([side, qty, price], i) => ({
    id: `e${++n}`,
    accountId: 'a1',
    symbol,
    side,
    qty,
    price,
    time: `2026-03-02T15:0${i}:00Z`,
    fees: 0,
    commission: 0,
  }));
  const [t, ...rest] = buildTrades(executions, opts).trades;
  if (!t || rest.length > 0) throw new Error('the fixture must be one trade');
  return { ...t, ...patch };
}

const rule = (p: Partial<TargetRule> = {}): TargetRule => ({
  id: 'r1',
  workspaceId: 'w',
  accountId: 'a1',
  assetClass: 'future',
  symbols: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...p,
});
const levels = (unit: LevelUnit, ...l: [value: number, pct: number][]) => ({
  unit,
  levels: l.map(([value, pct]) => ({ value, pct })),
});
const feeRule = (p: Partial<FeeRule> = {}): FeeRule => ({
  id: 'f1',
  workspaceId: 'w',
  accountId: 'a1',
  assetClass: 'future',
  symbols: [],
  mode: 'per-execution',
  applyOn: 'all',
  commission: 0,
  fee: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...p,
});

const ES_LONG = (qty = 3) => trade('ESZ5', [['buy', qty, 5000]]);

describe('ruleMatches', () => {
  test('the account, the instrument and the symbols all have to agree', () => {
    const t = ES_LONG();
    expect(ruleMatches(rule(), t)).toBe(true);
    expect(ruleMatches(rule({ accountId: 'a2' }), t)).toBe(false);
    expect(ruleMatches(rule({ assetClass: 'stock' }), t)).toBe(false);
    expect(ruleMatches(rule({ symbols: ['NQ'] }), t)).toBe(false);
  });

  test('empty symbols mean every symbol; a symbol matches the contract or its root, however it is written', () => {
    const t = ES_LONG();
    expect(ruleMatches(rule({ symbols: [] }), t)).toBe(true);
    expect(ruleMatches(rule({ symbols: ['ESZ5'] }), t)).toBe(true);
    expect(ruleMatches(rule({ symbols: ['es'] }), t)).toBe(true);
    expect(ruleMatches(rule({ symbols: ['/ES'] }), t)).toBe(true);
    expect(ruleMatches(rule({ symbols: ['NQ', 'ES'] }), t)).toBe(true);
    const fx = trade('EUR/USD', [['buy', 1, 1.1]]);
    expect(
      ruleMatches(rule({ assetClass: 'forex', symbols: ['EURUSD'] }), fx),
    ).toBe(true);
  });

  test('a future option is its own instrument; an option on a stock is an option', () => {
    const base = trade('ESZ5', [['buy', 1, 20]]);
    const futureOption: Trade = {
      ...base,
      instrument: {
        ...base.instrument,
        assetClass: 'option',
        optionOn: 'future',
      },
    };
    const stockOption: Trade = {
      ...base,
      instrument: {
        ...base.instrument,
        assetClass: 'option',
        optionOn: 'stock',
        pointValue: 100,
      },
    };
    expect(
      ruleMatches(rule({ assetClass: 'future-option' }), futureOption),
    ).toBe(true);
    expect(ruleMatches(rule({ assetClass: 'option' }), futureOption)).toBe(
      false,
    );
    expect(ruleMatches(rule({ assetClass: 'option' }), stockOption)).toBe(true);
    expect(
      ruleMatches(rule({ assetClass: 'future-option' }), stockOption),
    ).toBe(false);
  });
});

describe('pickRule', () => {
  const t = ES_LONG();

  test('a symbol rule beats an all-symbols rule, then the newest', () => {
    const all = rule({ id: 'all', createdAt: '2026-02-01T00:00:00.000Z' });
    const old = rule({
      id: 'old',
      symbols: ['ES'],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const fresh = rule({
      id: 'fresh',
      symbols: ['ES'],
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    // The newest rule overall names no symbol, yet the one that does wins.
    expect(pickRule([all, old], t)?.id).toBe('old');
    expect(pickRule([old, all], t)?.id).toBe('old');
    expect(pickRule([old, fresh, all], t)?.id).toBe('fresh');
    // With none naming the symbol, the newest of the rest.
    const older = rule({ id: 'older', createdAt: '2025-12-01T00:00:00.000Z' });
    expect(pickRule([older, all], t)?.id).toBe('all');
  });

  test('rules that do not match are never picked; none gives undefined; it reads fee rules too', () => {
    const other = rule({ id: 'x', accountId: 'a2' });
    expect(pickRule([other], t)).toBeUndefined();
    expect(pickRule([], t)).toBeUndefined();
    const fees = [
      feeRule({ id: 'f-all' }),
      feeRule({ id: 'f-es', symbols: ['ESZ5'] }),
    ];
    expect(pickRule(fees, t)?.id).toBe('f-es');
  });
});

describe('qtyStep', () => {
  test('whole for contracts and shares, a hundredth of a lot for forex, finer when the fills are', () => {
    expect(qtyStep(ES_LONG())).toBe(1);
    expect(qtyStep(trade('AAPL', [['buy', 100, 190]]))).toBe(1);
    expect(qtyStep(trade('EURUSD', [['buy', 1.7, 1.1]]))).toBe(0.01);
    expect(qtyStep(trade('EURUSD', [['buy', 0.125, 1.1]]))).toBe(0.001);
    expect(qtyStep(trade('AAPL', [['buy', 2.5, 190]]))).toBe(0.1);
  });
});

describe('applyTargetRule', () => {
  test('50% and 50% split the position, last takes the rest', () => {
    const t = ES_LONG(3);
    const given = applyTargetRule(
      t,
      rule({ target: levels('price', [5010, 50], [5020, 50]) }),
    );
    // Half of 3 contracts rounds down to 1; the last level takes the other 2.
    expect(given).toEqual({
      targets: {
        unit: 'price',
        levels: [
          { value: 5010, qty: 1 },
          { value: 5020, qty: 2 },
        ],
      },
    });
  });

  test('both sides at 100% cover the whole position, and the first level of a long stop is below the entry', () => {
    const t = ES_LONG(2);
    const given = applyTargetRule(
      t,
      rule({
        target: levels('price', [5010, 100]),
        stop: levels('price', [4995, 100]),
      }),
    );
    expect(given.targets?.levels).toEqual([{ value: 5010, qty: 2 }]);
    expect(given.stops?.levels).toEqual([{ value: 4995, qty: 2 }]);
  });

  test('a level that rounds down to nothing is dropped, and later levels take its share', () => {
    // One contract cannot be split in two.
    const one = applyTargetRule(
      ES_LONG(1),
      rule({ target: levels('price', [5010, 50], [5020, 50]) }),
    );
    expect(one.targets?.levels).toEqual([{ value: 5020, qty: 1 }]);
    // Two levels at 100% each: the first takes the position, the second has nothing left.
    const full = applyTargetRule(
      ES_LONG(6),
      rule({ target: levels('price', [5010, 100], [5020, 100]) }),
    );
    expect(full.targets?.levels).toEqual([{ value: 5010, qty: 6 }]);
  });

  test('the step follows the instrument: lots to a hundredth, shares to their own fills', () => {
    const lots = applyTargetRule(
      trade('EURUSD', [['buy', 1.7, 1.1]]),
      rule({
        assetClass: 'forex',
        target: levels('price', [1.102, 50], [1.105, 50]),
      }),
    );
    expect(lots.targets?.levels).toEqual([
      { value: 1.102, qty: 0.85 },
      { value: 1.105, qty: 0.85 },
    ]);
    const shares = applyTargetRule(
      trade('AAPL', [['buy', 2.5, 100]]),
      rule({
        assetClass: 'stock',
        target: levels('price', [110, 50], [120, 50]),
      }),
    );
    expect(shares.targets?.levels).toEqual([
      { value: 110, qty: 1.2 },
      { value: 120, qty: 1.3 },
    ]);
  });

  test('a wrong-side Price level skips that side', () => {
    const t = trade('AAPL', [['buy', 10, 100]]);
    const stock = (p: Partial<TargetRule>) =>
      rule({ assetClass: 'stock', ...p });
    // A long's stop above the entry: the stop side is skipped, the target stays.
    const stopAbove = applyTargetRule(
      t,
      stock({
        target: levels('price', [110, 100]),
        stop: levels('price', [105, 100]),
      }),
    );
    expect(stopAbove.targets?.levels).toEqual([{ value: 110, qty: 10 }]);
    expect(stopAbove).not.toHaveProperty('stops');
    // One wrong level takes the whole side with it, not just itself.
    const oneBad = applyTargetRule(
      t,
      stock({ target: levels('price', [110, 50], [95, 50]) }),
    );
    expect(oneBad).toEqual({});
    // A target below the entry of a long is the same mistake.
    expect(
      applyTargetRule(t, stock({ target: levels('price', [90, 100]) })),
    ).toEqual({});
    // A stop at the entry is a break-even stop, not a wrong one.
    expect(
      applyTargetRule(t, stock({ stop: levels('price', [100, 100]) })).stops,
    ).toBeDefined();
  });

  test('a short reverses the sides', () => {
    const t = trade('ESZ5', [['sell', 2, 5000]]);
    const ok = applyTargetRule(
      t,
      rule({
        target: levels('price', [4990, 100]),
        stop: levels('price', [5010, 100]),
      }),
    );
    expect(ok.targets).toBeDefined();
    expect(ok.stops).toBeDefined();
    // The prices a long wants are wrong for a short.
    expect(
      applyTargetRule(
        t,
        rule({
          target: levels('price', [5010, 100]),
          stop: levels('price', [4990, 100]),
        }),
      ),
    ).toEqual({});
  });

  test('a side the rule does not have is absent from the result', () => {
    const given = applyTargetRule(
      ES_LONG(),
      rule({ stop: levels('price', [4995, 100]) }),
    );
    expect(given).not.toHaveProperty('targets');
    expect(given.stops).toBeDefined();
    expect(applyTargetRule(ES_LONG(), rule())).toEqual({});
  });

  test('an MNQ rule of 300 and 150 dollars gives 2R whatever the size', () => {
    const rules = rule({
      target: levels('amount', [300, 100]),
      stop: levels('amount', [150, 100]),
    });
    for (const qty of [1, 4]) {
      const t = trade('MNQZ5', [['buy', qty, 21000]]);
      const given = applyTargetRule(t, rules);
      // An amount is the money on that level, not per contract (B10).
      expect(given.targets?.levels).toEqual([{ value: 300, qty }]);
      const levelled: Trade = { ...t, ...given };
      expect(plannedRMultiple(levelled)).toBe(2);
      expect(levelProblems(levelled, sidesOf(levelled))).toEqual([]);
    }
  });

  test('ticks, movement and every other unit are kept as the rule has them', () => {
    const given = applyTargetRule(
      ES_LONG(2),
      rule({
        target: levels('ticks', [8, 100]),
        stop: levels('movement', [3, 100]),
      }),
    );
    expect(given.targets).toEqual({
      unit: 'ticks',
      levels: [{ value: 8, qty: 2 }],
    });
    expect(given.stops).toEqual({
      unit: 'movement',
      levels: [{ value: 3, qty: 2 }],
    });
    // A negative movement lands on the wrong side, like a wrong Price.
    expect(
      applyTargetRule(
        ES_LONG(2),
        rule({ stop: levels('movement', [-3, 100]) }),
      ),
    ).toEqual({});
  });

  test('a trade with no size gets nothing, and the input is not touched', () => {
    const t = ES_LONG(2);
    const frozen = JSON.stringify(t);
    expect(
      applyTargetRule(
        { ...t, maxPosition: 0 },
        rule({ target: levels('price', [5010, 100]) }),
      ),
    ).toEqual({});
    applyTargetRule(t, rule({ target: levels('price', [5010, 100]) }));
    expect(JSON.stringify(t)).toBe(frozen);
  });
});

describe('targetRulePatch', () => {
  const both = rule({
    target: levels('price', [5010, 100]),
    stop: levels('price', [4995, 100]),
  });

  test('without override only a trade with neither a target nor a stop is filled, with both sides', () => {
    const bare = ES_LONG(2);
    expect(targetRulePatch(bare, both, false)).toEqual(
      applyTargetRule(bare, both),
    );
    // A stop in levels, a legacy stop or a legacy target each count as set.
    const withStop = {
      ...bare,
      stops: { unit: 'price' as const, levels: [{ value: 4990, qty: 2 }] },
    };
    const legacyStop = { ...bare, plannedStop: 4990 };
    const legacyTarget = { ...bare, plannedTarget: 5020 };
    for (const t of [withStop, legacyStop, legacyTarget])
      expect(targetRulePatch(t, both, false)).toBeUndefined();
  });

  test('with override each side the rule gives replaces that side, and the side it does not give stays', () => {
    const set: Trade = {
      ...ES_LONG(2),
      targets: { unit: 'price', levels: [{ value: 5030, qty: 2 }] },
      stops: { unit: 'price', levels: [{ value: 4990, qty: 2 }] },
    };
    expect(targetRulePatch(set, both, true)).toEqual(
      applyTargetRule(set, both),
    );
    const targetOnly = rule({ target: levels('price', [5010, 100]) });
    expect(targetRulePatch(set, targetOnly, true)).toEqual({
      targets: { unit: 'price', levels: [{ value: 5010, qty: 2 }] },
    });
  });

  test('a side the rule would leave exactly as it is is not a change', () => {
    const t = ES_LONG(2);
    const levelled: Trade = { ...t, ...applyTargetRule(t, both) };
    expect(targetRulePatch(levelled, both, true)).toBeUndefined();
  });

  test('a side that is skipped for this trade is not written', () => {
    const t = ES_LONG(2);
    const wrongStop = rule({
      target: levels('price', [5010, 100]),
      stop: levels('price', [5005, 100]),
    });
    const patch = targetRulePatch(t, wrongStop, false);
    expect(patch?.targets).toBeDefined();
    expect(patch).not.toHaveProperty('stops');
    expect(
      targetRulePatch(t, rule({ stop: levels('price', [5005, 100]) }), false),
    ).toBeUndefined();
  });
});

describe('unitsForRule and targetRuleError', () => {
  test('the unit list follows the instrument the way a trade does', () => {
    expect(unitsForRule('stock')).toEqual(['price', 'movement', 'amount']);
    expect(unitsForRule('future')).toEqual([
      'price',
      'movement',
      'ticks',
      'points',
      'amount',
    ]);
    expect(unitsForRule('future-option')).toContain('ticks');
    expect(unitsForRule('option')).not.toContain('ticks');
    expect(unitsForRule('forex')).toEqual([
      'price',
      'movement',
      'amount',
      'pips',
    ]);
  });

  const input = (p: Partial<TargetRule> = {}) => ({
    assetClass: rule().assetClass,
    target: levels('price', [5010, 100]),
    ...p,
  });

  test('a rule needs a target or a stop, each level a number and a share, and a unit its instrument has', () => {
    expect(targetRuleError(input())).toBeNull();
    expect(targetRuleError({ assetClass: 'future' })).toMatch(
      /target or a stop/,
    );
    expect(
      targetRuleError(input({ target: levels('price', [Number.NaN, 100]) })),
    ).toMatch(/number/);
    for (const pct of [0, -5, 101, Number.NaN])
      expect(
        targetRuleError(input({ target: levels('price', [5010, pct]) })),
      ).toMatch(/share/);
    expect(
      targetRuleError(input({ target: { unit: 'price', levels: [] } })),
    ).toMatch(/level/);
    // Pips are for forex; a stock has no ticks.
    expect(
      targetRuleError(
        input({ assetClass: 'stock', target: levels('ticks', [4, 100]) }),
      ),
    ).toMatch(/unit/);
    expect(targetRuleError(input({ stop: levels('pips', [10, 100]) }))).toMatch(
      /unit/,
    );
  });
});

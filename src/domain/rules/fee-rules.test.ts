import { describe, expect, test } from 'vitest';
import { buildGroupedTrade } from '../grouping';
import { resolveInstrument } from '../instruments';
import { buildTrades, type BuildOptions } from '../trade-builder';
import type { Execution, FeeRule, Side, Trade } from '../types';
import { applyFeeRule, feeRuleError, hasCosts, withFeeRule } from './fee-rules';

const opts: BuildOptions = {
  workspaceId: 'w',
  startSerial: 1,
  resolve: (s) => resolveInstrument(s),
  accountCurrency: () => 'USD',
};

let n = 0;
const fills = (
  symbol: string,
  list: [Side, number, number, Partial<Execution>?][],
): Execution[] =>
  list.map(([side, qty, price, extra], i) => ({
    id: `e${++n}`,
    accountId: 'a1',
    symbol,
    side,
    qty,
    price,
    time: `2026-03-02T15:0${i}:00Z`,
    fees: 0,
    commission: 0,
    ...extra,
  }));

function trade(
  symbol: string,
  list: [Side, number, number, Partial<Execution>?][],
  patch: Partial<Trade> = {},
): Trade {
  const [t, ...rest] = buildTrades(fills(symbol, list), opts).trades;
  if (!t || rest.length > 0) throw new Error('the fixture must be one trade');
  return { ...t, ...patch };
}

const rule = (p: Partial<FeeRule> = {}): FeeRule => ({
  id: 'f1',
  workspaceId: 'w',
  accountId: 'a1',
  assetClass: 'future',
  symbols: [],
  mode: 'per-execution',
  applyOn: 'all',
  commission: 150,
  fee: 20,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...p,
});

/** Long 2 ES at 5000, out 1 at 5004 and 1 at 5006: three fills, one entry and two exits. */
const scaled = (): Trade =>
  trade('ESZ5', [
    ['buy', 2, 5000],
    ['sell', 1, 5004],
    ['sell', 1, 5006],
  ]);
const costs = (list: readonly Execution[]) =>
  list.map((e) => [e.commission, e.fees]);

describe('hasCosts', () => {
  test('any fill with a commission or a fee counts', () => {
    expect(hasCosts(scaled())).toBe(false);
    expect(
      hasCosts(
        trade('ESZ5', [
          ['buy', 1, 5000, { commission: 1 }],
          ['sell', 1, 5001],
        ]),
      ),
    ).toBe(true);
    expect(
      hasCosts(
        trade('ESZ5', [
          ['buy', 1, 5000],
          ['sell', 1, 5001, { fees: 5 }],
        ]),
      ),
    ).toBe(true);
  });

  test('a negative cost, a credit, is a cost: the fill counts as costed', () => {
    const credited = trade('ESZ5', [
      ['buy', 1, 5000],
      ['sell', 1, 5001, { fees: -486 }],
    ]);
    expect(hasCosts(credited)).toBe(true);
    // So a rule without override leaves it alone, and with override replaces the credit.
    expect(
      withFeeRule(credited, rule(), {
        override: false,
        accountCurrency: 'USD',
      }),
    ).toBeUndefined();
    const out = withFeeRule(credited, rule({ applyOn: 'exit' }), {
      override: true,
      accountCurrency: 'USD',
    })!;
    expect(costs(out.executions)[1]).toEqual([150, 20]);
    expect(out.fees).toBe(credited.fees + 150 + 20 + 486);
  });
});

describe('applyFeeRule', () => {
  test('per contract multiplies by quantity; per execution once', () => {
    const t = scaled();
    expect(costs(applyFeeRule(t, rule({ mode: 'per-execution' })))).toEqual([
      [150, 20],
      [150, 20],
      [150, 20],
    ]);
    // The entry is two contracts, each exit one.
    expect(costs(applyFeeRule(t, rule({ mode: 'per-contract' })))).toEqual([
      [300, 40],
      [150, 20],
      [150, 20],
    ]);
  });

  test('a fraction of a contract is rounded to the cent, half away from zero', () => {
    const t = trade('EURUSD', [
      ['buy', 0.5, 1.1],
      ['sell', 0.5, 1.101],
    ]);
    const out = applyFeeRule(
      t,
      rule({
        assetClass: 'forex',
        mode: 'per-contract',
        commission: 25,
        fee: 7,
      }),
    );
    // 0.5 x 25 is 12.5 and 0.5 x 7 is 3.5: both go away from zero.
    expect(costs(out)).toEqual([
      [13, 4],
      [13, 4],
    ]);
  });

  test('apply on entry, exit or all', () => {
    const t = scaled();
    const on = (applyOn: FeeRule['applyOn']) =>
      costs(applyFeeRule(t, rule({ applyOn })));
    expect(on('all')).toEqual([
      [150, 20],
      [150, 20],
      [150, 20],
    ]);
    expect(on('entry')).toEqual([
      [150, 20],
      [0, 0],
      [0, 0],
    ]);
    expect(on('exit')).toEqual([
      [0, 0],
      [150, 20],
      [150, 20],
    ]);
  });

  test('a short enters with a sell and exits with a buy', () => {
    const t = trade('ESZ5', [
      ['sell', 1, 5000],
      ['buy', 1, 4990],
    ]);
    expect(costs(applyFeeRule(t, rule({ applyOn: 'entry' })))).toEqual([
      [150, 20],
      [0, 0],
    ]);
    expect(costs(applyFeeRule(t, rule({ applyOn: 'exit' })))).toEqual([
      [0, 0],
      [150, 20],
    ]);
  });

  test('entry and exit follow the position, not the direction of the first leg', () => {
    // Long 1 and out, then short 1 and covered: a trade the user joined by hand.
    const joined = buildGroupedTrade(
      fills('ESZ5', [
        ['buy', 1, 5000],
        ['sell', 1, 5004],
        ['sell', 1, 5010],
        ['buy', 1, 5002],
      ]),
      trade('ESZ5', [['buy', 1, 5000]]),
      opts,
    );
    expect(costs(applyFeeRule(joined, rule({ applyOn: 'entry' })))).toEqual([
      [150, 20],
      [0, 0],
      [150, 20],
      [0, 0],
    ]);
  });

  test('every matching fill is replaced, and a fill the rule leaves out keeps what it had', () => {
    const t = trade('ESZ5', [
      ['buy', 1, 5000, { commission: 99, fees: 9 }],
      ['sell', 1, 5004, { commission: 77, fees: 7 }],
    ]);
    expect(costs(applyFeeRule(t, rule({ applyOn: 'entry' })))).toEqual([
      [150, 20],
      [77, 7],
    ]);
  });

  test('the trade is not touched', () => {
    const t = scaled();
    const frozen = JSON.stringify(t);
    applyFeeRule(t, rule());
    expect(JSON.stringify(t)).toBe(frozen);
  });
});

describe('withFeeRule', () => {
  const run = { override: false, accountCurrency: 'USD' };

  test('fees, net and gross follow the new costs: the costs come off the net and the gross stays', () => {
    const t = scaled();
    const out = withFeeRule(t, rule(), run)!;
    // Three fills at 150 + 20 each.
    expect(out.fees).toBe(510);
    expect(out.net).toBe(t.net - 510);
    expect(out.gross).toBe(t.gross);
    expect(out.fees).toBe(
      out.executions.reduce((s, e) => s + e.fees + e.commission, 0),
    );
    expect(out.net).toBe(out.gross - out.fees);
    expect(costs(out.executions)).toEqual([
      [150, 20],
      [150, 20],
      [150, 20],
    ]);
    // Nothing else of the trade moves.
    expect({
      ...out,
      executions: t.executions,
      fees: t.fees,
      net: t.net,
    }).toEqual(t);
  });

  test('the figures equal the builder rebuilding the trade from its own fills, swap included', () => {
    const [first, ...rest] = fills('ESZ5', [
      ['buy', 2, 5000],
      ['sell', 1, 5004],
      ['sell', 1, 5006],
    ]);
    const base = trade('ESZ5', [['buy', 1, 5000]]);
    const stored = buildGroupedTrade(
      [first!, ...rest],
      { ...base, swap: -325 },
      opts,
    );
    const out = withFeeRule(stored, rule({ mode: 'per-contract' }), run)!;
    const rebuilt = buildGroupedTrade(out.executions, stored, opts);
    expect(out.swap).toBe(-325);
    expect(out.fees).toBe(rebuilt.fees);
    expect(out.gross).toBe(rebuilt.gross);
    expect(out.net).toBe(rebuilt.net);
    // The swap is inside the net and not the gross.
    expect(out.net).toBe(out.gross - out.fees - 325);
  });

  test('a figure the builder would not give back is kept: a file P&L, and the excursions', () => {
    // A closed-trade import takes the file's P&L as the gross; rebuilding from the fills would drop it.
    const t = {
      ...scaled(),
      gross: 12345,
      net: 12345,
      mae: -400,
      mfe: 900,
    };
    const out = withFeeRule(t, rule({ applyOn: 'entry' }), run)!;
    expect(out.gross).toBe(12345);
    expect(out.net).toBe(12345 - 170);
    expect(out.mae).toBe(-400);
    expect(out.mfe).toBe(900);
  });

  test('without override a trade with any costed fill is skipped', () => {
    const costed = trade('ESZ5', [
      ['buy', 1, 5000, { commission: 100 }],
      ['sell', 1, 5004],
    ]);
    expect(withFeeRule(costed, rule(), run)).toBeUndefined();
    // Even a fee on a fill the rule would not have touched.
    const exitCosted = trade('ESZ5', [
      ['buy', 1, 5000],
      ['sell', 1, 5004, { fees: 3 }],
    ]);
    expect(
      withFeeRule(exitCosted, rule({ applyOn: 'entry' }), run),
    ).toBeUndefined();
  });

  test('with override every matching fill is replaced', () => {
    const costed = trade('ESZ5', [
      ['buy', 1, 5000, { commission: 100, fees: 5 }],
      ['sell', 1, 5004, { commission: 80 }],
    ]);
    const out = withFeeRule(costed, rule({ applyOn: 'all' }), {
      ...run,
      override: true,
    })!;
    expect(costs(out.executions)).toEqual([
      [150, 20],
      [150, 20],
    ]);
    expect(out.fees).toBe(340);
    expect(out.net).toBe(costed.net + costed.fees - 340);
    // A fill outside the rule keeps its own costs.
    const entryOnly = withFeeRule(costed, rule({ applyOn: 'entry' }), {
      ...run,
      override: true,
    })!;
    expect(costs(entryOnly.executions)).toEqual([
      [150, 20],
      [80, 0],
    ]);
    expect(entryOnly.fees).toBe(170 + 80);
  });

  test('a rule that changes nothing is not a change', () => {
    const t = scaled();
    expect(
      withFeeRule(t, rule({ commission: 0, fee: 0 }), run),
    ).toBeUndefined();
    const set = withFeeRule(t, rule(), run)!;
    expect(
      withFeeRule(set, rule(), { ...run, override: true }),
    ).toBeUndefined();
  });

  test('a trade settled in another currency than the account is left alone', () => {
    const t = { ...scaled(), pnlCurrency: 'JPY' };
    expect(withFeeRule(t, rule(), run)).toBeUndefined();
  });
});

describe('the fills new in an import', () => {
  const run = { override: false, accountCurrency: 'USD' };
  /** A trade whose entry an earlier import costed; its two exits are the new fills. */
  const carried = () => {
    const t = scaled();
    const [entry, ...exits] = t.executions;
    return {
      t: {
        ...t,
        executions: [{ ...entry!, commission: 150, fees: 20 }, ...exits],
        fees: 170,
        net: t.net - 170,
      },
      fresh: new Set(exits.map((e) => e.id)),
      exits,
    };
  };

  test('only the fills in scope are costed, and a costed fill outside it does not stop the rule', () => {
    const { t, fresh } = carried();
    expect(hasCosts(t)).toBe(true);
    expect(hasCosts(t, fresh)).toBe(false);
    const out = withFeeRule(t, rule(), { ...run, fills: fresh })!;
    expect(costs(out.executions)).toEqual([
      [150, 20],
      [150, 20],
      [150, 20],
    ]);
    // The costs come off the net by the change only: two fills at 170.
    expect(out.fees).toBe(170 + 340);
    expect(out.net).toBe(t.net - 340);
    expect(out.gross).toBe(t.gross);
  });

  test('a fill in scope that carries costs from the file keeps them, and the rule skips the scope', () => {
    const { t, exits } = carried();
    const filed = {
      ...t,
      executions: t.executions.map((e) =>
        e.id === exits[1]!.id ? { ...e, commission: 250 } : e,
      ),
    };
    const fresh = new Set(exits.map((e) => e.id));
    expect(
      withFeeRule(filed, rule(), { ...run, fills: fresh }),
    ).toBeUndefined();
    // With override the fills in scope are replaced, and the others stay.
    const over = withFeeRule(filed, rule(), {
      ...run,
      override: true,
      fills: fresh,
    })!;
    expect(costs(over.executions)).toEqual([
      [150, 20],
      [150, 20],
      [150, 20],
    ]);
  });

  test('entry and exit are read from the whole position, not from the fills in scope', () => {
    const { t, exits } = carried();
    // Alone, the closing fill would read as an entry from flat; in the trade it is an exit.
    const closing = new Set([exits[1]!.id]);
    expect(
      withFeeRule(t, rule({ applyOn: 'entry' }), { ...run, fills: closing }),
    ).toBeUndefined();
    const out = withFeeRule(t, rule({ applyOn: 'exit' }), {
      ...run,
      fills: closing,
    })!;
    expect(costs(out.executions)).toEqual([
      [150, 20],
      [0, 0],
      [150, 20],
    ]);
    expect(out.fees).toBe(170 + 170);
  });

  test('an empty scope changes nothing', () => {
    const { t } = carried();
    expect(
      withFeeRule(t, rule(), { ...run, fills: new Set() }),
    ).toBeUndefined();
  });
});

describe('feeRuleError', () => {
  const input = (p: Partial<FeeRule> = {}) => ({
    assetClass: 'future' as const,
    mode: 'per-execution' as const,
    applyOn: 'all' as const,
    commission: 150,
    fee: 20,
    ...p,
  });

  test('costs are whole non-negative cents, and the mode and the legs are known', () => {
    expect(feeRuleError(input())).toBeNull();
    expect(feeRuleError(input({ commission: 0, fee: 0 }))).toBeNull();
    for (const bad of [-1, 1.5, Number.NaN])
      expect(feeRuleError(input({ commission: bad }))).toMatch(/cents/);
    expect(feeRuleError(input({ fee: -1 }))).toMatch(/cents/);
    expect(feeRuleError(input({ assetClass: 'bond' as never }))).toMatch(
      /kind of instrument/,
    );
    expect(feeRuleError(input({ mode: 'per-lot' as never }))).toMatch(
      /per contract or per execution/,
    );
    expect(feeRuleError(input({ applyOn: 'half' as never }))).toMatch(
      /entry, exit or all/,
    );
  });
});

import { describe, expect, test } from 'vitest';
import { buildGroupedTrade } from './grouping';
import { resolveInstrument } from './instruments';
import { buildTrades, type BuildOptions } from './trade-builder';
import type { Execution, Side, Trade } from './types';
import { centsFromText, fillCostsError, withFillCosts } from './fill-costs';

const opts: BuildOptions = {
  workspaceId: 'w',
  startSerial: 1,
  resolve: (s) => resolveInstrument(s),
  accountCurrency: () => 'USD',
};

let n = 0;
const fills = (list: [Side, number, number, Partial<Execution>?][]) =>
  list.map(([side, qty, price, extra], i): Execution => ({
    id: `e${++n}`,
    accountId: 'a1',
    symbol: 'ESZ5',
    side,
    qty,
    price,
    time: `2026-03-02T15:0${i}:00Z`,
    fees: 0,
    commission: 0,
    ...extra,
  }));

function trade(
  list: [Side, number, number, Partial<Execution>?][],
  patch: Partial<Trade> = {},
): Trade {
  const [t, ...rest] = buildTrades(fills(list), opts).trades;
  if (!t || rest.length > 0) throw new Error('the fixture must be one trade');
  return { ...t, ...patch };
}

/** Long 1 ES: in with 3.50 commission and a 1.20 fee, out with 3.50 commission. */
const costed = (patch: Partial<Trade> = {}) =>
  trade(
    [
      ['buy', 1, 5000, { commission: 350, fees: 120 }],
      ['sell', 1, 5004, { commission: 350 }],
    ],
    patch,
  );
const costsOf = (t: Trade) => t.executions.map((e) => [e.commission, e.fees]);

describe('withFillCosts', () => {
  test('fees and net move by the change in the fill, and the gross stays', () => {
    const t = costed();
    const out = withFillCosts(t, t.executions[1]!.id, {
      commission: 500,
      fees: 243,
    })!;
    expect(costsOf(out)).toEqual([
      [350, 120],
      [500, 243],
    ]);
    // The fill went from 350 to 743: 393 more.
    expect(out.fees).toBe(t.fees + 393);
    expect(out.net).toBe(t.net - 393);
    expect(out.gross).toBe(t.gross);
    expect(out.fees).toBe(
      out.executions.reduce((s, e) => s + e.commission + e.fees, 0),
    );
    // Nothing else of the trade moves, and the stored trade is not mutated.
    expect({
      ...out,
      executions: t.executions,
      fees: t.fees,
      net: t.net,
    }).toEqual(t);
    expect(t.executions[1]!.commission).toBe(350);
  });

  test('a smaller cost gives net back', () => {
    const t = costed();
    const out = withFillCosts(t, t.executions[0]!.id, {
      commission: 0,
      fees: 0,
    })!;
    expect(out.fees).toBe(t.fees - 470);
    expect(out.net).toBe(t.net + 470);
  });

  test('the figures equal the builder rebuilding the trade from its own fills, swap included', () => {
    const base = trade([['buy', 1, 5000]]);
    const stored = buildGroupedTrade(
      fills([
        ['buy', 1, 5000, { commission: 100 }],
        ['sell', 1, 5004],
      ]),
      { ...base, swap: -325 },
      opts,
    );
    const out = withFillCosts(stored, stored.executions[1]!.id, {
      commission: 250,
      fees: 30,
    })!;
    const rebuilt = buildGroupedTrade(out.executions, stored, opts);
    expect(out.swap).toBe(-325);
    expect(out.fees).toBe(rebuilt.fees);
    expect(out.gross).toBe(rebuilt.gross);
    expect(out.net).toBe(rebuilt.net);
    // The swap stays inside the net and outside the gross.
    expect(out.net).toBe(out.gross - out.fees - 325);
  });

  test('a figure the builder would not give back is kept: a file P&L, its currency, and the excursions', () => {
    // A closed-trades import takes the file's P&L as the gross; a rebuild would drop it, and the excursions.
    const t = costed({
      gross: 12345,
      net: 12345 - 820,
      pnlCurrency: 'GBP',
      mae: -400,
      mfe: 900,
    });
    const out = withFillCosts(t, t.executions[0]!.id, {
      commission: 0,
      fees: 0,
    })!;
    expect(out.gross).toBe(12345);
    expect(out.net).toBe(12345 - 350);
    expect(out.pnlCurrency).toBe('GBP');
    expect(out.mae).toBe(-400);
    expect(out.mfe).toBe(900);
  });

  test('a negative fee lowers the trade’s fees and raises its net: a credit', () => {
    const t = costed();
    // The exit fill went from 3.50 to a credit of 5.00: 8.50 less.
    const out = withFillCosts(t, t.executions[1]!.id, {
      commission: 0,
      fees: -500,
    })!;
    expect(costsOf(out)[1]).toEqual([0, -500]);
    expect(out.fees).toBe(t.fees - 850);
    expect(out.net).toBe(t.net + 850);
    expect(out.gross).toBe(t.gross);
    // The credits outweigh the charges: the trade's fees are below zero, and net is above gross.
    expect(out.fees).toBe(-30);
    expect(out.net).toBeGreaterThan(out.gross);
    // The same as rebuilding it from its fills, swap included.
    const rebuilt = buildGroupedTrade(
      out.executions,
      { ...out, swap: -100 },
      opts,
    );
    const withSwap = withFillCosts(
      { ...t, swap: -100, net: t.net - 100 },
      t.executions[1]!.id,
      {
        commission: 0,
        fees: -500,
      },
    )!;
    expect(withSwap.net).toBe(rebuilt.net);
    expect(withSwap.fees).toBe(rebuilt.fees);
  });

  test('a credit taken back to nothing gives the trade its charge again', () => {
    const base = costed();
    const t = withFillCosts(base, base.executions[1]!.id, {
      commission: 0,
      fees: -500,
    })!;
    const back = withFillCosts(t, t.executions[1]!.id, {
      commission: 350,
      fees: 0,
    })!;
    expect(back.fees).toBe(820);
  });

  test('moving cost from the commission to the fee changes the fill and not the trade figures', () => {
    const t = costed();
    const out = withFillCosts(t, t.executions[1]!.id, {
      commission: 0,
      fees: 350,
    })!;
    expect(costsOf(out)[1]).toEqual([0, 350]);
    expect(out.fees).toBe(t.fees);
    expect(out.net).toBe(t.net);
  });

  test('the same costs are not a change, and neither is a fill the trade does not have', () => {
    const t = costed();
    expect(
      withFillCosts(t, t.executions[0]!.id, { commission: 350, fees: 120 }),
    ).toBeUndefined();
    expect(
      withFillCosts(t, 'nope', { commission: 1, fees: 1 }),
    ).toBeUndefined();
  });

  test('only the named fill changes, also when two fills share a time', () => {
    const t = trade([
      ['buy', 1, 5000, { time: '2026-03-02T15:00:00Z', commission: 10 }],
      ['buy', 1, 5001, { time: '2026-03-02T15:00:00Z', commission: 20 }],
      ['sell', 2, 5004],
    ]);
    const out = withFillCosts(t, t.executions[1]!.id, {
      commission: 99,
      fees: 0,
    })!;
    expect(costsOf(out)).toEqual([
      [10, 0],
      [99, 0],
      [0, 0],
    ]);
  });
});

describe('fillCostsError', () => {
  test('whole cents are fine, a negative one too: a credit', () => {
    expect(fillCostsError({ commission: 0, fees: 0 })).toBeNull();
    expect(fillCostsError({ commission: 350, fees: 120 })).toBeNull();
    expect(fillCostsError({ commission: 0, fees: -486 })).toBeNull();
    expect(fillCostsError({ commission: -25, fees: 0 })).toBeNull();
  });

  test('a fraction or a non-number is refused', () => {
    for (const bad of [
      1.5,
      -0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2 ** 60,
    ])
      for (const field of ['commission', 'fees'] as const)
        expect(
          fillCostsError({ commission: 0, fees: 0, [field]: bad }),
          `${field} ${bad}`,
        ).not.toBeNull();
  });
});

describe('centsFromText', () => {
  test('an amount is read in cents; an empty field is 0', () => {
    expect(centsFromText('2.43')).toBe(243);
    expect(centsFromText('3.5')).toBe(350);
    expect(centsFromText('3')).toBe(300);
    expect(centsFromText('.5')).toBe(50);
    expect(centsFromText('5.')).toBe(500);
    expect(centsFromText('0')).toBe(0);
    expect(centsFromText('1,234.50')).toBe(123450);
    expect(centsFromText(' 7.25 ')).toBe(725);
    expect(centsFromText('')).toBe(0);
    expect(centsFromText('   ')).toBe(0);
  });

  test('a comma is a thousands mark and nothing else, so a decimal comma is refused, not read as dollars', () => {
    expect(centsFromText('1,234')).toBe(123400);
    expect(centsFromText('12,345,678.9')).toBe(1234567890);
    expect(centsFromText('2,43')).toBeNull();
  });

  test('an amount too large to be cents is refused', () => {
    expect(centsFromText('99999999999999999999')).toBeNull();
  });

  test('a fraction of a cent rounds to the cent', () => {
    expect(centsFromText('2.4349')).toBe(243);
    expect(centsFromText('2.436')).toBe(244);
  });

  test('a leading minus is a credit, as in TradeZella, where a swap credit goes in the fees', () => {
    expect(centsFromText('-1')).toBe(-100);
    expect(centsFromText('-4.86')).toBe(-486);
    expect(centsFromText('-0.01')).toBe(-1);
    expect(centsFromText('-.5')).toBe(-50);
    expect(centsFromText(' -1,234.50 ')).toBe(-123450);
    // Minus zero is zero, not a negative zero that would reach the store.
    expect(Object.is(centsFromText('-0'), 0)).toBe(true);
    expect(Object.is(centsFromText('-0.00'), 0)).toBe(true);
    // A decimal comma stays refused when it is negative too.
    expect(centsFromText('-2,43')).toBeNull();
  });

  test('a non-number is refused', () => {
    for (const bad of [
      '-',
      '--1',
      '1-',
      '-$2.43',
      '-1e3',
      '+2',
      'abc',
      '2.4.3',
      '1e3',
      '0x10',
      'Infinity',
      'NaN',
      '$2.43',
      '2,43',
      '2,4',
      '12,34',
      '1,23,456',
      '--',
      '.',
    ])
      expect(centsFromText(bad), bad).toBeNull();
  });
});

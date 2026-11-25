import { describe, expect, test } from 'vitest';
import { resolveInstrument } from './instruments';
import { realizations } from './metrics/realized';
import {
  buildTrades,
  finalizeTrade,
  matchLots,
  type Lot,
} from './trade-builder';
import type { CostMethod, Execution, Side, Trade } from './types';

const T1 = '2026-03-02T15:00:00Z';
const T2 = '2026-03-02T15:01:00Z';
const T3 = '2026-03-02T15:02:00Z';
const T4 = '2026-03-02T15:03:00Z';

function fill(
  id: string,
  side: Side,
  qty: number,
  price: number,
  time: string,
  commission = 0,
): Execution {
  return {
    id,
    accountId: 'a1',
    symbol: '',
    side,
    qty,
    price,
    time,
    fees: 0,
    commission,
  };
}
function build(fills: Execution[], symbol: string) {
  return buildTrades(
    fills.map((f) => ({ ...f, symbol })),
    {
      workspaceId: 'w',
      startSerial: 1,
      resolve: (s) => resolveInstrument(s),
      accountCurrency: () => 'USD',
    },
  );
}
function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new Error(`no element at ${i}`);
  return x;
}
function ex(
  accountId: string,
  symbol: string,
  side: Side,
  time: string,
): Execution {
  return {
    id: `${accountId}-${symbol}-${time}`,
    accountId,
    symbol,
    side,
    qty: 1,
    price: 100,
    time,
    fees: 0,
    commission: 0,
  };
}

describe('buildTrades', () => {
  test('long round trip with commissions', () => {
    const { trades } = build(
      [
        fill('f1', 'buy', 2, 4510.5, T1, 124),
        fill('f2', 'sell', 2, 4512.25, T2, 124),
      ],
      'ESZ5',
    );
    expect(at(trades, 0)).toMatchObject({
      direction: 'long',
      status: 'closed',
      avgEntry: 4510.5,
      avgExit: 4512.25,
      maxPosition: 2,
      gross: 17500,
      fees: 248,
      net: 17252,
      serial: 1,
    });
  });
  test('short round trip', () => {
    const { trades } = build(
      [fill('f1', 'sell', 1, 4520, T1), fill('f2', 'buy', 1, 4515.75, T2)],
      'ESZ5',
    );
    expect(at(trades, 0)).toMatchObject({ direction: 'short', gross: 21250 });
  });
  test('scale-in and partial exits are one FIFO trade', () => {
    const { trades } = build(
      [
        fill('f1', 'buy', 100, 150, T1),
        fill('f2', 'buy', 100, 151, T2),
        fill('f3', 'sell', 50, 152, T3),
        fill('f4', 'sell', 150, 149.5, T4),
      ],
      'AAPL',
    );
    expect(trades).toHaveLength(1);
    expect(at(trades, 0)).toMatchObject({
      gross: -7500,
      avgEntry: 150.5,
      avgExit: 150.125,
      maxPosition: 200,
    });
  });
  test('reversal splits the crossing fill and its costs', () => {
    const { trades } = build(
      [
        fill('f1', 'buy', 2, 4500, T1, 200),
        fill('f2', 'sell', 3, 4502, T2, 300),
        fill('f3', 'buy', 1, 4501, T3, 100),
      ],
      'ESZ5',
    );
    expect(
      trades.map((t) => [t.direction, t.gross, t.fees, t.net, t.serial]),
    ).toEqual([
      ['long', 20000, 400, 19600, 1],
      ['short', 5000, 200, 4800, 2],
    ]);
    expect(at(trades, 0).executions.at(-1)).toMatchObject({
      id: 'f2:a',
      qty: 2,
      commission: 200,
    });
    expect(at(trades, 1).executions[0]).toMatchObject({
      id: 'f2:b',
      qty: 1,
      commission: 100,
    });
  });
  test('reversal cost split keeps the rounding remainder on the closing part', () => {
    const { trades } = build(
      [
        fill('f1', 'buy', 2, 4500, T1),
        fill('f2', 'sell', 3, 4502, T2, 301),
        fill('f3', 'buy', 1, 4501, T3),
      ],
      'ESZ5',
    );
    expect(at(trades, 0).fees).toBe(201);
    expect(at(trades, 1).fees).toBe(100);
  });
  test('position still open at end of data', () => {
    const { trades } = build(
      [fill('f1', 'buy', 2, 4500, T1), fill('f2', 'sell', 1, 4504, T2)],
      'ESZ5',
    );
    expect(at(trades, 0)).toMatchObject({
      status: 'open',
      gross: 20000,
      maxPosition: 2,
      avgExit: 4504,
    });
    expect(at(trades, 0).closedAt).toBeUndefined();
  });
  test('open trade with no exits has no avgExit', () => {
    const { trades } = build([fill('f1', 'buy', 1, 4500, T1)], 'ESZ5');
    expect(at(trades, 0).avgExit).toBeUndefined();
    expect(Object.is(at(trades, 0).gross, 0)).toBe(true);
  });
  test('same-timestamp fills keep input order', () => {
    const { trades } = build(
      [fill('f1', 'buy', 1, 4500, T1), fill('f2', 'sell', 1, 4501, T1)],
      'ESZ5',
    );
    expect(trades).toHaveLength(1);
    expect(at(trades, 0)).toMatchObject({
      direction: 'long',
      status: 'closed',
      gross: 5000,
    });
  });
  test('fractional ticks give exact cents', () => {
    expect(
      build(
        [fill('f1', 'buy', 1, 71.42, T1), fill('f2', 'sell', 1, 71.55, T2)],
        'CLZ5',
      ).trades[0]?.gross,
    ).toBe(13000);
    expect(
      build(
        [fill('f1', 'buy', 1, 1.08512, T1), fill('f2', 'sell', 1, 1.08537, T2)],
        'EURUSD',
      ).trades[0]?.gross,
    ).toBe(2500);
  });
  test('forex P&L converts by exit rate when USD is the base; crosses stay unconverted', () => {
    const jpy = build(
      [fill('f1', 'buy', 1, 154.21, T1), fill('f2', 'sell', 1, 154.33, T2)],
      'USDJPY',
    ).trades[0];
    expect(jpy).toMatchObject({ pnlCurrency: 'USD', gross: 7776 });
    const gbp = build(
      [fill('f1', 'buy', 1, 0.8525, T1), fill('f2', 'sell', 1, 0.8531, T2)],
      'EURGBP',
    ).trades[0];
    expect(gbp).toMatchObject({ pnlCurrency: 'GBP', gross: 6000 });
  });
  test('a USD-base forex trade with several exits converts each exit at its own rate and rounds once (E71)', () => {
    // Short 2 @ 153.757, covered 1 @ 154.098 and 1 @ 154.026, commission 14.00.
    const t = build(
      [
        fill('f1', 'sell', 2, 153.757, T1, 700),
        fill('f2', 'buy', 1, 154.098, T2, 350),
        fill('f3', 'buy', 1, 154.026, T3, 350),
      ],
      'USDJPY',
    ).trades[0];
    // -34,100 / 154.098 + -26,900 / 154.026 = -395.934, not -221.29 - 174.65.
    expect(t).toMatchObject({ gross: -39593, fees: 1400, net: -40993 });
  });
  test('the net rounds once, half away from zero, and gross = net + fees (E71, crypto)', () => {
    // ETHUSD short 0.7 @ 3380.13 covered @ 3291.98, fees 4.67: gross 61.705, net 57.035.
    const t = build(
      [
        fill('f1', 'sell', 0.7, 3380.13, T1, 233),
        fill('f2', 'buy', 0.7, 3291.98, T2, 234),
      ],
      'ETHUSD',
    ).trades[0];
    expect(t).toMatchObject({ net: 5704, fees: 467, gross: 6171 });
  });
  test('accounts never mix, serials follow openedAt, unknown symbols are reported', () => {
    const r = buildTrades(
      [
        ex('a2', 'ESZ5', 'buy', T2),
        ex('a1', 'ESZ5', 'sell', T1),
        ex('a1', 'XYZZ5', 'buy', T1),
      ],
      {
        workspaceId: 'w',
        startSerial: 10,
        resolve: (s) => resolveInstrument(s),
        accountCurrency: () => 'USD',
      },
    );
    expect(r.trades.map((t) => [t.accountId, t.serial])).toEqual([
      ['a1', 10],
      ['a2', 11],
    ]);
    expect(r.unresolvedSymbols).toEqual(['XYZZ5']);
  });

  test('symbols are canonicalised: trimmed, uppercased, no leading slash', () => {
    const fills = [
      { ...fill('e1', 'buy', 1, 4500, T1), symbol: 'ESZ5' },
      { ...fill('e2', 'sell', 1, 4501, T2), symbol: ' /esz5 ' },
    ];
    const r = buildTrades(fills, {
      workspaceId: 'w',
      startSerial: 1,
      resolve: (s) => resolveInstrument(s),
      accountCurrency: () => 'USD',
    });
    expect(r.trades).toHaveLength(1);
    expect(at(r.trades, 0).status).toBe('closed');
    expect(at(r.trades, 0).id).toBe('a1:ESZ5:e1');
  });

  test('an open USD-base forex trade gets pnlCurrency from instrument and account', () => {
    const r = build([fill('e1', 'buy', 1, 154.21, T1)], 'USDJPY');
    expect(at(r.trades, 0)).toMatchObject({
      status: 'open',
      pnlCurrency: 'USD',
    });
  });
});

describe('cost methods (#49)', () => {
  const T5 = '2026-03-02T15:04:00Z';
  const build2 = (
    fills: Execution[],
    symbol: string,
    method: CostMethod,
  ): Trade[] =>
    buildTrades(
      fills.map((f) => ({ ...f, symbol })),
      {
        workspaceId: 'w',
        startSerial: 1,
        resolve: (s) => resolveInstrument(s),
        accountCurrency: () => 'USD',
        costMethodOf: () => method,
      },
    ).trades;
  const METHODS: CostMethod[] = ['fifo', 'lifo', 'average'];

  test('the help example: 100 at $10, 100 at $15, sell 100 at $20', () => {
    const lots = (): Lot[] => [
      { qty: 100, price: 10 },
      { qty: 100, price: 15 },
    ];
    expect(matchLots(lots(), 100, 20, 1, 1, 'fifo').pnl).toBe(1000);
    expect(matchLots(lots(), 100, 20, 1, 1, 'lifo').pnl).toBe(500);
    expect(matchLots(lots(), 100, 20, 1, 1, 'average').pnl).toBe(750);
    expect(matchLots(lots(), 100, 20, 1, 1).pnl).toBe(1000);
  });

  test('a flat-to-flat trade has the same total under every method', () => {
    const fills = [
      fill('f1', 'buy', 100, 10, T1),
      fill('f2', 'buy', 50, 12, T2),
      fill('f3', 'buy', 50, 11, T3),
      fill('f4', 'sell', 120, 14, T4),
      fill('f5', 'sell', 80, 13, T5),
    ];
    const gross = METHODS.map((m) => at(build2(fills, 'AAPL', m), 0).gross);
    expect(new Set(gross).size).toBe(1);
    expect(at(gross, 0)).toBe(
      Math.round((120 * 14 + 80 * 13 - 1000 - 600 - 550) * 100),
    );
  });

  test('a reversal closes and opens a new trade under every method', () => {
    const fills = [
      fill('f1', 'buy', 10, 100, T1),
      fill('f2', 'buy', 10, 110, T2),
      fill('f3', 'sell', 30, 120, T3),
      fill('f4', 'buy', 10, 115, T4),
    ];
    for (const m of METHODS) {
      const trades = build2(fills, 'AAPL', m);
      expect(trades).toHaveLength(2);
      expect(at(trades, 0)).toMatchObject({
        direction: 'long',
        status: 'closed',
      });
      expect(at(trades, 1)).toMatchObject({
        direction: 'short',
        status: 'closed',
      });
      expect(at(trades, 1).gross).toBe(5000);
    }
  });

  test('USDJPY with two entries and two exits: the closed total depends on the method', () => {
    const fills = [
      fill('f1', 'buy', 1, 154, T1),
      fill('f2', 'buy', 1, 155, T2),
      fill('f3', 'sell', 1, 155.5, T3),
      fill('f4', 'sell', 1, 156, T4),
    ];
    const g = (m: CostMethod): number =>
      at(build2(fills, 'USDJPY', m), 0).gross;
    expect(g('fifo')).not.toBe(g('lifo'));
    for (const m of METHODS) {
      const t = at(build2(fills, 'USDJPY', m), 0);
      expect(realizations(t).reduce((n, r) => n + r.gross, 0)).toBe(t.gross);
    }
  });

  test('average: an exit does not change the average', () => {
    const lots: Lot[] = [
      { qty: 10, price: 100 },
      { qty: 10, price: 110 },
    ];
    expect(matchLots(lots, 5, 120, 1, 1, 'average').pnl).toBe(75);
    lots.push({ qty: 5, price: 120 });
    const avg = (15 * 105 + 5 * 120) / 20;
    expect(matchLots(lots, 20, 130, 1, 1, 'average').pnl).toBeCloseTo(
      (130 - avg) * 20,
      9,
    );
  });

  test('buildTrades stamps costMethod from costMethodOf and omits FIFO', () => {
    const fills = [fill('f1', 'buy', 1, 10, T1), fill('f2', 'sell', 1, 11, T2)];
    expect(at(build2(fills, 'AAPL', 'fifo'), 0).costMethod).toBeUndefined();
    expect(at(build2(fills, 'AAPL', 'lifo'), 0).costMethod).toBe('lifo');
    expect(at(build2(fills, 'AAPL', 'average'), 0).costMethod).toBe('average');
    expect(at(build(fills, 'AAPL').trades, 0)).not.toHaveProperty('costMethod');
  });

  test('finalizeTrade re-derives the figures and keeps every other field', () => {
    const fills = [
      fill('f1', 'buy', 100, 10, T1),
      fill('f2', 'buy', 100, 15, T2),
      fill('f3', 'sell', 100, 20, T3),
      fill('f4', 'sell', 100, 20, T4),
    ];
    const t0 = at(build2(fills, 'AAPL', 'fifo'), 0);
    const tagged: Trade = {
      ...t0,
      tagIds: ['x'],
      noteId: 'keep',
      importId: 'i1',
    };
    const mid = finalizeTrade(tagged, 'lifo');
    expect(mid).toMatchObject({
      tagIds: ['x'],
      noteId: 'keep',
      importId: 'i1',
      costMethod: 'lifo',
      id: t0.id,
    });
    expect(mid.gross).toBe(t0.gross);
    const back = finalizeTrade(mid, 'fifo');
    expect(back).not.toHaveProperty('costMethod');
    expect(back).toEqual(tagged);
    const open = at(build2(fills.slice(0, 3), 'AAPL', 'fifo'), 0);
    expect(finalizeTrade(open, 'average')).toMatchObject({
      status: 'open',
      costMethod: 'average',
    });
  });
});

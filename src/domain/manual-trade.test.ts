import { describe, expect, test } from 'vitest';
import type { ManualTradeInput } from '@/data/repository';
import { resolveInstrument } from './instruments';
import { plannedR } from './metrics/summary';
import { hasCosts } from './rules/fee-rules';
import type { Instrument, LevelSide } from './types';
import {
  ASSET_TYPES,
  buildManualTrade,
  assetTypeOf,
  formPriceOf,
  keepHiddenSides,
  manualInstrument,
  type InstrumentSpec,
} from './manual-trade';

const ctx = { workspaceId: 'w', serial: 7, accountCurrency: 'USD' };
const es = resolveInstrument('ESZ6')!;

function fillOf(
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  minute: number,
) {
  return {
    time: new Date(Date.UTC(2026, 10, 19, 14, minute)).toISOString(),
    side,
    qty,
    price,
    commission: 0,
    fees: 0,
  };
}
const input = (p: Partial<ManualTradeInput> = {}): ManualTradeInput => ({
  accountId: 'a1',
  instrument: es,
  fills: [fillOf('buy', 2, 5000, 0), fillOf('sell', 2, 5010, 5)],
  ...p,
});

describe('buildManualTrade', () => {
  test('a long closed by a sell is a closed manual trade', () => {
    const r = buildManualTrade(input(), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trade).toMatchObject({
      status: 'closed',
      gross: 100000,
      net: 100000,
      source: 'manual',
      serial: 7,
      direction: 'long',
      accountId: 'a1',
      workspaceId: 'w',
    });
    expect(r.trade.executions).toHaveLength(2);
    expect(r.trade.executions[0]!.id).not.toBe(r.trade.executions[1]!.id);
  });

  test('a negative cost is a credit: it flows through fees and net, and the gross stays', () => {
    const r = buildManualTrade(
      input({
        fills: [
          { ...fillOf('buy', 2, 5000, 0), commission: 350, fees: -500 },
          { ...fillOf('sell', 2, 5010, 5), commission: -120 },
        ],
      }),
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 3.50 - 5.00 - 1.20 = -2.70: the credits outweigh the charges.
    expect(r.trade.fees).toBe(-270);
    expect(r.trade.gross).toBe(100000);
    expect(r.trade.net).toBe(100000 + 270);
    expect(r.trade.executions.map((e) => [e.commission, e.fees])).toEqual([
      [350, -500],
      [-120, 0],
    ]);
    // A fee rule reads a credit as a cost, so it does not fill over it without override.
    expect(hasCosts(r.trade)).toBe(true);
  });

  test('a partial exit leaves the trade open', () => {
    const r = buildManualTrade(
      input({ fills: [fillOf('buy', 2, 5000, 0), fillOf('sell', 1, 5010, 5)] }),
      ctx,
    );
    expect(r.ok && r.trade.status).toBe('open');
  });

  test('fills that cross through zero are a reversal', () => {
    expect(
      buildManualTrade(
        input({
          fills: [fillOf('buy', 1, 5000, 0), fillOf('sell', 3, 5010, 5)],
        }),
        ctx,
      ),
    ).toEqual({ ok: false, error: 'reversal' });
  });

  test('no fills, and a bad fill with its index', () => {
    expect(buildManualTrade(input({ fills: [] }), ctx)).toEqual({
      ok: false,
      error: 'no-fills',
    });
    expect(
      buildManualTrade(
        input({ fills: [fillOf('buy', 1, 5000, 0), fillOf('sell', 0, 5, 1)] }),
        ctx,
      ),
    ).toEqual({ ok: false, error: 'bad-fill', fillIndex: 1 });
  });

  test('an option without a strike needs its fields', () => {
    const inst = manualInstrument({
      type: 'option',
      symbol: 'AAPL',
      expiry: '2026-12-18',
      right: 'call',
    });
    expect(buildManualTrade(input({ instrument: inst }), ctx)).toEqual({
      ok: false,
      error: 'option-fields',
    });
  });

  test('an unknown futures root with no multiplier needs one', () => {
    const inst = manualInstrument({ type: 'future', symbol: 'ZZZ6' });
    expect(inst.root).toBe('ZZ');
    expect(buildManualTrade(input({ instrument: inst }), ctx)).toEqual({
      ok: false,
      error: 'multiplier',
    });
    const ok = manualInstrument({
      type: 'future',
      symbol: 'ZZZ6',
      multiplier: 25,
    });
    expect(ok.tickSize).toBe(0.01);
    expect(buildManualTrade(input({ instrument: ok }), ctx).ok).toBe(true);
  });

  test('a CL future option builds as an option on the root', () => {
    const inst = manualInstrument({
      type: 'future-option',
      symbol: 'CL',
      expiry: '2026-12-15',
      strike: 70,
      right: 'call',
      multiplier: 1000,
    });
    const r = buildManualTrade(input({ instrument: inst }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trade.instrument).toMatchObject({
      assetClass: 'option',
      underlying: 'CL',
      pointValue: 1000,
      strike: 70,
      right: 'call',
      expiry: '2026-12-15',
    });
    expect(r.trade.gross).toBe(2 * 10 * 1000 * 100);
  });

  test('the planned stop is one Price level and sets the initial risk; an explicit id is kept', () => {
    const r = buildManualTrade(input({ plannedStop: 4990 }), {
      ...ctx,
      id: 'keep-me',
    });
    expect(r.ok && r.trade.id).toBe('keep-me');
    // Saved in levels at the full size: the legacy fields are not written.
    expect(r.ok && r.trade.stops).toEqual({
      unit: 'price',
      levels: [{ value: 4990, qty: 2 }],
    });
    expect(r.ok && r.trade).not.toHaveProperty('plannedStop');
    expect(r.ok && r.trade).not.toHaveProperty('targets');
    expect(r.ok && r.trade.initialRisk).toBe(2 * 10 * 50 * 100);
  });

  test('the planned target is one Price level; with a stop it gives Planned R, alone it gives no risk', () => {
    const both = buildManualTrade(
      input({ plannedStop: 4990, plannedTarget: 5030 }),
      ctx,
    );
    expect(both.ok && both.trade.targets).toEqual({
      unit: 'price',
      levels: [{ value: 5030, qty: 2 }],
    });
    expect(both.ok && both.trade).not.toHaveProperty('plannedTarget');
    expect(both.ok && plannedR(both.trade)).toBe(3);
    const alone = buildManualTrade(input({ plannedTarget: 5030 }), ctx);
    expect(alone.ok && alone.trade.targets).toBeDefined();
    expect(alone.ok && alone.trade).not.toHaveProperty('stops');
    expect(alone.ok && alone.trade).not.toHaveProperty('initialRisk');
    expect(alone.ok && plannedR(alone.trade)).toBeUndefined();
  });

  test('a trade with no plan has no levels and no risk', () => {
    const r = buildManualTrade(input(), ctx);
    expect(r.ok && r.trade).not.toHaveProperty('stops');
    expect(r.ok && r.trade).not.toHaveProperty('targets');
    expect(r.ok && r.trade).not.toHaveProperty('initialRisk');
  });

  test('a stop on a trade the fills grew is one level of the whole position', () => {
    const r = buildManualTrade(
      input({
        plannedStop: 4990,
        fills: [
          fillOf('buy', 1, 5000, 0),
          fillOf('buy', 2, 5000, 1),
          fillOf('sell', 3, 5010, 5),
        ],
      }),
      ctx,
    );
    expect(r.ok && r.trade.stops?.levels).toEqual([{ value: 4990, qty: 3 }]);
    expect(r.ok && r.trade.initialRisk).toBe(3 * 10 * 50 * 100);
  });

  test('forex settles in the pair rules: lots, 100000, JPY quote', () => {
    const inst = manualInstrument({ type: 'forex', symbol: 'usdjpy' });
    expect(inst).toMatchObject({ pointValue: 100000, quoteCurrency: 'JPY' });
    const r = buildManualTrade(
      input({
        instrument: inst,
        fills: [fillOf('buy', 1, 150, 0), fillOf('sell', 1, 151, 5)],
      }),
      ctx,
    );
    // 1 yen * 100000 = 100000 JPY, converted at 151 into USD
    expect(r.ok && r.trade.pnlCurrency).toBe('USD');
    expect(r.ok && r.trade.gross).toBe(Math.round((100000 / 151) * 100));
  });
});

describe('the form and levels saved elsewhere', () => {
  const side = (
    unit: LevelSide['unit'],
    ...levels: [number, number][]
  ): LevelSide => ({
    unit,
    levels: levels.map(([value, qty]) => ({ value, qty })),
  });

  test('the form shows a side that is one Price level at the full size, and no other', () => {
    expect(formPriceOf(side('price', [4990, 2]), 2)).toBe(4990);
    expect(formPriceOf(side('price', [4990, 1], [4980, 1]), 2)).toBeUndefined();
    expect(formPriceOf(side('ticks', [12, 2]), 2)).toBeUndefined();
    expect(formPriceOf(side('price'), 2)).toBeUndefined();
    expect(formPriceOf(undefined, 2)).toBeUndefined();
  });

  test('a level that covers part of the position, or more than it, is not one the form can show', () => {
    // Saving it from the form would widen it to the whole position.
    expect(formPriceOf(side('price', [4990, 3]), 6)).toBeUndefined();
    expect(formPriceOf(side('price', [4990, 7]), 6)).toBeUndefined();
    // Float noise in a size is still the full size: 0.1 + 0.2 lots against 0.3.
    expect(formPriceOf(side('price', [4990, 0.1 + 0.2]), 0.3)).toBe(4990);
  });

  const made = (p: Partial<ManualTradeInput> = {}) => {
    const r = buildManualTrade(input(p), ctx);
    if (!r.ok) throw new Error(r.error);
    return r.trade;
  };
  /** A manual trade whose stops were later saved as two levels on the trade page. */
  const split = () => ({
    ...made({ plannedStop: 4990 }),
    stops: side('price', [4990, 1], [4980, 1]),
    initialRisk: 150000,
  });

  test('a rebuilt trade keeps the sides the form could not show, and its risk follows them', () => {
    const old = split();
    // The form showed an empty stop box, so it sent no stop.
    const next = keepHiddenSides(made(), old, input());
    expect(next.stops).toEqual(old.stops);
    expect(next.stops).not.toBe(old.stops);
    expect(next.initialRisk).toBe(150000);
  });

  test('a stop on part of the position is kept, not widened to all of it', () => {
    const six = (p: Partial<ManualTradeInput> = {}) =>
      input({
        fills: [fillOf('buy', 6, 5000, 0), fillOf('sell', 6, 5010, 5)],
        ...p,
      });
    const built = buildManualTrade(six(), ctx);
    if (!built.ok) throw new Error(built.error);
    // Saved on the trade page: 3 of the 6 contracts, so $1,500 at risk.
    const old = {
      ...built.trade,
      stops: side('price', [4990, 3]),
      initialRisk: 150000,
    };
    // The form shows no stop for it, so a fee edit sends none.
    const next = keepHiddenSides(built.trade, old, six());
    expect(next.stops).toEqual(side('price', [4990, 3]));
    expect(next.initialRisk).toBe(150000);
  });

  test('a stop typed into the form replaces the hidden side', () => {
    const next = keepHiddenSides(
      made({ plannedStop: 4995 }),
      split(),
      input({ plannedStop: 4995 }),
    );
    expect(next.stops).toEqual(side('price', [4995, 2]));
    expect(next.initialRisk).toBe(2 * 5 * 50 * 100);
  });

  test('a side the form showed follows the form, even when cleared', () => {
    const old = made({ plannedStop: 4990, plannedTarget: 5030 });
    // The stop box was emptied; the target box kept.
    const next = keepHiddenSides(
      made({ plannedTarget: 5030 }),
      old,
      input({ plannedTarget: 5030 }),
    );
    expect(next).not.toHaveProperty('stops');
    expect(next).not.toHaveProperty('initialRisk');
    expect(next.targets).toEqual(side('price', [5030, 2]));
  });

  test('a trade saved before levels is a side the form shows', () => {
    const old = {
      ...made(),
      plannedStop: 4990,
      plannedTarget: 5030,
      initialRisk: 100000,
    };
    const next = keepHiddenSides(
      made({ plannedStop: 4990 }),
      old,
      input({ plannedStop: 4990 }),
    );
    expect(next.stops).toEqual(side('price', [4990, 2]));
    expect(next).not.toHaveProperty('targets');
  });
});

describe('manualInstrument', () => {
  const spec = (s: InstrumentSpec) => manualInstrument(s);
  test('a known futures root takes the registry; the multiplier can override', () => {
    expect(spec({ type: 'future', symbol: 'ESZ6' })).toMatchObject({
      root: 'ES',
      pointValue: 50,
      tickSize: 0.25,
    });
    expect(
      spec({ type: 'future', symbol: 'ESZ6', multiplier: 10 }).pointValue,
    ).toBe(10);
  });
  test('an option is the OCC symbol over its underlying, default 100', () => {
    expect(
      spec({
        type: 'option',
        symbol: 'aapl',
        expiry: '2026-12-18',
        strike: 200,
        right: 'put',
      }),
    ).toMatchObject({
      symbol: 'AAPL261218P00200000',
      root: 'AAPL',
      underlying: 'AAPL',
      pointValue: 100,
      assetClass: 'option',
    });
  });
  test('stock, crypto, cfd', () => {
    expect(spec({ type: 'stock', symbol: 'aapl' })).toMatchObject({
      symbol: 'AAPL',
      assetClass: 'stock',
      pointValue: 1,
    });
    expect(spec({ type: 'crypto', symbol: 'BTC/USD' })).toMatchObject({
      assetClass: 'crypto',
      pointValue: 1,
    });
    expect(spec({ type: 'cfd', symbol: 'GER40' }).pointValue).toBe(0);
    expect(spec({ type: 'cfd', symbol: 'GER40', multiplier: 5 })).toMatchObject(
      { assetClass: 'cfd', pointValue: 5 },
    );
  });
  test('seven asset types', () => {
    expect(ASSET_TYPES.map((a) => a.label)).toEqual([
      'Stock',
      'Option',
      'Future',
      'Future option',
      'Forex',
      'Crypto',
      'CFD',
    ]);
  });
});

describe('optionOn', () => {
  const spec = (type: 'option' | 'future-option'): InstrumentSpec => ({
    type,
    symbol: 'ZZ',
    expiry: '2026-12-18',
    strike: 10,
    right: 'call',
    multiplier: 100,
  });

  test('manual entry records what the option is on', () => {
    expect(manualInstrument(spec('option')).optionOn).toBe('stock');
    expect(manualInstrument(spec('future-option')).optionOn).toBe('future');
  });

  test('the form reads it, so an option the old guess gets wrong round-trips', () => {
    // A future option on an unlisted root worth exactly 100.
    expect(assetTypeOf(manualInstrument(spec('future-option')))).toBe(
      'future-option',
    );
    // A stock option on a ticker that is also a futures root.
    expect(
      assetTypeOf({
        ...manualInstrument({ ...spec('option'), symbol: 'CL' }),
      }),
    ).toBe('option');
  });

  test('data without it is read by root and multiplier, as before', () => {
    const old = (o: Partial<Instrument>): Instrument => {
      const inst = { ...manualInstrument(spec('option')), ...o };
      delete inst.optionOn;
      return inst;
    };
    expect(assetTypeOf(old({}))).toBe('option');
    expect(assetTypeOf(old({ underlying: 'ES', root: 'ES' }))).toBe(
      'future-option',
    );
    expect(assetTypeOf(old({ pointValue: 50 }))).toBe('future-option');
  });
});

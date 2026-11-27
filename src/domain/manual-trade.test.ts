import { describe, expect, test } from 'vitest';
import type { ManualTradeInput } from '@/data/repository';
import { resolveInstrument } from './instruments';
import type { Instrument } from './types';
import {
  ASSET_TYPES,
  buildManualTrade,
  assetTypeOf,
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
  test("the account's method builds the trade and is stamped on it", () => {
    const open = input({
      fills: [
        fillOf('buy', 1, 5000, 0),
        fillOf('buy', 1, 5010, 1),
        fillOf('sell', 1, 5020, 2),
      ],
    });
    const gross = (costMethod?: 'fifo' | 'lifo' | 'average') => {
      const r = buildManualTrade(open, { ...ctx, costMethod });
      if (!r.ok) throw new Error(r.error);
      return r.trade;
    };
    expect(gross()).toMatchObject({ status: 'open', gross: 100000 });
    expect(gross()).not.toHaveProperty('costMethod');
    expect(gross('fifo')).not.toHaveProperty('costMethod');
    expect(gross('lifo')).toMatchObject({ gross: 50000, costMethod: 'lifo' });
    expect(gross('average')).toMatchObject({
      gross: 75000,
      costMethod: 'average',
    });
  });

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

  test('the planned stop sets the initial risk; an explicit id is kept', () => {
    const r = buildManualTrade(input({ plannedStop: 4990 }), {
      ...ctx,
      id: 'keep-me',
    });
    expect(r.ok && r.trade.id).toBe('keep-me');
    expect(r.ok && r.trade.plannedStop).toBe(4990);
    expect(r.ok && r.trade.initialRisk).toBe(2 * 10 * 50 * 100);
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

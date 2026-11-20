import { describe, expect, test } from 'vitest';
import { buildTrades } from '@/domain/trade-builder';
import { resolveInstrument } from '@/domain/instruments';
import type { Execution } from '@/domain/types';
import { expiryCloseUtc, settleExpiredOptions } from './expiry';

const opts = {
  workspaceId: 'w',
  startSerial: 1,
  resolve: (s: string) => resolveInstrument(s),
  accountCurrency: () => 'USD',
};
const x = (p: Partial<Execution>): Execution => ({
  id: 'x1',
  accountId: 'a1',
  symbol: 'AAPL  261120C00150000',
  side: 'buy',
  qty: 1,
  price: 1,
  time: '2026-11-18T15:00:00.000Z',
  fees: 0,
  commission: 0,
  ...p,
});
const AFTER = '2026-11-21T00:00:00.000Z';

describe('settleExpiredOptions', () => {
  test('expiry close is 16:00 New York', () => {
    expect(expiryCloseUtc('2026-11-20')).toBe('2026-11-20T21:00:00.000Z');
    expect(expiryCloseUtc('2026-07-17')).toBe('2026-07-17T20:00:00.000Z');
  });

  test('a long call left open past expiry closes at 0 and shows its loss', () => {
    const s = settleExpiredOptions(
      [x({ qty: 2, price: 1.5, commission: 130 })],
      opts.resolve,
      AFTER,
    );
    expect(s.expired).toEqual([
      expect.objectContaining({ accountId: 'a1', expiry: '2026-11-20' }),
    ]);
    expect(buildTrades(s.executions, opts).trades[0]).toMatchObject({
      status: 'closed',
      avgExit: 0,
      closedAt: '2026-11-20T21:00:00.000Z',
      gross: -30000,
      net: -30130,
    });
  });

  test('a short put that expires keeps its premium', () => {
    const s = settleExpiredOptions(
      [
        x({
          symbol: 'SPY   261120P00450000',
          side: 'sell',
          price: 2,
          commission: 65,
        }),
      ],
      opts.resolve,
      AFTER,
    );
    expect(buildTrades(s.executions, opts).trades[0]).toMatchObject({
      gross: 20000,
      net: 19935,
    });
  });

  test('nothing is added before expiry, for flat positions, or for non-options', () => {
    const flat = [
      x({}),
      x({ id: 'x2', side: 'sell', time: '2026-11-19T15:00:00.000Z' }),
    ];
    expect(
      settleExpiredOptions([x({})], opts.resolve, '2026-11-20T20:59:00.000Z')
        .expired,
    ).toEqual([]);
    expect(settleExpiredOptions(flat, opts.resolve, AFTER).expired).toEqual([]);
    expect(
      settleExpiredOptions([x({ symbol: 'ESZ5' })], opts.resolve, AFTER)
        .expired,
    ).toEqual([]);
  });

  test('a partly closed position settles only the remainder', () => {
    const s = settleExpiredOptions(
      [x({ qty: 3 }), x({ id: 'x2', side: 'sell', qty: 1 })],
      opts.resolve,
      AFTER,
    );
    expect(s.executions.at(-1)).toMatchObject({
      side: 'sell',
      qty: 2,
      price: 0,
    });
  });
});

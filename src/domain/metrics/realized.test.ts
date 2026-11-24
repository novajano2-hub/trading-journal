import { describe, expect, test } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { generateSampleWorkspace, SAMPLE_SEED } from '@/data/seed/generate';
import { makeTrade } from '../__fixtures__/trades';
import { buildTrades } from '../trade-builder';
import { resolveInstrument } from '../instruments';
import type { Execution, Trade } from '../types';
import { realizations } from './realized';

const es = resolveInstrument('ESZ5')!;

function fill(
  id: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  time: string,
  fees: number,
): Execution {
  return {
    id,
    accountId: 'a1',
    symbol: 'ESZ5',
    side,
    qty,
    price,
    time,
    fees,
    commission: 0,
  };
}

function built(execs: Execution[]): Trade {
  const { trades } = buildTrades(execs, {
    workspaceId: 'w',
    startSerial: 1,
    resolve: () => es,
    accountCurrency: () => 'USD',
  });
  const t = trades[0];
  if (!t) throw new Error('no trade');
  return t;
}

describe('realizations', () => {
  test('books each exit on its own time, entry fees shared by quantity', () => {
    const t = built([
      fill('e1', 'buy', 2, 5000, '2026-11-16T15:00:00.000Z', 300),
      fill('x1', 'sell', 1, 5010, '2026-11-16T20:00:00.000Z', 150),
      fill('x2', 'sell', 1, 5020, '2026-11-17T15:00:00.000Z', 150),
    ]);
    expect(realizations(t)).toEqual([
      {
        tradeId: t.id,
        time: '2026-11-16T20:00:00.000Z',
        gross: 50000,
        fees: 300,
        net: 49700,
      },
      {
        tradeId: t.id,
        time: '2026-11-17T15:00:00.000Z',
        gross: 100000,
        fees: 300,
        net: 99700,
      },
    ]);
  });

  test('leftover cents of the entry fees go to the last exit', () => {
    const t = built([
      fill('e1', 'buy', 3, 5000, '2026-11-16T15:00:00.000Z', 301),
      fill('x1', 'sell', 1, 5000, '2026-11-16T16:00:00.000Z', 150),
      fill('x2', 'sell', 1, 5000, '2026-11-16T17:00:00.000Z', 150),
      fill('x3', 'sell', 1, 5000, '2026-11-16T18:00:00.000Z', 150),
    ]);
    expect(realizations(t).map((r) => r.fees)).toEqual([250, 250, 251]);
  });

  test('an open trade books only the lots it has exited', () => {
    const t = built([
      fill('e1', 'buy', 2, 5000, '2026-11-16T15:00:00.000Z', 300),
      fill('x1', 'sell', 1, 5010, '2026-11-16T20:00:00.000Z', 150),
    ]);
    expect(t.status).toBe('open');
    expect(realizations(t)).toEqual([
      {
        tradeId: t.id,
        time: '2026-11-16T20:00:00.000Z',
        gross: 50000,
        fees: 300,
        net: 49700,
      },
    ]);
  });

  test('an open trade with no exit books nothing', () => {
    const t = built([
      fill('e1', 'buy', 2, 5000, '2026-11-16T15:00:00.000Z', 300),
    ]);
    expect(realizations(t)).toEqual([]);
  });

  test('a closed trade without fills books once at its close', () => {
    const t = makeTrade({ net: 700, closedAt: '2026-03-02T15:05:00Z' });
    expect(realizations(t)).toEqual([
      {
        tradeId: t.id,
        time: '2026-03-02T15:05:00Z',
        gross: 700,
        fees: 0,
        net: 700,
      },
    ]);
  });

  test('the realizations of every closed fixture trade add up to the trade', () => {
    const closed = [
      ...fixtureSample().trades,
      ...generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' })
        .trades,
    ].filter((t) => t.status === 'closed');
    expect(closed.length).toBeGreaterThan(0);
    for (const t of closed) {
      const rs = realizations(t);
      expect(rs.reduce((s, r) => s + r.net, 0)).toBe(t.net);
      expect(rs.reduce((s, r) => s + r.gross, 0)).toBe(t.gross);
      expect(rs.reduce((s, r) => s + r.fees, 0)).toBe(t.fees);
    }
  });
});

describe('realizations of a trade in another quote currency (E71)', () => {
  test('each exit is converted at its own rate, the trade rounds once and the last exit takes the leftover cent', () => {
    const jpy = (
      id: string,
      side: 'buy' | 'sell',
      qty: number,
      price: number,
      time: string,
    ): Execution => ({
      id,
      accountId: 'a1',
      symbol: 'USDJPY',
      side,
      qty,
      price,
      time,
      fees: 0,
      commission: 350,
    });
    const { trades } = buildTrades(
      [
        {
          ...jpy('f1', 'sell', 2, 153.757, '2026-09-03T07:12:06Z'),
          commission: 700,
        },
        jpy('f2', 'buy', 1, 154.098, '2026-09-03T07:30:00Z'),
        jpy('f3', 'buy', 1, 154.026, '2026-09-03T07:45:00Z'),
      ],
      {
        workspaceId: 'w',
        startSerial: 1,
        resolve: () => resolveInstrument('USDJPY'),
        accountCurrency: () => 'USD',
      },
    );
    const t = trades[0]!;
    expect(t.gross).toBe(-39593);
    const r = realizations(t);
    expect(r.map((x) => x.gross)).toEqual([-22129, -17464]);
    expect(r.reduce((n, x) => n + x.gross, 0)).toBe(t.gross);
    expect(r.reduce((n, x) => n + x.net, 0)).toBe(t.net);
    expect(t.net).toBe(-40993);
  });
});

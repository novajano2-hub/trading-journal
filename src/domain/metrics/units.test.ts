import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { resolveInstrument } from '../instruments';
import type { DisplayUnit, Execution, Trade } from '../types';
import { isTradeUnit, tradeUnits, unitKeeps, unitOf } from './units';

const fill = (
  id: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
): Execution => ({
  id,
  accountId: 'a1',
  symbol: 'MESZ6',
  time: '2026-11-02T15:00:00Z',
  side,
  qty,
  price,
  fees: 0,
  commission: 0,
});

const future = makeTrade({ net: 100 });
const forex = makeTrade({
  net: 100,
  instrument: resolveInstrument('EURUSD')!,
  avgEntry: 1.07483,
  avgExit: 1.07688,
});
const stock = makeTrade({ net: 100, instrument: resolveInstrument('AAPL')! });
const withStop = makeTrade({ net: 100, initialRisk: 5000 });
const zeroRisk = makeTrade({ net: 100, initialRisk: 0 });

describe('which trades a unit keeps', () => {
  test('Ticks and Points keep futures, Pips forex, R the trades with a stop', () => {
    const keeps = (unit: DisplayUnit, t: Trade) => unitKeeps(unit, t);
    for (const unit of ['ticks', 'points'] as const) {
      expect(keeps(unit, future)).toBe(true);
      expect(keeps(unit, forex)).toBe(false);
      expect(keeps(unit, stock)).toBe(false);
    }
    expect(keeps('pips', forex)).toBe(true);
    expect(keeps('pips', future)).toBe(false);
    expect(keeps('r', withStop)).toBe(true);
    expect(keeps('r', future)).toBe(false);
    expect(keeps('r', zeroRisk)).toBe(false);
  });
  test('Dollar, Percentage and Privacy keep every trade', () => {
    for (const unit of ['dollar', 'percent', 'privacy'] as const)
      for (const t of [future, forex, stock, withStop])
        expect(unitKeeps(unit, t)).toBe(true);
  });
  test('an open futures trade is still a futures trade', () => {
    const open = makeTrade({ net: 0, status: 'open', avgExit: undefined });
    expect(unitKeeps('ticks', open)).toBe(true);
  });
  test('the four narrowing units are the trade units', () => {
    expect(
      (
        [
          'dollar',
          'percent',
          'privacy',
          'r',
          'ticks',
          'pips',
          'points',
        ] as const
      ).filter(isTradeUnit),
    ).toEqual(['r', 'ticks', 'pips', 'points']);
  });
});

describe('a trade in each unit', () => {
  test('ticks and points count every contract the trade closed (Q3): points are ticks times the tick size', () => {
    // MES long: 2 at 5850 and 3 at 5851, all 5 out at 5852. Avg entry 5850.6.
    const t = makeTrade({
      net: 0,
      instrument: resolveInstrument('MESZ6')!,
      avgEntry: 5850.6,
      avgExit: 5852,
      maxPosition: 5,
      executions: [
        fill('e1', 'buy', 2, 5850),
        fill('e2', 'buy', 3, 5851),
        fill('x1', 'sell', 5, 5852),
      ],
    });
    const u = tradeUnits(t, 'net');
    // 1.4 points and 5.6 ticks a contract: 7 points and 28 ticks over five.
    expect(u.points).toBe(7);
    expect(u.ticks).toBe(28);
    expect(u.points).toBe(u.ticks! * 0.25);
    expect(u.pips).toBeNull();
  });
  test('an open trade counts the contracts it has closed so far', () => {
    const t = makeTrade({
      net: 0,
      status: 'open',
      avgEntry: 5000,
      avgExit: 5001,
      maxPosition: 3,
      executions: [fill('e1', 'buy', 3, 5000), fill('x1', 'sell', 1, 5001)],
    });
    expect(tradeUnits(t, 'net').ticks).toBe(4);
  });
  test('without fills a trade counts its size', () => {
    const t = makeTrade({
      net: 0,
      avgEntry: 5000,
      avgExit: 5003.25,
      maxPosition: 2,
    });
    expect(tradeUnits(t, 'net').ticks).toBe(26);
    expect(tradeUnits(t, 'net').points).toBe(6.5);
  });
  test('pips stay per lot', () => {
    const t = { ...forex, maxPosition: 1.9 };
    expect(tradeUnits(t, 'net').pips).toBe(20.5);
  });
  test('R is the P&L on the basis over the initial risk', () => {
    const t = makeTrade({ net: 6000, fees: 500, initialRisk: 3000 });
    expect(unitOf(t, 'r', 'net')).toBe(2);
    expect(unitOf(t, 'r', 'gross')).toBeCloseTo(6500 / 3000);
    expect(unitOf(future, 'r', 'net')).toBeNull();
  });
});

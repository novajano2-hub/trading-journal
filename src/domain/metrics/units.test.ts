import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { resolveInstrument } from '../instruments';
import type { DisplayUnit, Execution, Trade } from '../types';
import {
  exitUnits,
  isTradeUnit,
  moneyPerPip,
  realizedUnits,
  tradeUnits,
  unitKeeps,
  unitOf,
} from './units';

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

describe('moneyPerPip', () => {
  const fx = (p: Partial<Trade>) =>
    makeTrade({
      net: 0,
      instrument: resolveInstrument('EURUSD')!,
      avgEntry: 1.1,
      avgExit: 1.1025,
      ...p,
    });
  test('gross P&L over pips, for a winner', () => {
    expect(moneyPerPip(fx({ gross: 5000 }))).toBe(200);
  });
  test('a loser has negative gross and negative pips, so a positive figure', () => {
    expect(moneyPerPip(fx({ avgExit: 1.0975, gross: -5000 }))).toBe(200);
  });
  test('a multi-lot trade is gross over the per-lot pips', () => {
    expect(moneyPerPip(fx({ maxPosition: 3, gross: 15000 }))).toBe(600);
  });
  test('no pips, no figure', () => {
    expect(moneyPerPip(fx({ avgExit: 1.1, gross: 0 }))).toBeNull();
    expect(moneyPerPip(future)).toBeNull();
  });
});

describe('each exit in each unit (exitUnits)', () => {
  const at = (
    id: string,
    side: 'buy' | 'sell',
    qty: number,
    price: number,
    time: string,
  ): Execution => ({ ...fill(id, side, qty, price), time });
  // ES long 2 at 4500: one out at 4506 (+$300), one at 4498 (-$100). Risk $100.
  const es = makeTrade({
    net: 20000,
    avgEntry: 4500,
    avgExit: 4502,
    maxPosition: 2,
    initialRisk: 10000,
    executions: [
      at('e', 'buy', 2, 4500, '2026-11-04T15:00:00Z'),
      at('x1', 'sell', 1, 4506, '2026-11-04T16:00:00Z'),
      at('x2', 'sell', 1, 4498, '2026-11-05T15:00:00Z'),
    ],
  });

  test("an exit's R is its own P&L over the risk; ticks and points are its own move times the contracts it closed", () => {
    const [a, b] = exitUnits(es, 'net');
    expect(a!.time).toBe('2026-11-04T16:00:00Z');
    expect(a!.units).toEqual({ r: 3, ticks: 24, pips: null, points: 6 });
    expect(b!.units).toEqual({ r: -1, ticks: -8, pips: null, points: -2 });
  });

  test("a trade's total is the sum of its exits", () => {
    const whole = tradeUnits(es, 'net');
    const exits = exitUnits(es, 'net');
    for (const u of ['r', 'ticks', 'points'] as const)
      expect(exits.reduce((n, x) => n + x.units[u]!, 0)).toBeCloseTo(
        whole[u]!,
        9,
      );
  });

  test('pips stay per lot: each exit its move over its share of the size', () => {
    const eur = makeTrade({
      net: 3000,
      instrument: resolveInstrument('EURUSD')!,
      avgEntry: 1.07,
      avgExit: 1.0705,
      maxPosition: 2,
      executions: [
        at('e', 'buy', 2, 1.07, '2026-11-04T15:00:00Z'),
        at('x1', 'sell', 1, 1.0708, '2026-11-04T16:00:00Z'),
        at('x2', 'sell', 1, 1.0702, '2026-11-05T15:00:00Z'),
      ],
    });
    const [a, b] = exitUnits(eur, 'net');
    expect(a!.units.pips).toBe(4);
    expect(b!.units.pips).toBe(1);
    expect(a!.units.pips! + b!.units.pips!).toBe(tradeUnits(eur, 'net').pips);
  });

  test('a trade with no fills is one exit holding the whole trade; an open trade sums to what it has booked', () => {
    const plain = makeTrade({ net: 10000, avgExit: 4502, initialRisk: 5000 });
    expect(exitUnits(plain, 'net').map((x) => x.units)).toEqual([
      tradeUnits(plain, 'net'),
    ]);
    const open = makeTrade({
      net: 0,
      status: 'open',
      avgEntry: 4500,
      maxPosition: 2,
      initialRisk: 10000,
      executions: es.executions.slice(0, 2),
    });
    const [only] = exitUnits(open, 'net');
    expect(only!.units).toEqual(realizedUnits(open, 'net'));
  });
});

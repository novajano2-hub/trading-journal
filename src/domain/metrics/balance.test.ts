import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { resolveInstrument } from '../instruments';
import { buildTrades } from '../trade-builder';
import type { Account, CashFlow, Execution } from '../types';
import { balanceAt, balanceSeries, dayBefore } from './balance';
import { defaultMetricContext } from './context';

const ctx = defaultMetricContext('UTC');

const account = (id: string, startingBalance: number): Account =>
  ({
    id,
    workspaceId: 'w',
    name: id,
    broker: '',
    type: 'live',
    currency: 'USD',
    startingBalance,
    status: 'active',
  }) satisfies Account;

const flow = (
  accountId: string,
  date: string,
  amount: number,
  id = `${accountId}-${date}`,
): CashFlow => ({ id, workspaceId: 'w', accountId, date, amount });

describe('balanceAt', () => {
  test('starting balance, flows dated on or before the date, and net realized through it', () => {
    const accounts = [account('a1', 1_000_000)];
    const flows = [
      flow('a1', '2026-11-05', 100_000),
      flow('a1', '2026-11-12', -50_000),
      flow('a1', '2026-11-16', 999_999),
    ];
    const trades = [
      makeTrade({
        accountId: 'a1',
        net: 30_000,
        closedAt: '2026-11-15T15:00:00Z',
      }),
      makeTrade({
        accountId: 'a1',
        net: 70_000,
        closedAt: '2026-11-16T15:00:00Z',
      }),
    ];
    expect(balanceAt(accounts, flows, trades, '2026-11-15', ctx)).toBe(
      1_080_000,
    );
  });

  test('counts only the accounts it is given', () => {
    const accounts = [account('a1', 1_000_000)];
    const flows = [flow('a2', '2026-11-01', 5_000)];
    const trades = [
      makeTrade({
        accountId: 'a2',
        net: 7_000,
        closedAt: '2026-11-01T15:00:00Z',
      }),
    ];
    expect(balanceAt(accounts, flows, trades, '2026-11-30', ctx)).toBe(
      1_000_000,
    );
  });

  test('books a trade by its exits, not at its close', () => {
    const fill = (
      id: string,
      side: 'buy' | 'sell',
      qty: number,
      price: number,
      time: string,
    ): Execution => ({
      id,
      accountId: 'a1',
      symbol: 'ESZ5',
      side,
      qty,
      price,
      time,
      fees: 0,
      commission: 0,
    });
    const built = buildTrades(
      [
        fill('e', 'buy', 2, 5000, '2026-11-16T15:00:00.000Z'),
        fill('x1', 'sell', 1, 5010, '2026-11-16T20:00:00.000Z'),
        fill('x2', 'sell', 1, 5020, '2026-11-17T15:00:00.000Z'),
      ],
      {
        workspaceId: 'w',
        startSerial: 1,
        resolve: () => resolveInstrument('ESZ5')!,
        accountCurrency: () => 'USD',
      },
    ).trades;
    const accounts = [account('a1', 0)];
    // The first exit (+$500) is booked on the 16th, the second (+$1,000) on the 17th.
    expect(balanceAt(accounts, [], built, '2026-11-16', ctx)).toBe(50_000);
    expect(balanceAt(accounts, [], built, '2026-11-17', ctx)).toBe(150_000);
    expect(balanceAt(accounts, [], built, '2026-11-15', ctx)).toBe(0);
  });

  test('reads dates in the context time zone', () => {
    const accounts = [account('a1', 0)];
    const trades = [
      makeTrade({
        accountId: 'a1',
        net: 1_000,
        closedAt: '2026-11-16T03:00:00Z',
      }),
    ];
    const ny = defaultMetricContext('America/New_York');
    expect(balanceAt(accounts, [], trades, '2026-11-15', ny)).toBe(1_000);
    expect(balanceAt(accounts, [], trades, '2026-11-15', ctx)).toBe(0);
  });
});

test('dayBefore steps over month and year ends', () => {
  expect(dayBefore('2026-11-01')).toBe('2026-10-31');
  expect(dayBefore('2026-01-01')).toBe('2025-12-31');
  expect(dayBefore('2024-03-01')).toBe('2024-02-29');
});

describe('balanceSeries (C75)', () => {
  const days = [
    { date: '2026-11-01', net: 50_000 },
    { date: '2026-11-03', net: -20_000 },
    { date: '2026-11-05', net: 10_000 },
  ];
  const flows = [
    { date: '2026-11-02', amount: 100_000 },
    { date: '2026-11-04', amount: -30_000 },
  ];

  test('a point on every trading day and every day with a deposit or a withdrawal', () => {
    const points = balanceSeries(days, 1_000_000, flows);
    expect(points.map((p) => p.date)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ]);
    // The starting balance, the flows and the net booked through the day.
    expect(points.map((p) => p.balance)).toEqual([
      1_050_000, 1_150_000, 1_130_000, 1_100_000, 1_110_000,
    ]);
    // The deposits and withdrawals, net, running.
    expect(points.map((p) => p.flows)).toEqual([
      0, 100_000, 100_000, 70_000, 70_000,
    ]);
  });

  test('a range keeps its own days; the net flows count from its start', () => {
    const points = balanceSeries(days, 1_000_000, flows, {
      from: '2026-11-03',
      to: '2026-11-04',
    });
    expect(points.map((p) => p.date)).toEqual(['2026-11-03', '2026-11-04']);
    // Everything before the range is already in the balance.
    expect(points.map((p) => p.balance)).toEqual([1_130_000, 1_100_000]);
    expect(points.map((p) => p.flows)).toEqual([0, -30_000]);
  });

  test('no day and no flow is no point', () => {
    expect(balanceSeries([], 1_000_000, [])).toEqual([]);
    expect(balanceSeries(days, 0, [], { from: '2027-01-01' })).toEqual([]);
  });

  test('a flow and a trading day on one date make one point', () => {
    const points = balanceSeries(
      [{ date: '2026-11-02', net: 5_000 }],
      100_000,
      [{ date: '2026-11-02', amount: 1_000 }],
    );
    expect(points).toEqual([
      { date: '2026-11-02', balance: 106_000, flows: 1_000 },
    ]);
  });
});

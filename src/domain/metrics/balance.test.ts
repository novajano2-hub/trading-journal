import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { resolveInstrument } from '../instruments';
import { buildTrades } from '../trade-builder';
import type { Account, CashFlow, Execution } from '../types';
import { balanceAt, dayBefore } from './balance';
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

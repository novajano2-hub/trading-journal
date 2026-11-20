import { describe, expect, test } from 'vitest';
import { makeTrade } from '../domain/__fixtures__/trades';
import type { Account, UserPrefs } from '../domain/types';
import { metricContextOf, metricsByCurrency } from './metrics';
import { generateSampleWorkspace, SAMPLE_SEED } from './seed/generate';

const acct = (id: string, startingBalance: number, currency = 'USD') =>
  ({ id, startingBalance, currency }) as Account;
const ctx = {
  timeZone: 'America/New_York',
  breakevenRange: { unit: 'amount' as const, from: 0, to: 0 },
  pnlBasis: 'net' as const,
};

describe('metricsByCurrency', () => {
  test('starting balances of the selected accounts add up', () => {
    const [usd] = metricsByCurrency([makeTrade({ net: 100 })], {
      accounts: [acct('a', 5_000_000), acct('b', 2_500_000)],
      ctx,
      baseCurrency: 'USD',
    });
    expect(usd!.startingBalance).toBe(7_500_000);
    expect(usd!.equity[0]!.equity).toBe(7_500_100);
  });

  test('base currency first, others follow; each partition is single-currency', () => {
    const out = metricsByCurrency(
      [
        makeTrade({ net: 100 }),
        makeTrade({ net: -50 }),
        makeTrade({ net: 70, pnlCurrency: 'GBP' }),
      ],
      { accounts: [acct('a', 1000)], ctx, baseCurrency: 'USD' },
    );
    expect(out.map((m) => m.currency)).toEqual(['USD', 'GBP']);
    for (const m of out) expect(m.summary.currencies).toHaveLength(1);
    expect(out[1]!.startingBalance).toBe(0);
    expect(out[0]!.trades).toHaveLength(2);
  });

  test('base partition is present even when it has no trades', () => {
    const out = metricsByCurrency(
      [makeTrade({ net: 70, pnlCurrency: 'GBP' })],
      { accounts: [], ctx, baseCurrency: 'USD' },
    );
    expect(out.map((m) => m.currency)).toEqual(['USD', 'GBP']);
    expect(out[0]!.summary.closedCount).toBe(0);
  });

  test('no trades gives one empty base partition', () => {
    const out = metricsByCurrency([], {
      accounts: [],
      ctx,
      baseCurrency: 'USD',
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.currency).toBe('USD');
    expect(out[0]!.summary.closedCount).toBe(0);
    expect(out[0]!.summary.winRate).toBeNull();
  });

  test('other currencies are in code order', () => {
    const out = metricsByCurrency(
      ['JPY', 'GBP', 'EUR'].map((c) => makeTrade({ net: 1, pnlCurrency: c })),
      { accounts: [], ctx, baseCurrency: 'USD' },
    );
    expect(out.map((m) => m.currency)).toEqual(['USD', 'EUR', 'GBP', 'JPY']);
  });
});

test('metricContextOf maps prefs', () => {
  const prefs: UserPrefs = {
    timeZone: 'Europe/London',
    baseCurrency: 'GBP',
    breakevenRange: { unit: 'amount', from: -500, to: 500 },
    pnlBasis: 'gross',
  };
  expect(metricContextOf(prefs)).toEqual({
    timeZone: 'Europe/London',
    breakevenRange: { unit: 'amount', from: -500, to: 500 },
    pnlBasis: 'gross',
  });
});

describe('performance (spec §10)', () => {
  test('metrics over the sample workspace take under 50 ms (median of 5)', () => {
    const ws = generateSampleWorkspace({
      seed: SAMPLE_SEED,
      endDate: '2026-11-19',
    });
    expect(ws.accounts).toHaveLength(3);
    const run = () =>
      metricsByCurrency(ws.trades, {
        accounts: ws.accounts,
        ctx,
        baseCurrency: 'USD',
      });
    run(); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      run();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[2]!).toBeLessThan(50);
  });
});

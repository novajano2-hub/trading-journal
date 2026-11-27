import { beforeAll, describe, expect, test } from 'vitest';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { balanceAt } from '@/domain/metrics/balance';
import {
  breachInsights,
  filterChallenges,
  filterItems,
  passRates,
  roiSeries,
  spendItems,
  totals,
} from '@/domain/prop/finance';
import type {
  Account,
  BreachReason,
  Challenge,
  PropTxn,
  Trade,
} from '@/domain/types';
import { generateSampleWorkspace, SAMPLE_SEED } from './seed/generate';
import type { SampleWorkspace } from './seed/generate';
import {
  DEFAULT_PROP_VIEW,
  propFinance,
  type PropFinanceInput,
} from './prop-finance';

const NY = 'America/New_York';
const TODAY = '2026-11-20';
const CTX = {
  timeZone: NY,
  breakevenRange: { unit: 'amount' as const, from: 0, to: 0 },
  pnlBasis: 'net' as const,
  weekStart: 'sunday' as const,
};

function inputOf(
  s: SampleWorkspace,
  over: Partial<PropFinanceInput> = {},
): PropFinanceInput {
  return {
    challenges: s.challenges,
    accounts: s.accounts,
    trades: s.trades,
    flows: [],
    txns: s.propTxns,
    strategies: s.strategies,
    filters: {},
    view: DEFAULT_PROP_VIEW,
    baseCurrency: 'USD',
    ctx: CTX,
    today: TODAY,
    ...over,
  };
}

describe('propFinance on the sample', () => {
  let s: SampleWorkspace;
  beforeAll(() => {
    s = generateSampleWorkspace({ seed: SAMPLE_SEED, endDate: '2026-11-19' });
  });
  const account = (id: string) => s.accounts.find((a) => a.id === id)!;
  const balanceOf = (id: string) =>
    balanceAt(
      [account(id)],
      [],
      s.trades.filter((t) => t.accountId === id),
      TODAY,
      CTX,
    );

  test('the money cards: spent, earned, net and the return on spend', () => {
    const f = propFinance(inputOf(s));
    expect(f.totals).toMatchObject({
      spent: 151_900,
      earned: 450_000,
      net: 298_100,
      payouts: 2,
    });
    expect(f.totals.roi).toBeCloseTo(298_100 / 151_900, 10);
  });

  test('the balance cards: active funded accounts and active evaluation accounts', () => {
    const f = propFinance(inputOf(s));
    // Futures 50K is funded; Forex 100K is the one evaluation still going; Futures 100K is breached.
    expect(f.funded).toEqual({
      balance: balanceOf('sample-futures-50k-funded'),
      count: 1,
    });
    expect(f.evaluation).toEqual({
      balance: balanceOf('sample-forex-prop'),
      count: 1,
    });
    expect(f.leftOut).toBe(0);
  });

  test('the aggregates are the finance functions over the filtered rows', () => {
    const f = propFinance(inputOf(s));
    const items = spendItems(s.challenges, s.propTxns);
    expect(f.roi).toEqual(roiSeries(items, '1y', TODAY));
    expect(f.roi).toHaveLength(365);
    // Every fee is dated, so the window's last point is the cards' totals.
    expect(f.roi[364]).toMatchObject({
      income: 450_000,
      costs: 151_900,
      net: 298_100,
    });
    expect(f.passRate).toEqual(passRates(s.challenges, s.accounts, 'firm'));
    expect(f.passRate.overall).toEqual({ passed: 1, attempted: 2 });
    expect(f.breaches).toEqual(
      breachInsights(s.challenges, s.accounts, s.trades, CTX, 'evaluation'),
    );
    expect(f.breaches.reasons).toEqual([
      { reason: 'max-drawdown', count: 1, share: 1 },
    ]);
    expect(f.breaches.commonFirm).toBe('Sample prop firm');
    expect(f.breaches.commonSize).toBe(10_000_000);
    expect(f.breaches.avgDays).toBeGreaterThan(30);
  });

  test('the views pick the window, the grouping and the phase', () => {
    const by = (view: Partial<typeof DEFAULT_PROP_VIEW>) =>
      propFinance(inputOf(s, { view: { ...DEFAULT_PROP_VIEW, ...view } }));
    expect(by({ roi: '1w' }).roi).toHaveLength(7);
    expect(by({ roi: '1m' }).roi).toHaveLength(30);
    // The two activation fees no row holds count as fields.
    expect(by({ breakdown: 'fee' }).breakdown.map((r) => r.key)).toEqual([
      'evaluation-fee',
      'activation-fee',
      'reset-fee',
      'uncategorized',
    ]);
    expect(by({ breakdown: 'firm' }).breakdown.map((r) => r.label)).toEqual([
      'Sample prop firm',
      'Sample data feed',
    ]);
    expect(by({ breaches: 'funded' }).breaches.reasons).toEqual([]);
    expect(by({ passRate: 'type' }).passRate.rows.map((r) => r.key)).toEqual([
      '1-step',
    ]);
  });

  test('a strategy row reads the strategy by name', () => {
    const f = propFinance(
      inputOf(s, { view: { ...DEFAULT_PROP_VIEW, passRate: 'strategy' } }),
    );
    expect(f.passRate.rows.length).toBeGreaterThan(0);
    const names = new Set(s.strategies.map((x) => x.name));
    for (const r of f.passRate.rows) expect(names.has(r.label)).toBe(true);
  });

  test('a filter narrows the challenges, the rows and the cards together', () => {
    const f = propFinance(inputOf(s, { filters: { status: 'breached' } }));
    expect(f.challenges.map((c) => c.id)).toEqual([
      'sample-challenge-futures-100k',
    ]);
    // The evaluation fee and two resets of the breached one; its ignored refund never counts.
    expect(f.totals).toMatchObject({ spent: 29_900 + 19_800, earned: 0 });
    expect(f.funded).toEqual({ balance: 0, count: 0 });
    expect(f.evaluation).toEqual({ balance: 0, count: 0 });
    expect(f.counts).toEqual({ challenges: 3, txns: 9 });
  });

  test('a firm with no challenge keeps its rows', () => {
    const f = propFinance(
      inputOf(s, { filters: { firm: ['Sample data feed'] } }),
    );
    expect(f.challenges).toEqual([]);
    expect(f.totals).toMatchObject({ spent: 2_900, earned: 0 });
  });

  test('a filter that matches nothing leaves zeros', () => {
    const f = propFinance(inputOf(s, { filters: { firm: ['Nobody'] } }));
    expect(f.challenges).toEqual([]);
    expect(f.totals).toMatchObject({ spent: 0, earned: 0, net: 0, roi: null });
    expect(f.breakdown).toEqual([]);
    expect(f.passRate.overall).toEqual({ passed: 0, attempted: 0 });
  });

  test('the ROI window ends on the date range end, else today', () => {
    const open = propFinance(inputOf(s));
    expect(open.roi[364]!.date).toBe(TODAY);
    const ranged = propFinance(
      inputOf(s, { filters: { range: { to: '2026-11-01' } } }),
    );
    expect(ranged.roi[364]!.date).toBe('2026-11-01');
    // The range cuts the rows by their dates too.
    expect(ranged.totals.earned).toBeLessThan(open.totals.earned);
  });

  test('the date range is the finance functions', () => {
    const filters = { range: { from: '2026-10-01', to: '2026-11-10' } };
    const cs = filterChallenges(s.challenges, s.accounts, filters);
    const items = filterItems(
      spendItems(cs, s.propTxns),
      s.challenges,
      s.accounts,
      filters,
    );
    expect(propFinance(inputOf(s, { filters })).totals).toEqual(totals(items));
  });

  describe('other currencies (C58)', () => {
    test('an account in another currency is left out of the balances and counted', () => {
      const accounts: Account[] = s.accounts.map((a) =>
        a.id === 'sample-futures-50k-funded' ? { ...a, currency: 'EUR' } : a,
      );
      const f = propFinance(inputOf(s, { accounts }));
      expect(f.funded).toEqual({ balance: 0, count: 0 });
      expect(f.evaluation.count).toBe(1);
      expect(f.leftOut).toBe(1);
    });

    test('the size of a challenge with no account in the base currency is None', () => {
      const accounts: Account[] = s.accounts.map((a) =>
        a.id.startsWith('sample-futures-50k') ? { ...a, currency: 'EUR' } : a,
      );
      const rows = propFinance(
        inputOf(s, {
          accounts,
          view: { ...DEFAULT_PROP_VIEW, breakdown: 'size' },
        }),
      ).breakdown;
      expect(rows.map((r) => r.key)).not.toContain('5000000');
      expect(rows.map((r) => r.key)).toContain('none');
    });

    test('a second account of another currency is counted once each', () => {
      const accounts: Account[] = s.accounts.map((a) =>
        a.id.startsWith('sample-futures-50k') ? { ...a, currency: 'EUR' } : a,
      );
      expect(propFinance(inputOf(s, { accounts })).leftOut).toBe(2);
    });

    test('only the accounts of the challenges in view are counted', () => {
      const accounts: Account[] = s.accounts.map((a) =>
        a.id === 'sample-futures-50k-funded' ? { ...a, currency: 'EUR' } : a,
      );
      const f = propFinance(
        inputOf(s, { accounts, filters: { status: 'breached' } }),
      );
      expect(f.leftOut).toBe(0);
    });
  });

  test('an empty workspace has empty figures and zero counts', () => {
    const f = propFinance(
      inputOf(s, { challenges: [], txns: [], trades: [], accounts: [] }),
    );
    expect(f.counts).toEqual({ challenges: 0, txns: 0 });
    expect(f.totals).toMatchObject({ spent: 0, earned: 0, roi: null });
    expect(f.funded).toEqual({ balance: 0, count: 0 });
    expect(f.roi).toHaveLength(365);
  });
});

describe('prop dashboard budget', () => {
  test('prop dashboard budget: 200 challenges and 2,000 transactions in under 50 ms', () => {
    const accounts: Account[] = [];
    const challenges: Challenge[] = [];
    const trades: Trade[] = [];
    const reasons: BreachReason[] = [
      'max-drawdown',
      'overtrading',
      'time-pressure',
      'risk-management',
      'other',
    ];
    const firms = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
    for (let i = 0; i < 200; i++) {
      for (const id of [`a${i}`, `b${i}`])
        accounts.push({
          id,
          workspaceId: 'w',
          name: id,
          broker: 'b',
          type: 'prop-evaluation',
          currency: 'USD',
          startingBalance: [2_500_000, 5_000_000, 10_000_000][i % 3]!,
          status: 'active',
        });
      const month = String((i % 9) + 1).padStart(2, '0');
      const breached = i % 3 === 0;
      challenges.push({
        id: `c${i}`,
        workspaceId: 'w',
        name: `C${i}`,
        firm: firms[i % firms.length]!,
        steps: i % 2 === 0 ? 1 : 2,
        phases:
          i % 2 === 0
            ? [
                {
                  step: 'step-1',
                  accountId: `a${i}`,
                  startDate: `2026-${month}-02`,
                },
                {
                  step: 'funded',
                  accountId: `b${i}`,
                  startDate: `2026-${month}-20`,
                },
              ]
            : [
                {
                  step: 'step-1',
                  accountId: `a${i}`,
                  startDate: `2026-${month}-02`,
                },
                { step: 'step-2' },
                { step: 'funded' },
              ],
        phase: i % 5 === 0 ? 'funded' : 'evaluation',
        status: breached ? 'breached' : 'active',
        evaluationFee: 16_500,
        strategyIds: [`s${i % 6}`],
        ...(breached && {
          breachReason: reasons[i % reasons.length]!,
          breachedOn: `2026-${month}-28`,
        }),
      });
      for (let k = 0; k < 5; k++)
        trades.push(
          makeTrade({
            id: `t${i}-${k}`,
            serial: i * 5 + k,
            workspaceId: 'w',
            accountId: `a${i}`,
            openedAt: `2026-${month}-${String(k + 3).padStart(2, '0')}T15:00:00Z`,
            closedAt: `2026-${month}-${String(k + 3).padStart(2, '0')}T15:30:00Z`,
            net: 11_900,
          }),
        );
    }
    const txns: PropTxn[] = [];
    for (let i = 0; i < 2000; i++)
      txns.push({
        id: `x${i}`,
        workspaceId: 'w',
        date: `2026-${String((i % 9) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
        firm: firms[i % firms.length]!,
        ...(i % 5 === 0 ? {} : { challengeId: `c${i % 200}` }),
        category: i % 6 === 0 ? 'payout' : 'reset-fee',
        amount: (i % 6 === 0 ? 1 : -1) * (1_000 + (i % 97) * 100),
        status: i % 11 === 0 ? 'ignored' : 'reviewed',
      });
    const input: PropFinanceInput = {
      challenges,
      accounts,
      trades,
      flows: [],
      txns,
      filters: { status: 'active', range: { from: '2026-01-01' } },
      view: DEFAULT_PROP_VIEW,
      baseCurrency: 'USD',
      ctx: CTX,
      today: TODAY,
    };
    expect(propFinance(input).counts.challenges).toBe(200); // the warm-up
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      propFinance(input);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[2]!).toBeLessThan(50);
  });
});

// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_TEMPLATE } from '@/domain/dashboard/templates';
import { summarize } from '@/domain/metrics/summary';
import type { WidgetKey } from '@/domain/types';
import { DEFAULT_PROP_VIEW } from '../prop-finance';
import { createLocalRepository } from '../local/local-repository';
import {
  ChallengeBreachedError,
  NotFoundError,
  PayoutRefusedError,
} from '../repository';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from '../seed/generate';
import { usePropFinance, useWidgetData } from './derived';
import {
  useAccounts,
  useAddPropTxn,
  useChallenges,
  useLogPayout,
  useMarkBreached,
  usePropTxns,
  useRemovePropTxn,
  useSetCostMethod,
  useTrades,
  useUpdatePropTxn,
} from './hooks';
import { DataProvider } from './provider';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => '/app/dashboard',
}));

beforeEach(() => window.history.replaceState(null, '', '/app/dashboard'));
afterEach(cleanup);

const sample: SampleWorkspace = generateSampleWorkspace({
  seed: SAMPLE_SEED,
  endDate: '2026-11-19',
});
const FUNDED = 'sample-challenge-futures-50k';
const FOREX = 'sample-challenge-forex-100k';

function setup() {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => structuredClone(sample),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <DataProvider repository={repository} queryClient={queryClient}>
        {children}
      </DataProvider>
    );
  }
  return { repository, Wrapper };
}

describe('prop transactions', () => {
  test('usePropTxns reads the sample rows; add, update and remove refresh them', async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(
      () => ({
        list: usePropTxns(),
        add: useAddPropTxn(),
        update: useUpdatePropTxn(),
        remove: useRemovePropTxn(),
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(9));
    let added = '';
    await act(async () => {
      const t = await result.current.add.mutateAsync({
        date: '2026-11-18',
        firm: 'Sample prop firm',
        category: 'affiliate-income',
        amount: 5_000,
        status: 'not-reviewed',
      });
      added = t.id;
    });
    await waitFor(() => expect(result.current.list.data).toHaveLength(10));
    await act(async () => {
      await result.current.update.mutateAsync({
        id: added,
        patch: { status: 'ignored' },
      });
    });
    await waitFor(() =>
      expect(
        result.current.list.data!.find((t) => t.id === added)!.status,
      ).toBe('ignored'),
    );
    await act(async () => {
      await result.current.remove.mutateAsync(added);
    });
    await waitFor(() => expect(result.current.list.data).toHaveLength(9));
  });

  test('useLogPayout writes a payout linked to the funded challenge and counts at once', async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(
      () => ({
        list: usePropTxns(),
        payout: useLogPayout(),
        finance: usePropFinance({}, DEFAULT_PROP_VIEW),
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.finance.status).toBe('success'));
    const before = result.current.finance.data!.totals;
    let row;
    await act(async () => {
      row = await result.current.payout.mutateAsync({
        challengeId: FUNDED,
        amount: 90_000,
        date: '2026-11-17',
      });
    });
    expect(row).toMatchObject({
      category: 'payout',
      amount: 90_000,
      challengeId: FUNDED,
      firm: 'Sample prop firm',
      date: '2026-11-17',
      status: 'not-reviewed',
    });
    await waitFor(() =>
      expect(result.current.finance.data!.totals.earned).toBe(
        before.earned + 90_000,
      ),
    );
    expect(result.current.finance.data!.totals.payouts).toBe(
      before.payouts + 1,
    );
    expect(result.current.list.data).toHaveLength(10);
  });

  test('useLogPayout refuses an evaluation challenge and a breached one: only a funded account is paid (C29)', async () => {
    const { repository, Wrapper } = setup();
    const { result } = renderHook(() => useLogPayout(), { wrapper: Wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          challengeId: FOREX,
          amount: 90_000,
          date: '2026-11-17',
        }),
      ).rejects.toMatchObject({
        name: 'PayoutRefusedError',
        reason: 'not-funded',
      });
      await repository.challenges.markBreached('sample', FUNDED, {
        reason: 'max-drawdown',
        on: '2026-11-17',
      });
      const breached = result.current.mutateAsync({
        challengeId: FUNDED,
        amount: 90_000,
        date: '2026-11-17',
      });
      await expect(breached).rejects.toBeInstanceOf(PayoutRefusedError);
      await expect(breached).rejects.toMatchObject({ reason: 'breached' });
    });
    expect(await repository.propTxns.list('sample')).toHaveLength(9);
  });

  test('useLogPayout refuses an amount that is not income and a challenge that is not there', async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useLogPayout(), { wrapper: Wrapper });
    await act(async () => {
      for (const amount of [0, -100])
        await expect(
          result.current.mutateAsync({
            challengeId: FUNDED,
            amount,
            date: '2026-11-17',
          }),
        ).rejects.toBeInstanceOf(RangeError);
      await expect(
        result.current.mutateAsync({
          challengeId: 'nope',
          amount: 100,
          date: '2026-11-17',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});

describe('breaches and the cost method', () => {
  test('useMarkBreached marks for good, and the breach insights follow', async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(
      () => ({
        challenges: useChallenges(),
        mark: useMarkBreached(),
        finance: usePropFinance({}, DEFAULT_PROP_VIEW),
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.finance.status).toBe('success'));
    expect(result.current.finance.data!.breaches.reasons).toHaveLength(1);
    await act(async () => {
      await result.current.mark.mutateAsync({
        id: FOREX,
        reason: 'overtrading',
        on: '2026-11-18',
      });
    });
    await waitFor(() =>
      expect(
        result.current.challenges.data!.find((c) => c.id === FOREX),
      ).toMatchObject({ status: 'breached', breachReason: 'overtrading' }),
    );
    await waitFor(() =>
      expect(result.current.finance.data!.breaches.reasons).toHaveLength(2),
    );
    expect(result.current.finance.data!.evaluation.count).toBe(0);
    await act(async () => {
      await expect(
        result.current.mark.mutateAsync({
          id: FOREX,
          reason: 'other',
          on: '2026-11-19',
        }),
      ).rejects.toBeInstanceOf(ChallengeBreachedError);
    });
  });

  test('useSetCostMethod rebuilds the account and refreshes the trades and the account', async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(
      () => ({
        accounts: useAccounts(),
        trades: useTrades(),
        set: useSetCostMethod(),
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.trades.data).toBeDefined());
    const own = (r: typeof result.current) =>
      r.trades.data!.filter((t) => t.accountId === 'sample-futures');
    expect(own(result.current).every((t) => t.costMethod === undefined)).toBe(
      true,
    );
    await act(async () => {
      await result.current.set.mutateAsync({
        id: 'sample-futures',
        method: 'lifo',
      });
    });
    await waitFor(() =>
      expect(own(result.current).every((t) => t.costMethod === 'lifo')).toBe(
        true,
      ),
    );
    expect(
      result.current.accounts.data!.find((a) => a.id === 'sample-futures')!
        .costMethod,
    ).toBe('lifo');
  });
});

describe('usePropFinance', () => {
  test('answers once everything it reads has loaded, and follows the filters', async () => {
    const { Wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ firm }: { firm: string[] }) =>
        usePropFinance({ firm }, DEFAULT_PROP_VIEW),
      { wrapper: Wrapper, initialProps: { firm: [] as string[] } },
    );
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data!.challenges).toHaveLength(3);
    expect(result.current.data!.totals.spent).toBe(151_900);
    rerender({ firm: ['Sample data feed'] });
    expect(result.current.data!.challenges).toHaveLength(0);
    expect(result.current.data!.totals.spent).toBe(2_900);
  });

  test('an inline filter object does not recompute the figures every render', async () => {
    const { Wrapper } = setup();
    const { result, rerender } = renderHook(
      () => usePropFinance({ status: 'active' }, { ...DEFAULT_PROP_VIEW }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
    const first = result.current.data;
    rerender();
    expect(result.current.data).toBe(first);
  });
});

describe('useWidgetData', () => {
  const KEYS = [...DEFAULT_TEMPLATE.upper, ...DEFAULT_TEMPLATE.lower].map(
    (r) => r.key as WidgetKey,
  );

  test('reads the filtered trades of the base currency', async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useWidgetData(['net-pnl', 'score']), {
      wrapper: Wrapper,
    });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.status).toBe('success'));
    const d = result.current.data!;
    expect(d.currency).toBe('USD');
    expect(Object.keys(d.values).sort()).toEqual(['net-pnl', 'score']);
    expect(d.values['net-pnl']!.closedCount).toBeGreaterThan(1000);
    expect(d.unitLeftOut).toBe(0);
  });

  test('follows the URL filters: one account narrows every widget', async () => {
    window.history.replaceState(
      null,
      '',
      '/app/dashboard?account=sample-futures',
    );
    const { Wrapper } = setup();
    const { result } = renderHook(() => useWidgetData(KEYS), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.status).toBe('success'));
    const own = sample.trades.filter((t) => t.accountId === 'sample-futures');
    const net = result.current.data!.values['net-pnl']!;
    expect(net.closedCount).toBe(
      own.filter((t) => t.status === 'closed').length,
    );
    expect(net.netPnl).toBe(
      summarize(own, {
        timeZone: 'America/New_York',
        breakevenRange: { unit: 'amount', from: 0, to: 0 },
        pnlBasis: 'net',
      }).netPnl,
    );
  });

  test('a unit that narrows the trades leaves the score on all of them', async () => {
    window.history.replaceState(null, '', '/app/dashboard');
    const { repository, Wrapper } = setup();
    await repository.prefs.update({ displayUnit: 'ticks' });
    const { result } = renderHook(() => useWidgetData(['net-pnl', 'score']), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.status).toBe('success'));
    const d = result.current.data!;
    // Ticks keep the futures trades only: fewer closed trades than the whole set, left out and counted.
    expect(d.unitLeftOut).toBeGreaterThan(0);
    expect(d.values['net-pnl']!.closedCount).toBeLessThan(
      sample.trades.filter((t) => t.status === 'closed').length,
    );
    // The score reads the money of everything the filters match.
    expect(d.values.score!.total).toBeGreaterThan(0);
  });

  test('the chosen currency is read, and the list always starts with the base', async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(
      () => useWidgetData(['net-pnl'], { currency: 'JPY' }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data!.currencies[0]).toBe('USD');
    // The sample has no JPY trades: the base is read.
    expect(result.current.data!.currency).toBe('USD');
  });
});

// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import type { ImportPlan } from '@/domain/import/plan';
import {
  afterEach,
  beforeEach,
  expect,
  onTestFinished,
  test,
  vi,
} from 'vitest';
import { parseCsv } from '@/domain/import/csv';
import { guessMapping } from '@/domain/import/mapping';
import { EMPTY_FILTERS } from '../filters';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import { fixtureSample } from '../__fixtures__/sample';
import { createLocalRepository } from '../local/local-repository';
import type { Repository } from '../repository';
import { SAMPLE_WORKSPACE, USER_WORKSPACE } from '../workspaces';
import {
  useDayScores,
  useGlobalFilters,
  useImportPlan,
  useMetrics,
  useTradeSet,
  type Derived,
  type ImportInput,
} from './derived';
import { useCommitImport, useUndoImport } from './hooks';
import { DataProvider } from './provider';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => '/app/dashboard',
}));

beforeEach(() => window.history.replaceState(null, '', '/app/dashboard'));
afterEach(cleanup);

function setup(sample = fixtureSample) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample(),
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

test('useGlobalFilters reads the URL and writes filters back, keeping other params', async () => {
  window.history.replaceState(null, '', '/app/dashboard?by=hour&side=long');
  const { Wrapper } = setup();
  const { result } = renderHook(() => useGlobalFilters(), { wrapper: Wrapper });
  expect(result.current.filters.side).toBe('long');
  act(() => result.current.setFilters({ ...EMPTY_FILTERS, symbols: ['ES'] }));
  expect(window.location.search).toBe('?by=hour&symbol=ES');
  act(() => result.current.setFilters(EMPTY_FILTERS));
  expect(window.location.search).toBe('?by=hour');
});

test('useGlobalFilters drops unknown ids and cleans the URL (Review Focus 5)', async () => {
  window.history.replaceState(
    null,
    '',
    '/app/dashboard?by=hour&account=ghost&account=acc-a&tag=gone&symbol=ES',
  );
  const { Wrapper } = setup();
  const { result } = renderHook(() => useGlobalFilters(), { wrapper: Wrapper });
  await waitFor(() =>
    expect(window.location.search).toBe('?by=hour&account=acc-a&symbol=ES'),
  );
  expect(result.current.filters.accountIds).toEqual(['acc-a']);
  expect(result.current.filters.tagIds).toEqual([]);
});

test('useGlobalFilters leaves a clean URL untouched', async () => {
  window.history.replaceState(null, '', '/app/dashboard?account=acc-a');
  const spy = vi.spyOn(window.history, 'replaceState');
  const { Wrapper } = setup();
  const { result } = renderHook(
    () => ({ f: useGlobalFilters(), set: useTradeSet(EMPTY_FILTERS) }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.set.status).toBe('success'));
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

test('a filter on an unknown account still shows data', async () => {
  const { Wrapper } = setup();
  const { result } = renderHook(
    () => useTradeSet({ ...EMPTY_FILTERS, accountIds: ['ghost'] }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.data!.filters.accountIds).toEqual([]);
  expect(result.current.data!.trades.map((t) => t.id).sort()).toEqual([
    'f-1',
    'f-2',
  ]);
});

test('useTradeSet keeps its result while the inputs are unchanged', async () => {
  const { Wrapper } = setup();
  const { result, rerender } = renderHook(
    () => useTradeSet({ ...EMPTY_FILTERS }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.status).toBe('success'));
  const first = result.current.data;
  rerender();
  expect(result.current.data).toBe(first);
});

test('useMetrics partitions by currency', async () => {
  const { Wrapper } = setup();
  const { result } = renderHook(() => useMetrics(EMPTY_FILTERS), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.data![0]!.currency).toBe('USD');
  expect(result.current.data![0]!.summary.closedCount).toBe(2);
});

test('a failing query makes the derived result an error', async () => {
  const { repository } = setup();
  const broken: Repository = {
    ...repository,
    tags: {
      ...repository.tags,
      list: () => Promise.reject(new Error('tags down')),
    },
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { result } = renderHook(() => useTradeSet(EMPTY_FILTERS), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <DataProvider repository={broken} queryClient={queryClient}>
        {children}
      </DataProvider>
    ),
  });
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.error?.message).toBe('tags down');
});

test('useImportPlan plans the landing file and keeps its id per input', async () => {
  const { repository, Wrapper } = setup();
  const account = await repository.accounts.create(USER_WORKSPACE.id, {
    name: 'Mine',
    broker: 'x',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  const parsed = parseCsv(
    readFileSync('e2e/fixtures/sample-fills.csv', 'utf8'),
  );
  const input: ImportInput = {
    parsed,
    mapping: guessMapping(parsed, { sourceTimeZone: 'America/New_York' }),
    accountId: account.id,
    fileName: 'sample-fills.csv',
  };
  const { result, rerender } = renderHook(
    ({ i }: { i: ImportInput | null }) => useImportPlan(i),
    { wrapper: Wrapper, initialProps: { i: input as ImportInput | null } },
  );
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.data!.trades).toHaveLength(8);
  const id = result.current.data!.importId;
  rerender({ i: input });
  expect(result.current.data!.importId).toBe(id);
  rerender({ i: null });
  expect(result.current.status).toBe('pending');
});

const EARLY = '2026-11-21T10:00:00.000Z';
const LATE = '2026-11-21T10:05:00.000Z';

test('useImportPlan gives the same input a fresh id and time after every commit and undo, so no commit overwrites another', async () => {
  const { repository, Wrapper } = setup();
  const account = await repository.accounts.create(USER_WORKSPACE.id, {
    name: 'Mine',
    broker: 'x',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  const parsed = parseCsv(
    'Date/Time,Symbol,Buy/Sell,Quantity,Price\n2026-11-16 09:41:00,ESZ5,Buy,1,6010\n2026-11-16 09:50:00,ESZ5,Sell,1,6011\n',
  );
  const input: ImportInput = {
    parsed,
    mapping: guessMapping(parsed, { sourceTimeZone: 'America/New_York' }),
    accountId: account.id,
    fileName: 'es.csv',
  };
  const { result } = renderHook(
    () => ({
      plan: useImportPlan(input),
      commit: useCommitImport(),
      undo: useUndoImport(),
    }),
    { wrapper: Wrapper },
  );
  const planned = async (not: readonly string[]) => {
    await waitFor(() => {
      expect(result.current.plan.status).toBe('success');
      expect(not).not.toContain(result.current.plan.data!.importId);
    });
    return result.current.plan.data!;
  };

  // Only the clock is faked; timers stay real for waitFor and IndexedDB.
  vi.useFakeTimers({ toFake: ['Date'], now: Date.parse(EARLY) });
  onTestFinished(() => void vi.useRealTimers());
  const x = await planned([]);
  await act(() => result.current.commit.mutateAsync(x));
  // The file is all imported now, under a new id.
  const y = await planned([x.importId]);
  expect(y.blocked).toBe('nothing-new');
  vi.setSystemTime(Date.parse(LATE));
  await act(() => result.current.undo.mutateAsync(x.importId));
  const z = await planned([x.importId, y.importId]);
  expect(z.blocked).toBeNull();
  expect([x.createdAt, z.createdAt]).toEqual([EARLY, LATE]);
  await act(() => result.current.commit.mutateAsync(z));
  expect(
    (await repository.imports.list(USER_WORKSPACE.id)).map((j) => [
      j.id,
      j.status,
    ]),
  ).toEqual([
    [z.importId, 'active'],
    [x.importId, 'undone'],
  ]);
});

async function importFixture(
  repository: Repository,
  name: string,
  csv: string,
): Promise<ImportInput> {
  const account = await repository.accounts.create(USER_WORKSPACE.id, {
    name,
    broker: 'x',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  const parsed = parseCsv(csv);
  return {
    parsed,
    mapping: guessMapping(parsed, { sourceTimeZone: 'America/New_York' }),
    accountId: account.id,
    fileName: name + '.csv',
  };
}

const TWO_FILLS =
  'Date/Time,Symbol,Buy/Sell,Quantity,Price\n2026-11-16 09:41:00,ESZ5,Buy,1,6010\n2026-11-16 09:50:00,ESZ5,Sell,1,6011\n';

test('useImportPlan: success always carries data, on every pass', async () => {
  const { repository, Wrapper } = setup();
  const a = await importFixture(repository, 'a', TWO_FILLS);
  const b = await importFixture(repository, 'b', TWO_FILLS);
  const passes: Derived<ImportPlan>[] = [];
  const { result, rerender } = renderHook(
    ({ i }: { i: ImportInput }) => {
      const plan = useImportPlan(i);
      passes.push(plan);
      return {
        plan,
        commit: useCommitImport(),
        undo: useUndoImport(),
      };
    },
    { wrapper: Wrapper, initialProps: { i: a } },
  );
  const settled = async (fileName: string, not: readonly string[] = []) => {
    await waitFor(() => {
      expect(result.current.plan.status).toBe('success');
      expect(result.current.plan.data!.fileName).toBe(fileName);
      expect(not).not.toContain(result.current.plan.data!.importId);
    });
    return result.current.plan.data!;
  };
  await settled('a.csv');
  rerender({ i: b });
  const x = await settled('b.csv');
  await act(() => result.current.commit.mutateAsync(x));
  const y = await settled('b.csv', [x.importId]);
  await act(() => result.current.undo.mutateAsync(x.importId));
  await settled('b.csv', [x.importId, y.importId]);

  for (const r of passes)
    expect(r.status !== 'success' || r.data !== undefined).toBe(true);
  expect(passes.some((r) => r.status === 'success')).toBe(true);
});

test('useImportPlan: a new input never shows a plan made for the old one', async () => {
  const { repository, Wrapper } = setup();
  const a = await importFixture(repository, 'a', TWO_FILLS);
  const b = await importFixture(repository, 'b', TWO_FILLS);
  const passes: Derived<ImportPlan>[] = [];
  const { result, rerender } = renderHook(
    ({ i }: { i: ImportInput }) => {
      const plan = useImportPlan(i);
      passes.push(plan);
      return plan;
    },
    { wrapper: Wrapper, initialProps: { i: a } },
  );
  await waitFor(() => expect(result.current.status).toBe('success'));
  const before = passes.length;
  rerender({ i: b });
  await waitFor(() => expect(result.current.data?.fileName).toBe('b.csv'));
  for (const r of passes.slice(before))
    expect(r.data === undefined || r.data.fileName === 'b.csv').toBe(true);
});

test('useImportPlan: an inline input object does not loop', async () => {
  const { repository, Wrapper } = setup();
  const input = await importFixture(repository, 'a', TWO_FILLS);
  let renders = 0;
  const { result } = renderHook(
    () => {
      renders += 1;
      return useImportPlan({ ...input });
    },
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.status).toBe('success'));
  await new Promise((r) => setTimeout(r, 50));
  expect(renders).toBeLessThan(10);
  expect(result.current.data).toBeDefined();
});

test('useMetrics: day figures keep an exit dated inside the range when the open trade is matched outside it', async () => {
  // ES long opened Fri 13 Nov; one lot sold Tue 17 Nov for -$1,000; one lot still open.
  const held = makeTrade({
    id: 'held',
    workspaceId: SAMPLE_WORKSPACE.id,
    accountId: 'acc-a',
    status: 'open',
    openedAt: '2026-11-13T15:00:00Z',
    net: 0,
    gross: 0,
    maxPosition: 2,
    avgEntry: 5000,
    executions: [
      {
        id: 'e1',
        accountId: 'acc-a',
        symbol: 'ESZ5',
        side: 'buy',
        qty: 2,
        price: 5000,
        time: '2026-11-13T15:00:00Z',
        fees: 0,
        commission: 0,
      },
      {
        id: 'e2',
        accountId: 'acc-a',
        symbol: 'ESZ5',
        side: 'sell',
        qty: 1,
        price: 4980,
        time: '2026-11-17T15:00:00Z',
        fees: 0,
        commission: 0,
      },
    ],
  });
  const { Wrapper } = setup(() => ({ ...fixtureSample(), trades: [held] }));
  const { result } = renderHook(
    () =>
      useMetrics({
        ...EMPTY_FILTERS,
        range: { from: '2026-11-16', to: '2026-11-20' },
      }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.status).toBe('success'));
  const usd = result.current.data![0]!;
  expect(usd.days.map((d) => [d.date, d.net])).toEqual([
    ['2026-11-17', -100000],
  ]);
  expect(usd.netDays.map((d) => [d.date, d.net])).toEqual([
    ['2026-11-17', -100000],
  ]);
});

/** The fixture's two ES trades (f-1 with a stop), plus a forex and a stock trade on the same account. */
function mixedSample() {
  const base = fixtureSample();
  const own = { workspaceId: SAMPLE_WORKSPACE.id, accountId: 'acc-a' };
  return {
    ...base,
    trades: [
      { ...base.trades[0]!, initialRisk: 10_000 },
      base.trades[1]!,
      makeTrade({
        ...own,
        id: 'fx-1',
        serial: 4,
        instrument: resolveInstrument('EURUSD')!,
        openedAt: '2026-11-18T09:00:00Z',
        closedAt: '2026-11-18T10:00:00Z',
        avgEntry: 1.07483,
        avgExit: 1.07688,
        net: 20_500,
      }),
      makeTrade({
        ...own,
        id: 'st-1',
        serial: 5,
        instrument: resolveInstrument('AAPL')!,
        openedAt: '2026-11-18T15:00:00Z',
        closedAt: '2026-11-18T16:00:00Z',
        avgEntry: 200,
        avgExit: 201,
        net: 10_000,
        initialRisk: 5_000,
      }),
    ],
  };
}

test.each([
  ['dollar', ['f-1', 'f-2', 'fx-1', 'st-1']],
  ['percent', ['f-1', 'f-2', 'fx-1', 'st-1']],
  ['privacy', ['f-1', 'f-2', 'fx-1', 'st-1']],
  ['ticks', ['f-1', 'f-2']],
  ['points', ['f-1', 'f-2']],
  ['pips', ['fx-1']],
  ['r', ['f-1', 'st-1']],
] as const)(
  'under %s the trade set keeps %j, day trades too, and counts the rest as left out',
  async (unit, kept) => {
    const { Wrapper, repository } = setup(mixedSample);
    await repository.prefs.update({ displayUnit: unit });
    const { result } = renderHook(() => useTradeSet(EMPTY_FILTERS), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.status).toBe('success'));
    const set = result.current.data!;
    const ids = (ts: { id: string }[]) => ts.map((t) => t.id).sort();
    expect(ids(set.trades)).toEqual([...kept]);
    expect(ids(set.dayTrades)).toEqual([...kept]);
    expect(set.unitLeftOut).toBe(4 - kept.length);
  },
);

test('the left-out count is of the trades the filters matched', async () => {
  const { Wrapper, repository } = setup(mixedSample);
  await repository.prefs.update({ displayUnit: 'pips' });
  const { result } = renderHook(
    () => useTradeSet({ ...EMPTY_FILTERS, symbols: ['ES', 'EURUSD'] }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.data!.trades.map((t) => t.id)).toEqual(['fx-1']);
  expect(result.current.data!.unitLeftOut).toBe(2);
});

test('useMetrics under Ticks reads only the futures trades, and its profit factor in ticks', async () => {
  const { Wrapper, repository } = setup(mixedSample);
  await repository.prefs.update({ displayUnit: 'ticks' });
  const { result } = renderHook(() => useMetrics(EMPTY_FILTERS), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.status).toBe('success'));
  const usd = result.current.data![0]!;
  expect(usd.summary).toMatchObject({ closedCount: 2, wins: 1, losses: 1 });
  // f-1 made 5 points (20 ticks), f-2 lost 2.5 (10 ticks).
  expect(usd.summary.profitFactor).toBeCloseTo(2, 10);
  expect(usd.days.map((d) => d.date)).toEqual(['2026-11-16', '2026-11-17']);
});

test('useDayScores re-reads the clock each minute, so a missed start time turns failed (R8)', async () => {
  const { repository, Wrapper } = setup();
  await repository.prefs.update({ timeZone: 'America/New_York' });
  // 09:29 in New York on the fixture sample's today (its tracker's asOf).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T14:29:00Z'));
  const intervals: { fn: () => void; ms: number | undefined; id: number }[] =
    [];
  const real = globalThis.setInterval;
  const setSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((
    fn: () => void,
    ms?: number,
  ) => {
    const id = real(() => {}, 1 << 30) as unknown as number;
    if (ms === 60_000) intervals.push({ fn, ms, id });
    return id;
  }) as unknown as typeof setInterval);
  const clearSpy = vi.spyOn(globalThis, 'clearInterval');
  onTestFinished(() => {
    vi.useRealTimers();
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });
  const startBy = (
    r: Derived<{
      scoreOn(d: string): { rules: { key: string; status: string }[] };
    }>,
  ) =>
    r.data?.scoreOn('2026-11-19').rules.find((x) => x.key === 'startBy')
      ?.status;

  const { result, unmount } = renderHook(() => useDayScores(), {
    wrapper: Wrapper,
  });
  // waitFor polls on a clock this test has frozen, so poll by hand.
  for (let i = 0; i < 100 && result.current.status !== 'success'; i++)
    await act(() => new Promise((r) => setTimeout(r, 50)));
  expect(result.current.status).toBe('success');
  expect(startBy(result.current)).toBe('pending');
  expect(intervals).toHaveLength(1);

  vi.setSystemTime(new Date('2026-11-19T14:31:00Z'));
  act(() => intervals[0]!.fn());
  expect(startBy(result.current)).toBe('failed');

  unmount();
  expect(clearSpy).toHaveBeenCalledWith(intervals[0]!.id);
});

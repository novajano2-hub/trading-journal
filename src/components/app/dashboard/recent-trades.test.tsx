// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { buildDashboard, pickPartition } from '@/data/dashboard';
import { resolveRange } from '@/data/filters';
import { metricContextOf } from '@/data/metrics';
import {
  useGlobalFilters,
  useMetrics,
  useTradeSet,
} from '@/data/query/derived';
import {
  useAccounts,
  useCashFlows,
  usePrefs,
  useStrategies,
  useTagCategories,
  useTags,
  useTrades,
} from '@/data/query/hooks';
import { createLocalRepository } from '@/data/local/local-repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { resolveInstrument } from '@/domain/instruments';
import { strategyRules, type Trade, type UserPrefs } from '@/domain/types';
import { localDate } from '@/domain/time';
import {
  FigureSourceContext,
  pctBaseOf,
  type FigureSource,
} from '@/lib/display';
import { keepHyphens } from '@/lib/format';
import { rangeCaption } from '@/lib/range-label';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { dashboardFixture } from '../__fixtures__/dashboard-sample';
import { renderApp } from '../__fixtures__/render-app';
import { RecentTrades } from './recent-trades';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

// Animations finish at once here, as in dashboard-view.test.tsx.
MotionGlobalConfig.skipAnimations = true;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T15:00:00Z')); // Friday 20 Nov, 10:00 in New York
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const fx = fixtureSample();
const rule = (id: string) =>
  strategyRules(fx.strategies[0]!).find((r) => r.id === id)!.text;
const r1 = rule('r-1');
const r2 = rule('r-2');
const fomo = fx.tags.find((t) => t.id === 'tag-fomo')!.name;

/**
 * Feeds `RecentTrades` the way the recent trades widget does: the dashboard
 * model of the one currency the filters leave with closed trades (the base
 * currency first), the display unit's figure source and the range's words,
 * with the tab kept here so a filter change does not reset it.
 */
function RecentHarness(): React.JSX.Element | null {
  const { filters } = useGlobalFilters();
  const set = useTradeSet(filters);
  const metrics = useMetrics(filters);
  const prefs = usePrefs().data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const categories = useTagCategories().data;
  const accounts = useAccounts().data;
  const flows = useCashFlows().data;
  const allTrades = useTrades().data;
  const [tab, setTab] = useState<'closed' | 'open'>();
  const shownFilters = set.data?.filters;
  const view = useMemo(() => {
    if (
      !metrics.data ||
      !shownFilters ||
      !prefs ||
      !strategies ||
      !tags ||
      !categories ||
      !accounts ||
      !flows ||
      !allTrades
    )
      return undefined;
    const today = localDate(new Date().toISOString(), prefs.timeZone);
    const range = resolveRange(shownFilters.range, today, prefs.weekStart);
    const partition = pickPartition(
      metrics.data,
      undefined,
      prefs.baseCurrency,
    );
    const ctx = { ...metricContextOf(prefs), range };
    const model = buildDashboard(partition, {
      strategies,
      tags,
      tagCategories: categories,
      ctx,
    });
    const source: FigureSource = {
      tradesById: model.tradesById,
      ctx,
      pctBase: pctBaseOf({
        accounts,
        flows,
        trades: allTrades,
        accountIds: shownFilters.accountIds,
        currency: partition.currency,
        from: range.from,
        timeZone: prefs.timeZone,
      }),
    };
    return { model, source, caption: rangeCaption(range, today) };
  }, [
    metrics.data,
    shownFilters,
    prefs,
    strategies,
    tags,
    categories,
    accounts,
    flows,
    allTrades,
  ]);
  if (!view || !prefs) return null;
  const { model } = view;
  return (
    <FigureSourceContext.Provider value={view.source}>
      <RecentTrades
        recent={model.recent}
        open={model.open}
        tab={
          tab ??
          (model.recent.length === 0 && model.open.length > 0
            ? 'open'
            : 'closed')
        }
        onTab={setTab}
        basis={model.basis}
        timeZone={prefs.timeZone}
        caption={view.caption}
      />
    </FigureSourceContext.Provider>
  );
}

/**
 * The recent trades over `dashboardFixture`, in New York, with `prefs` on
 * top. Weeks start on Monday here.
 */
async function renderRecent(
  opts: {
    graded?: boolean;
    prefs?: Partial<UserPrefs>;
    edit?: (s: SampleWorkspace) => void;
    url?: string;
  } = {},
) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const s = dashboardFixture({ graded: opts.graded ?? true });
      opts.edit?.(s);
      return s;
    },
  });
  await repository.prefs.update({
    timeZone: 'America/New_York',
    weekStart: 'monday',
    ...opts.prefs,
  });
  return renderApp(<RecentHarness />, { repository, url: opts.url });
}

test('recent trades: newest first, with the rules column', async () => {
  await renderRecent();
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  const headers = within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(headers).toEqual([
    'Time',
    'Instrument',
    'Side',
    'Strategy',
    'Mistake',
    'Net P&L',
    'Rules',
  ]);
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  expect(rows[0]!.textContent).toContain('19 Nov 10:00');
  expect(rows[0]!.textContent).toContain('Opening range breakout');
  // A cut-short strategy name keeps its whole text in the title.
  expect(within(rows[0]!).getByTitle('Opening range breakout')).toBeTruthy();
  expect(rows[0]!.textContent).toContain(fomo);
  expect(rows[0]!.textContent).toContain('−$400.00');
  expect(rows[0]!.textContent).toContain(`Broke: ${r1}`);
  expect(rows[1]!.textContent).toContain('18 Nov 10:00');
  expect(rows[1]!.textContent).toContain('+$600.00');
  expect(rows[1]!.textContent).toContain('2 of 2 kept');
  // A trade with no mistake says so in its Mistake cell, never a blank.
  expect(within(rows[1]!).getAllByRole('cell')[4]!.textContent).toBe('None');
  const region = screen.getByRole('region', { name: 'Recent trades' });
  expect(region.textContent).toContain('all time');
});

test('a trade that broke two rules and carries two mistakes', async () => {
  await renderRecent({
    edit: (s) => {
      s.tags.push({
        id: 'tag-size',
        workspaceId: 'sample',
        name: 'oversized',
        categoryId: 'mistakes',
      });
      const f1 = s.trades.find((t) => t.id === 'f-1')!;
      f1.ruleChecks = [
        { ruleId: 'r-1', followed: false },
        { ruleId: 'r-2', followed: false },
      ];
      f1.tagIds = ['tag-fomo', 'tag-size'];
    },
  });
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  const row = within(table).getAllByRole('row')[1]!;
  // The full list rides in the title, and whole in the text a screen reader gets.
  const rules = within(row).getByTitle(`${r1}, ${r2}`);
  // Below xl the rule wraps to two lines rather than cutting to a stub; from xl it reads on one line.
  // "Broke:" (loss red) and the rule (ink) are two runs in one clamped line.
  const text = rules.querySelector('.line-clamp-2')!;
  expect(text.textContent).toBe(`Broke: ${keepHyphens(r1)}`);
  expect(text.className).toContain('line-clamp-2');
  expect(text.className).toContain('xl:truncate');
  expect(text.className).not.toMatch(/(^|\s)truncate/);
  // The rest is a small loss chip right after the rule, not stranded at the cell's edge.
  const count = text.nextElementSibling!;
  expect(count.textContent).toBe('+1');
  expect(count.className).toContain('bg-loss-soft');
  expect(rules.textContent).not.toContain('more');
  expect(row.textContent).toContain(`Broke: ${r1} and ${r2}`);
  // The first mistake as a chip, then +1 that names the rest.
  expect(row.textContent).toContain(fomo);
  const more = within(row).getByTitle('oversized');
  expect(more.textContent).toContain('+1');
});

test('recent trades name the instrument, keeping the symbol in the title', async () => {
  await renderRecent({
    edit: (s) => {
      const f1 = s.trades.find((t) => t.id === 'f-1')!;
      f1.instrument = resolveInstrument('TSLA261120P00370000')!;
    },
  });
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  const [option, future] = within(table).getAllByRole('row').slice(1);
  const name = within(option!).getByTitle('TSLA261120P00370000');
  expect(name.textContent).toBe('TSLA 370 Putexpires 20 Nov');
  expect(option!.textContent).not.toContain('TSLA261120P00370000');
  expect(within(future!).getByTitle('ESZ5').textContent).toBe('ES Dec 25');
});

/** An open ES long of 3 contracts at 6,000; `exits` are the contracts sold so far at 6,002. */
function openTrade(id: string, exits: number): Trade {
  const base = dashboardFixture().trades[0]!;
  const sell = (qty: number) => ({
    id: `${id}-x`,
    accountId: 'acc-a',
    symbol: 'ESZ5',
    side: 'sell' as const,
    qty,
    price: 6002,
    time: '2026-11-20T14:10:00.000Z',
    fees: 0,
    commission: 0,
  });
  const t: Trade = {
    ...base,
    id,
    serial: 20,
    status: 'open',
    openedAt: '2026-11-20T14:00:00.000Z',
    avgEntry: 6000,
    maxPosition: 3,
    gross: 0,
    fees: 0,
    net: 0,
    strategyIds: [],
    ruleChecks: [],
    tagIds: [],
    executions: [
      {
        id: `${id}-e`,
        accountId: 'acc-a',
        symbol: 'ESZ5',
        side: 'buy',
        qty: 3,
        price: 6000,
        time: '2026-11-20T14:00:00.000Z',
        fees: 0,
        commission: 0,
      },
      ...(exits > 0 ? [sell(exits)] : []),
    ],
  };
  delete t.closedAt;
  delete t.avgExit;
  return t;
}

const openTab = async () => {
  const group = await screen.findByRole('radiogroup', {
    name: 'Recent trades view',
  });
  fireEvent.click(within(group).getByRole('radio', { name: 'Open positions' }));
  return screen.findByRole('table', { name: 'Open positions' });
};

test('recent trades opens on the closed trades, with an Open positions tab beside them', async () => {
  await renderRecent();
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  expect(table).toBeTruthy();
  const group = screen.getByRole('radiogroup', { name: 'Recent trades view' });
  expect(
    within(group)
      .getAllByRole('radio')
      .map((r) => (r as HTMLInputElement).labels?.[0]?.textContent),
  ).toEqual(['Closed', 'Open positions']);
});

test('All trades is a drill-down to the All view, keeping the filters', async () => {
  await renderRecent({
    url: '/app/dashboard?from=2026-11-02&to=2026-11-19&account=acc-b',
  });
  const region = await screen.findByRole('region', { name: 'Recent trades' });
  expect(
    within(region)
      .getByRole('link', { name: 'All trades' })
      .getAttribute('href'),
  ).toBe('/app/trades?from=2026-11-02&to=2026-11-19&account=acc-b');
});

test('open positions: each open trade with its quantity, entry and realized P&L from a partial exit', async () => {
  await renderRecent({
    edit: (s) => {
      s.trades.push(openTrade('o-1', 1));
    },
  });
  const table = await openTab();
  const headers = within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(headers).toEqual([
    'Opened',
    'Instrument',
    'Side',
    'Quantity',
    'Avg entry',
    'Realized, net',
  ]);
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.textContent).toContain('20 Nov 09:00');
  expect(row.textContent).toContain('Long');
  // 3 bought, 1 sold: 2 still open.
  expect(within(row).getAllByRole('cell')[3]!.textContent).toBe('2');
  expect(row.textContent).toContain('6,000.00');
  // One contract exited 2 points up, 50 a point.
  expect(row.textContent).toContain('+$100.00');
  expect(within(row).getByRole('link').getAttribute('href')).toContain(
    '/app/trades/o-1',
  );
  // The closed table is gone while this tab shows.
  expect(screen.queryByRole('table', { name: 'Recent trades' })).toBeNull();
});

test('an open trade with no exit yet has no realized P&L, and says None', async () => {
  await renderRecent({
    edit: (s) => {
      s.trades.push(openTrade('o-2', 0));
    },
  });
  const table = await openTab();
  const row = within(table).getAllByRole('row')[1]!;
  expect(within(row).getAllByRole('cell')[5]!.textContent).toBe('None');
  expect(within(row).getAllByRole('cell')[3]!.textContent).toBe('3');
});

test('open positions with none open says so', async () => {
  await renderRecent();
  const group = await screen.findByRole('radiogroup', {
    name: 'Recent trades view',
  });
  fireEvent.click(within(group).getByRole('radio', { name: 'Open positions' }));
  const region = screen.getByRole('region', { name: 'Recent trades' });
  await waitFor(() =>
    expect(region.textContent).toContain('No open positions.'),
  );
  expect(screen.queryByRole('table', { name: 'Open positions' })).toBeNull();
});

test('open positions read the display unit: ticks of the contracts closed so far', async () => {
  await renderRecent({
    prefs: { displayUnit: 'ticks' },
    edit: (s) => {
      s.trades.push(openTrade('o-1', 1));
    },
  });
  const table = await openTab();
  const cell = within(table).getAllByRole('cell')[5]!;
  // One contract closed 2 points up on a 0.25 tick.
  expect(cell.textContent).toContain('+8.0 ticks');
  expect(cell.textContent).not.toContain('$');
});

test('open positions read R when R is shown', async () => {
  await renderRecent({
    prefs: { displayUnit: 'r' },
    edit: (s) => {
      const t = openTrade('o-1', 1);
      t.initialRisk = 5_000;
      for (const x of s.trades) x.initialRisk = 10_000;
      s.trades.push(t);
    },
  });
  const table = await openTab();
  // ++$100.00 booked over $50.00 risked.
  expect(within(table).getAllByRole('cell')[5]!.textContent).toContain(
    '+2.00R',
  );
});

test('on a phone the open positions are two-line rows that link to the trade', async () => {
  await renderRecent({
    edit: (s) => {
      s.trades.push(openTrade('o-1', 1));
    },
  });
  await openTab();
  const list = screen.getByRole('list', { name: 'Open positions' });
  expect(list.className).toContain('sm:hidden');
  const row = within(list).getAllByRole('listitem')[0]!;
  const link = within(row).getByRole('link');
  expect(link.getAttribute('href')).toContain('/app/trades/o-1');
  const one = row.querySelector('[data-line="1"]')!.textContent!;
  expect(one).toContain('20 Nov 09:00');
  expect(one).toContain('+$100.00');
  const two = row.querySelector('[data-line="2"]')!.textContent!;
  expect(two).toContain('Long');
  expect(two).toContain('2');
  expect(two).toContain('6,000.00');
  // The table keeps from 640px up.
  expect(
    screen.getByRole('table', { name: 'Open positions' }).className,
  ).toContain('max-sm:hidden');
});

test('open trades with no closed one still open on their tab', async () => {
  await renderRecent({
    edit: (s) => {
      s.trades = [openTrade('o-1', 1)];
    },
  });
  const table = await screen.findByRole('table', { name: 'Open positions' });
  expect(table.textContent).toContain('+$100.00');
  expect(
    (
      screen.getByRole('radio', {
        name: 'Open positions',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
});

test('recent trades follow the basis: gross reads the Gross P&L column', async () => {
  await renderRecent({ prefs: { pnlBasis: 'gross' } });
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  expect(
    within(table).getByRole('columnheader', { name: 'Gross P&L' }),
  ).toBeTruthy();
  expect(table.textContent).toContain('−$395.00');
});

test('ungraded imports still show their trades, not graded (Review Focus 1)', async () => {
  await renderRecent({ graded: false });
  const rows = within(
    await screen.findByRole('table', { name: 'Recent trades' }),
  )
    .getAllByRole('row')
    .slice(1);
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.textContent).toContain('Not graded');
    expect(row.textContent).toContain('None');
  }
  expect(rows[0]!.textContent).toContain('−$400.00');
});

test('under R the recent trades are the ones with a stop, so none is left out', async () => {
  // Only the first trade has a risk: the list is that trade alone.
  await renderRecent({
    prefs: { displayUnit: 'r' },
    edit: (s) => {
      s.trades[0]!.initialRisk = 10000;
    },
  });
  const recent = await screen.findByRole('table', { name: 'Recent trades' });
  expect(within(recent).getAllByRole('row').slice(1)).toHaveLength(1);
});

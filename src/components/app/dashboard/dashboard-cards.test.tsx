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
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { METRIC_IDS } from '@/content/metric-definitions';
import { resolveInstrument } from '@/domain/instruments';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import { USER_WORKSPACE } from '@/data/workspaces';
import type { ImportJob, Trade } from '@/domain/types';
import type { SampleWorkspace } from '@/data/seed/generate';
import { strategyRules, type UserPrefs } from '@/domain/types';
import { keepHyphens } from '@/lib/format';
import { dashboardFixture } from '../__fixtures__/dashboard-sample';
import { renderApp } from '../__fixtures__/render-app';
import { DashboardView } from './dashboard-view';
import { ProgressCard } from './progress-card';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

// As in dashboard-view.test.tsx: animations finish at once here.
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

/** No 0% that isn't part of a larger figure (50.0% and 40% are fine), and no NaN. */
const ZERO_OR_NAN = /(?<![\d.])0%|NaN/;

/**
 * The Dashboard over `dashboardFixture`, in New York, with `prefs` on top.
 * Weeks start on Monday here.
 */
async function renderDashboard(
  opts: {
    graded?: boolean;
    prefs?: Partial<UserPrefs>;
    /** Leave weekStart unset: the default, Sunday weeks. */
    defaultWeek?: boolean;
    edit?: (s: SampleWorkspace) => void;
    url?: string;
    patch?: (repo: Repository) => Partial<Repository>;
  } = {},
) {
  const base = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const s = dashboardFixture({ graded: opts.graded ?? true });
      opts.edit?.(s);
      return s;
    },
  });
  await base.prefs.update({
    timeZone: 'America/New_York',
    ...(opts.defaultWeek ? {} : { weekStart: 'monday' as const }),
    ...opts.prefs,
  });
  const repository = { ...base, ...opts.patch?.(base) };
  return renderApp(<DashboardView />, { repository, url: opts.url });
}

const trackerCard = () =>
  screen.findByRole('region', { name: 'Progress tracker' });

test("the card shows today's score and links to the tracker", async () => {
  await renderDashboard();
  const card = await trackerCard();
  await waitFor(() => expect(card.textContent).toMatch(/\d+ of \d+ rules met/));
  expect(
    within(card)
      .getByRole('link', { name: 'Open tracker' })
      .getAttribute('href'),
  ).toBe('/app/progress');
  expect(
    within(card).getByRole('button', { name: 'About the progress tracker' })
      .dataset.metricTip,
  ).toBe('tracker-card');
  // The grid is there, today's square is not marked, and there is no paging.
  expect(within(card).getByRole('grid')).toBeTruthy();
  expect(card.querySelector('[data-today]')).toBeNull();
  expect(
    within(card).queryByRole('button', { name: 'Earlier weeks' }),
  ).toBeNull();
});

test('Open tracker keeps the date range and the account selection', async () => {
  await renderDashboard({
    url: '/app/dashboard?from=2026-11-02&to=2026-11-19&account=acc-b',
  });
  const card = await trackerCard();
  expect(
    within(card)
      .getByRole('link', { name: 'Open tracker' })
      .getAttribute('href'),
  ).toBe('/app/progress?from=2026-11-02&to=2026-11-19&account=acc-b');
});

test('the checklist link keeps the date range and the account selection', async () => {
  await renderDashboard({
    url: '/app/dashboard?from=2026-11-02&to=2026-11-19&account=acc-b',
  });
  const card = await trackerCard();
  expect(
    (
      await within(card).findByRole('link', { name: "Today's checklist" })
    ).getAttribute('href'),
  ).toBe(
    '/app/day/2026-11-19/plan?from=2026-11-02&to=2026-11-19&account=acc-b',
  );
});

test('a non-trading today reads 0 of 0 rules met, with the grid and no caption line', async () => {
  await renderDashboard({
    edit: (s) => {
      // Saturday 21 Nov.
      s.tracker = { ...s.tracker, asOf: '2026-11-21' };
    },
  });
  const card = await trackerCard();
  await waitFor(() => expect(card.textContent).toContain('0 of 0 rules met'));
  expect(card.textContent).not.toContain('No rules apply');
  expect(within(card).getByRole('grid')).toBeTruthy();
  expect(card.textContent).not.toContain("Blank days aren't scored");
});

test('while it loads the card shows a skeleton and no figures', () => {
  renderApp(<ProgressCard />, {
    repository: createLocalRepository({
      indexedDB: new IDBFactory(),
      IDBKeyRange,
      sample: async () => fixtureSample(),
    }),
  });
  const card = screen.getByRole('region', { name: 'Progress tracker' });
  expect(card.textContent).not.toMatch(/\d|None|rules met/);
  expect(within(card).queryByRole('grid')).toBeNull();
});

test("its checklist button opens today's day page in plan mode", async () => {
  await renderDashboard();
  const card = await trackerCard();
  const checklist = await within(card).findByRole('link', {
    name: "Today's checklist",
  });
  expect(checklist.getAttribute('href')).toBe('/app/day/2026-11-19/plan'); // the sample's own today (Tracker.asOf)
});

test('the dashboard has no Goals region', async () => {
  await renderDashboard();
  await trackerCard();
  expect(screen.queryByRole('region', { name: 'Goals' })).toBeNull();
  expect(screen.queryByText(/Weekly net goal|Daily loss limit/)).toBeNull();
});

test('performance follows the basis', async () => {
  await renderDashboard();
  const perf = await screen.findByRole('region', { name: 'Performance' });
  const pnl = within(perf).getByTestId('kpi-pnl');
  expect(pnl.textContent).toContain('Net P&L');
  expect(pnl.textContent).toContain('+$200.00');
  expect(perf.textContent).toContain('Win rate');
  expect(perf.textContent).toContain('50.0%');
  expect(perf.textContent).toContain('Profit factor');
  expect(perf.textContent).toContain('1.50');
  expect(perf.textContent).toContain('Expectancy');
  expect(perf.textContent).toContain('+$100.00');
  expect(
    within(perf).getByRole('img', {
      name: 'Equity, from $50,000.00 to $50,200.00',
    }),
  ).toBeTruthy();
  expect(
    within(perf).getByRole('button', { name: 'Equity' }).dataset.metricTip,
  ).toBe('equity');
});

test('gross drives the KPIs and the equity line', async () => {
  await renderDashboard({ prefs: { pnlBasis: 'gross' } });
  const perf = await screen.findByRole('region', { name: 'Performance' });
  const pnl = within(perf).getByTestId('kpi-pnl');
  expect(pnl.textContent).toContain('Gross P&L');
  expect(pnl.textContent).toContain('+$210.00');
  expect(
    within(perf).getByRole('img', {
      name: 'Equity, from $50,000.00 to $50,210.00',
    }),
  ).toBeTruthy();
  const table = screen.getByRole('table', { name: 'Recent trades' });
  expect(
    within(table).getByRole('columnheader', { name: 'Gross P&L' }),
  ).toBeTruthy();
  expect(table.textContent).toContain('−$395.00');
});

test('a missing profit factor reads None', async () => {
  await renderDashboard({
    edit: (s) => {
      const f1 = s.trades.find((t) => t.id === 'f-1')!;
      f1.net = 40_000;
      f1.gross = 40_500;
    },
  });
  const perf = await screen.findByRole('region', { name: 'Performance' });
  const pf = within(perf)
    .getByRole('button', { name: 'Profit factor' })
    .closest('[data-kpi]')!;
  expect(pf.textContent).toContain('None');
  expect(perf.textContent).not.toMatch(/NaN|Infinity/);
});

test('recent trades: newest first, with the rules column', async () => {
  await renderDashboard();
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
  await renderDashboard({
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
  await renderDashboard({
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

test('ungraded imports still show performance and trades (Review Focus 1)', async () => {
  await renderDashboard({ graded: false });
  const pnl = await screen.findByTestId('kpi-pnl');
  expect(pnl.textContent).toContain('+$200.00');
  const perf = screen.getByRole('region', { name: 'Performance' });
  expect(perf.textContent).toContain('50.0%');
  expect(perf.textContent).toContain('1.50');
  const rows = within(screen.getByRole('table', { name: 'Recent trades' }))
    .getAllByRole('row')
    .slice(1);
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.textContent).toContain('Not graded');
    expect(row.textContent).toContain('None');
  }
  expect(rows[0]!.textContent).toContain('−$400.00');
  const ready = screen.getByTestId('dashboard-ready');
  expect(ready.textContent).not.toMatch(ZERO_OR_NAN);
});

test('every metric carries its definition', async () => {
  await renderDashboard();
  const tips = (root: Element) =>
    [...root.querySelectorAll('[data-metric-tip]')].map(
      (e) => (e as HTMLElement).dataset.metricTip,
    );
  const ids = tips(await screen.findByTestId('dashboard-ready'));
  // A rule's drill-down carries the last: its Kept column.
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(`^${r1}\\.`) }),
  );
  ids.push(...tips(await screen.findByRole('dialog')));
  // Defined ahead of the screens that show them (Plan 5, later tasks).
  const notOnDashboard = new Set<string>([
    'trades',
    'net-roi',
    'realized-r',
    'planned-r',
    'mae',
    'mfe',
    'sharpe',
    'sortino',
    'longest-day',
    'day-streaks',
    // Plotted on Reports, Performance (Task 25).
    'longest-trade',
    'avg-day-length',
    'long-trades',
    'short-trades',
    'long-win-rate',
    'short-win-rate',
    'green-day-streak',
    'red-day-streak',
    // On the calendar (Task 13, Task 30).
    'day-ticks',
    'day-pips',
    'day-points',
    'day-rating',
    'trading-days',
    'green-days',
    'best-day',
    'worst-day',
    'fees',
    'gross-pnl',
    'net-pnl',
    // On the reports (Task 14).
    'cumulative-pnl',
    'avg-win',
    'avg-loss',
    'largest-win',
    'largest-loss',
    'max-drawdown',
    'win-streak',
    'loss-streak',
    // On the reports (Task 15).
    'avg-duration',
    'avg-size',
    'long-share',
    'no-stop',
    'r-expectancy',
    'avg-trade',
    // On the Overview's Days card (fix round 1).
    'avg-green-day',
    'avg-red-day',
    'trades-per-day',
    // On the Overview's month, count, day, hold and cost cards (Task 23).
    'best-month',
    'worst-month',
    'avg-month',
    'winners',
    'losers',
    'breakevens',
    'open-trades',
    'green-day-count',
    'red-day-count',
    'flat-day-count',
    'logged-days',
    'avg-daily-pnl',
    'avg-daily-win-loss',
    'largest-green-day',
    'largest-red-day',
    'avg-daily-volume',
    'avg-drawdown',
    'avg-drawdown-pct',
    'hold-time',
    'hold-time-wins',
    'hold-time-losses',
    'hold-time-breakevens',
    'commissions',
    'fill-fees',
    // In the Performance picker only (completion round A).
    'daily-drawdown',
    'account-balance',
    'long-winners',
    'long-losers',
    'long-breakevens',
    'long-open-trades',
    'short-winners',
    'short-losers',
    'short-breakevens',
    'short-open-trades',
    // On a strategy's rules (Task 16).
    'rule-follow-rate',
    'rule-followed-pnl',
    'rule-followed-win-rate',
    'rule-followed-pf',
    // On the progress tracker (Plan 6A Task 7).
    'tracker-streak',
    'tracker-score',
    'tracker-today',
    'rule-streak',
    'rule-average',
    'tracker-follow-rate',
    'tracker-history',
    // On a trade note's stats card (Task 21).
    'volume',
    // On a challenge's card (Task 19).
    'prop-profit',
    'prop-profit-funded',
    'prop-drawdown-left',
    'prop-daily-loss',
    'prop-trading-days',
    'prop-consistency',
  ]);
  expect(new Set(ids)).toEqual(
    new Set(METRIC_IDS.filter((id) => !notOnDashboard.has(id))),
  );
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
  await renderDashboard();
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  expect(table).toBeTruthy();
  const group = screen.getByRole('radiogroup', { name: 'Recent trades view' });
  expect(
    within(group)
      .getAllByRole('radio')
      .map((r) => (r as HTMLInputElement).labels?.[0]?.textContent),
  ).toEqual(['Closed', 'Open positions']);
});

test('open positions: each open trade with its quantity, entry and realized P&L from a partial exit', async () => {
  await renderDashboard({
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
  await renderDashboard({
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
  await renderDashboard();
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
  await renderDashboard({
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
  await renderDashboard({
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
  await renderDashboard({
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
  await renderDashboard({
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

test('the performance card adds the day win rate and the average win to loss', async () => {
  await renderDashboard();
  const perf = await screen.findByRole('region', { name: 'Performance' });
  const day = within(perf)
    .getByRole('button', { name: 'Day win rate' })
    .closest('[data-kpi]')!;
  // 18 Nov green, 19 Nov red.
  expect(day.textContent).toContain('50.0%');
  expect(day.textContent).toContain('1 green, 1 red, 0 flat');
  const wl = within(perf)
    .getByRole('button', { name: 'Average win to loss' })
    .closest('[data-kpi]')!;
  expect(wl.textContent).toContain('1.50');
  expect(wl.textContent).toContain('+$600.00');
  expect(wl.textContent).toContain('−$400.00');
});

test('with no loss the average win to loss reads None', async () => {
  await renderDashboard({
    edit: (s) => {
      const f1 = s.trades.find((t) => t.id === 'f-1')!;
      f1.net = 40_000;
      f1.gross = 40_500;
    },
  });
  const perf = await screen.findByRole('region', { name: 'Performance' });
  const wl = within(perf)
    .getByRole('button', { name: 'Average win to loss' })
    .closest('[data-kpi]')!;
  expect(wl.textContent).toContain('None');
  expect(wl.textContent).not.toMatch(/NaN|Infinity/);
});

test('the win to loss ratio is the two amounts beside it, in the unit', async () => {
  // In ticks: a 20-tick loser (f-1) and a 10-tick winner (f-2); in dollars 600 over 400.
  await renderDashboard({
    prefs: { displayUnit: 'ticks' },
    edit: (s) => {
      const f1 = s.trades.find((t) => t.id === 'f-1')!;
      f1.avgExit = 5995;
      const f2 = s.trades.find((t) => t.id === 'f-2')!;
      f2.avgEntry = 6010;
      f2.avgExit = 6007.5;
    },
  });
  const perf = await screen.findByRole('region', { name: 'Performance' });
  const wl = within(perf)
    .getByRole('button', { name: 'Average win to loss' })
    .closest('[data-kpi]')!;
  expect(wl.textContent).toContain('+10.0 ticks');
  expect(wl.textContent).toContain('−20.0 ticks');
  expect(wl.textContent).toContain('0.50');
  expect(wl.textContent).not.toContain('1.50');
});

const job = (p: Partial<ImportJob>): ImportJob => ({
  id: 'job',
  workspaceId: USER_WORKSPACE.id,
  accountId: 'u-acc',
  fileName: 'x.csv',
  mapping: {} as ImportJob['mapping'],
  rowCount: 1,
  tradeCount: 1,
  skippedCount: 0,
  duplicateCount: 0,
  status: 'active',
  createdAt: '2026-11-10T14:30:00.000Z',
  ...p,
});

function withImports(jobs: ImportJob[]) {
  return (repo: Repository): Partial<Repository> => ({
    imports: { ...repo.imports, list: async () => jobs },
    accounts: {
      ...repo.accounts,
      list: async (ws: string) =>
        ws === USER_WORKSPACE.id
          ? [
              {
                id: 'u-acc',
                workspaceId: ws,
                name: 'Live ES',
                broker: 'B',
                type: 'live' as const,
                currency: 'USD',
                startingBalance: 0,
                status: 'active' as const,
              },
            ]
          : repo.accounts.list(ws),
    },
  });
}

test('the last import line names the newest import that is not undone, with its account and a link', async () => {
  await renderDashboard({
    patch: withImports([
      job({ id: 'a', createdAt: '2026-11-05T14:30:00.000Z' }),
      job({ id: 'b', createdAt: '2026-11-18T14:30:00.000Z' }),
      job({
        id: 'c',
        createdAt: '2026-11-19T14:30:00.000Z',
        status: 'undone',
      }),
    ]),
  });
  const ready = await screen.findByTestId('dashboard-ready');
  const line = await within(ready).findByText(/Last import/);
  expect(line.textContent).toContain('18 Nov 09:30');
  expect(line.textContent).toContain('Live ES');
  expect(line.textContent).not.toContain('19 Nov');
  expect(
    within(ready)
      .getByRole('link', { name: 'Import history' })
      .getAttribute('href'),
  ).toBe('/app/settings/import-history');
});

test('with no import, or only undone ones, there is no last import line', async () => {
  await renderDashboard({
    patch: withImports([job({ status: 'undone' })]),
  });
  const ready = await screen.findByTestId('dashboard-ready');
  await new Promise((r) => setTimeout(r, 20));
  expect(ready.textContent).not.toContain('Last import');
  expect(
    within(ready).queryByRole('link', { name: 'Import history' }),
  ).toBeNull();
});

test('the last import line waits for the account name instead of jumping', async () => {
  await renderDashboard({
    patch: (repo) => ({
      imports: { ...repo.imports, list: async () => [job({})] },
      accounts: {
        ...repo.accounts,
        list: async (ws: string) =>
          ws === USER_WORKSPACE.id
            ? new Promise<never>(() => {})
            : repo.accounts.list(ws),
      },
    }),
  });
  const ready = await screen.findByTestId('dashboard-ready');
  await new Promise((r) => setTimeout(r, 30));
  expect(ready.textContent).not.toContain('Last import');
});

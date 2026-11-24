// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { METRIC_IDS } from '@/content/metric-definitions';
import { createLocalRepository } from '@/data/local/local-repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import type { SampleWorkspace } from '@/data/seed/generate';
import { resolveInstrument } from '@/domain/instruments';
import type { Execution, JournalEntry, Trade } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { reportsSample } from '../__fixtures__/reports-sample';
import { OverviewView } from './overview';
import { Stat } from './overview-stat';
import type { ReportData } from './use-report-data';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const URL = '/app/reports';

const fill = (
  side: 'buy' | 'sell',
  price: number,
  time: string,
  fees: number,
  commission: number,
): Execution => ({
  id: `e-${side}`,
  accountId: 'acc-a',
  symbol: 'ESZ5',
  side,
  qty: 1,
  price,
  time,
  fees,
  commission,
});

const entry = (id: string, over: Partial<JournalEntry> = {}): JournalEntry => ({
  id,
  workspaceId: SAMPLE_WORKSPACE.id,
  kind: 'daily-review',
  title: id,
  body: null,
  linkedTradeIds: [],
  tags: [],
  updatedAt: '2026-11-06T00:00:00Z',
  ...over,
});

/**
 * The nine report trades (Mon 2 to Thu 5 Nov, New York), each one lot:
 * r-0 held 20 minutes with fills (+$100 gross, $1.50 commission, $0.50 fees:
 * +$98.00 net), r-5 a breakeven held 30 minutes, the rest an hour, and an open
 * trade. Daily notes on Mon and Tue, one in the trash on Wed, a pre-market on Thu.
 */
async function figuresSample(): Promise<SampleWorkspace> {
  const s = await reportsSample();
  const trades: Trade[] = s.trades.map((t) => ({ ...t, maxPosition: 1 }));
  const r0 = trades[0]!;
  trades[0] = {
    ...r0,
    openedAt: '2026-11-02T15:00:00Z',
    closedAt: '2026-11-02T15:20:00Z',
    avgEntry: 4500,
    avgExit: 4502,
    gross: 10000,
    fees: 200,
    net: 9800,
    instrument: resolveInstrument('ESZ5')!,
    executions: [
      fill('buy', 4500, '2026-11-02T15:00:00Z', 25, 75),
      fill('sell', 4502, '2026-11-02T15:20:00Z', 25, 75),
    ],
  };
  trades[5] = {
    ...trades[5]!,
    net: 0,
    gross: 0,
    closedAt: '2026-11-04T15:30:00Z',
  };
  const { closedAt: _closed, ...open } = trades[8]!;
  void _closed;
  trades.push({
    ...open,
    id: 'r-open',
    serial: 10,
    status: 'open',
    net: 0,
    gross: 0,
  });
  s.trades = trades;
  s.journal = [
    entry('d-1', { date: '2026-11-02' }),
    entry('d-2', { date: '2026-11-03' }),
    entry('d-3', { date: '2026-11-04', deletedAt: '2026-11-05T00:00:00Z' }),
    entry('d-4', { date: '2026-11-05', kind: 'pre-market' }),
  ];
  return s;
}

async function page() {
  renderApp(<OverviewView />, { sample: figuresSample, url: URL });
  return screen.findByTestId('reports-overview');
}
const stat = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-stat="${id}"]`)!.textContent;
const NEW_IDS = [
  'best-month',
  'worst-month',
  'avg-month',
  'winners',
  'losers',
  'breakevens',
  'open-trades',
  'trading-days',
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
];

test('the months: best, lowest and the average, each named', async () => {
  const root = await page();
  const card = within(root).getByRole('region', { name: 'Months' });
  // Mon +58, Tue +100, Wed -60, Thu +45: one month at +$143.00.
  expect(stat(card, 'best-month')).toContain('+$143.00');
  expect(stat(card, 'best-month')).toContain('Nov 2026');
  expect(stat(card, 'worst-month')).toContain('+$143.00');
  expect(stat(card, 'worst-month')).toContain('Nov 2026');
  expect(stat(card, 'avg-month')).toContain('+$143.00');
  expect(stat(card, 'avg-month')).toContain('1 month');
});

test('the trade counts: winners, losers, breakevens and open trades', async () => {
  const root = await page();
  const card = within(root).getByRole('region', { name: 'Trade counts' });
  expect(stat(card, 'winners')).toBe('5');
  expect(stat(card, 'losers')).toBe('3');
  expect(stat(card, 'breakevens')).toBe('1');
  expect(stat(card, 'open-trades')).toBe('1');
});

test('the day counts: trading, green, red and flat days, and the days with a daily note', async () => {
  const root = await page();
  const card = within(root).getByRole('region', { name: 'Day counts' });
  expect(stat(card, 'trading-days')).toBe('4');
  expect(stat(card, 'green-day-count')).toBe('3');
  expect(stat(card, 'red-day-count')).toBe('1');
  expect(stat(card, 'flat-day-count')).toBe('0');
  // Mon and Tue have a daily note; Wed's is in the trash and Thu's is not a daily one.
  await vi.waitFor(() => expect(stat(card, 'logged-days')).toBe('2'));
});

test('Privacy hides the average daily win to loss with the amounts beside it', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: figuresSample,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<OverviewView />, { repository, url: URL });
  const root = await screen.findByTestId('reports-overview');
  const card = within(root).getByRole('region', { name: 'Day figures' });
  expect(stat(card, 'avg-daily-win-loss')).toContain('•••');
  expect(stat(card, 'avg-daily-win-loss')).not.toContain('1.13');
  expect(stat(card, 'avg-daily-win-loss')).toContain('hidden ratio');
});

test('the day figures: averages, largest days, volume and the average drawdown', async () => {
  const root = await page();
  const card = within(root).getByRole('region', { name: 'Day figures' });
  // 143 over four days.
  expect(stat(card, 'avg-daily-pnl')).toContain('+$35.75');
  // Average green day 67.67 over the 60.00 red day.
  expect(stat(card, 'avg-daily-win-loss')).toContain('1.13');
  expect(stat(card, 'avg-daily-win-loss')).toContain('+$67.67');
  expect(stat(card, 'avg-daily-win-loss')).toContain('−$60.00');
  expect(stat(card, 'largest-green-day')).toContain('+$100.00');
  expect(stat(card, 'largest-green-day')).toContain('Tue 3 Nov');
  expect(stat(card, 'largest-red-day')).toContain('−$60.00');
  expect(stat(card, 'largest-red-day')).toContain('Wed 4 Nov');
  // Ten trades of one lot over four days.
  expect(stat(card, 'avg-daily-volume')).toContain('2.5');
  // Wed closed $60.00 under the Tue peak and Thu $15.00 under it: $37.50 on average.
  expect(stat(card, 'avg-drawdown')).toContain('−$37.50');
  expect(stat(card, 'avg-drawdown-pct')).toContain('−');
  expect(stat(card, 'avg-drawdown-pct')).toContain('%');
});

test('the hold times: all trades, winners, losers and breakevens', async () => {
  const root = await page();
  const card = within(root).getByRole('region', { name: 'Hold time' });
  // r-0 20m, r-5 30m, seven others an hour, the open trade not counted.
  expect(stat(card, 'hold-time')).toBe('52m 13s');
  expect(stat(card, 'hold-time-wins')).toBe('52m 00s');
  expect(stat(card, 'hold-time-losses')).toBe('1h 0m');
  expect(stat(card, 'hold-time-breakevens')).toBe('30m 00s');
});

test('the costs: commissions and fees as separate totals', async () => {
  const root = await page();
  const card = within(root).getByRole('region', { name: 'Costs' });
  // Costs are signed negative, as the rest of the page signs them.
  expect(stat(card, 'commissions')).toBe('−$1.50');
  expect(stat(card, 'fill-fees')).toBe('−$0.50');
});

test('every new label carries its definition', async () => {
  const root = await page();
  for (const id of NEW_IDS) {
    expect(METRIC_IDS as readonly string[], id).toContain(id);
    expect(root.querySelector(`[data-metric-tip="${id}"]`), id).not.toBeNull();
  }
});

test('the largest win and the largest loss link to their trades', async () => {
  const root = await page();
  const link = (kpi: string) =>
    root.querySelector<HTMLAnchorElement>(`[data-kpi="${kpi}"] a`);
  expect(link('largest-win')?.getAttribute('href')).toBe('/app/trades/r-0');
  expect(link('largest-loss')?.getAttribute('href')).toBe('/app/trades/r-4');
});

test('the largest green and red days link to that day on the calendar', async () => {
  const root = await page();
  const card = within(root).getByRole('region', { name: 'Day figures' });
  const link = (id: string) =>
    card.querySelector<HTMLAnchorElement>(`[data-stat="${id}"] a`);
  expect(link('largest-green-day')?.getAttribute('href')).toBe(
    '/app/calendar?month=2026-11&day=2026-11-03',
  );
  expect(link('largest-red-day')?.getAttribute('href')).toBe(
    '/app/calendar?month=2026-11&day=2026-11-04',
  );
});

test('the links keep the page filters', async () => {
  renderApp(<OverviewView />, {
    sample: figuresSample,
    url: `${URL}?side=long`,
  });
  const root = await screen.findByTestId('reports-overview');
  const href = root
    .querySelector<HTMLAnchorElement>('[data-stat="largest-green-day"] a')!
    .getAttribute('href')!;
  expect(new URLSearchParams(href.split('?')[1]).get('side')).toBe('long');
});

test('with no daily note, no loss and no fills the figures say None', async () => {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const s = await reportsSample();
      s.trades = s.trades.filter((t) => t.net > 0);
      return s;
    },
  });
  renderApp(<OverviewView />, { repository: repo, url: URL });
  const root = await screen.findByTestId('reports-overview');
  const days = within(root).getByRole('region', { name: 'Day figures' });
  expect(stat(days, 'avg-daily-win-loss')).toContain('None');
  expect(stat(days, 'largest-red-day')).toContain('None');
  expect(stat(days, 'avg-drawdown')).toContain('None');
  expect(stat(days, 'avg-drawdown-pct')).toContain('None');
  const hold = within(root).getByRole('region', { name: 'Hold time' });
  expect(stat(hold, 'hold-time-losses')).toContain('None');
  expect(stat(hold, 'hold-time-breakevens')).toContain('None');
});

test('Privacy masks every new amount and the money ratios, and keeps the counts', async () => {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: figuresSample,
  });
  await repo.prefs.update({ displayUnit: 'privacy' });
  renderApp(<OverviewView />, { repository: repo, url: URL });
  const root = await screen.findByTestId('reports-overview');
  expect(root.textContent).not.toMatch(/\$\d/);
  const days = within(root).getByRole('region', { name: 'Day figures' });
  // The ratio is built from money, so Privacy hides it as it hides the amounts.
  expect(stat(days, 'avg-daily-win-loss')).not.toContain('1.13');
  expect(stat(days, 'avg-daily-win-loss')).toContain('•••');
  expect(
    stat(within(root).getByRole('region', { name: 'Costs' }), 'commissions'),
  ).toContain('$•••');
});

/** The nine trades in ticks (ES, one lot each): Mon +8 -4, Tue +6 +3, Wed -5 0, Thu +4 -2 +2. */
const TICKS = [8, -4, 6, 3, -5, 0, 4, -2, 2];
async function ticksSample(): Promise<SampleWorkspace> {
  const s = await figuresSample();
  s.trades = s.trades.map((t, i) => {
    const ticks = TICKS[i];
    if (ticks === undefined || i === 0) return { ...t, initialRisk: 5000 };
    const sign = t.direction === 'long' ? 1 : -1;
    return {
      ...t,
      instrument: resolveInstrument('ESZ5')!,
      avgEntry: 4500,
      avgExit: 4500 + sign * ticks * 0.25,
      initialRisk: 5000,
    };
  });
  return s;
}
async function inUnit(unit: 'ticks' | 'r') {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: ticksSample,
  });
  await repo.prefs.update({ displayUnit: unit });
  return repo;
}

test('in Ticks the months, day averages and largest days read ticks, and still link to their days', async () => {
  renderApp(<OverviewView />, {
    repository: await inUnit('ticks'),
    url: URL,
  });
  const root = await screen.findByTestId('reports-overview');
  const months = within(root).getByRole('region', { name: 'Months' });
  expect(stat(months, 'best-month')).toContain('+12.0 ticks');
  expect(stat(months, 'avg-month')).toContain('+12.0 ticks');
  const card = within(root).getByRole('region', { name: 'Day figures' });
  // Days +4, +9, -5, +4 ticks: 12 over four days.
  expect(stat(card, 'avg-daily-pnl')).toContain('+3.0 ticks');
  // Green days average 5.67 ticks over the 5.0 of the red day.
  expect(stat(card, 'avg-daily-win-loss')).toContain('1.13');
  expect(stat(card, 'avg-daily-win-loss')).toContain('+5.7 ticks');
  expect(stat(card, 'largest-green-day')).toContain('+9.0 ticks');
  expect(stat(card, 'largest-red-day')).toContain('−5.0 ticks');
  const link = (id: string) =>
    card.querySelector<HTMLAnchorElement>(`[data-stat="${id}"] a`);
  expect(link('largest-green-day')?.getAttribute('href')).toBe(
    '/app/calendar?month=2026-11&day=2026-11-03',
  );
  expect(link('largest-red-day')?.getAttribute('href')).toBe(
    '/app/calendar?month=2026-11&day=2026-11-04',
  );
  // Costs stay in money.
  expect(
    stat(within(root).getByRole('region', { name: 'Costs' }), 'commissions'),
  ).toBe('−$1.50');
});

test('in R the month and day figures read R', async () => {
  renderApp(<OverviewView />, { repository: await inUnit('r'), url: URL });
  const root = await screen.findByTestId('reports-overview');
  const months = within(root).getByRole('region', { name: 'Months' });
  expect(stat(months, 'best-month')).toContain('+2.86R');
  const card = within(root).getByRole('region', { name: 'Day figures' });
  expect(stat(card, 'largest-green-day')).toContain('+2.00R');
  expect(stat(card, 'largest-red-day')).toContain('−1.20R');
});

test('logged days shows a loading state, not None, while the journal loads', async () => {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: figuresSample,
  });
  const journal = { ...repo.journal, list: () => new Promise<never>(() => {}) };
  renderApp(<OverviewView />, {
    repository: { ...repo, journal } as typeof repo,
    url: URL,
  });
  const root = await screen.findByTestId('reports-overview');
  const cell = root.querySelector('[data-stat="logged-days"]')!;
  expect(cell.textContent).not.toContain('None');
  expect(
    within(cell as HTMLElement)
      .getByRole('status')
      .getAttribute('aria-label'),
  ).toBe('Loading logged days');
});

test('logged days says so when the journal fails to load', async () => {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: figuresSample,
  });
  const journal = {
    ...repo.journal,
    list: () => Promise.reject(new Error('no journal')),
  };
  renderApp(<OverviewView />, {
    repository: { ...repo, journal } as typeof repo,
    url: URL,
  });
  const root = await screen.findByTestId('reports-overview');
  await vi.waitFor(() =>
    expect(
      root.querySelector('[data-stat="logged-days"]')!.textContent,
    ).toContain('Could not load'),
  );
});

test('a figure of 0 keeps its link', () => {
  const { container } = render(
    <Stat
      id="avg-daily-pnl"
      data={{ basis: 'net' } as ReportData}
      href="/app/calendar?day=2026-11-03"
      linkLabel="Open the day"
    >
      {0}
    </Stat>,
  );
  expect(container.querySelector('a')?.getAttribute('href')).toBe(
    '/app/calendar?day=2026-11-03',
  );
});

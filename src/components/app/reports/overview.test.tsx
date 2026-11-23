// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { METRIC_IDS } from '@/content/metric-definitions';
import { createLocalRepository } from '@/data/local/local-repository';
import { breakdownSample } from '../__fixtures__/breakdown-sample';
import { renderApp } from '../__fixtures__/render-app';
import { reportsSample } from '../__fixtures__/reports-sample';
import { OverviewView } from './overview';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const URL = '/app/reports';
const KPIS = [
  'pnl',
  'win-rate',
  'profit-factor',
  'expectancy',
  'avg-win',
  'avg-loss',
  'largest-win',
  'largest-loss',
  'max-drawdown',
  'win-streak',
  'loss-streak',
  'green-days',
  'sharpe',
  'sortino',
];

async function ready() {
  return screen.findByTestId('reports-overview');
}

test('the 14 KPIs render, each with its metric tip', async () => {
  renderApp(<OverviewView />, { sample: reportsSample, url: URL });
  const page = await ready();
  const kpis = within(
    within(page).getByRole('region', { name: 'Key figures' }),
  );
  const cells = [...page.querySelectorAll('[data-kpi]')] as HTMLElement[];
  expect(cells.map((c) => c.dataset.kpi)).toEqual(KPIS);
  for (const cell of cells)
    expect(
      cell.querySelector(`[data-metric-tip="${cell.dataset.kpi}"]`),
      cell.dataset.kpi,
    ).not.toBeNull();
  // Net +$125.00 on 9 trades: 5 wins, 4 losses.
  expect(kpis.getByText('+$125.00')).toBeTruthy();
  expect(page.querySelector('[data-kpi="win-rate"]')!.textContent).toContain(
    '55.6%',
  );
});

test('the long and short columns count every closed trade', async () => {
  renderApp(<OverviewView />, { sample: reportsSample, url: URL });
  const table = within(
    await screen.findByRole('table', { name: 'Long and short' }),
  );
  const row = table.getByRole('row', { name: /^Trades/ });
  const counts = within(row)
    .getAllByRole('cell')
    .map((c) => Number(c.textContent));
  expect(counts).toEqual([5, 4]);
  expect(counts[0]! + counts[1]!).toBe(9);
  const long = within(table.getByRole('row', { name: /^Net P&L/ }))
    .getAllByRole('cell')
    .map((c) => c.textContent);
  expect(long).toEqual(['+$105.00', '+$20.00']);
});

test('two charts, by realization date, and both are labelled', async () => {
  renderApp(<OverviewView />, { sample: reportsSample, url: URL });
  const page = await ready();
  expect(
    within(page).getByRole('img', { name: /Cumulative net P&L/ }),
  ).toBeTruthy();
  expect(within(page).getByRole('img', { name: /Daily net P&L/ })).toBeTruthy();
});

test('every metric on the page has a definition, and the six held back from the dashboard are here', async () => {
  renderApp(<OverviewView />, { sample: reportsSample, url: URL });
  const page = await ready();
  const ids = new Set(
    [...page.querySelectorAll('[data-metric-tip]')].map(
      (e) => (e as HTMLElement).dataset.metricTip!,
    ),
  );
  for (const id of ids) expect(METRIC_IDS as readonly string[]).toContain(id);
  for (const id of [
    ...KPIS,
    'net-roi',
    'sharpe',
    'sortino',
    'avg-daily-win-rate',
    'longest-day',
    'day-streaks',
  ])
    expect(ids.has(id), id).toBe(true);
});

test('Privacy leaves no dollar amount anywhere on the page', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: reportsSample,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  const { container } = renderApp(<OverviewView />, {
    repository,
    url: URL,
  });
  await ready();
  expect(container.textContent).toContain('$•••');
  expect(container.textContent).not.toMatch(/\$\d/);
  expect(container.innerHTML).not.toMatch(/aria-label="[^"]*\$\d/);
});

test('an empty workspace says so instead of drawing zeros', async () => {
  renderApp(<OverviewView />, {
    sample: async () => ({ ...(await reportsSample()), trades: [] }),
    url: URL,
  });
  expect(
    await screen.findByText(/No trades in this workspace yet/),
  ).toBeTruthy();
  expect(screen.queryByTestId('reports-overview')).toBeNull();
});

/** The breakdown workspace with $5.00 of fees on its first trade (gross $105.00, net $100.00). */
async function withFees() {
  const s = await breakdownSample();
  s.trades[0] = { ...s.trades[0]!, gross: 10500, fees: 500 };
  return s;
}

const stat = (page: HTMLElement, id: string) =>
  page.querySelector(`[data-stat="${id}"]`)!.textContent;

test('Gross to net shows gross, fees and net, and how much the fees took', async () => {
  renderApp(<OverviewView />, { sample: withFees, url: URL });
  const page = await ready();
  const card = within(page).getByRole('region', { name: 'Gross to net' });
  expect(stat(card, 'gross-pnl')).toBe('+$130.00');
  expect(stat(card, 'fees')).toBe('−$5.00');
  expect(stat(card, 'net-pnl')).toBe('+$125.00');
  // 500 of 13,000.
  expect(within(card).getByText(/Fees took 3\.8% of gross/)).toBeTruthy();
  for (const id of ['gross-pnl', 'fees', 'net-pnl'])
    expect(page.querySelector(`[data-metric-tip="${id}"]`), id).not.toBeNull();
});

test('Risk in R shows planned and realized R, trades without a stop, and R expectancy', async () => {
  renderApp(<OverviewView />, { sample: breakdownSample, url: URL });
  const page = await ready();
  const card = within(page).getByRole('region', { name: 'Risk in R' });
  // One planned R of 2.00 (b-1), two realized R (+2 and -1), five trades with no stop.
  expect(stat(card, 'planned-r')).toContain('2.00R');
  expect(stat(card, 'planned-r')).toContain('1 trade');
  expect(stat(card, 'realized-r')).toContain('+0.50R');
  expect(stat(card, 'realized-r')).toContain('2 trades');
  expect(stat(card, 'no-stop')).toContain('5');
  expect(stat(card, 'r-expectancy')).toContain('+0.50R');
  for (const id of ['planned-r', 'realized-r', 'no-stop', 'r-expectancy'])
    expect(card.querySelector(`[data-metric-tip="${id}"]`), id).not.toBeNull();
});

test('the cumulative line carries the max drawdown band, and a clean run has none', async () => {
  const { container, unmount } = renderApp(<OverviewView />, {
    sample: breakdownSample,
    url: URL,
  });
  await ready();
  const band = container.querySelector('[data-band="drawdown"]');
  expect(band).not.toBeNull();
  expect(container.textContent).toContain('Max drawdown');
  unmount();
  const up = await breakdownSample();
  up.trades = up.trades.filter((t) => t.net > 0);
  const again = renderApp(<OverviewView />, {
    sample: async () => up,
    url: URL,
  });
  await screen.findAllByTestId('reports-overview');
  expect(again.container.querySelector('[data-band="drawdown"]')).toBeNull();
});

async function inUnit(unit: 'r' | 'privacy', sample = breakdownSample) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample,
  });
  await repository.prefs.update({ displayUnit: unit });
  return repository;
}

test('in R the average win and average loss read in R', async () => {
  renderApp(<OverviewView />, {
    repository: await inUnit('r'),
    url: URL,
  });
  const page = await ready();
  // Only b-1 (+2R) among the winners and b-2 (-1R) among the losers have a stop.
  expect(page.querySelector('[data-kpi="avg-win"]')!.textContent).toContain(
    '+2.00R',
  );
  expect(page.querySelector('[data-kpi="avg-loss"]')!.textContent).toContain(
    '−1.00R',
  );
});

test('both charts say the range and their key values, and Privacy hides the amounts', async () => {
  const { unmount } = renderApp(<OverviewView />, {
    sample: breakdownSample,
    url: URL,
  });
  const page = await ready();
  expect(
    within(page).getByRole('img', {
      name: /^Cumulative net P&L by day, all time\. Ends at \+\$125\.00/,
    }),
  ).toBeTruthy();
  // Best day Mon 2 Nov +$60.00, worst Wed 4 Nov +$15.00.
  expect(
    within(page).getByRole('img', {
      name: /^Daily net P&L bars, 3 days, all time\. Best .*\+\$60\.00, worst .*\+\$15\.00/,
    }),
  ).toBeTruthy();
  unmount();
  renderApp(<OverviewView />, {
    repository: await inUnit('privacy'),
    url: URL,
  });
  const hidden = await ready();
  expect(
    within(hidden).getByRole('img', {
      name: /^Cumulative net P&L by day, all time\. Ends at hidden amount/,
    }),
  ).toBeTruthy();
  expect(
    within(hidden).getByRole('img', {
      name: /^Daily net P&L bars, 3 days, all time\. Best .*hidden amount, worst .*hidden amount/,
    }),
  ).toBeTruthy();
});

test('the drawdown band is labelled as measured after each trade', async () => {
  const { container } = renderApp(<OverviewView />, {
    sample: breakdownSample,
    url: URL,
  });
  await ready();
  expect(container.textContent).toContain('Max drawdown after each trade');
});

// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { METRIC_IDS } from '@/content/metric-definitions';
import { createLocalRepository } from '@/data/local/local-repository';
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

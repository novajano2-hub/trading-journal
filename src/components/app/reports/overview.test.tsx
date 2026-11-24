// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
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

test('every metric on the page has a definition, and the five held back from the dashboard are here', async () => {
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
    'longest-day',
    'day-streaks',
  ])
    expect(ids.has(id), id).toBe(true);
});

test('the day win rate is shown once, as Day win rate: the winning-day share with the green, red and flat counts', async () => {
  renderApp(<OverviewView />, { sample: reportsSample, url: URL });
  const page = await ready();
  // Mon +60, Tue +100, Wed -80, Thu +45: three winning days of four.
  const cell = page.querySelector('[data-kpi="green-days"]')!;
  expect(cell.textContent).toContain('75.0%');
  expect(cell.textContent).toContain('3 green, 1 red, 0 flat');
  // The old mean of each day's trade win rate is gone, under any name.
  expect(page.querySelector('[data-stat="avg-daily-win-rate"]')).toBeNull();
  expect(page.textContent).not.toContain('Average daily win rate');
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

test('Privacy hides the profit factor, keeps the win rate', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: reportsSample,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<OverviewView />, { repository, url: URL });
  const page = await ready();
  const pf = page.querySelector('[data-kpi="profit-factor"]')!;
  expect(pf.textContent).toContain('•••');
  expect(pf.textContent).not.toMatch(/\d\.\d\d/);
  expect(within(pf as HTMLElement).getByText('hidden ratio')).toBeTruthy();
  expect(page.querySelector('[data-kpi="win-rate"]')!.textContent).toMatch(
    /\d%/,
  );
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

test('the cost rows say what they are: Commissions and fees in Gross to net, Commissions and Fees in Costs, signed in overview-figures', async () => {
  renderApp(<OverviewView />, { sample: withFees, url: URL });
  const page = await ready();
  const gross = within(page).getByRole('region', { name: 'Gross to net' });
  expect(within(gross).getByText('Commissions and fees')).toBeTruthy();
  expect(within(gross).queryByText('Fees')).toBeNull();
  const costs = within(page).getByRole('region', { name: 'Costs' });
  const labels = [...costs.querySelectorAll('[data-stat]')].map((el) =>
    el.previousElementSibling?.textContent?.trim(),
  );
  expect(labels).toEqual(['Commissions', 'Fees']);
});

test('trade and day counts read in neutral ink: gain and loss colour are for signed money', async () => {
  renderApp(<OverviewView />, { sample: reportsSample, url: URL });
  const page = await ready();
  for (const id of ['winners', 'losers', 'green-day-count', 'red-day-count']) {
    const el = page.querySelector(`[data-stat="${id}"]`)!;
    expect(el, id).not.toBeNull();
    expect(el.className, id).not.toMatch(/text-(gain|loss)/);
  }
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

/** The breakdown sample with Tuesday turned into a losing day: a daily fall of 9,000 after Monday's peak of 6,000. */
async function lossDaySample() {
  const s = await breakdownSample();
  s.trades = s.trades.map((t) =>
    t.id === 'b-3' ? { ...t, net: -7000, gross: -7000 } : t,
  );
  return s;
}

test('the cumulative line carries the max drawdown band, and a clean run has none', async () => {
  const { container, unmount } = renderApp(<OverviewView />, {
    sample: lossDaySample,
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

async function inUnit(
  unit: 'r' | 'privacy' | 'ticks',
  sample = breakdownSample,
) {
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

test('the drawdown band is labelled as measured by day, and a fall inside a day is none', async () => {
  const { container, unmount } = renderApp(<OverviewView />, {
    sample: lossDaySample,
    url: URL,
  });
  await ready();
  expect(container.textContent).toContain('Max drawdown by day');
  expect(container.textContent).toContain('−$90.00');
  unmount();
  // Every day of the plain sample ends green, though a trade fell inside Monday.
  const plain = renderApp(<OverviewView />, {
    sample: breakdownSample,
    url: URL,
  });
  await ready();
  expect(plain.container.querySelector('[data-band="drawdown"]')).toBeNull();
});

test('the Days card gives the average green day, the average red day and trades per day', async () => {
  renderApp(<OverviewView />, { sample: reportsSample, url: URL });
  const page = await ready();
  const card = within(page).getByRole('region', { name: 'Days' });
  // Green days +60, +100 and +45; the red day -80; nine trades over four days.
  expect(stat(card, 'avg-green-day')).toContain('+$68.33');
  expect(stat(card, 'avg-green-day')).toContain('3 days');
  expect(stat(card, 'avg-red-day')).toContain('−$80.00');
  expect(stat(card, 'avg-red-day')).toContain('1 day');
  expect(stat(card, 'trades-per-day')).toContain('2.3');
  for (const id of ['avg-green-day', 'avg-red-day', 'trades-per-day'])
    expect(card.querySelector(`[data-metric-tip="${id}"]`), id).not.toBeNull();
});

test('the daily bars write their value on the best and the worst day', async () => {
  const { container } = renderApp(<OverviewView />, {
    sample: reportsSample,
    url: URL,
  });
  await ready();
  const best = container.querySelector('[data-extreme="best"]');
  const worst = container.querySelector('[data-extreme="worst"]');
  expect(best?.textContent).toBe('+$100');
  expect(worst?.textContent).toBe('−$80');
});

test('the cumulative readout gives that day and its trades', async () => {
  renderApp(<OverviewView />, { sample: reportsSample, url: URL });
  const page = await ready();
  const chart = within(page).getByRole('img', {
    name: /^Cumulative net P&L by day/,
  });
  act(() => chart.focus());
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  const readout = within(chart.parentElement!.parentElement!).getByRole(
    'status',
  );
  // Tue 3 Nov: +$100.00 over two trades; the line stands at +$160.00.
  expect(readout.textContent).toContain('Tue 3 Nov');
  expect(readout.textContent).toMatch(/That day\s*\+\$100\.00/);
  expect(readout.textContent).toMatch(/Trades\s*2/);
});

/** Three ES longs on Mon 2 Nov: +8 ticks for +$100, +4 for +$10, -6 for -$200; and a stock trade. */
async function ticksSample() {
  const s = await breakdownSample();
  const es = s.trades[0]!;
  const at = (avgExit: number, net: number, id: string) => ({
    ...es,
    id,
    net,
    gross: net,
    avgEntry: 4500,
    avgExit,
    maxPosition: 1,
    initialRisk: undefined,
  });
  s.trades = [
    at(4502, 10000, 'k-1'),
    at(4501, 1000, 'k-2'),
    { ...at(4498.5, -20000, 'k-3'), closedAt: '2026-11-03T16:00:00Z' },
    { ...s.trades[4]!, id: 'k-4', net: 50000, gross: 50000 },
  ];
  return s;
}

test('in Ticks the figures read the futures trades alone, profit factor and averages in ticks, and drawdown has no %', async () => {
  renderApp(<OverviewView />, {
    repository: await inUnit('ticks', ticksSample),
    url: URL,
  });
  const page = await ready();
  const kpi = (id: string) =>
    page.querySelector(`[data-kpi="${id}"]`)!.textContent;
  // The stock trade is left out: three trades, two won.
  expect(kpi('pnl')).toContain('3 closed trades');
  expect(kpi('win-rate')).toContain('66.7%');
  // 12 ticks won over 6 lost; in dollars it would be 0.55.
  expect(kpi('profit-factor')).toContain('2.00');
  expect(kpi('avg-win')).toContain('+6.0 ticks');
  expect(kpi('avg-loss')).toContain('−6.0 ticks');
  expect(kpi('largest-win')).toContain('+8.0 ticks');
  expect(kpi('largest-loss')).toContain('−6.0 ticks');
  expect(kpi('max-drawdown')).toContain('from a peak');
  expect(kpi('max-drawdown')).not.toContain('%');
  // Daily returns on the balance have no value in ticks.
  expect(kpi('sharpe')).toContain('None');
  expect(kpi('sortino')).toContain('None');
});

test('when the unit leaves out every closed trade the page says so, and keeps Clear filters while a filter is set', async () => {
  // No report trade has a stop, so R reads none of them.
  renderApp(<OverviewView />, {
    repository: await inUnit('r', reportsSample),
    url: `${URL}?symbol=ES`,
  });
  expect(
    await screen.findByText('No closed trades with a stop in these filters.'),
  ).toBeTruthy();
  expect(
    screen.getByText('R-multiple counts trades with a stop only.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await vi.waitFor(() => expect(window.location.search).toBe(''));
  expect(
    await screen.findByText('No closed trades with a stop in these filters.'),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
});

test('in Ticks both charts plot, name and read out ticks, never dollars (I2)', async () => {
  renderApp(<OverviewView />, {
    repository: await inUnit('ticks', ticksSample),
    url: URL,
  });
  const page = await ready();
  // Mon 2 Nov +12 ticks, Tue 3 Nov -6 ticks: the line ends at +6 ticks.
  const cumulative = within(page).getByRole('img', {
    name: /^Cumulative net P&L by day, all time\. Ends at \+6\.0 ticks\.$/,
  });
  expect(
    within(page).getByRole('img', {
      name: /^Daily net P&L bars, 2 days, all time\. Best .*\+12\.0 ticks, worst .*−6\.0 ticks\.$/,
    }),
  ).toBeTruthy();
  const header = within(page)
    .getByRole('heading', { name: 'Cumulative P&L' })
    .closest('section')!;
  expect(header.textContent).toContain('Ends at +6.0 ticks');
  // Only the drawdown band stays in money, as the drawdown does.
  expect(
    header.textContent!.replace(/Max drawdown by day −\$[\d.,]+/, ''),
  ).not.toContain('$');
  const daily = within(page)
    .getByRole('heading', { name: 'Daily P&L' })
    .closest('section')!;
  expect(daily.textContent).not.toContain('$');
  // The axis ticks read in ticks too.
  expect(cumulative.textContent).toMatch(/\dt/);
  act(() => cumulative.focus());
  fireEvent.keyDown(cumulative, { key: 'ArrowRight' });
  const readout = within(cumulative.parentElement!.parentElement!).getByRole(
    'status',
  );
  // Tue 3 Nov: the day lost 6 ticks; the line stands at +6.
  expect(readout.textContent).toContain('Tue 3 Nov');
  expect(readout.textContent).toMatch(/That day\s*−6\.0 ticks/);
  expect(readout.textContent).toContain('+6.0 ticks');
  expect(readout.textContent).not.toContain('$');
});

test('in R the cumulative line ends at +1.00R, not at a cent (I2)', async () => {
  renderApp(<OverviewView />, {
    repository: await inUnit('r'),
    url: URL,
  });
  const page = await ready();
  // b-1 +2R and b-2 -1R on Mon 2 Nov; the others have no stop.
  expect(
    within(page).getByRole('img', {
      name: /^Cumulative net P&L by day, all time\. Ends at \+1\.00R\.$/,
    }),
  ).toBeTruthy();
});

test('on one of several currencies the largest-day links open the calendar on it (M4)', async () => {
  const { container } = renderApp(<OverviewView />, {
    sample: async () => {
      const s = await breakdownSample();
      s.trades.push({
        ...s.trades[0]!,
        id: 'b-eur',
        serial: 99,
        pnlCurrency: 'EUR',
      });
      return s;
    },
    url: `${URL}?cur=EUR`,
  });
  await ready();
  const link = container.querySelector(
    '[data-stat="largest-green-day"] a',
  ) as HTMLAnchorElement;
  expect(
    new globalThis.URL(link.getAttribute('href')!, 'http://x').searchParams.get(
      'cur',
    ),
  ).toBe('EUR');
});

test('the cumulative and daily P&L cards share a row from xl up, in equal halves', async () => {
  renderApp(<OverviewView />, { sample: reportsSample, url: URL });
  const page = await ready();
  const cumulative = within(page).getByRole('region', {
    name: 'Cumulative P&L',
  });
  const daily = within(page).getByRole('region', { name: 'Daily P&L' });
  const row = cumulative.parentElement!;
  expect(daily.parentElement).toBe(row);
  expect(row.children).toHaveLength(2);
  // Stacked below xl, two equal columns from it.
  expect(row.className).toContain('xl:grid-cols-2');
  expect(row.className).not.toMatch(/(^|\s)grid-cols-2/);
  // Each keeps its own Expand in its header.
  expect(
    within(cumulative).getByRole('button', { name: 'Expand chart' }),
  ).toBeTruthy();
  expect(
    within(daily).getByRole('button', { name: 'Expand chart' }),
  ).toBeTruthy();
});

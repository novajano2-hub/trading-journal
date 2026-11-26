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
import { afterEach, expect, test, vi } from 'vitest';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { balanceAt } from '@/domain/metrics/balance';
import { formatMoney } from '@/lib/format';
import { renderApp } from '../__fixtures__/render-app';
import { PropDashboard } from './prop-dashboard';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const URL = '/app/prop-firms';
const NY = 'America/New_York';

// The real sample: three challenges (Futures 50K funded, Forex 100K in
// evaluation, Futures 100K breached) and nine transactions. Its figures are
// the ones Task 4 pins: spent $1,519.00, earned $4,500.00 from two payouts.
const sample: SampleWorkspace = generateSampleWorkspace({
  seed: SAMPLE_SEED,
  endDate: '2026-11-19',
});

function repo(extra: (s: SampleWorkspace) => void = () => {}): Repository {
  const s = structuredClone(sample);
  extra(s);
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => s,
  });
}

/** Today in New York, fixed: 25 Nov 2026. */
async function inNewYork(r: Repository): Promise<void> {
  await r.prefs.update({ timeZone: NY });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
}

const CTX = {
  timeZone: NY,
  breakevenRange: { unit: 'amount' as const, from: 0, to: 0 },
  pnlBasis: 'net' as const,
  weekStart: 'sunday' as const,
};
/** What an account holds today, as the cards read it. */
const balanceOf = (id: string): string =>
  formatMoney(
    balanceAt(
      [sample.accounts.find((a) => a.id === id)!],
      [],
      sample.trades.filter((t) => t.accountId === id),
      '2026-11-25',
      CTX,
    ),
  );

const card = (name: string) => screen.findByRole('region', { name });
const cardText = async (name: string) => (await card(name)).textContent;

test('the five cards read the sample: balances, spent, earned, net and the return on spend (C60, C32)', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<PropDashboard />, { repository: r, url: URL });

  expect(await cardText('Funded')).toBe(
    `Funded${balanceOf('sample-futures-50k-funded')}1 active funded account`,
  );
  expect(await cardText('Evaluation')).toBe(
    `Evaluation${balanceOf('sample-forex-prop')}1 active evaluation account`,
  );
  expect(await cardText('Total spent')).toBe(
    'Total spent−$1,519.00fees and resets',
  );
  expect(await cardText('Total earned')).toBe(
    'Total earned+$4,500.00' + '2 payouts',
  );
  expect(await cardText('Net')).toBe('Net+$2,981.00Return on spend 196.2%');
});

test('spent is red, earned and a positive net green, and a loss is red with its minus', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<PropDashboard />, { repository: r, url: URL });
  const fig = async (name: string, text: string) =>
    within(await card(name)).getByText(text);
  expect((await fig('Total spent', '−$1,519.00')).className).toContain(
    'text-loss',
  );
  expect((await fig('Total earned', '+$4,500.00')).className).toContain(
    'text-gain',
  );
  expect((await fig('Net', '+$2,981.00')).className).toContain('text-gain');
  cleanup();

  // Costs only: the net is a loss, and the return reads below zero.
  const costs = repo((s) => {
    s.propTxns = s.propTxns.filter((t) => t.amount < 0);
  });
  await inNewYork(costs);
  renderApp(<PropDashboard />, { repository: costs, url: URL });
  const net = within(await card('Net'));
  await waitFor(() => expect(net.getByText('−$1,519.00')).toBeTruthy());
  expect(net.getByText('−$1,519.00').className).toContain('text-loss');
  expect(net.getByText('Return on spend −100.0%')).toBeTruthy();
});

test('every card names its figure with a definition, and the definitions say what is counted', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<PropDashboard />, { repository: r, url: URL });
  for (const name of [
    'Funded',
    'Evaluation',
    'Total spent',
    'Total earned',
    'Net',
  ])
    expect(
      (await card(name)).querySelector('button[data-metric-tip]'),
    ).not.toBeNull();
});

test('under Privacy no amount shows in a card, a label or the chart, and the rates and counts stay', async () => {
  const r = repo();
  await inNewYork(r);
  await r.prefs.update({ displayUnit: 'privacy' });
  const { container } = renderApp(<PropDashboard />, {
    repository: r,
    url: URL,
  });
  await card('Net');
  await waitFor(() =>
    expect(container.textContent).toContain('Return on spend 196.2%'),
  );
  expect(container.textContent).toContain('2 payouts');
  expect(container.textContent).toContain('1 active funded account');
  expect(container.textContent).not.toMatch(/\p{Sc}\s?\d/u);
  expect(container.textContent).not.toMatch(/\d,\d{3}/);
  // What a screen reader gets is as hidden.
  for (const el of container.querySelectorAll('[aria-label]'))
    expect(el.getAttribute('aria-label')).not.toMatch(/\d,\d{3}|\p{Sc}\s?\d/u);
  expect(
    within(await card('Total earned')).getByText('hidden amount'),
  ).toBeTruthy();
});

test('Return over time: income, costs and net over 1W, 1M or 1Y, the year first (C36)', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<PropDashboard />, { repository: r, url: URL });
  const period = await screen.findByRole('radiogroup', { name: 'Period' });
  expect(
    within(period)
      .getAllByRole('radio')
      .map((x) => [
        x.parentElement?.textContent,
        (x as HTMLInputElement).checked,
      ]),
  ).toEqual([
    ['1W', false],
    ['1M', false],
    ['1Y', true],
  ]);
  const chart = await screen.findByRole('img', { name: /^Return over time/ });
  // The image names its range and the three figures at its end.
  expect(chart.getAttribute('aria-label')).toBe(
    'Return over time, 1 year to 25 Nov: income +$4,500.00, costs −$1,519.00, net +$2,981.00',
  );
  const table = screen.getByRole('table', {
    name: chart.getAttribute('aria-label')!,
  });
  expect(table.closest('.sr-only')).not.toBeNull();
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual(['Day', 'Income', 'Costs', 'Net']);
  // The last row is today, holding the year's totals.
  const rows = within(table).getAllByRole('row');
  expect(
    within(rows[rows.length - 1]!)
      .getAllByRole('cell')
      .map((c) => c.textContent),
  ).toEqual(['+$4,500.00', '−$1,519.00', '+$2,981.00']);
  expect(
    within(rows[rows.length - 1]!).getByRole('rowheader').textContent,
  ).toBe('Wed 25 Nov');
  // The legend names the three lines.
  const legend = chart.closest('section')!.querySelector('[data-legend]')!;
  expect(
    [...legend.querySelectorAll('li')].map((li) => li.textContent),
  ).toEqual(['Income', 'Costs', 'Net']);
});

test('a week is seven days and a month thirty, ending today', async () => {
  const r = repo((s) => {
    s.propTxns.push({
      id: 'recent',
      workspaceId: SAMPLE_WORKSPACE.id,
      date: '2026-11-24',
      firm: 'Sample prop firm',
      category: 'payout',
      amount: 10_000,
      status: 'reviewed',
    });
  });
  await inNewYork(r);
  renderApp(<PropDashboard />, { repository: r, url: URL });
  const period = await screen.findByRole('radiogroup', { name: 'Period' });
  const rowsOf = (chart: HTMLElement) =>
    within(
      screen.getByRole('table', { name: chart.getAttribute('aria-label')! }),
    ).getAllByRole('row').length;
  fireEvent.click(within(period).getByRole('radio', { name: '1W' }));
  const week = await screen.findByRole('img', {
    name: /^Return over time, 1 week to 25 Nov: income \+\$100\.00, costs \$0\.00, net \+\$100\.00$/,
  });
  expect(rowsOf(week)).toBe(8);
  fireEvent.click(within(period).getByRole('radio', { name: '1M' }));
  const month = await screen.findByRole('img', {
    name: /^Return over time, 1 month to 25 Nov/,
  });
  expect(rowsOf(month)).toBe(31);
});

test('a period with no money in it says so instead of drawing a flat line', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<PropDashboard />, { repository: r, url: URL });
  const period = await screen.findByRole('radiogroup', { name: 'Period' });
  fireEvent.click(within(period).getByRole('radio', { name: '1W' }));
  expect(
    await screen.findByText('No income or costs in this period.'),
  ).toBeTruthy();
  // The switch stays, so the trader can widen it.
  fireEvent.click(within(period).getByRole('radio', { name: '1Y' }));
  expect(
    await screen.findByRole('img', { name: /^Return over time/ }),
  ).toBeTruthy();
});

test('the chart reads a day under the pointer: its date and the three running figures', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<PropDashboard />, { repository: r, url: URL });
  const chart = await screen.findByRole('img', { name: /^Return over time/ });
  fireEvent.keyDown(chart, { key: 'End' });
  fireEvent.focus(chart);
  fireEvent.keyDown(chart, { key: 'End' });
  const readout = screen.getByRole('status');
  expect(readout.textContent).toContain('Wed 25 Nov');
  expect(readout.textContent).toContain('+$4,500.00');
  expect(readout.textContent).toContain('−$1,519.00');
  expect(readout.textContent).toContain('+$2,981.00');
});

test('the figures follow the date range: transactions by date, challenge fees by the challenge start (C37)', async () => {
  const r = repo();
  await inNewYork(r);
  window.history.replaceState(null, '', `${URL}?to=2026-11-01`);
  renderApp(<PropDashboard />, { repository: r, url: `${URL}?to=2026-11-01` });
  // The 2 Nov payout falls outside; the 17 Oct one is in.
  expect(await cardText('Total earned')).toBe(
    'Total earned+$1,800.00' + '1 payout',
  );
});

test('a filter in the address narrows every card: the breached challenge alone has no balance', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<PropDashboard />, {
    repository: r,
    url: `${URL}?pstatus=breached`,
  });
  expect(await cardText('Funded')).toContain('$0.00');
  await waitFor(async () =>
    expect(await cardText('Total spent')).toContain('−$497.00'),
  );
  expect(await cardText('Total earned')).toContain('$0.00');
  expect(await cardText('Net')).toContain('−$497.00');
});

test('transactions only: the money cards and the chart fill, the balances read none, and no challenge has an outcome yet (C69)', async () => {
  const r = repo((s) => {
    s.challenges = [];
  });
  await inNewYork(r);
  renderApp(<PropDashboard />, { repository: r, url: URL });
  expect(await cardText('Funded')).toBe('Funded$0.00No active funded account');
  expect(await cardText('Evaluation')).toBe(
    'Evaluation$0.00No active evaluation account',
  );
  await waitFor(async () =>
    expect(await cardText('Total earned')).toContain('+$4,500.00'),
  );
  expect(
    await screen.findByRole('img', { name: /^Return over time/ }),
  ).toBeTruthy();
});

test('challenges with no fees and no transactions: spent reads $0.00 and the return reads None (C69)', async () => {
  const r = repo((s) => {
    s.propTxns = [];
    s.challenges = s.challenges.map((c) => {
      const { evaluationFee, activationFee, ...rest } = c;
      void evaluationFee;
      void activationFee;
      return rest;
    });
  });
  await inNewYork(r);
  renderApp(<PropDashboard />, { repository: r, url: URL });
  expect(await cardText('Total spent')).toBe('Total spent$0.00fees and resets');
  expect(await cardText('Total earned')).toBe(
    'Total earned$0.00No payouts yet',
  );
  expect(await cardText('Net')).toBe('Net$0.00Return on spend None');
});

test('no challenge and no transaction: the empty state offers Add transaction and New challenge (C69)', async () => {
  const r = repo((s) => {
    s.challenges = [];
    s.propTxns = [];
  });
  renderApp(<PropDashboard />, { repository: r, url: URL });
  expect(await screen.findByText('Nothing to total yet.')).toBeTruthy();
  const add = screen.getByRole('link', { name: 'Add transaction' });
  expect(add.getAttribute('href')).toBe('/app/prop-firms/transactions?add=1');
  // No card draws before there is something to read.
  expect(screen.queryByRole('region', { name: 'Funded' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'New challenge' }));
  expect(
    await screen.findByRole('dialog', { name: 'New challenge' }),
  ).toBeTruthy();
});

test('a filter that matches nothing says so, and Clear filters brings the figures back', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<PropDashboard />, { repository: r, url: `${URL}?pfirm=Nobody` });
  expect(
    await screen.findByText('No challenges match these filters.'),
  ).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Funded' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(await card('Funded')).toBeTruthy();
  expect(window.location.search).toBe('');
});

test('a firm with transactions and no challenge still shows its money', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<PropDashboard />, {
    repository: r,
    url: `${URL}?pfirm=${encodeURIComponent('Sample data feed')}`,
  });
  expect(await cardText('Total spent')).toBe(
    'Total spent−$29.00fees and resets',
  );
  expect(screen.queryByText('No challenges match these filters.')).toBeNull();
});

test('the date range alone, matching nothing, says the same', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<PropDashboard />, {
    repository: r,
    url: `${URL}?from=2020-01-01&to=2020-01-31`,
  });
  expect(
    await screen.findByText('No challenges match these filters.'),
  ).toBeTruthy();
});

test('balances of accounts in another currency are left out and named (C58)', async () => {
  const r = repo((s) => {
    const a = s.accounts.find((x) => x.id === 'sample-forex-prop')!;
    a.currency = 'EUR';
  });
  await inNewYork(r);
  renderApp(<PropDashboard />, { repository: r, url: URL });
  expect(
    await screen.findByText('1 account in another currency is left out.'),
  ).toBeTruthy();
  expect(await cardText('Evaluation')).toBe(
    'Evaluation$0.00No active evaluation account',
  );
});

test('it waits while the workspace loads, and says plainly when it cannot', async () => {
  renderApp(<PropDashboard />, { repository: repo(), url: URL });
  expect(
    screen.getByRole('status', { name: 'Loading the dashboard' }),
  ).toBeTruthy();
  await card('Funded');
  cleanup();

  const failing = repo();
  failing.challenges.list = vi.fn().mockRejectedValue(new Error('storage'));
  renderApp(<PropDashboard />, { repository: failing, url: URL });
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByText("The prop dashboard couldn't load.")).toBeTruthy();
});

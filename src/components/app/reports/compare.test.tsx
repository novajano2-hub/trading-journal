// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { breakdownSample } from '../__fixtures__/breakdown-sample';
import { renderApp } from '../__fixtures__/render-app';
import { CompareView } from './compare';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const row = (table: HTMLElement, name: RegExp) =>
  within(within(table).getByRole('row', { name }))
    .getAllByRole('cell')
    .map((c) => c.textContent);

test('Group A ES against Group B NQ shows both nets and the difference', async () => {
  renderApp(<CompareView />, {
    sample: breakdownSample,
    url: '/app/reports/compare?a=symbol%3DES&b=symbol%3DNQ',
  });
  const page = await screen.findByTestId('reports-compare');
  const table = within(page).getByRole('table', { name: 'Comparison' });
  // ES: +$100.00 and -$40.00. NQ: +$70.00 and -$20.00.
  expect(row(table, /^Net P&L/)).toEqual(['+$60.00', '+$50.00', '+$10.00']);
  expect(row(table, /^Trades/)).toEqual(['2', '2', '0']);
  expect(row(table, /^Win rate/)).toEqual(['50.0%', '50.0%', '0.0 pts']);
  // Both cumulative lines are on one chart.
  const chart = within(page).getByRole('img', {
    name: /Cumulative P&L.*Group A.*Group B/,
  });
  expect(chart.querySelectorAll('[data-mark="line"]')).toHaveLength(2);
  expect(chart.querySelectorAll('[data-series]')).toHaveLength(2);
  // Every metric label has its definition.
  for (const id of [
    'pnl',
    'trades',
    'win-rate',
    'profit-factor',
    'expectancy',
    'avg-win',
    'avg-loss',
    'realized-r',
  ])
    expect(table.querySelector(`[data-metric-tip="${id}"]`), id).not.toBeNull();
});

test('Group A starts from the global filters and Group B starts empty', async () => {
  renderApp(<CompareView />, {
    sample: breakdownSample,
    url: '/app/reports/compare?symbol=ES',
  });
  const page = await screen.findByTestId('reports-compare');
  const table = within(page).getByRole('table', { name: 'Comparison' });
  // A is ES alone; B has every trade: +$125.00.
  expect(row(table, /^Net P&L/)).toEqual(['+$60.00', '+$125.00', '−$65.00']);
  const a = within(page).getByRole('group', { name: 'Group A filters' });
  expect(within(a).getByRole('button', { name: /ES/ })).toBeTruthy();
});

test('choosing a side for a group writes it to the address, so the comparison is linkable', async () => {
  renderApp(<CompareView />, {
    sample: breakdownSample,
    url: '/app/reports/compare?a=symbol%3DES&b=symbol%3DNQ',
  });
  const page = await screen.findByTestId('reports-compare');
  const b = within(page).getByRole('group', { name: 'Group B filters' });
  fireEvent.click(within(b).getByRole('button', { name: /^Side/ }));
  fireEvent.click(await screen.findByRole('radio', { name: 'Short' }));
  const params = new URLSearchParams(window.location.search);
  expect(new URLSearchParams(params.get('b')!).get('side')).toBe('short');
  expect(new URLSearchParams(params.get('b')!).get('symbol')).toBe('NQ');
  expect(new URLSearchParams(params.get('a')!).get('symbol')).toBe('ES');
  // NQ short is the one -$20.00 trade.
  const table = within(page).getByRole('table', { name: 'Comparison' });
  expect(row(table, /^Net P&L/)[1]).toBe('−$20.00');
});

test('Privacy leaves no dollar amount on the page', async () => {
  const { createLocalRepository } =
    await import('@/data/local/local-repository');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: breakdownSample,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  const { container } = renderApp(<CompareView />, {
    repository,
    url: '/app/reports/compare?a=symbol%3DES&b=symbol%3DNQ',
  });
  await screen.findByTestId('reports-compare');
  expect(container.textContent).toContain('$•••');
  expect(container.textContent).not.toMatch(/\$\d/);
});

async function inUnit(displayUnit: 'r' | 'percent' | 'privacy') {
  const { createLocalRepository } =
    await import('@/data/local/local-repository');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: breakdownSample,
  });
  await repository.prefs.update({ displayUnit });
  return repository;
}

test('in R each group keeps only its trades with a stop, so a group with none holds no trades and reads None', async () => {
  renderApp(<CompareView />, {
    repository: await inUnit('r'),
    url: '/app/reports/compare?a=symbol%3DES&b=symbol%3DNQ',
  });
  const page = await screen.findByTestId('reports-compare');
  const table = within(page).getByRole('table', { name: 'Comparison' });
  // ES: b-1 +2R and b-2 -1R. NQ's two trades have no stop.
  expect(row(table, /^Trades/).slice(0, 2)).toEqual(['2', '0']);
  // A group with no trades has no P&L: it reads None, not a zero in dollars.
  expect(row(table, /^Net P&L/).slice(0, 2)).toEqual(['+1.00R', 'None']);
  expect(row(table, /^Expectancy/)[0]).toBe('+0.50R');
  expect(row(table, /^Average win/)[0]).toBe('+2.00R');
  expect(row(table, /^Average loss/)[0]).toBe('−1.00R');
  expect(
    within(page).getByText(
      'R-multiple counts trades with a stop only, so 2 trades are left out.',
    ),
  ).toBeTruthy();
});

test('in percent each group is over its own accounts at its own range start', async () => {
  // A: acc-a from 3 Nov, so the base is $50,000.00 plus the $60.00 made before. B: every active account, all time (the archived one is left out unless picked).
  renderApp(<CompareView />, {
    repository: await inUnit('percent'),
    url: '/app/reports/compare?a=account%3Dacc-a%26from%3D2026-11-03&b=',
  });
  const page = await screen.findByTestId('reports-compare');
  const table = within(page).getByRole('table', { name: 'Comparison' });
  // A: +$65.00 over $50,060.00 is 0.13%. B: +$125.00 over $50,000.00 is 0.25%.
  expect(row(table, /^Net P&L/).slice(0, 2)).toEqual(['+0.13%', '+0.25%']);
});

test('the chart names each group, its range and where it ends; Privacy hides the amounts', async () => {
  const url = '/app/reports/compare?a=symbol%3DES&b=symbol%3DNQ';
  const { unmount } = renderApp(<CompareView />, {
    sample: breakdownSample,
    url,
  });
  const page = await screen.findByTestId('reports-compare');
  expect(
    within(page).getByRole('img', {
      name: /Group A, all time, ends at \+\$60\.00.*Group B, all time, ends at \+\$50\.00/,
    }),
  ).toBeTruthy();
  unmount();
  renderApp(<CompareView />, { repository: await inUnit('privacy'), url });
  const hidden = await screen.findByTestId('reports-compare');
  expect(
    within(hidden).getByRole('img', {
      name: /Group A, all time, ends at hidden amount.*Group B, all time, ends at hidden amount/,
    }),
  ).toBeTruthy();
});

test('a group shows "+N more" for inherited filters it has no chip for, with a way to clear them', async () => {
  renderApp(<CompareView />, {
    sample: breakdownSample,
    url: '/app/reports/compare?a=symbol%3DES%26wd%3D1%2C2%26r%3D1_',
  });
  const page = await screen.findByTestId('reports-compare');
  const a = within(page).getByRole('group', { name: 'Group A filters' });
  expect(within(a).getByText('+2 more')).toBeTruthy();
  const b = within(page).getByRole('group', { name: 'Group B filters' });
  expect(within(b).queryByText(/more$/)).toBeNull();
  fireEvent.click(within(a).getByRole('button', { name: 'Clear Weekdays, R' }));
  const written = new URLSearchParams(
    new URLSearchParams(window.location.search).get('a')!,
  );
  expect(written.get('symbol')).toBe('ES');
  expect(written.get('wd')).toBeNull();
  expect(written.get('r')).toBeNull();
  expect(within(a).queryByText('+2 more')).toBeNull();
});

test('Group B starts as the previous period of the same length, not a copy of A', async () => {
  renderApp(<CompareView />, {
    sample: breakdownSample,
    url: '/app/reports/compare?from=2026-11-04&to=2026-11-05',
  });
  const page = await screen.findByTestId('reports-compare');
  const table = within(page).getByRole('table', { name: 'Comparison' });
  // A is 4 and 5 Nov: Wednesday's trades. B is 2 and 3 Nov: +$60.00 and +$50.00.
  expect(row(table, /^Trades/).slice(0, 2)).toEqual(['3', '4']);
  expect(row(table, /^Net P&L/)[1]).toBe('+$110.00');
  const b = within(page).getByRole('group', { name: 'Group B filters' });
  expect(within(b).getByRole('button', { name: /2-3 Nov/ })).toBeTruthy();
});

test('an explicit b= wins over the previous-period default', async () => {
  renderApp(<CompareView />, {
    sample: breakdownSample,
    url: '/app/reports/compare?from=2026-11-04&to=2026-11-05&b=symbol%3DNQ',
  });
  const page = await screen.findByTestId('reports-compare');
  const table = within(page).getByRole('table', { name: 'Comparison' });
  expect(row(table, /^Net P&L/)[1]).toBe('+$50.00');
});

test('the metric names are a sticky first column below lg', async () => {
  renderApp(<CompareView />, {
    sample: breakdownSample,
    url: '/app/reports/compare?a=symbol%3DES&b=symbol%3DNQ',
  });
  const table = await screen.findByRole('table', { name: 'Comparison' });
  for (const cell of [
    table.querySelector('thead td:first-child')!,
    ...table.querySelectorAll('tbody th[scope="row"]'),
  ]) {
    expect(cell.className).toContain('max-lg:sticky');
    expect(cell.className).toContain('max-lg:left-0');
  }
  expect(
    [...table.querySelectorAll('tbody th[scope="row"]')].every((c) =>
      c.className.includes('max-lg:bg-surface-1'),
    ),
  ).toBe(true);
});

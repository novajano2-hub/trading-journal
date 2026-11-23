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

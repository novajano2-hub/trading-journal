// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { breakdownSample } from '../__fixtures__/breakdown-sample';
import { renderApp } from '../__fixtures__/render-app';
import { StrategiesView, SymbolsView, TagsView } from './breakdown-report';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const rowOf = (table: HTMLElement, name: RegExp) =>
  within(within(table).getByRole('row', { name }));

test('symbols: a chart of net, and a table with each symbol', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols',
  });
  const page = await screen.findByTestId('reports-symbols');
  expect(
    within(page).getByRole('img', { name: /Net P&L by symbol/ }),
  ).toBeTruthy();
  const table = within(page).getByRole('table', { name: 'Symbols summary' });
  // ES +$60.00 on 2 trades, NQ +$50.00 on 2, SPY +$15.00 on 3.
  const es = rowOf(table, /^ES/)
    .getAllByRole('cell')
    .map((c) => c.textContent);
  expect(es.slice(0, 4)).toEqual(['ES', '2', '50.0%', '+$60.00']);
  expect(rowOf(table, /^SPY/).getAllByRole('cell')[3]!.textContent).toBe(
    '+$15.00',
  );
  // Every header with a metric carries its definition.
  expect(
    table.querySelector('[data-metric-tip="profit-factor"]'),
  ).not.toBeNull();
});

test('cross-analysed by side the table swaps for a symbol by side matrix', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols?x=side',
  });
  const page = await screen.findByTestId('reports-symbols');
  expect(
    within(page).queryByRole('table', { name: 'Symbols summary' }),
  ).toBeNull();
  const matrix = within(page).getByRole('table', { name: 'Symbols by side' });
  const nq = rowOf(matrix, /^NQ/).getAllByRole('cell');
  expect(nq[0]!.textContent).toContain('+$70.00');
  expect(nq[1]!.textContent).toContain('−$20.00');
  const select = within(page).getByLabelText(
    'Cross-analyse by',
  ) as HTMLSelectElement;
  expect(select.value).toBe('side');
  // Back to none restores the table and clears the address.
  fireEvent.change(select, { target: { value: '' } });
  expect(
    await within(page).findByRole('table', { name: 'Symbols summary' }),
  ).toBeTruthy();
  expect(new URLSearchParams(window.location.search).get('x')).toBeNull();
  // The matrix can show win rate instead of net.
  fireEvent.change(select, { target: { value: 'side' } });
  fireEvent.change(within(page).getByLabelText('Cross-analysis metric'), {
    target: { value: 'win-rate' },
  });
  const rate = rowOf(
    within(page).getByRole('table', { name: 'Symbols by side' }),
    /^NQ/,
  ).getAllByRole('cell');
  expect(rate[0]!.textContent).toContain('100.0%');
  expect(rate[1]!.textContent).toContain('0.0%');
});

test('a trade with two strategies counts under each', async () => {
  renderApp(<StrategiesView />, {
    sample: breakdownSample,
    url: '/app/reports/strategies',
  });
  const page = await screen.findByTestId('reports-strategies');
  const table = within(page).getByRole('table', { name: 'Strategies summary' });
  // Opening range breakout: b-1 and b-3. Pullback: b-3. No strategy: the other five.
  expect(
    rowOf(table, /^Opening range breakout/).getAllByRole('cell')[1]!
      .textContent,
  ).toBe('2');
  expect(rowOf(table, /^Pullback/).getAllByRole('cell')[1]!.textContent).toBe(
    '1',
  );
  expect(
    rowOf(table, /^No strategy/).getAllByRole('cell')[1]!.textContent,
  ).toBe('5');
});

test('tags have a category select', async () => {
  renderApp(<TagsView />, {
    sample: breakdownSample,
    url: '/app/reports/tags',
  });
  const page = await screen.findByTestId('reports-tags');
  const table = () => within(page).getByRole('table', { name: 'Tags summary' });
  expect(rowOf(table(), /^Breakout/)).toBeTruthy();
  expect(rowOf(table(), /^FOMO/)).toBeTruthy();
  const select = within(page).getByLabelText('Category') as HTMLSelectElement;
  expect([...select.options].map((o) => o.textContent)).toEqual([
    'All categories',
    'Custom tags',
    'Mistakes',
    'Setups',
  ]);
  fireEvent.change(select, { target: { value: 'mistakes' } });
  expect(within(table()).queryByRole('row', { name: /^Breakout/ })).toBeNull();
  expect(rowOf(table(), /^FOMO/).getAllByRole('cell')[4]!.textContent).toBe(
    '−$40.00',
  );
  expect(new URLSearchParams(window.location.search).get('cat')).toBe(
    'mistakes',
  );
});

test('Privacy leaves no dollar amount in the table, the matrix or the chart', async () => {
  const { createLocalRepository } =
    await import('@/data/local/local-repository');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: breakdownSample,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  const { container } = renderApp(<SymbolsView />, {
    repository,
    url: '/app/reports/symbols?x=side',
  });
  await screen.findByTestId('reports-symbols');
  expect(container.textContent).toContain('$•••');
  expect(container.textContent).not.toMatch(/\$\d/);
  expect(container.innerHTML).not.toMatch(/aria-label="[^"]*\$\d/);
});

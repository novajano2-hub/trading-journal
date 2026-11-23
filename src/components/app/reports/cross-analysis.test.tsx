// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderApp } from '../__fixtures__/render-app';
import { CrossAnalysis } from './cross-analysis';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
afterEach(cleanup);

test('a cell per pair, blank where there are no trades', async () => {
  renderApp(
    <CrossAnalysis
      label="Weekday by symbol"
      rowTitle="Symbol"
      rows={[
        { key: 'ES', label: 'ES' },
        { key: 'NQ', label: 'NQ' },
      ]}
      columns={[
        { key: 'mon', label: 'Mon' },
        { key: 'tue', label: 'Tue' },
      ]}
      cell={(r, c) =>
        r === 'ES' && c === 'mon'
          ? { value: 12000, count: 3 }
          : r === 'NQ' && c === 'tue'
            ? { value: -5000, count: 1 }
            : undefined
      }
    />,
  );
  const table = within(
    await screen.findByRole('table', { name: 'Weekday by symbol' }),
  );
  const es = within(table.getByRole('row', { name: /^ES/ })).getAllByRole(
    'cell',
  );
  expect(es[0]!.textContent).toContain('+$120.00');
  expect(es[0]!.textContent).toContain('3 trades');
  expect(es[1]!.textContent).toBe('');
  const nq = within(table.getByRole('row', { name: /^NQ/ })).getAllByRole(
    'cell',
  );
  expect(nq[1]!.textContent).toContain('−$50.00');
  expect(nq[1]!.textContent).toContain('1 trade');
});

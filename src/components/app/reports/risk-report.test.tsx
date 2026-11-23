// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { breakdownSample } from '../__fixtures__/breakdown-sample';
import { renderApp } from '../__fixtures__/render-app';
import { RiskView } from './risk-report';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

/** The cells of the row whose first cell reads `name`. */
const cellsOf = (table: HTMLElement, name: string) => {
  const rows = within(table)
    .getAllByRole('row')
    .map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));
  return rows.find((r) => r[0] === name) ?? [];
};

test('the R-multiple tab buckets trades by 1R, with the ones without a stop apart', async () => {
  renderApp(<RiskView />, {
    sample: breakdownSample,
    url: '/app/reports/risk',
  });
  const page = await screen.findByTestId('reports-risk');
  expect(
    within(page)
      .getAllByRole('tab')
      .map((t) => t.textContent),
  ).toEqual(['R-multiple', 'Position size', 'R distribution']);
  const table = within(page).getByRole('table', { name: 'R multiple summary' });
  expect(cellsOf(table, '+2R to +3R').slice(0, 4)).toEqual([
    '+2R to +3R',
    '1',
    '100.0%',
    '+$100.00',
  ]);
  expect(cellsOf(table, '−1R to 0R')[1]).toBe('1');
  expect(cellsOf(table, 'No stop')[1]).toBe('5');
  // Buckets nobody reached at the ends are left off.
  expect(within(table).queryByRole('row', { name: /^−5R or less/ })).toBeNull();
});

test('the position size tab uses the largest position each trade held', async () => {
  renderApp(<RiskView />, {
    sample: breakdownSample,
    url: '/app/reports/risk?tab=size',
  });
  const page = await screen.findByTestId('reports-risk');
  const table = within(page).getByRole('table', {
    name: 'Position size summary',
  });
  expect(cellsOf(table, '1')[1]).toBe('6');
  expect(cellsOf(table, '2-3')[1]).toBe('1');
});

test('the R distribution tab clamps, counts trades without a stop, and the drawdown curve sits below every tab', async () => {
  renderApp(<RiskView />, {
    sample: breakdownSample,
    url: '/app/reports/risk?tab=dist',
  });
  const page = await screen.findByTestId('reports-risk');
  expect(within(page).getByRole('img', { name: /R multiples/ })).toBeTruthy();
  expect(
    within(page).getByText(/5 trades have no stop and are left out/),
  ).toBeTruthy();
  expect(within(page).getByRole('img', { name: /Drawdown/ })).toBeTruthy();
  fireEvent.click(within(page).getByRole('tab', { name: 'R-multiple' }));
  expect(within(page).getByRole('img', { name: /Drawdown/ })).toBeTruthy();
  expect(new URLSearchParams(window.location.search).get('tab')).toBe('r');
});

/** The breakdown sample with Tuesday turned into a losing day: a daily fall of 9,000 after Monday's peak of 6,000. */
async function lossDaySample() {
  const s = await breakdownSample();
  s.trades = s.trades.map((t) =>
    t.id === 'b-3' ? { ...t, net: -7000, gross: -7000 } : t,
  );
  return s;
}

test('the R distribution and the drawdown chart say the range and their key values; Privacy hides the amounts', async () => {
  const { unmount } = renderApp(<RiskView />, {
    sample: lossDaySample,
    url: '/app/reports/risk?tab=dist',
  });
  const page = await screen.findByTestId('reports-risk');
  expect(
    within(page).getByRole('img', {
      name: /^R multiples, trades per half R, all time\. 2 trades with a stop, 5 without/,
    }),
  ).toBeTruthy();
  expect(
    within(page).getByRole('img', {
      name: /^Drawdown from the daily P&L peak, all time\. Max drawdown −\$90\.00/,
    }),
  ).toBeTruthy();
  unmount();
  const { createLocalRepository } =
    await import('@/data/local/local-repository');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: lossDaySample,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<RiskView />, { repository, url: '/app/reports/risk?tab=dist' });
  const hidden = await screen.findByTestId('reports-risk');
  expect(
    within(hidden).getByRole('img', {
      name: /Max drawdown hidden amount/,
    }),
  ).toBeTruthy();
});

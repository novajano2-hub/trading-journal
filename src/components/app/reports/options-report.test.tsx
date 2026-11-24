// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { breakdownSample } from '../__fixtures__/breakdown-sample';
import { renderApp } from '../__fixtures__/render-app';
import { OptionsView } from './options-report';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

test('a 0DTE option lands in the 0 bucket, stock and futures are absent, and the note says how many have no expiry', async () => {
  renderApp(<OptionsView />, {
    sample: breakdownSample,
    url: '/app/reports/options',
  });
  const page = await screen.findByTestId('reports-options');
  const table = within(page).getByRole('table', {
    name: 'Days to expiry summary',
  });
  const rows = within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));
  expect(rows.map((r) => [r[0], r[1]])).toEqual([
    ['0', '1'],
    ['1', '0'],
    ['2 to 7', '1'],
    ['8 to 30', '0'],
    ['31+', '0'],
  ]);
  // 0DTE won $30.00; the 5-day option lost $10.00. The six futures trades are not here.
  expect(rows[0]![3]).toBe('+$30.00');
  expect(rows[2]![3]).toBe('−$10.00');
  expect(
    within(page).getByText(/1 option trade has no expiry and is left out/),
  ).toBeTruthy();
});

test('a workspace with no options says so', async () => {
  const { reportsSample } = await import('../__fixtures__/reports-sample');
  renderApp(<OptionsView />, {
    sample: reportsSample,
    url: '/app/reports/options',
  });
  expect(
    await screen.findByText(/No option trades in these filters/),
  ).toBeTruthy();
});

test('each days to expiry bucket with trades opens exactly them in the log', async () => {
  renderApp(<OptionsView />, {
    sample: breakdownSample,
    url: '/app/reports/options',
  });
  const page = await screen.findByTestId('reports-options');
  const table = within(page).getByRole('table', {
    name: 'Days to expiry summary',
  });
  // Two buckets hold a trade: 0 and 2 to 7. Empty ones have nothing to open.
  const hrefs = within(table)
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'));
  expect(hrefs).toHaveLength(2);
  expect(hrefs[0]).toContain('dte=_0');
  expect(hrefs[1]).toContain('dte=2_7');
  expect(
    within(page)
      .getByRole('img', { name: /Net P&L by days to expiry/ })
      .querySelectorAll('a'),
  ).toHaveLength(2);
});

// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderApp } from '../__fixtures__/render-app';
import {
  newYorkRepository,
  reportsSample,
} from '../__fixtures__/reports-sample';
import { PerformanceView } from './performance';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const URL = '/app/reports/performance';

async function picker() {
  return within(await screen.findByRole('group', { name: 'Metrics' }));
}

test('choosing net (bar), win rate (line) and trades (bar) disables the rest', async () => {
  renderApp(<PerformanceView />, { sample: reportsSample, url: URL });
  const metrics = await picker();
  // Net P&L is the default.
  expect(
    (metrics.getByRole('checkbox', { name: 'Net P&L' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  fireEvent.click(metrics.getByRole('checkbox', { name: 'Win rate' }));
  fireEvent.click(metrics.getByRole('checkbox', { name: 'Trades' }));

  const chosen = ['Net P&L', 'Win rate', 'Trades'];
  const boxes = metrics.getAllByRole('checkbox') as HTMLInputElement[];
  expect(boxes).toHaveLength(9);
  for (const box of boxes) {
    const name = box.getAttribute('aria-label')!;
    expect(box.checked, name).toBe(chosen.includes(name));
    expect(box.disabled, name).toBe(!chosen.includes(name));
    // A disabled box says why through the limit message.
    const why = box.getAttribute('aria-describedby');
    if (chosen.includes(name)) expect(why, name).toBeNull();
    else
      expect(document.getElementById(why!)?.textContent, name).toBe(
        'Three metrics at most',
      );
  }
  expect(screen.getByText('Three metrics at most')).toBeTruthy();

  // Kinds: net a bar, win rate a line, trades a bar.
  const kind = (m: string) =>
    (
      within(
        screen.getByRole('radiogroup', { name: `${m} chart type` }),
      ).getByRole('radio', { checked: true }) as HTMLInputElement
    ).value;
  expect([kind('Net P&L'), kind('Win rate'), kind('Trades')]).toEqual([
    'bar',
    'line',
    'bar',
  ]);
  // The choice is in the address bar, so it can be linked.
  expect(new URLSearchParams(window.location.search).get('m')).toBe(
    'net:bar,win-rate:line,trades:bar',
  );

  // Unchecking one frees the others again.
  fireEvent.click(metrics.getByRole('checkbox', { name: 'Trades' }));
  expect(
    (metrics.getByRole('checkbox', { name: 'Fees' }) as HTMLInputElement)
      .disabled,
  ).toBe(false);
  expect(screen.queryByText('Three metrics at most')).toBeNull();
});

test('the chart type and the bucket come from the link and change it', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m=net:line,trades:bar&bucket=week`,
  });
  const metrics = await picker();
  expect(
    (
      within(
        screen.getByRole('radiogroup', { name: 'Net P&L chart type' }),
      ).getByRole('radio', { checked: true }) as HTMLInputElement
    ).value,
  ).toBe('line');
  const bucket = within(screen.getByRole('radiogroup', { name: 'Group by' }));
  expect(
    (bucket.getByRole('radio', { checked: true }) as HTMLInputElement).value,
  ).toBe('week');
  fireEvent.click(bucket.getByRole('radio', { name: 'Month' }));
  await waitFor(() =>
    expect(new URLSearchParams(window.location.search).get('bucket')).toBe(
      'month',
    ),
  );
  fireEvent.click(
    within(
      screen.getByRole('radiogroup', { name: 'Trades chart type' }),
    ).getByRole('radio', { name: 'Line' }),
  );
  expect(new URLSearchParams(window.location.search).get('m')).toBe(
    'net:line,trades:line',
  );
  expect(metrics.getAllByRole('checkbox')).toHaveLength(9);
});

test('the summary table has a column per chosen metric and sorts', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m=net:bar,trades:bar&bucket=day`,
  });
  const table = await screen.findByRole('table', { name: 'Summary by day' });
  const heads = within(table).getAllByRole('columnheader');
  expect(heads.map((h) => h.textContent)).toEqual([
    'Period',
    'Net P&L',
    'Trades',
  ]);
  expect(heads[1]!.getAttribute('aria-sort')).toBe('none');
  const first = () =>
    within(within(table).getAllByRole('row')[1]!).getAllByRole('cell')[0]!
      .textContent;
  // Date order to begin with.
  expect(first()).toBe('Mon 2 Nov');
  fireEvent.click(
    within(table).getByRole('button', { name: 'Sort by Net P&L' }),
  );
  expect(
    within(table).getAllByRole('columnheader')[1]!.getAttribute('aria-sort'),
  ).toBe('descending');
  // Mon +$60, Tue +$100, Wed -$80, Thu +$45: Tue is the largest.
  expect(first()).toBe('Tue 3 Nov');
  fireEvent.click(
    within(table).getByRole('button', { name: 'Sort by Net P&L' }),
  );
  expect(first()).toBe('Wed 4 Nov');
});

test('Cumulative P&L carries its own definition, not the Net P&L one', async () => {
  renderApp(<PerformanceView />, { sample: reportsSample, url: URL });
  const metrics = await picker();
  const row = metrics
    .getByRole('checkbox', { name: 'Cumulative P&L' })
    .closest('div.min-h-10')!;
  expect(
    row.querySelector('[data-metric-tip="cumulative-pnl"]'),
  ).not.toBeNull();
  expect(row.querySelector('[data-metric-tip="pnl"]')).toBeNull();
});

test('the chart says the range and where each metric runs, and Privacy hides the amounts', async () => {
  const { unmount } = renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?bucket=day`,
  });
  // Days: Nov 2 +$60.00, Nov 3 +$100.00, Nov 4 −$80.00, Nov 5 +$45.00.
  expect(
    await screen.findByRole('img', {
      name: /^Net P&L by day, all time\. Net P&L runs from −\$80\.00 to \+\$100\.00/,
    }),
  ).toBeTruthy();
  unmount();
  const repository = await newYorkRepository();
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<PerformanceView />, { repository, url: `${URL}?bucket=day` });
  expect(
    await screen.findByRole('img', {
      name: /^Net P&L by day, all time\. Net P&L runs from hidden amount to hidden amount/,
    }),
  ).toBeTruthy();
});

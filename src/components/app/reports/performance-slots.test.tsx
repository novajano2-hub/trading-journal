// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { commitNavigation, deferNavigation } from '../__fixtures__/navigation';
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
const param = (name: string) =>
  new URLSearchParams(window.location.search).get(name);

const chart = async (n: 1 | 2) =>
  within(await screen.findByRole('region', { name: `Chart ${n}` }));

/** A slot's catalogue lives in its own "+ Metric" popover. */
async function picker(slot: ReturnType<typeof within>) {
  fireEvent.click(slot.getByRole('button', { name: 'Add metric' }));
  return within(await screen.findByRole('group', { name: 'Metrics' }));
}

const chosen = (slot: ReturnType<typeof within>) =>
  within(slot.getByRole('list', { name: 'Plotted metrics' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent!.replace(/BarLine|PeriodRunning/g, ''));

const radio = (slot: ReturnType<typeof within>, group: string) =>
  (
    within(slot.getByRole('radiogroup', { name: group })).getByRole('radio', {
      checked: true,
    }) as HTMLInputElement
  ).value;

test('two slots open with their defaults: running Net P&L, and average daily win/loss per period', async () => {
  renderApp(<PerformanceView />, { sample: reportsSample, url: URL });
  const one = await chart(1);
  const two = await chart(2);
  expect(chosen(one)).toEqual(['Net P&L']);
  expect(radio(one, 'Net P&L plotted')).toBe('running');
  expect(radio(one, 'Group by')).toBe('week');
  expect(chosen(two)).toEqual(['Average daily win/loss']);
  expect(radio(two, 'Average daily win/loss plotted')).toBe('period');
  expect(radio(two, 'Average daily win/loss chart type')).toBe('line');
  expect(radio(two, 'Group by')).toBe('week');
  // Defaults are not written to the address.
  expect(window.location.search).toBe('');
  // No chart is removed, so Remove is offered on both and nothing is missing.
  expect(screen.getAllByRole('button', { name: /^Remove chart/ })).toHaveLength(
    2,
  );
  expect(screen.queryByRole('button', { name: 'Add chart' })).toBeNull();
});

test('a metric chosen in one slot leaves the other untouched, in the view and in the address', async () => {
  renderApp(<PerformanceView />, { sample: reportsSample, url: URL });
  const two = await chart(2);
  const metrics = await picker(two);
  fireEvent.click(metrics.getByRole('checkbox', { name: 'Trades' }));
  expect(param('m2')).toBe('avg-daily-win-loss:line,trades:bar');
  expect(param('m')).toBeNull();
  expect(chosen(await chart(1))).toEqual(['Net P&L']);
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

  const one = await chart(1);
  const first = await picker(one);
  fireEvent.click(first.getByRole('checkbox', { name: 'Win rate' }));
  expect(param('m')).toBe('net:bar:running,win-rate:line');
  expect(param('m2')).toBe('avg-daily-win-loss:line,trades:bar');
  expect(chosen(await chart(2))).toEqual(['Average daily win/loss', 'Trades']);
});

test('each slot holds the same metric once but the two may share one', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m2=net:line`,
  });
  const two = await chart(2);
  const metrics = await picker(two);
  expect(
    (metrics.getByRole('checkbox', { name: 'Net P&L' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(chosen(await chart(1))).toEqual(['Net P&L']);
  expect(chosen(two)).toEqual(['Net P&L']);
});

test('each slot has its own cap of three and its own grouping', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m=net:bar,trades:bar,win-rate:line&m2=volume:bar`,
  });
  const one = await chart(1);
  const two = await chart(2);
  const full = await picker(one);
  expect(
    (full.getByRole('checkbox', { name: 'Fees' }) as HTMLInputElement).disabled,
  ).toBe(true);
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  const open = await picker(two);
  expect(
    (open.getByRole('checkbox', { name: 'Fees' }) as HTMLInputElement).disabled,
  ).toBe(false);
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

  fireEvent.click(
    within(two.getByRole('radiogroup', { name: 'Group by' })).getByRole(
      'radio',
      { name: 'Month' },
    ),
  );
  await waitFor(() => expect(param('bucket2')).toBe('month'));
  expect(param('bucket')).toBeNull();
  expect(radio(await chart(1), 'Group by')).toBe('week');
  expect(radio(await chart(2), 'Group by')).toBe('month');
});

test('Remove empties its place with Add chart, which brings the slot back as it was', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m2=trades:line`,
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Remove chart 2' }),
  );
  expect(screen.queryByRole('region', { name: 'Chart 2' })).toBeNull();
  expect(param('off')).toBe('2');
  // The last chart cannot go.
  expect(screen.queryByRole('button', { name: /^Remove chart/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add chart' }));
  const two = await chart(2);
  expect(chosen(two)).toEqual(['Trades']);
  expect(param('off')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add chart' })).toBeNull();
});

test('the first slot can go too: the table then follows the one left', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m2=trades:bar&bucket2=day`,
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Remove chart 1' }),
  );
  expect(screen.queryByRole('region', { name: 'Chart 1' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Add chart' })).toBeTruthy();
  expect(param('off')).toBe('1');
  const table = await screen.findByRole('table', { name: 'Summary by day' });
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual(['Period', 'Trades']);
  expect(screen.getByRole('heading', { name: 'By day, chart 2' })).toBeTruthy();
});

test('the table follows chart 1 and says so', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m=trades:bar&bucket=day&m2=win-rate:line&bucket2=month`,
  });
  expect(
    await screen.findByRole('heading', { name: 'By day, chart 1' }),
  ).toBeTruthy();
  const table = await screen.findByRole('table', { name: 'Summary by day' });
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual(['Period', 'Trades']);
});

test('the address round-trips: an old link opens as it did, and a chart link opens both slots', async () => {
  const { unmount } = renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m=net:line,trades:bar&bucket=month`,
  });
  const one = await chart(1);
  expect(chosen(one)).toEqual(['Net P&L', 'Trades']);
  expect(radio(one, 'Net P&L chart type')).toBe('line');
  expect(radio(one, 'Net P&L plotted')).toBe('period');
  expect(radio(one, 'Group by')).toBe('month');
  // Slot 2 still opens on its default.
  expect(chosen(await chart(2))).toEqual(['Average daily win/loss']);
  unmount();

  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m=net:bar&m2=trades:bar:running,win-rate:line&bucket2=day`,
  });
  const two = await chart(2);
  expect(chosen(two)).toEqual(['Trades', 'Win rate']);
  expect(radio(two, 'Trades plotted')).toBe('running');
  expect(radio(two, 'Group by')).toBe('day');
});

test('a link with chart 2 removed opens without it, and a bad off value is ignored', async () => {
  const { unmount } = renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?off=2`,
  });
  await chart(1);
  expect(screen.queryByRole('region', { name: 'Chart 2' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Add chart' })).toBeTruthy();
  unmount();
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?off=1,2`,
  });
  // Both off is not allowed: chart 1 stays.
  await chart(1);
  expect(screen.queryByRole('region', { name: 'Chart 2' })).toBeNull();
});

test('two quick ticks in slot 2 before the address catches up both stick', async () => {
  renderApp(<PerformanceView />, { sample: reportsSample, url: URL });
  const metrics = await picker(await chart(2));
  const box = (name: string) =>
    metrics.getByRole('checkbox', { name }) as HTMLInputElement;
  deferNavigation();
  fireEvent.click(box('Win rate'));
  fireEvent.click(box('Trades'));
  expect(box('Win rate').checked).toBe(true);
  expect(box('Trades').checked).toBe(true);
  act(() => commitNavigation());
  expect(param('m2')).toBe('avg-daily-win-loss:line,win-rate:line,trades:bar');
  expect(box('Win rate').checked).toBe(true);
  expect(box('Trades').checked).toBe(true);
});

test('a change in each slot before the address catches up keeps both', async () => {
  renderApp(<PerformanceView />, { sample: reportsSample, url: URL });
  const one = await chart(1);
  const two = await chart(2);
  deferNavigation();
  fireEvent.click(
    within(one.getByRole('radiogroup', { name: 'Group by' })).getByRole(
      'radio',
      { name: 'Day' },
    ),
  );
  fireEvent.click(
    within(two.getByRole('radiogroup', { name: 'Group by' })).getByRole(
      'radio',
      { name: 'Month' },
    ),
  );
  expect(radio(one, 'Group by')).toBe('day');
  expect(radio(two, 'Group by')).toBe('month');
  act(() => commitNavigation());
  expect(param('bucket')).toBe('day');
  expect(param('bucket2')).toBe('month');
});

test('Privacy hides slot 2: the ratio is dots, and so is the figure in its label', async () => {
  const repository = await newYorkRepository();
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<PerformanceView />, {
    repository,
    url: `${URL}?m2=avg-daily-win-loss:line,net:bar&bucket2=month`,
  });
  const two = await chart(2);
  const img = await two.findByRole('img', {
    name: /^Average daily win\/loss, Net P&L by month/,
  });
  const name = img.getAttribute('aria-label')!;
  expect(name).toContain('hidden ratio');
  expect(name).toContain('hidden amount');
  expect(name).not.toMatch(/\d\.\d\d/);
});

test('Ticks reads slot 2 in ticks', async () => {
  const repository = await newYorkRepository();
  await repository.prefs.update({ displayUnit: 'ticks' });
  renderApp(<PerformanceView />, {
    repository,
    url: `${URL}?m2=avg-daily-net:bar&bucket2=month`,
  });
  const two = await chart(2);
  const img = await two.findByRole('img', {
    name: /^Average daily P&L by month/,
  });
  expect(img.getAttribute('aria-label')).toContain('is +5.0 ticks');
  expect(img.getAttribute('aria-label')).not.toContain('$');
});

test('Expand on slot 2 opens that chart, and Remove sits beside it in the header', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m2=net:bar&bucket2=day`,
  });
  const two = await chart(2);
  fireEvent.click(await two.findByRole('button', { name: 'Expand chart' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('Net P&L by day');
});

test('removing and adding a chart each make a history entry, so Back undoes them; other changes replace', async () => {
  renderApp(<PerformanceView />, { sample: reportsSample, url: URL });
  const push = vi.spyOn(window.history, 'pushState');
  const replace = vi.spyOn(window.history, 'replaceState');
  const two = await chart(2);
  const metrics = await picker(two);
  fireEvent.click(metrics.getByRole('checkbox', { name: 'Trades' }));
  fireEvent.click(
    within(two.getByRole('radiogroup', { name: 'Group by' })).getByRole(
      'radio',
      { name: 'Day' },
    ),
  );
  expect(push).not.toHaveBeenCalled();
  expect(replace).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Remove chart 2' }));
  expect(push).toHaveBeenCalledTimes(1);
  expect(String(push.mock.calls[0]![2])).toContain('off=2');
  fireEvent.click(screen.getByRole('button', { name: 'Add chart' }));
  expect(push).toHaveBeenCalledTimes(2);
  expect(String(push.mock.calls[1]![2])).not.toContain('off=');
  push.mockRestore();
  replace.mockRestore();
});

test('a slot whose series has no value in some periods says why', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    // Running by day: Mon and Tue are only green, Wed on has a red day.
    url: `${URL}?m2=avg-daily-win-loss:line:running&bucket2=day`,
  });
  const two = await chart(2);
  await two.findByRole('img', { name: /Average daily win\/loss/ });
  expect(
    two.getByText(
      'Average daily win/loss (running) shows only for periods with both a green and a red day.',
    ),
  ).toBeTruthy();
  // Chart 1 has a value everywhere, so no note.
  expect((await chart(1)).queryByText(/shows only for/)).toBeNull();
});

test('a slot with no value in any period shows the reason in place of an empty chart', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    // A single day is only green or red, never both.
    url: `${URL}?bucket2=day`,
  });
  const two = await chart(2);
  expect(
    await two.findByText(
      'Average daily win/loss shows only for periods with both a green and a red day.',
    ),
  ).toBeTruthy();
  expect(two.queryByRole('img')).toBeNull();
  // The default (Week) has values, so the chart is there.
});

test('the table starts afresh when the chart it follows changes', async () => {
  renderApp(<PerformanceView />, {
    sample: reportsSample,
    url: `${URL}?m=trades:bar&bucket=day&m2=trades:bar&bucket2=day`,
  });
  const table = await screen.findByRole('table', { name: 'Summary by day' });
  fireEvent.click(
    within(table).getByRole('button', { name: 'Sort by Trades' }),
  );
  expect(
    within(table).getAllByRole('columnheader')[1]!.getAttribute('aria-sort'),
  ).toBe('descending');
  fireEvent.click(screen.getByRole('button', { name: 'Remove chart 1' }));
  const next = await screen.findByRole('table', { name: 'Summary by day' });
  expect(
    within(next).getAllByRole('columnheader')[1]!.getAttribute('aria-sort'),
  ).toBe('none');
});

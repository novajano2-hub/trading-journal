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
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { everyString } from '../__fixtures__/every-string';
import { renderApp } from '../__fixtures__/render-app';
import { StrategyView } from './strategy-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

/** str-1 on both closed trades; its Risk rule shows on losers only. */
async function sample(): Promise<SampleWorkspace> {
  const fx = fixtureSample();
  fx.trades[1]!.strategyIds = ['str-1'];
  fx.strategies[0]!.groups[1]!.rules[0]!.showWhen = 'loser';
  return fx;
}

const open = (id = 'str-1') =>
  renderApp(<StrategyView id={id} />, {
    sample,
    url: `/app/strategies/${id}`,
  });

test("shows the rules under the strategy's own groups, with a chip on a rule that is not always graded", async () => {
  open();
  const table = await screen.findByRole('table', { name: 'Rules' });
  expect(within(table).getByText('Entry')).toBeTruthy();
  expect(within(table).getByText('Risk')).toBeTruthy();
  expect(
    within(table).getByText('Wait for the 15-minute range to close'),
  ).toBeTruthy();
  const loserRow = within(table)
    .getByText('Stop beyond the far side of the range')
    .closest('tr')!;
  expect(within(loserRow).getByText('On losers')).toBeTruthy();
  const alwaysRow = within(table)
    .getByText('Wait for the 15-minute range to close')
    .closest('tr')!;
  expect(within(alwaysRow).queryByText(/^On /)).toBeNull();
});

test('View n trades goes to the log filtered by the strategy; Edit goes to the editor', async () => {
  open();
  const view = await screen.findByRole('link', { name: 'View 2 trades' });
  expect(view.getAttribute('href')).toBe('/app/trades?strategy=str-1');
  expect(
    screen.getByRole('link', { name: 'Edit strategy' }).getAttribute('href'),
  ).toBe('/app/strategies/str-1/edit');
});

test('Archive sets it aside, and the button turns into Unarchive', async () => {
  const { repo } = open();
  fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
  await waitFor(async () =>
    expect(
      (await repo.strategies.get(SAMPLE_WORKSPACE.id, 'str-1'))!.status,
    ).toBe('archived'),
  );
  expect(await screen.findByRole('button', { name: 'Unarchive' })).toBeTruthy();
});

test('a strategy that is not there says so', async () => {
  open('nope');
  expect(await screen.findByText("That strategy isn't here.")).toBeTruthy();
});

/** str-1 on two base-currency trades and a third in euros. */
async function mixed(): Promise<SampleWorkspace> {
  const fx = await sample();
  fx.trades[2]!.strategyIds = ['str-1'];
  fx.trades[2]!.pnlCurrency = 'EUR';
  return fx;
}

test('trades in another currency are left out, and the page says so', async () => {
  renderApp(<StrategyView id="str-1" />, {
    sample: mixed,
    url: '/app/strategies/str-1',
  });
  expect(
    await screen.findByRole('link', { name: 'View 3 trades' }),
  ).toBeTruthy();
  expect(
    screen.getByText(
      '1 trade in another currency is left out of these figures.',
    ),
  ).toBeTruthy();
});

test('with every trade in the base currency there is no left-out note', async () => {
  open();
  await screen.findByRole('link', { name: 'View 2 trades' });
  expect(screen.queryByText(/left out of these figures/)).toBeNull();
});

test('the equity line is an image that says its range, trade count and end value', async () => {
  open();
  const line = await screen.findByRole('img', { name: /^Equity of / });
  const name = line.getAttribute('aria-label')!;
  expect(name).toContain('Opening range breakout');
  expect(name).toContain('16 Nov 2026 to 17 Nov 2026');
  expect(name).toContain('2 closed trades');
  expect(name).toMatch(/ends at \+\$116\.00/);
});

test('under Privacy the equity line names no amount', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<StrategyView id="str-1" />, {
    repository,
    url: '/app/strategies/str-1',
  });
  const line = await screen.findByRole('img', { name: /^Equity of / });
  expect(line.getAttribute('aria-label')).toContain('hidden amount');
  fireEvent.focus(line.closest('[data-equity-points]')!);
  expect(everyString(document.body).filter((t) => /\$\d/.test(t))).toEqual([]);
});

test('focusing the equity line reads a point, and the arrow keys move along it', async () => {
  open();
  const line = await screen.findByRole('img', { name: /^Equity of / });
  const points = line.closest('[data-equity-points]') as HTMLElement;
  expect(points.getAttribute('tabindex')).toBe('0');
  const readout = screen.getByRole('status', { name: 'Equity readout' });
  expect(readout.textContent).toBe('');
  fireEvent.focus(points);
  expect(readout.textContent).toContain('17 Nov 2026');
  expect(readout.textContent).toContain('after trade 2 of 2');
  fireEvent.keyDown(points, { key: 'ArrowLeft' });
  expect(readout.textContent).toContain('16 Nov 2026');
  expect(readout.textContent).toContain('after trade 1 of 2');
  fireEvent.keyDown(points, { key: 'Home' });
  expect(readout.textContent).toContain('Before the first trade');
  fireEvent.blur(points);
  expect(readout.textContent).toBe('');
});

test('the rules are also stacked per rule for narrow screens: the text, three figures, then two', async () => {
  open();
  const list = await screen.findByRole('list', {
    name: 'Rules, one card each',
  });
  const card = within(list)
    .getByText('Wait for the 15-minute range to close')
    .closest('li')!;
  const text = card.textContent!;
  const order = [
    'Wait for the 15-minute range to close',
    'Follow rate',
    'P&L when followed',
    'Cost when broken',
    'Win rate kept',
    'PF kept',
  ].map((t) => text.indexOf(t));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  // The first three share one line; the last two sit on the next.
  const lines = card.querySelectorAll('[data-line]');
  expect(lines).toHaveLength(2);
  expect(lines[0]!.textContent).toContain('Cost when broken');
  expect(lines[1]!.textContent).toContain('PF kept');
});

test('the average win, the drawdown and the broken cost follow the display unit', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample,
  });
  await repository.prefs.update({ displayUnit: 'ticks' });
  renderApp(<StrategyView id="str-1" />, {
    repository,
    url: '/app/strategies/str-1',
  });
  const stats = (await screen.findByRole('heading', { name: 'Stats' })).closest(
    'section',
  )!;
  expect(stats.textContent).toContain('avg win');
  expect(stats.textContent).not.toMatch(/\$\d/);
});

test('if archiving fails the header says so, neutrally', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample,
  });
  repository.strategies.update = async () => {
    throw new Error('quota');
  };
  renderApp(<StrategyView id="str-1" />, {
    repository,
    url: '/app/strategies/str-1',
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("couldn't be archived");
  expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy();
});

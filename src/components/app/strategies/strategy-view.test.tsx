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
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
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

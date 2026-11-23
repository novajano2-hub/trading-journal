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
import { StrategiesView } from './strategies-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

/** str-1 (active) on two trades, plus an archived "Old swing". */
function sample(withArchived = true) {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    fx.trades[1]!.strategyIds = ['str-1'];
    if (withArchived)
      fx.strategies.push({
        id: 'str-old',
        workspaceId: SAMPLE_WORKSPACE.id,
        name: 'Old swing',
        description: 'Retired.',
        assetClasses: ['stock'],
        groups: [{ id: 'g-o', title: 'Entry', rules: [] }],
        checklist: [],
        status: 'archived',
      });
    return fx;
  };
}

test('lists the active strategies, then only the archived ones with the switch', async () => {
  renderApp(<StrategiesView />, { sample: sample(), url: '/app/strategies' });
  expect(await screen.findByText('Opening range breakout')).toBeTruthy();
  expect(screen.queryByText('Old swing')).toBeNull();

  fireEvent.click(screen.getByRole('radio', { name: 'Archived' }));
  expect(await screen.findByText('Old swing')).toBeTruthy();
  expect(screen.queryByText('Opening range breakout')).toBeNull();
});

test('a card shows its rule count, trades and a link to the strategy', async () => {
  renderApp(<StrategiesView />, { sample: sample(), url: '/app/strategies' });
  const card = (await screen.findByText('Opening range breakout')).closest(
    'article',
  )!;
  expect(within(card).getByText('Rules').nextSibling?.textContent).toBe('2');
  expect(within(card).getByText('in 2 groups')).toBeTruthy();
  expect(
    within(card)
      .getByRole('link', { name: 'Opening range breakout' })
      .getAttribute('href'),
  ).toBe('/app/strategies/str-1');
});

test('deleting asks first, names the trades that lose the strategy, then removes it', async () => {
  const { repo } = renderApp(<StrategiesView />, {
    sample: sample(),
    url: '/app/strategies',
  });
  await screen.findByText('Opening range breakout');
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'More for Opening range breakout' }),
    { key: 'Enter' },
  );
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

  const dialog = await screen.findByRole('dialog');
  expect(
    within(dialog).getByText('Delete Opening range breakout?'),
  ).toBeTruthy();
  expect(
    within(dialog).getByText(
      'Its 2 trades keep their data and lose this strategy.',
    ),
  ).toBeTruthy();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(async () =>
    expect(await repo.strategies.get(SAMPLE_WORKSPACE.id, 'str-1')).toBe(
      undefined,
    ),
  );
});

test('with no strategies it says so and offers the first one', async () => {
  renderApp(<StrategiesView />, {
    sample: async () => ({ ...fixtureSample(), strategies: [] }),
    url: '/app/strategies',
  });
  expect(await screen.findByText('No strategies yet.')).toBeTruthy();
  const links = screen.getAllByRole('link', { name: 'New strategy' });
  expect(links[0]!.getAttribute('href')).toBe('/app/strategies/new');
});

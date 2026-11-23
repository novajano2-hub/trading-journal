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

test('a card says when trades in another currency are left out of its figures', async () => {
  renderApp(<StrategiesView />, {
    sample: async () => {
      const fx = await sample()();
      fx.trades[2]!.strategyIds = ['str-1'];
      fx.trades[2]!.pnlCurrency = 'EUR';
      return fx;
    },
    url: '/app/strategies',
  });
  const card = (await screen.findByText('Opening range breakout')).closest(
    'article',
  )!;
  expect(
    within(card).getByText(
      '1 trade in another currency is left out of these figures.',
    ),
  ).toBeTruthy();
});

test('a card has no left-out note when every trade is in the base currency', async () => {
  renderApp(<StrategiesView />, { sample: sample(), url: '/app/strategies' });
  await screen.findByText('Opening range breakout');
  expect(screen.queryByText(/left out of these figures/)).toBeNull();
});

test("a card's equity line is an image with its range, count and end value, and reads a point on focus", async () => {
  renderApp(<StrategiesView />, { sample: sample(), url: '/app/strategies' });
  const line = await screen.findByRole('img', { name: /^Equity of / });
  const name = line.getAttribute('aria-label')!;
  expect(name).toContain('16 Nov 2026 to 17 Nov 2026');
  expect(name).toContain('2 closed trades');
  fireEvent.focus(line.closest('[data-equity-points]')!);
  expect(
    screen.getByRole('status', { name: 'Equity readout' }).textContent,
  ).toContain('17 Nov 2026');
});

test('if archiving fails the list says so, neutrally', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  repository.strategies.update = async () => {
    throw new Error('quota');
  };
  renderApp(<StrategiesView />, { repository, url: '/app/strategies' });
  await screen.findByText('Opening range breakout');
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'More for Opening range breakout' }),
    { key: 'Enter' },
  );
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("couldn't be archived");
});

test('the unassigned-trades note follows the display unit', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  await repository.prefs.update({ displayUnit: 'ticks' });
  renderApp(<StrategiesView />, { repository, url: '/app/strategies' });
  const note = (
    await screen.findByText(/has no strategy|have no strategy/)
  ).closest('p')!;
  expect(note.textContent).toMatch(/ticks/);
  expect(note.textContent).not.toMatch(/\$\d/);
});

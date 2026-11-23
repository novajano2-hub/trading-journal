// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { breakdownSample } from '../__fixtures__/breakdown-sample';
import { renderApp } from '../__fixtures__/render-app';
import { WinsLossesView } from './wins-losses';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const stat = (card: HTMLElement, label: string) =>
  card.querySelector(`[data-stat="${label}"]`)!.textContent;

test('counts and average nets match the fixture, side by side', async () => {
  renderApp(<WinsLossesView />, {
    sample: breakdownSample,
    url: '/app/reports/wins-losses',
  });
  const page = await screen.findByTestId('reports-wins-losses');
  const wins = within(page).getByRole('region', { name: 'Wins' });
  const losses = within(page).getByRole('region', { name: 'Losses' });
  // Wins: +100, +70, +30 (three trades, +$200.00, average +$66.67).
  expect(stat(wins, 'trades')).toBe('3');
  expect(stat(wins, 'pnl')).toBe('+$200.00');
  expect(stat(wins, 'avg-win')).toBe('+$66.67');
  // Losses: -40, -20, -10, -5.
  expect(stat(losses, 'trades')).toBe('4');
  expect(stat(losses, 'pnl')).toBe('−$75.00');
  expect(stat(losses, 'avg-loss')).toBe('−$18.75');
  // Held 45, 35 and 30 minutes: 36m 40s on average.
  expect(stat(wins, 'avg-duration')).toBe('36m 40s');
  expect(stat(wins, 'long-share')).toBe('100.0%');
  expect(stat(losses, 'long-share')).toBe('50.0%');
  // R: only b-1 (+2R) among the winners has a stop; the losers have b-2 at -1R.
  expect(stat(wins, 'realized-r')).toBe('+2.00R');
  expect(stat(losses, 'realized-r')).toBe('−1.00R');
});

test('every figure label has a definition, and Privacy hides the amounts', async () => {
  const { createLocalRepository } =
    await import('@/data/local/local-repository');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: breakdownSample,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  const { container } = renderApp(<WinsLossesView />, {
    repository,
    url: '/app/reports/wins-losses',
  });
  const page = await screen.findByTestId('reports-wins-losses');
  for (const id of [
    'trades',
    'pnl',
    'avg-win',
    'avg-loss',
    'avg-duration',
    'realized-r',
    'avg-size',
    'mae',
    'mfe',
    'long-share',
  ])
    expect(page.querySelector(`[data-metric-tip="${id}"]`), id).not.toBeNull();
  expect(container.textContent).not.toMatch(/\$\d/);
});

test('in R the P&L and the averages read in R', async () => {
  const { createLocalRepository } =
    await import('@/data/local/local-repository');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: breakdownSample,
  });
  await repository.prefs.update({ displayUnit: 'r' });
  renderApp(<WinsLossesView />, {
    repository,
    url: '/app/reports/wins-losses',
  });
  const page = await screen.findByTestId('reports-wins-losses');
  const wins = within(page).getByRole('region', { name: 'Wins' });
  const losses = within(page).getByRole('region', { name: 'Losses' });
  // Only b-1 (+2R) of the winners and b-2 (-1R) of the losers have a stop.
  expect(stat(wins, 'pnl')).toContain('+2.00R');
  expect(stat(wins, 'avg-win')).toContain('+2.00R');
  expect(stat(losses, 'pnl')).toContain('−1.00R');
  expect(stat(losses, 'avg-loss')).toContain('−1.00R');
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from '@/data/seed/generate';
import { renderApp } from '../__fixtures__/render-app';
import { PropDashboard } from './prop-dashboard';
import { PropHome } from './prop-home';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
// The tip's own wording does not use the basis for a prop figure, so the basis
// each tip is handed is what the test reads.
vi.mock('@/components/ui/metric-tip', () => ({
  MetricTip: ({
    id,
    basis,
    children,
  }: {
    id: string;
    basis: string;
    children?: React.ReactNode;
  }) => (
    <button type="button" data-metric-tip={id} data-basis={basis}>
      {children}
    </button>
  ),
}));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const sample: SampleWorkspace = generateSampleWorkspace({
  seed: SAMPLE_SEED,
  endDate: '2026-11-19',
});

/** A repository whose trader shows gross P&L: the prop figures are net all the same (C72). */
async function grossTrader(): Promise<Repository> {
  const r = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => structuredClone(sample),
  });
  await r.prefs.update({ pnlBasis: 'gross' });
  return r;
}

const tips = () =>
  [...document.querySelectorAll<HTMLElement>('[data-metric-tip]')].map(
    (el) => [el.dataset.metricTip, el.dataset.basis] as const,
  );

test('every tip on the prop dashboard is handed the net basis, whatever the trader shows (C72, C-09)', async () => {
  const r = await grossTrader();
  renderApp(<PropDashboard />, { repository: r, url: '/app/prop-firms' });
  await screen.findByRole('region', { name: 'Total spent' });
  await screen.findByRole('region', { name: 'Why accounts broke' });
  const all = tips();
  // The tiles, the return chart, the money, the pass rate and the breach card.
  const ids = all.map(([id]) => id);
  for (const id of [
    'prop-spent',
    'prop-return',
    'prop-money',
    'prop-pass-rate',
    'prop-breach-reasons',
  ])
    expect(ids, id).toContain(id);
  expect(all.length).toBeGreaterThan(8);
  expect(all.filter(([, basis]) => basis !== 'net')).toEqual([]);
});

test('the first run totals read net too (C72, C-09)', async () => {
  const r = await grossTrader();
  await r.workspaces.setActive('mine');
  renderApp(<PropHome />, { repository: r, url: '/app/prop-firms' });
  await screen.findByText('Step 1 of 4');
  fireEvent.click(screen.getByRole('radio', { name: /Prop firms/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('Step 2 of 4');
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('Step 3 of 4');
  const all = tips();
  expect(all.map(([id]) => id)).toEqual(
    expect.arrayContaining(['prop-spent', 'prop-earned', 'prop-net']),
  );
  expect(all.filter(([, basis]) => basis !== 'net')).toEqual([]);
});

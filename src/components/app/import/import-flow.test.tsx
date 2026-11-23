// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { renderApp } from '../__fixtures__/render-app';
import { ImportFlow } from './import-flow';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

const pending = vi.hoisted(() => ({
  load: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('@/lib/pending-import', () => ({
  loadPendingImport: pending.load,
  clearPendingImport: pending.clear,
  savePendingImport: vi.fn(),
}));

MotionGlobalConfig.skipAnimations = true;

beforeEach(() => {
  pending.load.mockReset().mockResolvedValue(undefined);
  pending.clear.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

const FILE = [
  'Time,Symbol,Side,Quantity,Price',
  '11/19/2026 09:30:00,ESZ6,Buy,1,5000',
  '11/19/2026 09:45:00,ESZ6,Sell,1,5004',
].join('\n');

async function open() {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repo.accounts.create('mine', {
    name: 'Futures',
    broker: 'Sample broker',
    type: 'live',
    currency: 'USD',
    startingBalance: 5_000_000,
    status: 'active',
    timeZone: 'America/Chicago',
  });
  renderApp(
    <Suspense fallback={null}>
      <ImportFlow />
    </Suspense>,
    { repository: repo, url: '/app/import' },
  );
  return { repo };
}

test('a file handed over from the landing page opens straight into Map', async () => {
  pending.load.mockResolvedValue(
    new File([FILE], 'landing.csv', { type: 'text/csv' }),
  );
  await open();
  expect(
    await screen.findByRole('heading', { name: 'Match your columns' }),
  ).toBeTruthy();
  expect(window.location.search).toContain('step=map');
  expect(screen.getAllByText(/landing\.csv/).length).toBeGreaterThan(0);
});

test('committing the import clears the file waiting in this browser', async () => {
  await open();
  fireEvent.change(await screen.findByLabelText('Import file'), {
    target: { files: [new File([FILE], 'fills.csv', { type: 'text/csv' })] },
  });
  fireEvent.click(await screen.findByRole('button', { name: /^Map columns/ }));
  await screen.findByRole('heading', { name: 'Match your columns' });
  // Choosing the file already cleared the old one; count from here.
  pending.clear.mockClear();
  fireEvent.click(screen.getByRole('button', { name: /^Preview/ }));
  expect(pending.clear).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Import 1 trade into Futures' }),
  );
  await screen.findByText('1 trade imported into Futures.');
  await waitFor(() => expect(pending.clear).toHaveBeenCalledTimes(1));
});

test('the stepper has a one-line phone form: "Step 2 of 4: Map columns" over a progress bar', async () => {
  pending.load.mockResolvedValue(
    new File([FILE], 'landing.csv', { type: 'text/csv' }),
  );
  await open();
  await screen.findByRole('heading', { name: 'Match your columns' });
  const line = screen.getByText('Step 2 of 4: Map columns');
  expect(line.parentElement!.className).toContain('sm:hidden');
  const bar = screen.getByRole('progressbar', { name: 'Import progress' });
  expect(bar.getAttribute('aria-valuenow')).toBe('2');
  expect(bar.getAttribute('aria-valuemax')).toBe('4');
  expect(
    screen.getByRole('list', { name: 'Import steps' }).className,
  ).toContain('max-sm:hidden');
});

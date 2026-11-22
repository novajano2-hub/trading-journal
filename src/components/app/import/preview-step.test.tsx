// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { Suspense } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { NewAccount, Repository } from '@/data/repository';
import { renderApp } from '../__fixtures__/render-app';
import { ImportFlow } from './import-flow';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const TRIPS =
  'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price,Commission,P&L';
const row = (pnl: string, at = '09') =>
  `2026-11-16 ${at}:30:00,2026-11-16 ${at}:45:00,ESZ6,Long,1,6000,6004,5.00,${pnl}`;
const FILLS = 'Time,Symbol,Side,Quantity,Price';

const futures: NewAccount = {
  name: 'Futures',
  broker: 'Sample broker',
  type: 'live',
  currency: 'USD',
  startingBalance: 5_000_000,
  status: 'active',
  timeZone: 'America/Chicago',
};

function csv(lines: readonly string[], name = 'trades.csv') {
  return new File([lines.join('\n')], name, { type: 'text/csv' });
}

async function toPreview(file: File): Promise<{ repo: Repository }> {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repo.accounts.create('mine', futures);
  renderApp(
    <Suspense fallback={null}>
      <ImportFlow />
    </Suspense>,
    { repository: repo, url: '/app/import' },
  );
  fireEvent.change(await screen.findByLabelText('Import file'), {
    target: { files: [file] },
  });
  fireEvent.click(await screen.findByRole('button', { name: /^Map columns/ }));
  await screen.findByRole('heading', { name: 'Match your columns' });
  fireEvent.click(screen.getByRole('button', { name: /^Preview/ }));
  return { repo };
}

const tile = (name: string) =>
  within(screen.getByRole('region', { name: 'What Keel read' })).getByText(name)
    .parentElement!;

test('the tiles match the plan, and a P&L mismatch row says what the file says', async () => {
  await toPreview(
    csv([
      TRIPS,
      row('200.00', '09'),
      row('10.00', '10'),
      row('200.00', '11'),
      // Skipped: an exit that is not a number.
      '2026-11-16 12:30:00,2026-11-16 12:45:00,ESZ6,Long,1,6000,60O4,5.00,200.00',
    ]),
  );
  await screen.findByRole('region', { name: 'What Keel read' });
  expect(within(tile('Rows read')).getByText('4')).toBeTruthy();
  expect(within(tile('Trades built')).getByText('3')).toBeTruthy();
  expect(within(tile('Duplicates skipped')).getByText('0')).toBeTruthy();
  expect(within(tile('Rows with issues')).getByText('1')).toBeTruthy();
  expect(screen.getByText('File says +$10.00')).toBeTruthy();
  // The issue is listed with its row, counted as in the file (the header is row 1).
  expect(screen.getByText('Row 5')).toBeTruthy();
  expect(window.location.search).toContain('step=preview');
});

test('Confirm commits the plan and says what landed where', async () => {
  const { repo } = await toPreview(
    csv([
      TRIPS,
      row('200.00'),
      '2026-11-16 12:30:00,2026-11-16 12:45:00,ESZ6,Long,1,6000,60O4,5.00,200.00',
    ]),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Import 1 trade into Futures' }),
  );
  expect(
    await screen.findByText(/1 row with issues was left out/),
  ).toBeTruthy();
  expect(
    await screen.findByText('1 trade imported into Futures.'),
  ).toBeTruthy();
  expect(
    screen.getByText(
      (_, el) =>
        el?.tagName === 'P' &&
        el.textContent === 'You can undo this import from Import history.',
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Import history' }).getAttribute('href'),
  ).toBe('/app/settings/import-history');
  expect(await repo.trades.list('mine')).toHaveLength(1);
  const [job] = await repo.imports.list('mine');
  expect(job).toMatchObject({ tradeCount: 1, status: 'active' });
  expect(window.location.search).toContain('step=confirm');
  expect(screen.getByRole('button', { name: 'View trades' })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Import another file' }),
  ).toBeTruthy();
});

test('a plan blocked by unpriced symbols names them and goes back to the point values', async () => {
  await toPreview(
    csv([
      FILLS,
      '11/19/2026 09:30:00,HGZ6,Buy,1,4.10',
      '11/19/2026 09:45:00,HGZ6,Sell,1,4.20',
    ]),
  );
  expect(await screen.findByText(/HG needs a point value/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Import \d/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Set point values' }));
  await waitFor(() => expect(window.location.search).toContain('step=map'));
});

test('a file whose rows are all imported already says so and offers another file', async () => {
  const { repo } = await toPreview(csv([TRIPS, row('200.00')]));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Import 1 trade into Futures' }),
  );
  await screen.findByText('1 trade imported into Futures.');
  // Same file again, through the flow.
  fireEvent.click(screen.getByRole('button', { name: 'Import another file' }));
  fireEvent.change(await screen.findByLabelText('Import file'), {
    target: { files: [csv([TRIPS, row('200.00')])] },
  });
  fireEvent.click(await screen.findByRole('button', { name: /^Map columns/ }));
  await screen.findByRole('heading', { name: 'Match your columns' });
  fireEvent.click(screen.getByRole('button', { name: /^Preview/ }));
  expect(await screen.findByText(/already imported into Futures/)).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Choose another file' }),
  ).toBeTruthy();
  expect(await repo.trades.list('mine')).toHaveLength(1);
});

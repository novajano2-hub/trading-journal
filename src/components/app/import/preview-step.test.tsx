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
import type { UserPrefs } from '@/domain/types';
import { useActiveWorkspace, useSetActiveWorkspace } from '@/data/query/hooks';
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

/** What the sidebar's switcher does, beside the flow. */
function SampleSwitch() {
  const active = useActiveWorkspace().data;
  const set = useSetActiveWorkspace();
  return (
    <div>
      <p>Active: {active?.id}</p>
      <button type="button" onClick={() => set.mutate('sample')}>
        Switch to sample
      </button>
    </div>
  );
}

async function toPreview(
  file: File,
  prefs: Partial<UserPrefs> = {},
): Promise<{ repo: Repository }> {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repo.accounts.create('mine', futures);
  if (Object.keys(prefs).length > 0) await repo.prefs.update(prefs);
  renderApp(
    <Suspense fallback={null}>
      <ImportFlow />
      <SampleSwitch />
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

test('a plan blocked by unpriced symbols names them and goes back to the point values, focused', async () => {
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
  // Map opens with the first point-value input ready to type in.
  const input = await screen.findByLabelText('HG point value');
  await waitFor(() => expect(document.activeElement).toBe(input));
});

test('a symbol Keel cannot place is not offered a point value: it says to check the Symbol column', async () => {
  await toPreview(
    csv([
      FILLS,
      '11/19/2026 09:30:00,FUT-01,Buy,1,4.10',
      '11/19/2026 09:45:00,FUT-01,Sell,1,4.20',
    ]),
  );
  expect(
    await screen.findByText('FUT-01 is not a symbol Keel knows'),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "Keel doesn't recognise the symbol, check the Symbol column.",
    ),
  ).toBeTruthy();
  // The way out is not a Map with nothing to set.
  expect(screen.queryByRole('button', { name: 'Set point values' })).toBeNull();
  expect(screen.queryByText(/needs a point value/)).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Choose another file' }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back to columns' }));
  await waitFor(() => expect(window.location.search).toContain('step=map'));
});

test('with both kinds, the priceable root is asked for and the other symbol is named apart', async () => {
  await toPreview(
    csv([
      FILLS,
      '11/19/2026 09:30:00,HGZ6,Buy,1,4.10',
      '11/19/2026 09:45:00,HGZ6,Sell,1,4.20',
      '11/19/2026 09:50:00,FUT-01,Buy,1,4.10',
    ]),
  );
  expect(await screen.findByText(/HG needs a point value/)).toBeTruthy();
  expect(
    screen.getByText(/Keel doesn't recognise FUT-01, check the Symbol column/),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Set point values' })).toBeTruthy();
});

const stalePlan =
  'Your trades changed while you were mapping. Review the preview again.';

test('a trade made while the plan waits makes Confirm say so, and the preview is read again', async () => {
  const { repo } = await toPreview(csv([TRIPS, row('200.00')]));
  const button = await screen.findByRole('button', {
    name: 'Import 1 trade into Futures',
  });
  const [account] = await repo.accounts.list('mine');
  await repo.trades.createManual('mine', {
    accountId: account!.id,
    instrument: {
      symbol: 'AAPL',
      root: 'AAPL',
      assetClass: 'stock',
      pointValue: 1,
      tickSize: 0.01,
      quoteCurrency: 'USD',
    },
    fills: [
      {
        time: '2026-11-16T14:00:00.000Z',
        side: 'buy',
        qty: 1,
        price: 200,
        commission: 0,
        fees: 0,
      },
    ],
  });
  fireEvent.click(button);
  expect(await screen.findByText(stalePlan)).toBeTruthy();
  expect(await repo.imports.list('mine')).toHaveLength(0);
  // The plan is built again over the new import state: Confirm now goes through.
  await waitFor(async () => {
    const again = screen.queryByRole('button', {
      name: 'Import 1 trade into Futures',
    });
    if (again) fireEvent.click(again);
    expect(await repo.imports.list('mine')).toHaveLength(1);
  });
  expect(
    await screen.findByText('1 trade imported into Futures.'),
  ).toBeTruthy();
});

test('View trades switches to My workspace first, then opens the account in the log', async () => {
  const { repo } = await toPreview(csv([TRIPS, row('200.00')]));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Import 1 trade into Futures' }),
  );
  await screen.findByText('1 trade imported into Futures.');
  // The commit made My workspace active; the sidebar is switched to the sample afterwards.
  fireEvent.click(screen.getByRole('button', { name: 'Switch to sample' }));
  await screen.findByText('Active: sample');
  const [account] = await repo.accounts.list('mine');

  const order: string[] = [];
  const setActive = repo.workspaces.setActive.bind(repo.workspaces);
  repo.workspaces.setActive = async (id) => {
    await setActive(id);
    order.push(`switch ${id}`);
  };
  const pushState = window.history.pushState;
  window.history.pushState = (...args) => {
    order.push('push');
    pushState.apply(window.history, args);
  };
  try {
    fireEvent.click(screen.getByRole('button', { name: 'View trades' }));
    await waitFor(() => expect(order).toEqual(['switch mine', 'push']));
  } finally {
    window.history.pushState = pushState;
  }
  expect(window.location.pathname).toBe('/app/trades');
  expect(new URLSearchParams(window.location.search).get('account')).toBe(
    account!.id,
  );
  expect((await repo.workspaces.getActive()).id).toBe('mine');
});

test('under Privacy a skipped row hides the money value it quotes', async () => {
  await toPreview(
    csv([
      TRIPS,
      row('200.00'),
      '2026-11-16 12:30:00,2026-11-16 12:45:00,ESZ6,Long,1,6000,6004,5.00,"$1,2x"',
    ]),
    { displayUnit: 'privacy' },
  );
  await screen.findByRole('region', { name: 'What Keel read' });
  expect(screen.getByText('Row 3')).toBeTruthy();
  expect(document.body.textContent).not.toContain('$1,2x');
  expect(screen.getAllByLabelText('hidden amount').length).toBeGreaterThan(0);
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

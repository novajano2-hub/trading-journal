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
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { parseCsv } from '@/domain/import/csv';
import { guessMapping } from '@/domain/import/mapping';
import { planImport } from '@/domain/import/plan';
import { renderApp } from '../__fixtures__/render-app';
import { ImportHistory } from './import-history';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const H = 'Date/Time,Symbol,Buy/Sell,Quantity,Price\n';
const FIRST =
  H +
  '2026-11-16 09:41:00,ESZ5,Buy,2,6010\n2026-11-16 10:00:00,ESZ5,Sell,2,6015\n';
const SECOND =
  H +
  '2026-11-17 09:41:00,NQZ5,Buy,1,21000\n2026-11-17 10:00:00,NQZ5,Sell,1,21010\n';

async function seeded(archive = false) {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const account = await repo.accounts.create('mine', {
    name: 'Futures',
    broker: 'b',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  let minute = 0;
  for (const [name, text] of [
    ['first.csv', FIRST],
    ['second.csv', SECOND],
  ] as const) {
    const ctx = await repo.imports.context('mine', account.id);
    const parsed = parseCsv(text);
    const plan = planImport(
      parsed,
      guessMapping(parsed, { sourceTimeZone: 'America/New_York' }),
      ctx,
      {
        importId: name,
        fileName: name,
        now: new Date(Date.UTC(2026, 10, 21, 12, minute++)).toISOString(),
      },
    );
    await repo.imports.commit('mine', plan);
  }
  if (archive)
    await repo.accounts.update('mine', account.id, { status: 'archived' });
  renderApp(<ImportHistory />, {
    repository: repo,
    url: '/app/settings/import-history',
  });
  return repo;
}

test('lists the jobs newest first with their counts and status', async () => {
  await seeded();
  const table = await screen.findByRole('table');
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  expect(within(rows[0]!).getByText('second.csv')).toBeTruthy();
  expect(within(rows[1]!).getByText('first.csv')).toBeTruthy();
  expect(within(rows[0]!).getByText('Futures')).toBeTruthy();
  expect(within(rows[0]!).getByText('Active')).toBeTruthy();
  for (const name of [
    'File',
    'Account',
    'Date',
    'Rows',
    'Trades',
    'Duplicates',
    'Skipped',
    'Status',
  ])
    expect(within(table).getByRole('columnheader', { name })).toBeTruthy();
});

test('Undo asks first, then marks the job Undone and removes its trades', async () => {
  const repo = await seeded();
  const rows = (await screen.findAllByRole('row')).slice(1);
  fireEvent.click(
    within(rows[1]!).getByRole('button', { name: 'Undo first.csv' }),
  );
  expect(
    await screen.findByText(
      'Undo this import? Its 1 trade is removed. Rows a later import skipped as duplicates stay out until you import that file again.',
    ),
  ).toBeTruthy();
  expect(await repo.trades.list('mine')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Undo import' }));
  await waitFor(async () =>
    expect(await repo.trades.list('mine')).toHaveLength(1),
  );
  await waitFor(() => {
    const after = screen.getAllByRole('row').slice(1);
    expect(within(after[1]!).getByText('Undone')).toBeTruthy();
    expect(
      within(after[1]!).queryByRole('button', { name: /^Undo/ }),
    ).toBeNull();
  });
  expect((await repo.imports.list('mine')).map((j) => j.status)).toEqual([
    'active',
    'undone',
  ]);
});

test('an empty history says so', async () => {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  renderApp(<ImportHistory />, {
    repository: repo,
    url: '/app/settings/import-history',
  });
  expect(await screen.findByText('No imports yet.')).toBeTruthy();
});

test("an archived account's imports offer no Undo, and say why (M6)", async () => {
  await seeded(true);
  const table = await screen.findByRole('table');
  await within(table).findByText('first.csv');
  const undo = within(table).getByRole('button', { name: 'Undo first.csv' });
  expect((undo as HTMLButtonElement).disabled).toBe(true);
  const why = document.getElementById(undo.getAttribute('aria-describedby')!);
  expect(why?.textContent).toBe(
    "Imports into an archived account can't be undone: its trades are read-only. Unarchive the account in Accounts to undo one.",
  );
});

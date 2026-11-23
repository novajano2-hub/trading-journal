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
import { renderApp } from '../__fixtures__/render-app';
import { AccountsSettings } from './accounts';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const URL = '/app/settings/accounts';

function repo() {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}

/** "$50,116.00" or "−$500.00" as a number of dollars. */
const dollars = (text: string) =>
  Number(text.replace(/[$,]/g, '').replace('−', '-'));

async function rowOf(name: string): Promise<HTMLElement> {
  const row = await screen.findByRole('row', {
    name: new RegExp(`^${name}`),
  });
  return row;
}

/** The cell under the column header with this name. */
function cell(row: HTMLElement, header: string): HTMLElement {
  const table = row.closest('table')!;
  const heads = [...table.querySelectorAll('thead th')].map((h) =>
    h.textContent!.trim(),
  );
  return within(row).getAllByRole('cell')[heads.indexOf(header)]!;
}

async function openMenu(account: string) {
  fireEvent.keyDown(
    await screen.findByRole('button', { name: `Actions for ${account}` }),
    { key: 'Enter' },
  );
}

test('the table reads each account with its balance today and its status', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const futures = await rowOf('Futures main');
  expect(cell(futures, 'Starting balance').textContent).toBe('$50,000.00');
  // $50,000.00 plus +$245.50 and -$129.50.
  await waitFor(() =>
    expect(cell(futures, 'Balance today').textContent).toBe('$50,116.00'),
  );
  expect(cell(futures, 'Status').textContent).toBe('Active');
  const old = await rowOf('Old demo');
  expect(cell(old, 'Status').textContent).toContain('Archived');
});

test('adding a withdrawal of $500 lowers the balance today by $500', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const futures = await rowOf('Futures main');
  await waitFor(() =>
    expect(cell(futures, 'Balance today').textContent).toBe('$50,116.00'),
  );
  await openMenu('Futures main');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Deposits and withdrawals' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Deposits and withdrawals',
  });
  expect(within(dialog).getByText('No deposits or withdrawals.')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
  fireEvent.change(within(dialog).getByLabelText('Date'), {
    target: { value: '2026-11-10' },
  });
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Withdrawal' }));
  fireEvent.change(within(dialog).getByLabelText('Amount'), {
    target: { value: '500' },
  });
  fireEvent.change(within(dialog).getByLabelText('Note'), {
    target: { value: 'Payout' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  const listed = await within(dialog).findByRole('row', { name: /Payout/ });
  expect(listed.textContent).toContain('−$500.00');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() =>
    expect(dollars(cell(futures, 'Balance today').textContent!)).toBe(
      50_116 - 500,
    ),
  );
});

test('a flow can be edited and removed', async () => {
  const r = repo();
  await r.cashFlows.create('sample', {
    accountId: 'acc-a',
    date: '2026-11-05',
    amount: 100_000,
    note: 'Top up',
  });
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  await openMenu('Futures main');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Deposits and withdrawals' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Deposits and withdrawals',
  });
  const row = await within(dialog).findByRole('row', { name: /Top up/ });
  expect(row.textContent).toContain('+$1,000.00');
  fireEvent.click(within(row).getByRole('button', { name: 'Edit Top up' }));
  fireEvent.change(within(dialog).getByLabelText('Amount'), {
    target: { value: '1200' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(
      within(dialog).getByRole('row', { name: /Top up/ }).textContent,
    ).toContain('+$1,200.00'),
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Remove Top up' }),
  );
  await within(dialog).findByText('No deposits or withdrawals.');
  expect(await r.cashFlows.list('sample')).toEqual([]);
});

test('Clear trades needs the account name typed, then removes its trades', async () => {
  const r = repo();
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  await openMenu('Futures main');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Clear trades' }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(
    within(dialog).getByText(
      "Delete all 2 trades and imports in Futures main? This can't be undone.",
    ),
  ).toBeTruthy();
  const confirm = within(dialog).getByRole('button', {
    name: 'Clear trades',
  }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(dialog).getByRole('textbox'), {
    target: { value: 'Futures' },
  });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(dialog).getByRole('textbox'), {
    target: { value: 'Futures main' },
  });
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);
  await waitFor(async () =>
    expect((await r.trades.list('sample')).map((t) => t.id)).toEqual(['f-3']),
  );
});

test('Delete is offered only to an account with no trades', async () => {
  const r = repo();
  await r.accounts.create('sample', {
    name: 'Empty one',
    broker: '',
    type: 'live',
    currency: 'USD',
    startingBalance: 0,
    status: 'active',
  });
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  await openMenu('Futures main');
  await screen.findByRole('menuitem', { name: 'Clear trades' });
  expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

  await openMenu('Empty one');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Delete account' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('row', { name: /^Empty one/ })).toBeNull(),
  );
  expect((await r.accounts.list('sample')).map((a) => a.name)).toEqual([
    'Futures main',
    'Old demo',
  ]);
});

test('archiving shows Archived and the row reads Read-only; Unarchive brings it back', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  await openMenu('Futures main');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
  const futures = await rowOf('Futures main');
  await waitFor(() =>
    expect(cell(futures, 'Status').textContent).toContain('Archived'),
  );
  expect(futures.textContent).toContain('Read-only');
  await openMenu('Futures main');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Unarchive' }));
  await waitFor(() =>
    expect(cell(futures, 'Status').textContent).toBe('Active'),
  );
});

test('New account makes an account from the dialog', async () => {
  const r = repo();
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  fireEvent.click(await screen.findByRole('button', { name: 'New account' }));
  const dialog = await screen.findByRole('dialog', { name: 'New account' });
  fireEvent.change(within(dialog).getByLabelText('Account name'), {
    target: { value: 'Swing book' },
  });
  fireEvent.change(within(dialog).getByLabelText('Broker'), {
    target: { value: 'Some broker' },
  });
  fireEvent.change(within(dialog).getByLabelText('Starting balance'), {
    target: { value: '12,500.50' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  const row = await rowOf('Swing book');
  expect(cell(row, 'Starting balance').textContent).toBe('$12,500.50');
  const made = (await r.accounts.list('sample')).find(
    (a) => a.name === 'Swing book',
  );
  expect(made).toMatchObject({
    broker: 'Some broker',
    startingBalance: 1_250_050,
  });
});

test('Privacy hides every balance', async () => {
  const r = repo();
  await r.prefs.update({ displayUnit: 'privacy' });
  const { container } = renderApp(<AccountsSettings />, {
    repository: r,
    url: URL,
  });
  await rowOf('Futures main');
  expect(container.textContent).toContain('$•••');
  expect(container.textContent).not.toMatch(/\$\d/);
});

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

const card = () => screen.findByRole('region', { name: 'Balance adjustments' });

test('the Balance adjustments card shows the first active account, whose row is marked', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const c = await card();
  expect(within(c).getByText('Futures main, in USD')).toBeTruthy();
  expect(within(c).getByText('No deposits or withdrawals.')).toBeTruthy();
  expect((await rowOf('Futures main')).getAttribute('aria-current')).toBe(
    'true',
  );
  expect((await rowOf('Old demo')).getAttribute('aria-current')).toBeNull();
  expect(c.textContent).toContain('Not profit or loss');
});

test('the row menu picks the account for the card, marks its row and moves focus to the card', async () => {
  const r = repo();
  await r.cashFlows.create('sample', {
    accountId: 'acc-b',
    date: '2026-11-03',
    amount: 25_000,
    note: 'Demo top up',
  });
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  await card();
  await openMenu('Old demo');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Deposits and withdrawals' }),
  );
  const c = await card();
  await waitFor(() =>
    expect(within(c).getByText('Old demo, in USD')).toBeTruthy(),
  );
  expect(within(c).getByRole('row', { name: /Demo top up/ })).toBeTruthy();
  expect((await rowOf('Old demo')).getAttribute('aria-current')).toBe('true');
  expect((await rowOf('Futures main')).getAttribute('aria-current')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(c));
});

test('adding a withdrawal of $500 in the card lowers the balance today by $500', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const futures = await rowOf('Futures main');
  await waitFor(() =>
    expect(cell(futures, 'Balance today').textContent).toBe('$50,116.00'),
  );
  const c = await card();
  fireEvent.click(within(c).getByRole('button', { name: 'Add adjustment' }));
  fireEvent.change(within(c).getByLabelText('Date'), {
    target: { value: '2026-11-10' },
  });
  fireEvent.click(within(c).getByRole('radio', { name: 'Withdrawal' }));
  fireEvent.change(within(c).getByLabelText('Amount'), {
    target: { value: '500' },
  });
  fireEvent.change(within(c).getByLabelText('Note'), {
    target: { value: 'Payout' },
  });
  fireEvent.click(within(c).getByRole('button', { name: 'Save' }));
  const listed = await within(c).findByRole('row', { name: /Payout/ });
  expect(listed.textContent).toContain('−$500.00');
  await waitFor(() =>
    expect(dollars(cell(futures, 'Balance today').textContent!)).toBe(
      50_116 - 500,
    ),
  );
});

test('a flow can be edited, and is removed only after a confirmation', async () => {
  const r = repo();
  await r.cashFlows.create('sample', {
    accountId: 'acc-a',
    date: '2026-11-05',
    amount: 100_000,
    note: 'Top up',
  });
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  const c = await card();
  const row = await within(c).findByRole('row', { name: /Top up/ });
  expect(row.textContent).toContain('+$1,000.00');
  fireEvent.click(within(row).getByRole('button', { name: 'Edit Top up' }));
  fireEvent.change(within(c).getByLabelText('Amount'), {
    target: { value: '1200' },
  });
  fireEvent.click(within(c).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(
      within(c).getByRole('row', { name: /Top up/ }).textContent,
    ).toContain('+$1,200.00'),
  );
  fireEvent.click(within(c).getByRole('button', { name: 'Remove Top up' }));
  const confirm = await screen.findByRole('dialog', {
    name: /Remove Top up\?/,
  });
  // Asking changes nothing; Cancel keeps it.
  expect(await r.cashFlows.list('sample')).toHaveLength(1);
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await r.cashFlows.list('sample')).toHaveLength(1);
  fireEvent.click(within(c).getByRole('button', { name: 'Remove Top up' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: 'Remove',
    }),
  );
  await within(c).findByText('No deposits or withdrawals.');
  expect(await r.cashFlows.list('sample')).toEqual([]);
});

test('at 390 the actions column and the first column stay in view', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const row = await rowOf('Futures main');
  const actions = within(row).getByRole('button', {
    name: 'Actions for Futures main',
  });
  const td = actions.closest('td')!;
  expect(td.className).toContain('sticky');
  expect(td.className).toContain('right-0');
  const th = row.closest('table')!.querySelector('thead th:last-child')!;
  expect(th.className).toContain('sticky');
  expect(th.className).toContain('right-0');
});

test('a failed flows read shows the failure, not a loader', async () => {
  const r = repo();
  const broken = {
    ...r,
    cashFlows: {
      ...r.cashFlows,
      list: async () => {
        throw new Error('no read');
      },
    },
  };
  renderApp(<AccountsSettings />, { repository: broken, url: URL });
  expect((await screen.findByRole('alert')).textContent).toContain(
    "Keel couldn't read your accounts",
  );
  expect(screen.queryByText('Loading your accounts...')).toBeNull();
});

test('a failed trades read shows the failure, not a loader', async () => {
  const r = repo();
  const broken = {
    ...r,
    trades: {
      ...r.trades,
      list: async () => {
        throw new Error('no read');
      },
    },
  };
  renderApp(<AccountsSettings />, { repository: broken, url: URL });
  expect((await screen.findByRole('alert')).textContent).toContain(
    "Keel couldn't read your accounts",
  );
  expect(screen.queryByText('Loading your accounts...')).toBeNull();
});

test('an account with no name is refused: the error is an alert tied to the field, and focus goes to it', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  fireEvent.click(await screen.findByRole('button', { name: 'New account' }));
  const dialog = await screen.findByRole('dialog', { name: 'New account' });
  const name = within(dialog).getByLabelText('Account name');
  const balance = within(dialog).getByLabelText('Starting balance');
  fireEvent.change(balance, { target: { value: 'abc' } });
  (balance as HTMLElement).focus();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  const alerts = await within(dialog).findAllByRole('alert');
  expect(alerts.map((a) => a.textContent)).toEqual([
    'Give the account a name.',
    'Enter an amount of zero or more.',
  ]);
  expect(name.getAttribute('aria-describedby')).toBe(alerts[0]!.id);
  expect(balance.getAttribute('aria-describedby')).toContain(alerts[1]!.id);
  // The first invalid field takes focus, not the one that was focused.
  expect(document.activeElement).toBe(name);
});

test('a deposit with no amount is refused: alert, link and focus on the amount', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const c = await card();
  fireEvent.click(within(c).getByRole('button', { name: 'Add adjustment' }));
  fireEvent.click(within(c).getByRole('button', { name: 'Save' }));
  const alert = await within(c).findByRole('alert');
  expect(alert.textContent).toBe('Enter an amount above zero.');
  const amount = within(c).getByLabelText('Amount');
  expect(amount.getAttribute('aria-describedby')).toBe(alert.id);
  expect(document.activeElement).toBe(amount);
  // A missing date comes first.
  fireEvent.change(within(c).getByLabelText('Date'), { target: { value: '' } });
  fireEvent.click(within(c).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(document.activeElement).toBe(within(c).getByLabelText('Date')),
  );
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

test('the Name column holds its place, and the Actions column too, as the table scrolls', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const futures = await rowOf('Futures main');
  expect(futures.querySelector('td:first-child')!.className).toContain(
    'sticky left-0',
  );
  expect(futures.querySelector('td:last-child')!.className).toContain(
    'sticky right-0',
  );
});

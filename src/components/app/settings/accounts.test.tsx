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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { ImportJob } from '@/domain/types';
import { commitNavigation } from '../__fixtures__/navigation';
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
  // A row's name starts with its selection box's: "Select Futures main".
  const row = await screen.findByRole('row', {
    name: new RegExp(`^Select ${name}`),
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
    expect(screen.queryByRole('row', { name: /^Select Empty one/ })).toBeNull(),
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

test('the selected row keeps its status pill fill against the row tint, and the sticky header cell has no ground at lg', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const row = await rowOf('Futures main');
  expect(cell(row, 'Status').firstElementChild!.className).toContain(
    'bg-surface-1!',
  );
  // The Type pill gets the same treatment as the Status pill, with an outline.
  const pills = ['Type', 'Status'].map(
    (c) => cell(row, c).firstElementChild!.className,
  );
  for (const k of pills) expect(k).toContain('ring-line-2');
  expect(pills[0]).toContain('bg-surface-1!');
  const other = await rowOf('Old demo');
  expect(cell(other, 'Status').firstElementChild!.className).not.toContain(
    'bg-surface-1!',
  );
  const th = row.closest('table')!.querySelector('thead th:last-child')!;
  expect(th.className).toContain('lg:bg-transparent');
});

test('a long broker name wraps to two lines at 1440 rather than truncating', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const row = await rowOf('Futures main');
  expect(cell(row, 'Broker').className).not.toContain('truncate');
  expect(cell(row, 'Broker').firstElementChild!.className).toContain(
    'line-clamp-2',
  );
});

describe('below 640px', () => {
  beforeEach(() => {
    window.innerWidth = 390;
  });
  afterEach(() => {
    window.innerWidth = 1024;
  });

  test('accounts are two-line rows: name and balance, then type, status and prop rules, with the row menu kept', async () => {
    renderApp(<AccountsSettings />, { repository: repo(), url: URL });
    const list = await screen.findByRole('list', { name: 'Accounts' });
    expect(screen.queryByRole('table')).toBeNull();
    const item = within(list)
      .getAllByRole('listitem')
      .find((li) => li.textContent!.startsWith('Futures main'))!;
    const one = item.querySelector('[data-line="1"]')!;
    const two = item.querySelector('[data-line="2"]')!;
    expect(one.textContent).toContain('Futures main');
    await waitFor(() => expect(one.textContent).toContain('$50,116.00'));
    expect(two.textContent).toContain('Live');
    expect(two.textContent).toContain('Active');
    expect(two.textContent).toContain('Does not apply');
    expect(item.getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(
      within(item).getByRole('button', { name: 'Actions for Futures main' }),
      { key: 'Enter' },
    );
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeTruthy();
  });
});

test('on the sample workspace the menu offers Add a trade but not Import trades, which lands only in My workspace', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  await openMenu('Futures main');
  await screen.findByRole('menuitem', { name: 'Edit' });
  expect(screen.queryByRole('menuitem', { name: 'Import trades' })).toBeNull();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Add a trade' }));
  await waitFor(() =>
    expect(window.location.pathname + window.location.search).toBe(
      '/app/trades/new?account=acc-a',
    ),
  );
});

test('in My workspace an active account offers Import trades, opening Import with that account', async () => {
  const r = repo();
  const made = await r.accounts.create('mine', {
    name: 'Mine live',
    broker: 'Broker',
    type: 'live',
    currency: 'USD',
    startingBalance: 100_000,
    status: 'active',
  });
  await r.workspaces.setActive('mine');
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  await openMenu('Mine live');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Import trades' }),
  );
  await waitFor(() =>
    expect(window.location.pathname + window.location.search).toBe(
      `/app/import?account=${made.id}`,
    ),
  );
});

test('an archived account is read-only: its menu offers neither', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  await openMenu('Old demo');
  await screen.findByRole('menuitem', { name: 'Unarchive' });
  expect(screen.queryByRole('menuitem', { name: 'Import trades' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Add a trade' })).toBeNull();
});

const job = (over: Partial<ImportJob>): ImportJob => ({
  id: 'job',
  workspaceId: 'mine',
  accountId: 'acc-a',
  fileName: 'fills.csv',
  mapping: {} as ImportJob['mapping'],
  rowCount: 2,
  tradeCount: 1,
  skippedCount: 0,
  duplicateCount: 0,
  status: 'active',
  createdAt: '2026-11-10T15:00:00.000Z',
  ...over,
});

const lastImport = (row: HTMLElement) =>
  row.querySelector('[data-last-import]') as HTMLElement;

test('the sample workspace shows no Last import line: imports never land there', async () => {
  const r = repo();
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  const row = await rowOf('Futures main');
  expect(lastImport(row)).toBeNull();
});

test('in My workspace Last import reads None, or the newest import not undone', async () => {
  const r = repo();
  const mk = (name: string) =>
    r.accounts.create('mine', {
      name,
      broker: 'Broker',
      type: 'live',
      currency: 'USD',
      startingBalance: 100_000,
      status: 'active',
    });
  const a = await mk('Mine a');
  const b = await mk('Mine b');
  await r.workspaces.setActive('mine');
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  expect(lastImport(await rowOf('Mine a')).textContent).toBe(
    'Last import None',
  );
  cleanup();

  const jobs = [
    job({ id: 'a', accountId: a.id, createdAt: '2026-11-10T15:00:00.000Z' }),
    job({
      id: 'b',
      accountId: a.id,
      fileName: 'newer.csv',
      createdAt: '2026-11-12T15:00:00.000Z',
      status: 'undone',
    }),
    job({
      id: 'c',
      accountId: b.id,
      fileName: 'other.csv',
      createdAt: '2026-11-15T15:00:00.000Z',
    }),
  ];
  renderApp(<AccountsSettings />, {
    repository: { ...r, imports: { ...r.imports, list: async () => jobs } },
    url: URL,
  });
  const row = await rowOf('Mine a');
  await waitFor(() =>
    expect(lastImport(row).textContent).toBe('Last import 10 Nov 2026'),
  );
  expect(lastImport(row).getAttribute('title')).toBe('fills.csv');
  expect(lastImport(await rowOf('Mine b')).textContent).toBe(
    'Last import 15 Nov 2026',
  );
});

// ---- Search, filter by, and bulk select ----

const base = {
  broker: '',
  type: 'live' as const,
  currency: 'USD',
  startingBalance: 0,
  status: 'active' as const,
};

/** The fixture's two accounts, plus a prop evaluation, a euro prop funded and an empty live one. */
async function wideRepo() {
  const r = repo();
  await r.accounts.create('sample', {
    ...base,
    name: 'Apex 50K',
    broker: 'Apex Trader Funding',
    type: 'prop-evaluation',
  });
  await r.accounts.create('sample', {
    ...base,
    name: 'Euro desk',
    broker: 'Darwinex',
    type: 'prop-funded',
    currency: 'EUR',
  });
  await r.accounts.create('sample', { ...base, name: 'Empty one' });
  await r.cashFlows.create('sample', {
    accountId: (await r.accounts.list('sample')).find(
      (a) => a.name === 'Empty one',
    )!.id,
    date: '2026-11-02',
    amount: 100_000,
  });
  return r;
}

const names = () =>
  [...document.querySelectorAll('tbody tr')].map(
    (r) => r.querySelector('[data-account-name]')?.textContent,
  );
const search = () =>
  screen.findByRole('searchbox', { name: 'Search accounts' });

async function pickFilter(...labels: string[]) {
  fireEvent.click(await screen.findByRole('button', { name: /^Filter by/ }));
  for (const l of labels)
    fireEvent.click(await screen.findByRole('checkbox', { name: l }));
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: 'Escape',
  });
}

test('search matches the name or the broker as you type, in any case', async () => {
  renderApp(<AccountsSettings />, { repository: await wideRepo(), url: URL });
  const box = await search();
  await waitFor(() => expect(names()).toHaveLength(5));
  fireEvent.change(box, { target: { value: 'APEX' } });
  await waitFor(() => expect(names()).toEqual(['Apex 50K']));
  fireEvent.change(box, { target: { value: 'darwin' } });
  await waitFor(() => expect(names()).toEqual(['Euro desk']));
  expect(window.location.search).toBe('?q=darwin');
});

test('a search with no match says so and offers Clear search', async () => {
  renderApp(<AccountsSettings />, { repository: await wideRepo(), url: URL });
  fireEvent.change(await search(), { target: { value: 'zzz' } });
  expect(await screen.findByText('No account matches.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  await waitFor(() => expect(names()).toHaveLength(5));
  expect((await search()).getAttribute('value') ?? '').toBe('');
  expect(window.location.search).toBe('');
});

test('Filter by type, status and currency each narrow the list and show as clearable chips', async () => {
  renderApp(<AccountsSettings />, { repository: await wideRepo(), url: URL });
  await pickFilter('Prop evaluation', 'Prop funded');
  await waitFor(() => expect(names()).toEqual(['Apex 50K', 'Euro desk']));
  expect(window.location.search).toBe('?type=prop-evaluation%2Cprop-funded');
  // Clearing one chip leaves the other.
  fireEvent.click(
    screen.getByRole('button', { name: 'Clear filter Type: Prop evaluation' }),
  );
  await waitFor(() => expect(names()).toEqual(['Euro desk']));

  fireEvent.click(
    screen.getByRole('button', { name: 'Clear filter Type: Prop funded' }),
  );
  await pickFilter('Archived');
  await waitFor(() => expect(names()).toEqual(['Old demo']));
  expect(window.location.search).toBe('?status=archived');
  fireEvent.click(
    screen.getByRole('button', { name: 'Clear filter Status: Archived' }),
  );

  await pickFilter('EUR');
  await waitFor(() => expect(names()).toEqual(['Euro desk']));
  expect(window.location.search).toBe('?ccy=EUR');
  fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
  await waitFor(() => expect(names()).toHaveLength(5));
  expect(window.location.search).toBe('');
});

test('the currency filter is offered only where accounts span more than one', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  fireEvent.click(await screen.findByRole('button', { name: /^Filter by/ }));
  await screen.findByRole('checkbox', { name: 'Archived' });
  expect(screen.queryByRole('checkbox', { name: 'USD' })).toBeNull();
});

test('the search and filters come back from the address, and survive Back', async () => {
  renderApp(<AccountsSettings />, {
    repository: await wideRepo(),
    url: `${URL}?q=desk&type=prop-funded&status=active&ccy=EUR`,
  });
  await waitFor(() => expect(names()).toEqual(['Euro desk']));
  expect(((await search()) as HTMLInputElement).value).toBe('desk');
  for (const chip of [
    'Clear filter Type: Prop funded',
    'Clear filter Status: Active',
    'Clear filter Currency: EUR',
  ])
    expect(screen.getByRole('button', { name: chip })).toBeTruthy();
  // Back to the entry before: the writes that follow replace it, a clear does not leave the state behind.
  window.history.replaceState(null, '', URL);
  commitNavigation();
  await waitFor(() => expect(names()).toHaveLength(5));
});

test('select all ticks the visible rows, is indeterminate for some, and follows the filter', async () => {
  renderApp(<AccountsSettings />, { repository: await wideRepo(), url: URL });
  const all = (await screen.findByRole('checkbox', {
    name: 'Select all accounts',
  })) as HTMLInputElement;
  expect(all.checked).toBe(false);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Apex 50K' }));
  expect(all.indeterminate).toBe(true);
  expect(
    await screen.findByRole('toolbar', { name: '1 account selected' }),
  ).toBeTruthy();
  fireEvent.click(all);
  expect(all.indeterminate).toBe(false);
  expect(all.checked).toBe(true);
  expect(screen.getByText('5 selected')).toBeTruthy();
  fireEvent.click(all);
  expect(screen.queryByRole('toolbar')).toBeNull();
  // Select all takes only what the filter lets through.
  fireEvent.change(await search(), { target: { value: 'apex' } });
  await waitFor(() => expect(names()).toEqual(['Apex 50K']));
  fireEvent.click(all);
  expect(screen.getByText('1 selected')).toBeTruthy();
  // A row the filter hides is not acted on: widening the search shows it unticked.
  fireEvent.change(await search(), { target: { value: '' } });
  await waitFor(() => expect(names()).toHaveLength(5));
  expect(
    (
      screen.getByRole('checkbox', {
        name: 'Select Euro desk',
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});

test('bulk Archive archives the active ones and Unarchive brings archived ones back', async () => {
  const r = await wideRepo();
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  fireEvent.click(
    await screen.findByRole('checkbox', { name: 'Select Apex 50K' }),
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Euro desk' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Old demo' }));
  const bar = await screen.findByRole('toolbar', {
    name: '3 accounts selected',
  });
  // Archive counts the active two, Unarchive the archived one.
  fireEvent.click(within(bar).getByRole('button', { name: 'Archive 2' }));
  await waitFor(async () =>
    expect(
      (await r.accounts.list('sample'))
        .filter((a) => a.status === 'archived')
        .map((a) => a.name)
        .sort(),
    ).toEqual(['Apex 50K', 'Euro desk', 'Old demo']),
  );
  const again = await screen.findByRole('toolbar', { name: /selected/ });
  // Now all three are archived: Archive is gone, Unarchive takes them.
  expect(within(again).queryByRole('button', { name: /^Archive/ })).toBeNull();
  fireEvent.click(within(again).getByRole('button', { name: 'Unarchive 3' }));
  await waitFor(async () =>
    expect(
      (await r.accounts.list('sample')).filter((a) => a.status === 'archived'),
    ).toHaveLength(0),
  );
});

test('bulk Delete lists what goes, keeps accounts that hold trades, and asks the single delete’s confirmation', async () => {
  const r = await wideRepo();
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  fireEvent.click(
    await screen.findByRole('checkbox', { name: 'Select Empty one' }),
  );
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Select Futures main' }),
  );
  fireEvent.click(
    within(await screen.findByRole('toolbar')).getByRole('button', {
      name: 'Delete 1',
    }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Delete 1 account?')).toBeTruthy();
  const text = dialog.textContent!;
  expect(text).toContain('Empty one');
  expect(text).toContain('0 trades, 1 deposit or withdrawal');
  expect(text).toContain('Futures main');
  expect(text).toContain('holds 2 trades');
  expect(text).toContain("This can't be undone.");
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(await r.accounts.list('sample')).toHaveLength(5);
  // Confirmed: only the empty one goes, with its deposit.
  fireEvent.click(
    within(screen.getByRole('toolbar')).getByRole('button', {
      name: 'Delete 1',
    }),
  );
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: 'Delete account',
    }),
  );
  await waitFor(async () =>
    expect((await r.accounts.list('sample')).map((a) => a.name)).not.toContain(
      'Empty one',
    ),
  );
  expect((await r.accounts.list('sample')).map((a) => a.name)).toContain(
    'Futures main',
  );
  expect(await r.cashFlows.list('sample')).toHaveLength(0);
});

test('Delete in the bar is off when every selected account holds trades, and the bar says why in plain text', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  fireEvent.click(
    await screen.findByRole('checkbox', { name: 'Select Futures main' }),
  );
  const bar = await screen.findByRole('toolbar');
  const del = within(bar).getByRole('button', {
    name: 'Delete',
  }) as HTMLButtonElement;
  expect(del.disabled).toBe(true);
  const why = within(bar).getByText(
    "Accounts with trades can't be deleted. Archive them or clear their trades first.",
  );
  expect(del.getAttribute('aria-describedby')).toBe(why.id);
});

test('the empty state clears a search and filters together in one action', async () => {
  renderApp(<AccountsSettings />, {
    repository: await wideRepo(),
    url: `${URL}?q=zzz&type=live&status=active`,
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Clear search and filters' }),
  );
  await waitFor(() => expect(names()).toHaveLength(5));
  expect(window.location.search).toBe('');
  expect(((await search()) as HTMLInputElement).value).toBe('');
  expect(screen.queryByRole('button', { name: /^Clear filter/ })).toBeNull();
});

test('a bulk delete that fails on the second account says what was deleted, what failed and what was not tried, and keeps the rest selected', async () => {
  const r = await wideRepo();
  for (const name of ['Spare one', 'Spare two'])
    await r.accounts.create('sample', { ...base, name });
  let calls = 0;
  const flaky = {
    ...r,
    accounts: {
      ...r.accounts,
      remove: async (ws: string, id: string) => {
        calls += 1;
        if (calls === 2) throw new Error('disk full');
        return r.accounts.remove(ws, id);
      },
    },
  };
  renderApp(<AccountsSettings />, { repository: flaky, url: URL });
  for (const n of ['Empty one', 'Spare one', 'Spare two'])
    fireEvent.click(
      await screen.findByRole('checkbox', { name: `Select ${n}` }),
    );
  fireEvent.click(
    within(screen.getByRole('toolbar')).getByRole('button', {
      name: 'Delete 3',
    }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Delete accounts' }),
  );
  const alert = await within(dialog).findByRole('alert');
  expect(alert.textContent).toContain('Deleted: Empty one');
  expect(alert.textContent).toContain("Couldn't delete: Spare one (disk full)");
  expect(alert.textContent).toContain('Not attempted: Spare two');
  const left = (await r.accounts.list('sample')).map((a) => a.name);
  expect(left).not.toContain('Empty one');
  expect(left).toContain('Spare one');
  expect(left).toContain('Spare two');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  // Only the accounts still there stay selected.
  expect(await screen.findByText('2 selected')).toBeTruthy();
});

test('an archived account is read-only: no bulk Archive for it, only Unarchive', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  fireEvent.click(
    await screen.findByRole('checkbox', { name: 'Select Old demo' }),
  );
  const bar = await screen.findByRole('toolbar');
  expect(within(bar).queryByRole('button', { name: /^Archive/ })).toBeNull();
  expect(within(bar).getByRole('button', { name: 'Unarchive 1' })).toBeTruthy();
});

test('on a phone the checkbox leads each two-line row and the bar floats above the tab bar', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q) =>
      ({
        matches: !q.includes('min-width: 640px'),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  renderApp(<AccountsSettings />, { repository: await wideRepo(), url: URL });
  const row = (await screen.findByText('Apex 50K')).closest('li')!;
  const first = row.firstElementChild!;
  expect(first.querySelector('input[type="checkbox"]')).not.toBeNull();
  expect(row.querySelectorAll('[data-line]')).toHaveLength(2);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Apex 50K' }));
  const bar = await screen.findByRole('toolbar');
  expect(bar.parentElement!.className).toContain('bottom-[calc(var(--tab-bar)');
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Select all accounts' }),
  );
  expect(screen.getByText('5 selected')).toBeTruthy();
  vi.restoreAllMocks();
});

test('after a partial failure the selection is what was selected minus what was deleted, by id, even with shared names and a kept account', async () => {
  const r = await wideRepo();
  // A second account with the same name as "Empty one".
  await r.accounts.create('sample', { ...base, name: 'Empty one' });
  let calls = 0;
  const flaky = {
    ...r,
    accounts: {
      ...r.accounts,
      remove: async (ws: string, id: string) => {
        calls += 1;
        if (calls === 2) throw new Error('disk full');
        return r.accounts.remove(ws, id);
      },
    },
  };
  renderApp(<AccountsSettings />, { repository: flaky, url: URL });
  for (const box of await screen.findAllByRole('checkbox', {
    name: 'Select Empty one',
  }))
    fireEvent.click(box);
  // An account holding trades is selected too, and is not up for deletion.
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Select Futures main' }),
  );
  fireEvent.click(
    within(screen.getByRole('toolbar')).getByRole('button', {
      name: 'Delete 2',
    }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Delete accounts' }),
  );
  await within(dialog).findByRole('alert');
  // The dialog no longer lists the account that is gone.
  expect(dialog.querySelectorAll('li')).toHaveLength(2);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByText('2 selected')).toBeTruthy();
  const ticked = screen
    .getAllByRole('checkbox')
    .filter((c) => (c as HTMLInputElement).checked)
    .map((c) => c.getAttribute('aria-label'));
  expect(ticked.sort()).toEqual(['Select Empty one', 'Select Futures main']);
});

test('?new=prop opens the new-account dialog on a prop account once, and leaves the address clean', async () => {
  renderApp(<AccountsSettings />, {
    repository: repo(),
    url: `${URL}?new=prop&q=main`,
  });
  const dialog = await screen.findByRole('dialog', { name: 'New account' });
  const type = within(dialog).getByLabelText(
    'Account type',
  ) as HTMLSelectElement;
  expect(type.value).toBe('prop-evaluation');
  expect(window.location.search).toBe('?q=main');
});

test('without ?new the new-account dialog still opens on a live account', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  fireEvent.click(await screen.findByRole('button', { name: 'New account' }));
  const dialog = await screen.findByRole('dialog', { name: 'New account' });
  expect(
    (within(dialog).getByLabelText('Account type') as HTMLSelectElement).value,
  ).toBe('live');
});

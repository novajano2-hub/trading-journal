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
import type { Repository } from '@/data/repository';
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

/** The row's cell under this header. */
async function methodOf(account: string): Promise<string> {
  const row = await screen.findByRole('row', {
    name: new RegExp(`^Select ${account}`),
  });
  const heads = [...row.closest('table')!.querySelectorAll('thead th')].map(
    (h) => h.textContent!.trim(),
  );
  return within(row).getAllByRole('cell')[heads.indexOf('Cost method')]!
    .textContent!;
}

async function openEdit(account: string): Promise<HTMLElement> {
  fireEvent.keyDown(
    await screen.findByRole('button', { name: `Actions for ${account}` }),
    { key: 'Enter' },
  );
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
  return screen.findByRole('dialog', { name: 'Edit account' });
}

const group = (dialog: HTMLElement) =>
  within(dialog).getByRole('radiogroup', { name: 'Cost method' });
const radio = (dialog: HTMLElement, name: RegExp) =>
  within(group(dialog)).getByRole('radio', { name }) as HTMLInputElement;

test('Edit account offers FIFO first, then LIFO and Weighted average, each with its line, and an account with none set reads FIFO', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const dialog = await openEdit('Futures main');
  const radios = within(group(dialog)).getAllByRole('radio');
  expect(radios.map((r) => r.closest('label')!.textContent)).toEqual([
    'FIFO, first in first outAn exit closes the oldest open lot first. The default.',
    'LIFO, last in first outAn exit closes the newest open lot first.',
    'Weighted averageAn exit closes at the average cost of every lot held.',
  ]);
  expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([
    true,
    false,
    false,
  ]);
  expect(radios.every((r) => !(r as HTMLInputElement).disabled)).toBe(true);
});

test('New account has no cost method field: a new account starts FIFO', async () => {
  const r = repo();
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  fireEvent.click(await screen.findByRole('button', { name: 'New account' }));
  const dialog = await screen.findByRole('dialog', { name: 'New account' });
  expect(within(dialog).queryByRole('radiogroup')).toBeNull();
  expect(within(dialog).queryByText('Cost method')).toBeNull();
  fireEvent.change(within(dialog).getByLabelText('Account name'), {
    target: { value: 'Swing book' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await methodOf('Swing book')).toBe('FIFO');
  const made = (await r.accounts.list('sample')).find(
    (a) => a.name === 'Swing book',
  )!;
  expect(made.costMethod).toBeUndefined();
});

test('choosing LIFO and saving asks first, says what can change, and writes only after Switch to LIFO', async () => {
  const r = repo();
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  const dialog = await openEdit('Futures main');
  fireEvent.click(radio(dialog, /^LIFO/));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  const ask = await screen.findByRole('dialog', {
    name: 'Switch Futures main to LIFO?',
  });
  expect(ask.textContent).toContain(
    'Every trade in this account is worked out again from its fills. What can change:',
  );
  const items = within(ask)
    .getAllByRole('listitem')
    .map((li) => li.textContent);
  expect(items).toEqual([
    'which day books each partial exit;',
    'the realized part of an open trade;',
    "the total of a pair converted at each exit's rate, such as USDJPY.",
  ]);
  expect(ask.textContent).toContain(
    "A trade's fills, notes, tags, strategies and ratings stay as they are.",
  );
  // Nothing is written yet, and the form is out of the way.
  expect(
    (await r.accounts.list('sample')).find((a) => a.id === 'acc-a')!.costMethod,
  ).toBeUndefined();
  expect(
    within(ask).queryByRole('textbox', { name: 'Account name' }),
  ).toBeNull();

  fireEvent.click(within(ask).getByRole('button', { name: 'Switch to LIFO' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(async () =>
    expect(await methodOf('Futures main')).toBe('LIFO'),
  );
  expect(
    (await r.accounts.list('sample')).find((a) => a.id === 'acc-a')!.costMethod,
  ).toBe('lifo');
  // Its trades were worked out again under the new method.
  const own = (await r.trades.list('sample')).filter(
    (t) => t.accountId === 'acc-a',
  );
  expect(own.length).toBeGreaterThan(0);
  expect(own.every((t) => t.costMethod === 'lifo')).toBe(true);
});

test('Cancel on the question keeps the old method, saves nothing and returns to the form', async () => {
  const r = repo();
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  const dialog = await openEdit('Futures main');
  fireEvent.click(radio(dialog, /^LIFO/));
  fireEvent.change(within(dialog).getByLabelText('Broker'), {
    target: { value: 'Another broker' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  const ask = await screen.findByRole('dialog', {
    name: 'Switch Futures main to LIFO?',
  });
  fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));

  // Back on the form: FIFO chosen again, the other edit still typed.
  const back = await screen.findByRole('dialog', { name: 'Edit account' });
  expect(radio(back, /^FIFO/).checked).toBe(true);
  expect(radio(back, /^LIFO/).checked).toBe(false);
  expect(
    (within(back).getByLabelText('Broker') as HTMLInputElement).value,
  ).toBe('Another broker');
  const stored = (await r.accounts.list('sample')).find(
    (a) => a.id === 'acc-a',
  )!;
  expect(stored.costMethod).toBeUndefined();
  expect(stored.broker).toBe('Sample broker');

  // Closing the form leaves the table as it was.
  fireEvent.click(within(back).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await methodOf('Futures main')).toBe('FIFO');
});

test('saving without a change of method does not ask', async () => {
  const r = repo();
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  const dialog = await openEdit('Futures main');
  fireEvent.change(within(dialog).getByLabelText('Broker'), {
    target: { value: 'Another broker' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const stored = (await r.accounts.list('sample')).find(
    (a) => a.id === 'acc-a',
  )!;
  expect(stored.broker).toBe('Another broker');
  expect(stored.costMethod).toBeUndefined();
});

test('switching back to FIFO asks too, and stores FIFO as unset', async () => {
  const r = repo();
  await r.accounts.setCostMethod('sample', 'acc-a', 'average');
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  expect(await methodOf('Futures main')).toBe('Average');
  const dialog = await openEdit('Futures main');
  expect(radio(dialog, /^Weighted average/).checked).toBe(true);
  fireEvent.click(radio(dialog, /^FIFO/));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  const ask = await screen.findByRole('dialog', {
    name: 'Switch Futures main to FIFO?',
  });
  fireEvent.click(within(ask).getByRole('button', { name: 'Switch to FIFO' }));
  await waitFor(async () =>
    expect(await methodOf('Futures main')).toBe('FIFO'),
  );
  expect(
    (await r.accounts.list('sample')).find((a) => a.id === 'acc-a')!.costMethod,
  ).toBeUndefined();
});

test('a switch to the weighted average names it in words', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const dialog = await openEdit('Futures main');
  fireEvent.click(radio(dialog, /^Weighted average/));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  const ask = await screen.findByRole('dialog', {
    name: 'Switch Futures main to weighted average?',
  });
  expect(
    within(ask).getByRole('button', { name: 'Switch to weighted average' }),
  ).toBeTruthy();
});

test('an archived account shows its method read-only and still saves its other fields', async () => {
  const r = repo();
  await r.accounts.setCostMethod('sample', 'acc-a', 'lifo');
  await r.accounts.update('sample', 'acc-a', { status: 'archived' });
  renderApp(<AccountsSettings />, { repository: r, url: URL });
  const dialog = await openEdit('Futures main');
  const radios = within(group(dialog)).getAllByRole(
    'radio',
  ) as HTMLInputElement[];
  expect(radios.map((x) => x.checked)).toEqual([false, true, false]);
  expect(radios.every((x) => x.disabled)).toBe(true);
  expect(dialog.textContent).toContain(
    'An archived account keeps its cost method.',
  );

  // The method is not part of the save: no question, no refusal.
  fireEvent.change(within(dialog).getByLabelText('Broker'), {
    target: { value: 'Another broker' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const stored = (await r.accounts.list('sample')).find(
    (a) => a.id === 'acc-a',
  )!;
  expect(stored).toMatchObject({
    broker: 'Another broker',
    costMethod: 'lifo',
  });
});

test('a failed switch says so on the question and writes nothing', async () => {
  const real = repo();
  const broken: Repository = {
    ...real,
    accounts: {
      ...real.accounts,
      update: () => Promise.reject(new Error('disk full')),
    },
  };
  renderApp(<AccountsSettings />, { repository: broken, url: URL });
  const dialog = await openEdit('Futures main');
  fireEvent.click(radio(dialog, /^LIFO/));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  const ask = await screen.findByRole('dialog', {
    name: 'Switch Futures main to LIFO?',
  });
  fireEvent.click(within(ask).getByRole('button', { name: 'Switch to LIFO' }));
  expect(
    await within(ask).findByText("Couldn't save the account. Try again."),
  ).toBeTruthy();
  // The question stays up, so the switch can be tried again or cancelled.
  expect(within(ask).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  expect(
    (await real.accounts.list('sample')).find((a) => a.id === 'acc-a')!
      .costMethod,
  ).toBeUndefined();
});

test('a reopened dialog starts from the account as it is, not from a cancelled choice', async () => {
  renderApp(<AccountsSettings />, { repository: repo(), url: URL });
  const dialog = await openEdit('Futures main');
  fireEvent.click(radio(dialog, /^LIFO/));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  const ask = await screen.findByRole('dialog', {
    name: 'Switch Futures main to LIFO?',
  });
  // Escape closes the whole dialog, question included.
  fireEvent.keyDown(ask, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const again = await openEdit('Futures main');
  expect(radio(again, /^FIFO/).checked).toBe(true);
  expect(
    screen.queryByRole('dialog', { name: /^Switch Futures main/ }),
  ).toBeNull();
});

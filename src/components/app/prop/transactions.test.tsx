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
import { createLocalRepository } from '@/data/local/local-repository';
import { usePropFinance } from '@/data/query/derived';
import type { Repository } from '@/data/repository';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { renderApp } from '../__fixtures__/render-app';
import { viewport } from '../__fixtures__/viewport';
import { Transactions } from './transactions';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const WS = SAMPLE_WORKSPACE.id;
const URL = '/app/prop-firms/transactions';

// The real sample: three challenges and nine transactions, 9, 3, 6 and 3 by
// the four filters (the plan's 13, 3, 10 and 3 is the same filter on thirteen
// rows, pinned in the domain tests).
const sample: SampleWorkspace = generateSampleWorkspace({
  seed: SAMPLE_SEED,
  endDate: '2026-11-19',
});
const FUTURES_50K = 'sample-challenge-futures-50k';
const FOREX_100K = 'sample-challenge-forex-100k';
const NEWEST_FIRST = [
  'Market data fee',
  'Payout', // 2 Nov, not reviewed
  'Card refund, duplicate charge',
  'Payout', // 17 Oct, reviewed
  'Reset', // 5 Oct
  'Reset', // 23 Sep
  'Evaluation, Futures 100K',
  'Activation, Forex 100K',
  'Evaluation, Forex 100K',
];

function repo(extra: (s: SampleWorkspace) => void = () => {}): Repository {
  const s = structuredClone(sample);
  extra(s);
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => s,
  });
}

/** Today in New York, fixed: 25 Nov 2026. */
async function inNewYork(r: Repository): Promise<void> {
  await r.prefs.update({ timeZone: 'America/New_York' });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
}

const table = () => screen.findByRole('table', { name: 'Transactions' });
const rowOf = async (id: string) => {
  const t = await table();
  const row = t.querySelector<HTMLElement>(`[data-txn="${id}"]`);
  if (!row) throw new Error(`no row ${id}`);
  return row;
};
const descriptions = async () =>
  within(await table())
    .getAllByRole('row')
    .filter((r) => r.hasAttribute('data-txn'))
    .map((r) => within(r).getAllByRole('cell')[1]!.textContent);
const show = (name: string) =>
  fireEvent.click(screen.getByRole('radio', { name }));
async function openMenu(label: string | RegExp, within_?: HTMLElement) {
  const scope = within_ ? within(within_) : screen;
  fireEvent.keyDown(await scope.findByRole('button', { name: label }), {
    key: 'Enter',
  });
}

test('the table reads date, description, firm, challenge, category, amount, status and actions, newest first (C68)', async () => {
  renderApp(<Transactions />, { repository: repo(), url: URL });
  const t = await table();
  expect(
    within(t)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual([
    'Date',
    'Description',
    'Firm',
    'Challenge',
    'Category',
    'Amount',
    'Status',
    'Actions',
  ]);
  expect(await descriptions()).toEqual(NEWEST_FIRST);
  const row = await rowOf('sample-prop-txn-7');
  expect(
    within(row)
      .getAllByRole('cell')
      .map((c) => c.textContent),
  ).toEqual([
    '2 Nov',
    'Payout',
    'Sample prop firm',
    'Futures 50K',
    'Payout',
    '+$2,700.00',
    'Not reviewed',
    '',
  ]);
  // A row with no challenge reads None.
  const loose = await rowOf('sample-prop-txn-9');
  expect(within(loose).getAllByRole('cell')[3]!.textContent).toBe('None');
});

test('the filter keeps 9, 3, 6 and 3 rows of the sample, and carries no counts (C68, C73)', async () => {
  renderApp(<Transactions />, { repository: repo(), url: URL });
  await table();
  const radios = screen.getAllByRole('radio');
  expect(radios.map((r) => r.parentElement?.textContent)).toEqual([
    'All',
    'Income',
    'Costs',
    'To review',
  ]);
  expect((await descriptions()).length).toBe(9);
  show('Income');
  expect(await descriptions()).toEqual([
    'Payout',
    'Card refund, duplicate charge',
    'Payout',
  ]);
  show('Costs');
  expect((await descriptions()).length).toBe(6);
  show('To review');
  expect(await descriptions()).toEqual(['Market data fee', 'Payout', 'Reset']);
  show('All');
  expect((await descriptions()).length).toBe(9);
});

test('the sign decides, whatever the category: an uncategorized refund is income, an uncategorized fee a cost (C60)', async () => {
  renderApp(<Transactions />, { repository: repo(), url: URL });
  const refund = await rowOf('sample-prop-txn-8');
  const fee = await rowOf('sample-prop-txn-9');
  expect(within(refund).getAllByRole('cell')[4]!.textContent).toContain(
    'Uncategorized',
  );
  expect(within(refund).getAllByRole('cell')[5]!.textContent).toBe('+$165.00');
  expect(within(fee).getAllByRole('cell')[5]!.textContent).toBe('−$29.00');
  show('Income');
  expect(await descriptions()).toContain('Card refund, duplicate charge');
  expect(await descriptions()).not.toContain('Market data fee');
  // The hint says so.
  expect(
    screen.getByText(
      'A negative amount is a cost and a positive one is income, whatever its category. Ignored rows stay listed and never count.',
    ),
  ).toBeTruthy();
});

test('an ignored row stays listed, faint, with its status', async () => {
  renderApp(<Transactions />, { repository: repo(), url: URL });
  const ignored = await rowOf('sample-prop-txn-8');
  expect(ignored.getAttribute('data-ignored')).toBe('true');
  const amount = within(ignored).getAllByRole('cell')[5]!;
  expect(amount.className).toContain('text-faint');
  expect(amount.className).not.toContain('text-gain');
  expect(within(ignored).getByText('Ignored')).toBeTruthy();
  // A counted income row is not faint.
  const counted = await rowOf('sample-prop-txn-7');
  expect(counted.hasAttribute('data-ignored')).toBe(false);
  expect(within(counted).getAllByRole('cell')[5]!.className).toContain(
    'text-gain',
  );
  expect(
    within(await rowOf('sample-prop-txn-9')).getAllByRole('cell')[5]!.className,
  ).toContain('text-loss');
});

test('Add transaction opens the inline row at the top: today, uncategorized, not reviewed', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Transactions />, { repository: r, url: URL });
  await table();
  expect(screen.queryByRole('button', { name: 'Save transaction' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
  expect(
    (screen.getByRole('textbox', { name: 'Description' }) as HTMLInputElement)
      .value,
  ).toBe('');
  expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe(
    '2026-11-25',
  );
  expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe(
    'uncategorized',
  );
  expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe(
    'not-reviewed',
  );
  expect((screen.getByLabelText('Challenge') as HTMLSelectElement).value).toBe(
    '',
  );
  // It is the first row of the table, above the log.
  const rows = within(await table()).getAllByRole('row');
  expect(rows[1]!.contains(screen.getByLabelText('Amount'))).toBe(true);
  // Focus lands in the row.
  expect(document.activeElement).toBe(
    screen.getByRole('textbox', { name: 'Description' }),
  );
});

test('the tick saves the row: the text is trimmed, the sign is the amount’s, and the row closes', async () => {
  const r = repo();
  await inNewYork(r);
  renderApp(<Transactions />, { repository: r, url: URL });
  await table();
  fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
    target: { value: '  Chart package  ' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Firm' }), {
    target: { value: 'Sample data feed' },
  });
  fireEvent.change(screen.getByLabelText('Amount'), {
    target: { value: '−300' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
  await waitFor(async () => expect((await descriptions()).length).toBe(10));
  expect((await descriptions())[0]).toBe('Chart package');
  const saved = (await r.propTxns.list(WS)).find(
    (t) => t.description === 'Chart package',
  )!;
  expect(saved).toMatchObject({
    date: '2026-11-25',
    firm: 'Sample data feed',
    category: 'uncategorized',
    amount: -30_000,
    status: 'not-reviewed',
  });
  expect(saved.challengeId).toBeUndefined();
  expect(screen.queryByRole('button', { name: 'Save transaction' })).toBeNull();
  // Focus is back on the button that opened the row.
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Add transaction' }),
  );
});

test('a row that is not valid does not save, and says why (an amount, a date)', async () => {
  const r = repo();
  renderApp(<Transactions />, { repository: r, url: URL });
  await table();
  fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
  const amount = screen.getByLabelText('Amount');
  for (const bad of ['', '0', 'abc']) {
    fireEvent.change(amount, { target: { value: bad } });
    fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/amount/i);
    expect(amount.getAttribute('aria-invalid')).toBe('true');
    // The field points at the message that names what is wrong with it.
    expect(
      document.getElementById(amount.getAttribute('aria-describedby')!)
        ?.textContent,
    ).toMatch(/amount/i);
    expect(document.activeElement).toBe(amount);
  }
  fireEvent.change(amount, { target: { value: '25' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/date/i);
  expect(await r.propTxns.list(WS)).toHaveLength(9);
  expect((await descriptions()).length).toBe(9);
});

test('Enter saves and Escape closes the row', async () => {
  renderApp(<Transactions />, { repository: repo(), url: URL });
  await table();
  const open = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
  open();
  fireEvent.keyDown(screen.getByLabelText('Amount'), { key: 'Escape' });
  expect(screen.queryByLabelText('Amount')).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Add transaction' }),
  );
  open();
  fireEvent.change(screen.getByLabelText('Amount'), {
    target: { value: '12' },
  });
  fireEvent.keyDown(screen.getByLabelText('Amount'), { key: 'Enter' });
  await waitFor(async () => expect((await descriptions()).length).toBe(10));
});

test('the firm is free text with the existing firms as suggestions, and a challenge fills it in', async () => {
  renderApp(<Transactions />, { repository: repo(), url: URL });
  await table();
  fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
  const firm = screen.getByRole('combobox', {
    name: 'Firm',
  }) as HTMLInputElement;
  const list = document.getElementById(firm.getAttribute('list')!)!;
  expect(
    [...list.querySelectorAll('option')].map((o) => o.getAttribute('value')),
  ).toEqual(['Sample data feed', 'Sample prop firm']);
  // Anything can be typed.
  fireEvent.change(firm, { target: { value: 'Some other firm' } });
  expect(firm.value).toBe('Some other firm');
  // A challenge fills the firm only while the trader has not typed one.
  fireEvent.change(firm, { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Challenge'), {
    target: { value: FUTURES_50K },
  });
  expect(firm.value).toBe('Sample prop firm');
  fireEvent.change(firm, { target: { value: 'Mine' } });
  fireEvent.change(screen.getByLabelText('Challenge'), {
    target: { value: FOREX_100K },
  });
  expect(firm.value).toBe('Mine');
});

test('a row added while a filter hides it brings the list back to All, so the new row shows', async () => {
  renderApp(<Transactions />, { repository: repo(), url: URL });
  await table();
  show('Income');
  fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
    target: { value: 'Software' },
  });
  fireEvent.change(screen.getByLabelText('Amount'), {
    target: { value: '-40' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
  await waitFor(async () => expect((await descriptions())[0]).toBe('Software'));
  expect(
    (screen.getByRole('radio', { name: 'All' }) as HTMLInputElement).checked,
  ).toBe(true);
});

test('the edit control beside a category changes it', async () => {
  const r = repo();
  renderApp(<Transactions />, { repository: r, url: URL });
  const fee = await rowOf('sample-prop-txn-9');
  expect(within(fee).getAllByRole('cell')[4]!.textContent).toBe(
    'Uncategorized',
  );
  await openMenu('Edit the category of Market data fee');
  // The six categories, the current one chosen.
  const items = await screen.findAllByRole('menuitemradio');
  expect(items.map((i) => i.textContent)).toEqual([
    'Payout',
    'Evaluation fee',
    'Activation fee',
    'Reset fee',
    'Affiliate income',
    'Uncategorized',
  ]);
  expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual([
    'false',
    'false',
    'false',
    'false',
    'false',
    'true',
  ]);
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Reset fee' }));
  await waitFor(async () =>
    expect(
      within(await rowOf('sample-prop-txn-9')).getAllByRole('cell')[4]!
        .textContent,
    ).toBe('Reset fee'),
  );
  expect(
    (await r.propTxns.list(WS)).find((t) => t.id === 'sample-prop-txn-9')!
      .category,
  ).toBe('reset-fee');
  // The amount's sign is not the category's: it is still a cost, still the same figure.
  expect(
    within(await rowOf('sample-prop-txn-9')).getAllByRole('cell')[5]!
      .textContent,
  ).toBe('−$29.00');
  // Focus is back on the pencil.
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', {
        name: 'Edit the category of Market data fee',
      }),
    ),
  );
});

test('each row’s menu sets the status, leaving out the one it has', async () => {
  const r = repo();
  renderApp(<Transactions />, { repository: r, url: URL });
  const row = await rowOf('sample-prop-txn-9');
  await openMenu('Actions for Market data fee');
  expect(
    (await screen.findAllByRole('menuitem')).map((i) => i.textContent),
  ).toEqual([
    'Mark as reviewed',
    'Mark as ignored',
    'Link a challenge',
    'Delete',
  ]);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as reviewed' }));
  await waitFor(() => expect(within(row).getByText('Reviewed')).toBeTruthy());
  await openMenu('Actions for Market data fee');
  expect(
    (await screen.findAllByRole('menuitem')).map((i) => i.textContent),
  ).toEqual([
    'Mark as not reviewed',
    'Mark as ignored',
    'Link a challenge',
    'Delete',
  ]);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as ignored' }));
  await waitFor(() => expect(row.getAttribute('data-ignored')).toBe('true'));
  expect(
    (await r.propTxns.list(WS)).find((t) => t.id === 'sample-prop-txn-9')!
      .status,
  ).toBe('ignored');
});

function Earned() {
  const f = usePropFinance({});
  return (
    <output aria-label="Total earned">
      {f.data ? f.data.totals.earned : 'loading'}
    </output>
  );
}

test('setting a payout to ignored takes it out of the dashboard totals; setting it back puts it in', async () => {
  renderApp(
    <>
      <Earned />
      <Transactions />
    </>,
    { repository: repo(), url: URL },
  );
  const earned = () => screen.getByLabelText('Total earned').textContent;
  await table();
  await waitFor(() => expect(earned()).toBe('450000'));
  await openMenu('Actions for Payout', await rowOf('sample-prop-txn-7'));
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Mark as ignored' }),
  );
  await waitFor(() => expect(earned()).toBe('180000'));
  await openMenu('Actions for Payout', await rowOf('sample-prop-txn-7'));
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Mark as reviewed' }),
  );
  await waitFor(() => expect(earned()).toBe('450000'));
});

test('Link a challenge links a row to one, and None unlinks it', async () => {
  const r = repo();
  renderApp(<Transactions />, { repository: r, url: URL });
  await openMenu('Actions for Market data fee');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Link a challenge' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Link a challenge',
  });
  const select = within(dialog).getByLabelText(
    'Challenge',
  ) as HTMLSelectElement;
  expect([...select.options].map((o) => o.textContent)).toEqual([
    'None',
    'Forex 100K',
    'Futures 100K',
    'Futures 50K',
  ]);
  expect(select.value).toBe('');
  fireEvent.change(select, { target: { value: FOREX_100K } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(async () =>
    expect(
      within(await rowOf('sample-prop-txn-9')).getAllByRole('cell')[3]!
        .textContent,
    ).toBe('Forex 100K'),
  );
  // The row keeps its own firm; the link is the only change.
  const linked = (await r.propTxns.list(WS)).find(
    (t) => t.id === 'sample-prop-txn-9',
  )!;
  expect(linked.challengeId).toBe(FOREX_100K);
  expect(linked.firm).toBe('Sample data feed');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  // Focus is back on the row's menu.
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Actions for Market data fee' }),
  );

  await openMenu('Actions for Market data fee');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Link a challenge' }),
  );
  const again = await screen.findByRole('dialog', { name: 'Link a challenge' });
  const select2 = within(again).getByLabelText(
    'Challenge',
  ) as HTMLSelectElement;
  expect(select2.value).toBe(FOREX_100K);
  fireEvent.change(select2, { target: { value: '' } });
  fireEvent.click(within(again).getByRole('button', { name: 'Save' }));
  await waitFor(async () =>
    expect(
      within(await rowOf('sample-prop-txn-9')).getAllByRole('cell')[3]!
        .textContent,
    ).toBe('None'),
  );
  expect(
    (await r.propTxns.list(WS)).find((t) => t.id === 'sample-prop-txn-9')!
      .challengeId,
  ).toBeUndefined();
});

test('Delete asks first, says it is for good, and Cancel leaves the row', async () => {
  const r = repo();
  renderApp(<Transactions />, { repository: r, url: URL });
  await openMenu('Actions for Market data fee');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'Delete this transaction?',
  });
  expect(dialog.textContent).toContain('Market data fee');
  expect(dialog.textContent).toMatch(/for good|can.t be undone/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await r.propTxns.list(WS)).toHaveLength(9);
  // Focus is back on the row's menu.
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Actions for Market data fee' }),
  );

  await openMenu('Actions for Market data fee');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  fireEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'Delete this transaction?' }),
    ).getByRole('button', { name: 'Delete' }),
  );
  await waitFor(async () => expect((await descriptions()).length).toBe(8));
  expect(await descriptions()).not.toContain('Market data fee');
  expect(await r.propTxns.list(WS)).toHaveLength(8);
});

test('under Privacy no amount shows; under percent the money stays in dollars (C72)', async () => {
  const r = repo();
  await r.prefs.update({ displayUnit: 'privacy' });
  renderApp(<Transactions />, { repository: r, url: URL });
  const t = await table();
  expect(t.textContent).not.toMatch(/\d,\d{3}/);
  expect(t.textContent).not.toMatch(/\p{Sc}\s?\d/u);
  expect(t.textContent).toContain('+$•••');
  expect(t.textContent).toContain('−$•••');
  cleanup();

  const p = repo();
  await p.prefs.update({ displayUnit: 'percent' });
  renderApp(<Transactions />, { repository: p, url: URL });
  expect(
    within(await rowOf('sample-prop-txn-7')).getAllByRole('cell')[5]!
      .textContent,
  ).toBe('+$2,700.00');
});

test('with no transaction it says so, with Add transaction; an empty filter says what it lacks', async () => {
  const r = repo((s) => {
    s.propTxns = [];
  });
  renderApp(<Transactions />, { repository: r, url: URL });
  expect(await screen.findByText('No transactions yet.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add transaction' })).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  cleanup();

  renderApp(<Transactions />, {
    repository: repo((s) => {
      s.propTxns = s.propTxns.filter((t) => t.amount < 0);
    }),
    url: URL,
  });
  await table();
  show('Income');
  expect(await screen.findByText('No income yet.')).toBeTruthy();
  show('To review');
  expect(await descriptions()).toEqual(['Market data fee', 'Reset']);
  cleanup();

  renderApp(<Transactions />, {
    repository: repo((s) => {
      s.propTxns = s.propTxns.map((t) => ({ ...t, status: 'reviewed' }));
    }),
    url: URL,
  });
  await table();
  show('To review');
  expect(await screen.findByText('Nothing to review.')).toBeTruthy();
});

test('Add transaction on a transactions-only workspace works with no challenge at all', async () => {
  const r = repo((s) => {
    s.challenges = [];
    s.propTxns = [];
  });
  renderApp(<Transactions />, { repository: r, url: URL });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  );
  expect(
    [...(screen.getByLabelText('Challenge') as HTMLSelectElement).options].map(
      (o) => o.textContent,
    ),
  ).toEqual(['None']);
  fireEvent.change(screen.getByLabelText('Amount'), {
    target: { value: '500' },
  });
  fireEvent.change(screen.getByLabelText('Category'), {
    target: { value: 'affiliate-income' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
  await waitFor(async () => expect((await r.propTxns.list(WS)).length).toBe(1));
  expect((await r.propTxns.list(WS))[0]).toMatchObject({
    amount: 50_000,
    category: 'affiliate-income',
    firm: '',
  });
  expect(
    await within(await table()).findByText('Affiliate income'),
  ).toBeTruthy();
});

test('a failed save says so and keeps the row', async () => {
  const r = repo();
  vi.spyOn(r.propTxns, 'add').mockRejectedValue(new Error('disk full'));
  renderApp(<Transactions />, { repository: r, url: URL });
  await table();
  fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
  fireEvent.change(screen.getByLabelText('Amount'), {
    target: { value: '-5' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    "Couldn't save that. Try again.",
  );
  expect(screen.getByLabelText('Amount')).toBeTruthy();
  expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe(
    '-5',
  );
});

// Phone: two-line rows; Add opens a full-height sheet.

test('on a phone each row is two lines: description and amount, then date, firm, category and status', async () => {
  viewport({ phone: true });
  renderApp(<Transactions />, { repository: repo(), url: URL });
  const list = await screen.findByRole('list', { name: 'Transactions' });
  expect(screen.queryByRole('table')).toBeNull();
  const item = [...list.querySelectorAll<HTMLElement>('li')].find(
    (li) => li.getAttribute('data-txn') === 'sample-prop-txn-7',
  )!;
  expect(item.querySelector('[data-line="1"]')!.textContent).toBe(
    'Payout+$2,700.00',
  );
  const two = item.querySelector('[data-line="2"]')!.textContent!;
  expect(two).toContain('2 Nov');
  expect(two).toContain('Sample prop firm');
  expect(two).toContain('Payout');
  expect(two).toContain('Not reviewed');
  expect(
    within(item).getByRole('button', { name: 'Actions for Payout' }),
  ).toBeTruthy();
  expect(
    within(item).getByRole('button', { name: 'Edit the category of Payout' }),
  ).toBeTruthy();
  // The filter works on rows too.
  show('Costs');
  expect(list.querySelectorAll('li').length).toBe(6);
});

test('on a phone Add transaction opens a sheet with the same fields, and saves', async () => {
  viewport({ phone: true });
  const r = repo();
  await inNewYork(r);
  renderApp(<Transactions />, { repository: r, url: URL });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Add transaction' }),
  );
  const sheet = await screen.findByRole('dialog', { name: 'Add transaction' });
  expect((within(sheet).getByLabelText('Date') as HTMLInputElement).value).toBe(
    '2026-11-25',
  );
  expect(
    (within(sheet).getByLabelText('Category') as HTMLSelectElement).value,
  ).toBe('uncategorized');
  expect(
    (within(sheet).getByLabelText('Status') as HTMLSelectElement).value,
  ).toBe('not-reviewed');
  // Invalid: no amount.
  fireEvent.click(
    within(sheet).getByRole('button', { name: 'Add transaction' }),
  );
  expect((await within(sheet).findByRole('alert')).textContent).toMatch(
    /amount/i,
  );
  expect(await r.propTxns.list(WS)).toHaveLength(9);
  fireEvent.change(within(sheet).getByLabelText('Description'), {
    target: { value: 'VPS' },
  });
  fireEvent.change(within(sheet).getByLabelText('Amount'), {
    target: { value: '-20' },
  });
  fireEvent.click(
    within(sheet).getByRole('button', { name: 'Add transaction' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const rows = await r.propTxns.list(WS);
  expect(rows).toHaveLength(10);
  expect(rows.find((t) => t.description === 'VPS')).toMatchObject({
    amount: -2_000,
    date: '2026-11-25',
  });
  expect(
    within(await screen.findByRole('list', { name: 'Transactions' })).getByText(
      'VPS',
    ),
  ).toBeTruthy();
});

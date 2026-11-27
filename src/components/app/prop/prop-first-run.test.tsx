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
import { useSetActiveWorkspace } from '@/data/query/hooks';
import type { Repository } from '@/data/repository';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from '@/data/seed/generate';
import { totals } from '@/domain/prop/finance';
import { renderApp } from '../__fixtures__/render-app';
import { PropHome } from './prop-home';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const URL = '/app/prop-firms';
const NY = 'America/New_York';

// The real sample: it has challenges and transactions, so no first run there.
const sample: SampleWorkspace = generateSampleWorkspace({
  seed: SAMPLE_SEED,
  endDate: '2026-11-19',
});

function repo(): Repository {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => structuredClone(sample),
  });
}

/** An empty My workspace, today 25 Nov 2026 in New York. */
async function emptyMine(): Promise<Repository> {
  const r = repo();
  await r.workspaces.setActive('mine');
  await r.prefs.update({ timeZone: NY });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
  return r;
}

const step = (n: number) => screen.findByText(`Step ${n} of 4`);
const button = (name: string) => screen.getByRole('button', { name });
const click = (name: string) => fireEvent.click(button(name));
const field = (label: string) => screen.getByLabelText(label, { exact: true });
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });

async function openRun(r: Repository, url = URL) {
  const view = renderApp(<PropHome />, { repository: r, url });
  await step(1);
  return view;
}

/** Choose how you trade and go to the transaction step. */
async function toTransactions(answer = 'Prop firms') {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(answer) }));
  click('Continue');
  await step(2);
}

/** How many rows the list below the form holds (it is not drawn while empty). */
const count = () =>
  screen.queryByRole('list', { name: 'Added' })?.querySelectorAll('li')
    .length ?? 0;

/** Fill the form and add the row. */
async function addRow(
  firm: string,
  amount: string,
  extra: { category?: string; status?: string; description?: string } = {},
) {
  type('Firm', firm);
  type('Amount', amount);
  if (extra.category) type('Category', extra.category);
  if (extra.status) type('Status', extra.status);
  if (extra.description) type('Description, optional', extra.description);
  const before = count();
  click('Add transaction');
  await waitFor(() => expect(count()).toBe(before + 1));
}

const savedPrefs = (r: Repository) => r.prefs.saved();

test('an empty My workspace shows the first run, at step 1, instead of the dashboard (C71)', async () => {
  const r = await emptyMine();
  await openRun(r);
  expect(
    screen.getByRole('heading', { level: 2, name: 'How do you trade?' }),
  ).toBeTruthy();
  expect(
    screen.getByText('This only helps you set up; it changes nothing else.'),
  ).toBeTruthy();
  expect(
    screen.getAllByRole('radio').map((i) => i.closest('label')!.textContent),
  ).toEqual([
    'Own capitalYour own trading accounts. They go in your journal as now.',
    'Prop firmsEvaluation and funded accounts with a prop firm.',
    'BothProp accounts here; your own accounts stay in your journal.',
  ]);
  // The dashboard, its tabs and its buttons wait behind it.
  expect(screen.queryByRole('navigation', { name: 'Prop firms' })).toBeNull();
  expect(screen.queryByText('Nothing to total yet.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'New challenge' })).toBeNull();
  expect(button('Skip')).toBeTruthy();
  // Nothing is chosen for the trader, so Continue waits for an answer.
  expect(button('Continue').hasAttribute('disabled')).toBe(true);
  // No bank-link choice anywhere (C38).
  expect(document.body.textContent).not.toMatch(/bank|connect|link your/i);
});

test('the run is four steps with a Step n of 4 bar, and shows nothing of itself in the dashboard once done', async () => {
  const r = await emptyMine();
  await openRun(r);
  const bar = () =>
    [...document.querySelectorAll('[data-run-bar] i')].map((i) =>
      i.getAttribute('data-on'),
    );
  expect(bar()).toEqual(['true', 'false', 'false', 'false']);
  await toTransactions();
  expect(bar()).toEqual(['true', 'true', 'false', 'false']);
  click('Continue');
  await step(3);
  expect(bar()).toEqual(['true', 'true', 'true', 'false']);
  click('Continue');
  await step(4);
  expect(bar()).toEqual(['true', 'true', 'true', 'true']);
});

test('a workspace with data never shows it: the sample, a challenge, or a transaction', async () => {
  // The sample has both.
  await (async () => {
    const r = repo();
    renderApp(<PropHome />, { repository: r, url: URL });
    expect(
      await screen.findByRole('region', { name: 'Total spent' }),
    ).toBeTruthy();
    expect(screen.queryByText('How do you trade?')).toBeNull();
    cleanup();
  })();

  // One transaction in My workspace is enough.
  const t = await emptyMine();
  await t.propTxns.add('mine', {
    date: '2026-11-02',
    firm: 'Firm A',
    category: 'payout',
    amount: 100_00,
    status: 'reviewed',
  });
  renderApp(<PropHome />, { repository: t, url: URL });
  expect(
    await screen.findByRole('region', { name: 'Total earned' }),
  ).toBeTruthy();
  expect(screen.queryByText('How do you trade?')).toBeNull();
  cleanup();

  // So is one challenge.
  const c = await emptyMine();
  await c.challenges.create('mine', {
    name: 'Futures 50K',
    firm: 'Firm A',
    steps: 1,
    phases: [{ step: 'step-1', startDate: '2026-11-02' }, { step: 'funded' }],
    phase: 'evaluation',
    status: 'active',
  });
  renderApp(<PropHome />, { repository: c, url: URL });
  expect(
    await screen.findByRole('navigation', { name: 'Prop firms' }),
  ).toBeTruthy();
  expect(screen.queryByText('How do you trade?')).toBeNull();
});

test('once done it never shows again in that workspace, and the dashboard says it is empty', async () => {
  const r = await emptyMine();
  await r.prefs.update({ propStart: { mine: { answer: 'own', done: true } } });
  renderApp(<PropHome />, { repository: r, url: URL });
  expect(await screen.findByText('Nothing to total yet.')).toBeTruthy();
  expect(screen.queryByText('How do you trade?')).toBeNull();
  // The tabs and the buttons are the dashboard's own.
  expect(screen.getByRole('navigation', { name: 'Prop firms' })).toBeTruthy();
});

test('the run is per workspace: done in the sample does not end it in My workspace', async () => {
  const r = await emptyMine();
  await r.prefs.update({ propStart: { sample: { done: true } } });
  await openRun(r);
});

test('Home’s ?new=challenge goes straight to the form and leaves the run alone', async () => {
  const r = await emptyMine();
  renderApp(<PropHome />, { repository: r, url: `${URL}?new=challenge` });
  expect(
    await screen.findByRole('dialog', { name: 'New challenge' }),
  ).toBeTruthy();
  expect(screen.queryByText('How do you trade?')).toBeNull();
  expect((await savedPrefs(r)).propStart).toBeUndefined();
});

test('step 1: the answer is chosen, Back keeps it, and nothing is written before the run ends', async () => {
  const r = await emptyMine();
  const before = await savedPrefs(r);
  await openRun(r);
  const radios = () => screen.getAllByRole('radio') as HTMLInputElement[];
  expect(radios().map((i) => i.checked)).toEqual([false, false, false]);
  fireEvent.click(radios()[2]!);
  expect(radios().map((i) => i.checked)).toEqual([false, false, true]);
  fireEvent.click(radios()[1]!);
  expect(radios().map((i) => i.checked)).toEqual([false, true, false]);
  click('Continue');
  await step(2);
  click('Back');
  await step(1);
  expect(radios().map((i) => i.checked)).toEqual([false, true, false]);
  expect(await savedPrefs(r)).toEqual(before);
});

test('moving between steps puts focus on the new step, so a keyboard or screen-reader user lands on it', async () => {
  const r = await emptyMine();
  await openRun(r);
  fireEvent.click(screen.getAllByRole('radio')[0]!);
  click('Continue');
  const heading = await screen.findByRole('heading', {
    name: "Add what you've paid and been paid",
  });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  click('Back');
  const first = await screen.findByRole('heading', {
    name: 'How do you trade?',
  });
  await waitFor(() => expect(document.activeElement).toBe(first));
});

test('step 2: the form opens with today, uncategorized and not reviewed; the description says it is optional', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  expect(
    screen.getByText(
      'Fees and resets as a negative amount, payouts as a positive one. You can add more later in Transactions.',
    ),
  ).toBeTruthy();
  expect((field('Date') as HTMLInputElement).value).toBe('2026-11-25');
  expect((field('Category') as HTMLSelectElement).value).toBe('uncategorized');
  expect((field('Status') as HTMLSelectElement).value).toBe('not-reviewed');
  expect((field('Firm') as HTMLInputElement).value).toBe('');
  expect(field('Amount').getAttribute('placeholder')).toBe('−300 or 3000');
  // A form field reads from the left (the table's column lines up on the right).
  expect(field('Amount').className).not.toContain('text-right');
  expect(field('Firm').getAttribute('placeholder')).toBe('Firm name');
  expect(field('Description, optional').getAttribute('placeholder')).toBe(
    'For example, a reset',
  );
  // The six categories and three statuses of the Transactions tab, in its order.
  expect(
    [...(field('Category') as HTMLSelectElement).options].map((o) => o.text),
  ).toEqual([
    'Payout',
    'Evaluation fee',
    'Activation fee',
    'Reset fee',
    'Affiliate income',
    'Uncategorized',
  ]);
  expect(
    [...(field('Status') as HTMLSelectElement).options].map((o) => o.text),
  ).toEqual(['Not reviewed', 'Reviewed', 'Ignored']);
  // No challenge exists to link, so the first run does not ask for one.
  expect(screen.queryByLabelText('Challenge')).toBeNull();
  expect(
    screen.queryByRole('list', { name: 'Added' })?.children.length ?? 0,
  ).toBe(0);
});

test('step 2: each added row is saved to Transactions at once and listed below the form, newest first', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  await addRow('Sample firm A', '-165', {
    category: 'evaluation-fee',
    description: 'Evaluation',
  });
  await addRow('Sample firm A', '1800', {
    category: 'payout',
    status: 'reviewed',
  });

  const rows = within(screen.getByRole('list', { name: 'Added' })).getAllByRole(
    'listitem',
  );
  expect(rows.map((li) => li.textContent)).toEqual([
    '25 NovSample firm APayout+$1,800.00',
    '25 NovSample firm AEvaluation fee−$165.00',
  ]);
  // Signed money: a cost red with its minus, income green with its plus (C60).
  expect(within(rows[0]!).getByText('+$1,800.00').className).toContain(
    'text-gain',
  );
  expect(within(rows[1]!).getByText('−$165.00').className).toContain(
    'text-loss',
  );

  // They are real rows, in the workspace's ledger.
  const saved = await r.propTxns.list('mine');
  expect(
    saved
      .map((t) => [
        t.firm,
        t.amount,
        t.category,
        t.status,
        t.description,
        t.date,
      ])
      .sort(),
  ).toEqual(
    [
      [
        'Sample firm A',
        -165_00,
        'evaluation-fee',
        'not-reviewed',
        'Evaluation',
        '2026-11-25',
      ],
      ['Sample firm A', 1800_00, 'payout', 'reviewed', undefined, '2026-11-25'],
    ].sort(),
  );
  // The form is ready for the next row: defaults back, cursor in the firm.
  expect((field('Firm') as HTMLInputElement).value).toBe('');
  expect((field('Amount') as HTMLInputElement).value).toBe('');
  expect((field('Category') as HTMLSelectElement).value).toBe('uncategorized');
  expect((field('Status') as HTMLSelectElement).value).toBe('not-reviewed');
  expect(document.activeElement).toBe(field('Firm'));
  expect(screen.getByRole('status').textContent).toBe(
    'Transaction added. 2 in the list.',
  );
});

test('step 2: Enter in the amount adds the row', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  type('Firm', 'Firm A');
  type('Amount', '3000');
  fireEvent.submit(field('Amount').closest('form')!);
  await waitFor(() =>
    expect(
      within(screen.getByRole('list', { name: 'Added' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(1),
  );
});

test('step 2: a row with no firm, no amount or no date is not saved, and the first bad field says why and takes focus', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();

  click('Add transaction');
  expect(await screen.findByText("Enter the firm's name.")).toBeTruthy();
  expect(screen.getByText('Enter an amount, like −300 or 3000.')).toBeTruthy();
  expect(document.activeElement).toBe(field('Firm'));
  expect(field('Firm').getAttribute('aria-invalid')).toBe('true');
  expect(field('Amount').getAttribute('aria-invalid')).toBe('true');
  expect(
    document.getElementById(field('Firm').getAttribute('aria-describedby')!)!
      .textContent,
  ).toBe("Enter the firm's name.");

  type('Firm', 'Firm A');
  type('Amount', 'abc');
  click('Add transaction');
  expect(
    await screen.findByText('Enter an amount, like −300 or 3000.'),
  ).toBeTruthy();
  expect(document.activeElement).toBe(field('Amount'));

  type('Amount', '0');
  click('Add transaction');
  expect(
    await screen.findByText('Enter an amount, like −300 or 3000.'),
  ).toBeTruthy();

  type('Amount', '-300');
  type('Date', '');
  click('Add transaction');
  expect(await screen.findByText('Pick a date.')).toBeTruthy();
  expect(document.activeElement).toBe(field('Date'));

  expect(await r.propTxns.list('mine')).toEqual([]);
});

test('step 2: a write that fails keeps the row typed and says so', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  vi.spyOn(r.propTxns, 'add').mockRejectedValueOnce(new Error('disk'));
  type('Firm', 'Firm A');
  type('Amount', '-50');
  click('Add transaction');
  expect(
    await screen.findByText("Couldn't save that. Try again."),
  ).toBeTruthy();
  expect((field('Firm') as HTMLInputElement).value).toBe('Firm A');
  expect((field('Amount') as HTMLInputElement).value).toBe('-50');
  // Trying again works.
  click('Add transaction');
  await waitFor(() =>
    expect(
      within(screen.getByRole('list', { name: 'Added' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(1),
  );
  expect(await r.propTxns.list('mine')).toHaveLength(1);
});

test('step 2: the firms already added are offered as suggestions', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  await addRow('Sample firm A', '-85');
  await addRow('Other firm', '-10');
  const list = document.getElementById(field('Firm').getAttribute('list')!)!;
  expect(
    [...list.querySelectorAll('option')].map((o) => o.getAttribute('value')),
  ).toEqual(['Other firm', 'Sample firm A']);
});

test('step 2: Continue with a row typed adds it first; one that is not valid stays put', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  type('Firm', 'Firm A');
  click('Continue');
  // The amount is missing: the step stays, and says why.
  expect(
    await screen.findByText('Enter an amount, like −300 or 3000.'),
  ).toBeTruthy();
  expect(screen.queryByText('Step 3 of 4')).toBeNull();
  type('Amount', '-120');
  click('Continue');
  await step(3);
  expect(
    (await r.propTxns.list('mine')).map((t) => [t.firm, t.amount]),
  ).toEqual([['Firm A', -120_00]]);
  // Back to the step: the row is in its list, and nothing typed is left behind.
  click('Back');
  await step(2);
  expect(
    within(screen.getByRole('list', { name: 'Added' })).getAllByRole(
      'listitem',
    ),
  ).toHaveLength(1);
  expect((field('Firm') as HTMLInputElement).value).toBe('');
});

test('step 3: Spent, Earned and Net are Task 4’s totals of the transactions, signed and coloured (C60)', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  await addRow('Sample firm A', '-165', { category: 'evaluation-fee' });
  await addRow('Sample firm A', '-85', { category: 'activation-fee' });
  await addRow('Sample firm A', '1800', { category: 'payout' });
  await addRow('Sample firm A', '500', { status: 'ignored' });
  click('Continue');
  await step(3);
  expect(
    screen.getByRole('heading', {
      level: 2,
      name: 'Your prop-firm money so far',
    }),
  ).toBeTruthy();

  const t = totals(await r.propTxns.list('mine'));
  expect([t.spent, t.earned, t.net]).toEqual([250_00, 1800_00, 1550_00]);
  const fig = (label: string) => screen.getByText(label).closest('div')!;
  expect(fig('Spent').textContent).toBe('Spent−$250.00');
  expect(fig('Earned').textContent).toBe('Earned+$1,800.00');
  expect(fig('Net').textContent).toBe('Net+$1,550.00');
  expect(within(fig('Spent')).getByText('−$250.00').className).toContain(
    'text-loss',
  );
  expect(within(fig('Earned')).getByText('+$1,800.00').className).toContain(
    'text-gain',
  );
  expect(within(fig('Net')).getByText('+$1,550.00').className).toContain(
    'text-gain',
  );
});

test('step 3: a loss reads red, and with nothing added the totals are zero and uncoloured', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  click('Continue');
  await step(3);
  const fig = (label: string) => screen.getByText(label).closest('div')!;
  expect(fig('Spent').textContent).toBe('Spent$0.00');
  expect(fig('Earned').textContent).toBe('Earned$0.00');
  expect(fig('Net').textContent).toBe('Net$0.00');
  click('Back');
  await step(2);
  await addRow('Firm A', '-300');
  click('Continue');
  await step(3);
  expect(within(fig('Net')).getByText('−$300.00').className).toContain(
    'text-loss',
  );
});

test('step 3: each total is a metric with its definition (MetricTip)', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  click('Continue');
  await step(3);
  for (const [label, id] of [
    ['Spent', 'prop-spent'],
    ['Earned', 'prop-earned'],
    ['Net', 'prop-net'],
  ] as const)
    expect(
      screen
        .getByRole('button', { name: label })
        .getAttribute('data-metric-tip'),
    ).toBe(id);
});

test('step 3: Privacy masks the totals and the listed amounts', async () => {
  const r = await emptyMine();
  await r.prefs.update({ displayUnit: 'privacy' });
  await openRun(r);
  await toTransactions();
  await addRow('Firm A', '-165');
  await addRow('Firm A', '1800');
  const list = screen.getByRole('list', { name: 'Added' });
  expect(list.textContent).not.toMatch(/\d,\d{3}|\p{Sc}\s?\d|165/u);
  click('Continue');
  await step(3);
  const card = document.querySelector('section')!;
  expect(card.textContent).not.toMatch(/\d,\d{3}|\p{Sc}\s?\d|165/u);
  expect(within(card).getAllByText('hidden amount').length).toBeGreaterThan(0);
});

test('step 4 offers Add active accounts and Go to the dashboard, and nothing about a bank', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  click('Continue');
  await step(3);
  click('Continue');
  await step(4);
  expect(
    screen.getByRole('heading', {
      level: 2,
      name: 'Track your active accounts',
    }),
  ).toBeTruthy();
  expect(
    screen.getByText(
      'Add each evaluation or funded account as a challenge, with its rules, to follow its progress against them.',
    ),
  ).toBeTruthy();
  expect(button('Add active accounts')).toBeTruthy();
  expect(button('Go to the dashboard')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/bank|connect/i);
});

test('Go to the dashboard ends the run: the answer is stored, nothing else is, and the dashboard shows the rows', async () => {
  const r = await emptyMine();
  const before = await savedPrefs(r);
  await openRun(r);
  await toTransactions('Both');
  await addRow('Sample firm A', '-250');
  await addRow('Sample firm A', '1800', { category: 'payout' });
  click('Continue');
  await step(3);
  click('Continue');
  await step(4);
  click('Go to the dashboard');

  expect(
    await screen.findByRole('region', { name: 'Total spent' }),
  ).toBeTruthy();
  expect(screen.getByRole('navigation', { name: 'Prop firms' })).toBeTruthy();
  expect(screen.queryByText('How do you trade?')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(await savedPrefs(r)).toEqual({
    ...before,
    propStart: { mine: { answer: 'both', done: true } },
  });
  // The rows are in Transactions, and the dashboard counts them.
  expect(await r.propTxns.list('mine')).toHaveLength(2);
  const net = await screen.findByRole('region', { name: 'Net' });
  expect(net.textContent).toContain('+$1,550.00');
});

test('Add active accounts ends the run and opens New challenge over the dashboard', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions('Own capital');
  click('Continue');
  await step(3);
  click('Continue');
  await step(4);
  click('Add active accounts');
  expect(
    await screen.findByRole('dialog', { name: 'New challenge' }),
  ).toBeTruthy();
  expect(screen.queryByText('How do you trade?')).toBeNull();
  expect((await savedPrefs(r)).propStart).toEqual({
    mine: { answer: 'own', done: true },
  });
  // Behind the form: the dashboard, with its own empty state.
  expect(await screen.findByText('Nothing to total yet.')).toBeTruthy();
});

test('Skip at any step ends the run; the answer is kept if one was given, and rows already added stay', async () => {
  // Step 1, no answer.
  let r = await emptyMine();
  let before = await savedPrefs(r);
  await openRun(r);
  click('Skip');
  expect(await screen.findByText('Nothing to total yet.')).toBeTruthy();
  expect(await savedPrefs(r)).toEqual({
    ...before,
    propStart: { mine: { done: true } },
  });
  cleanup();

  // Step 1, with an answer chosen but not continued.
  r = await emptyMine();
  await openRun(r);
  fireEvent.click(screen.getByRole('radio', { name: /Own capital/ }));
  click('Skip');
  expect(await screen.findByText('Nothing to total yet.')).toBeTruthy();
  expect((await savedPrefs(r)).propStart).toEqual({
    mine: { answer: 'own', done: true },
  });
  cleanup();

  // Step 2, after adding a row.
  r = await emptyMine();
  before = await savedPrefs(r);
  await openRun(r);
  await toTransactions('Prop firms');
  await addRow('Firm A', '-85');
  click('Skip');
  expect(
    await screen.findByRole('region', { name: 'Total spent' }),
  ).toBeTruthy();
  expect((await savedPrefs(r)).propStart).toEqual({
    mine: { answer: 'prop', done: true },
  });
  expect(await r.propTxns.list('mine')).toHaveLength(1);
  cleanup();

  // Step 3.
  r = await emptyMine();
  await openRun(r);
  await toTransactions('Both');
  click('Continue');
  await step(3);
  click('Skip');
  expect(await screen.findByText('Nothing to total yet.')).toBeTruthy();
  expect((await savedPrefs(r)).propStart).toEqual({
    mine: { answer: 'both', done: true },
  });
});

test('Skip drops a row left half typed, without saving it', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  type('Firm', 'Firm A');
  type('Amount', '-50');
  click('Skip');
  expect(await screen.findByText('Nothing to total yet.')).toBeTruthy();
  expect(await r.propTxns.list('mine')).toEqual([]);
});

test('a row added in the run does not swap the run for the dashboard under the trader', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  await addRow('Firm A', '-50');
  // The workspace now has a transaction; the run is still the run.
  expect(screen.getByText('Step 2 of 4')).toBeTruthy();
  expect(screen.queryByRole('navigation', { name: 'Prop firms' })).toBeNull();
});

test('after the run, a fresh visit shows the dashboard, not the run', async () => {
  const r = await emptyMine();
  const first = await openRun(r);
  await toTransactions();
  await addRow('Firm A', '-50');
  click('Skip');
  expect(
    await screen.findByRole('region', { name: 'Total spent' }),
  ).toBeTruthy();
  first.unmount();
  // A reload: the same stored data, a new page.
  renderApp(<PropHome />, { repository: r, url: URL });
  expect(
    await screen.findByRole('region', { name: 'Total spent' }),
  ).toBeTruthy();
  expect(screen.queryByText('How do you trade?')).toBeNull();
});

test('a failed write on the last step keeps the run where it is and says so; trying again ends it', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  click('Continue');
  await step(3);
  click('Continue');
  await step(4);
  vi.spyOn(r.prefs, 'update').mockRejectedValueOnce(new Error('disk'));
  click('Go to the dashboard');
  expect(
    await screen.findByText("Couldn't save that. Try again."),
  ).toBeTruthy();
  expect(screen.getByText('Step 4 of 4')).toBeTruthy();
  click('Go to the dashboard');
  expect(await screen.findByText('Nothing to total yet.')).toBeTruthy();
  expect((await savedPrefs(r)).propStart).toEqual({
    mine: { answer: 'prop', done: true },
  });
});

function Switcher({ to }: { to: string }): React.JSX.Element {
  const set = useSetActiveWorkspace();
  return <button onClick={() => set.mutate(to)}>{`Switch to ${to}`}</button>;
}

test('switching workspace swaps the run for the sample dashboard, and back brings the run back while it never ended', async () => {
  const r = await emptyMine();
  renderApp(
    <>
      <Switcher to="sample" />
      <Switcher to="mine" />
      <PropHome />
    </>,
    { repository: r, url: URL },
  );
  await step(1);
  fireEvent.click(screen.getByRole('button', { name: 'Switch to sample' }));
  expect(
    await screen.findByRole('region', { name: 'Total spent' }),
  ).toBeTruthy();
  expect(screen.queryByText('Step 1 of 4')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to mine' }));
  await step(1);
  expect((await savedPrefs(r)).propStart).toBeUndefined();
});

test('after a switch from the sample to an empty My workspace the run is decided on My workspace, never on the sample’s challenges or transactions', async () => {
  // The sample is the active workspace, with three challenges and nine transactions.
  const r = repo();
  await r.prefs.update({ timeZone: NY });
  renderApp(
    <>
      <Switcher to="mine" />
      <PropHome />
    </>,
    { repository: r, url: URL },
  );
  expect(
    await screen.findByRole('region', { name: 'Total spent' }),
  ).toBeTruthy();
  expect(screen.queryByText('Step 1 of 4')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to mine' }));
  // The run, not the sample's dashboard held over, and not a blank in between.
  await step(1);
  expect(screen.queryByRole('region', { name: 'Total spent' })).toBeNull();
  expect(await r.challenges.list('mine')).toEqual([]);
  expect(await r.propTxns.list('mine')).toEqual([]);
  expect((await savedPrefs(r)).propStart).toBeUndefined();
});

test('a switch to a My workspace that has a transaction and no challenge shows its dashboard, whatever the sample held', async () => {
  const r = repo();
  await r.prefs.update({ timeZone: NY });
  await r.propTxns.add('mine', {
    date: '2026-11-20',
    firm: 'Apex',
    category: 'evaluation-fee',
    amount: -16_500,
    status: 'reviewed',
  });
  renderApp(
    <>
      <Switcher to="mine" />
      <PropHome />
    </>,
    { repository: r, url: URL },
  );
  await screen.findByRole('region', { name: 'Total spent' });
  fireEvent.click(screen.getByRole('button', { name: 'Switch to mine' }));
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Total spent' }).textContent,
    ).toBe('Total spent−$165.00fees and resets'),
  );
  expect(screen.queryByText('Step 1 of 4')).toBeNull();
});

test('the form is one column on a phone and two from sm, and the card is the full width up to 640px', async () => {
  const r = await emptyMine();
  await openRun(r);
  await toTransactions();
  const grid = field('Firm').closest('form')!.firstElementChild as HTMLElement;
  expect(grid.className).toContain('grid-cols-1');
  expect(grid.className).toContain('sm:grid-cols-2');
  const card = screen.getByText('Step 2 of 4').closest('section')!;
  expect(card.className).toContain('max-w-[640px]');
  expect(card.className).toContain('w-full');
});

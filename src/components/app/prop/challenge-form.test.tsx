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
import type { NewChallengeEntry } from '@/data/repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { challengeType } from '@/domain/prop/finance';
import { localDate } from '@/domain/time';
import type { Account, Challenge, PropRuleSet } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { ChallengeForm } from './challenge-form';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = SAMPLE_WORKSPACE.id;

function repo() {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}

const type = (label: string | RegExp, value: string, within_?: HTMLElement) =>
  fireEvent.change((within_ ? within(within_) : screen).getByLabelText(label), {
    target: { value },
  });

const group = (name: string) => screen.getByRole('group', { name });

/** Names the challenge and creates step 1's account with the given balance. */
function basics(balance: string) {
  type('Challenge name', 'Apex 100K');
  type('Firm', 'Apex');
  const step1 = group('Step 1');
  type('Account', 'new', step1);
  type('New account name', 'Apex 100K evaluation', step1);
  type('Starting balance', balance, step1);
  return step1;
}

test('a daily loss of 5% on a $100,000 start saves dailyLossLimit: 500000', async () => {
  const r = repo();
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  const step1 = basics('100000');
  type('Profit target', '8', step1);
  fireEvent.click(
    within(
      within(step1).getByRole('radiogroup', { name: 'Profit target unit' }),
    ).getByRole('radio', { name: '%' }),
  );
  type('Daily loss limit', '5', step1);
  fireEvent.click(
    within(
      within(step1).getByRole('radiogroup', { name: 'Daily loss limit unit' }),
    ).getByRole('radio', { name: '%' }),
  );
  type('Max drawdown', '10000', step1);
  type('Drawdown type', 'trailing', step1);
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const account = (await r.accounts.list(WS)).find(
    (a) => a.name === 'Apex 100K evaluation',
  )!;
  expect(account).toMatchObject({
    type: 'prop-evaluation',
    startingBalance: 10_000_000,
  });
  expect(account.propRules).toMatchObject({
    dailyLossLimit: 500_000,
    profitTarget: 800_000,
    maxDrawdown: 1_000_000,
    drawdownType: 'trailing',
    phase: 'evaluation',
    firm: 'Apex',
  });
  const [saved] = await r.challenges.list(WS);
  expect(saved).toMatchObject({
    name: 'Apex 100K',
    firm: 'Apex',
    steps: 1,
    phase: 'evaluation',
    status: 'active',
  });
  expect(saved!.phases.map((p) => p.step)).toEqual(['step-1', 'funded']);
  expect(saved!.phases[0]!.accountId).toBe(account.id);
});

test('Same rules as step 1 copies the rules to step 2', async () => {
  renderApp(<ChallengeForm onClose={() => {}} />, { repository: repo() });
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('radio', { name: '2 steps' }));
  const step1 = basics('100000');
  type('Profit target', '8000', step1);
  type('Daily loss limit', '2500', step1);
  type('Max drawdown', '6000', step1);
  type('Minimum trading days', '7', step1);
  type('Best-day consistency (%)', '40', step1);
  const step2 = group('Step 2');
  type('Account', 'new', step2);
  fireEvent.click(
    within(step2).getByRole('button', { name: 'Same rules as step 1' }),
  );
  expect(
    (within(step2).getByLabelText('Profit target') as HTMLInputElement).value,
  ).toBe('8000');
  expect(
    (within(step2).getByLabelText('Daily loss limit') as HTMLInputElement)
      .value,
  ).toBe('2500');
  expect(
    (within(step2).getByLabelText('Max drawdown') as HTMLInputElement).value,
  ).toBe('6000');
  expect(
    (within(step2).getByLabelText('Minimum trading days') as HTMLInputElement)
      .value,
  ).toBe('7');
  expect(
    (
      within(step2).getByLabelText(
        'Best-day consistency (%)',
      ) as HTMLInputElement
    ).value,
  ).toBe('40');
});

test('the funded phase shows no target and no period', async () => {
  renderApp(<ChallengeForm onClose={() => {}} />, { repository: repo() });
  await screen.findByRole('dialog');
  const funded = group('Funded');
  expect(within(funded).queryByLabelText('Profit target')).toBeNull();
  expect(within(funded).queryByLabelText('Period')).toBeNull();
  // It links an account first: its rules show once there is one.
  type('Account', 'new', funded);
  expect(within(funded).getByLabelText('Daily loss limit')).toBeTruthy();
  expect(within(funded).queryByLabelText('Profit target')).toBeNull();
  expect(within(group('Step 1')).queryByLabelText('Profit target')).toBeNull();
  type('Account', 'new', group('Step 1'));
  expect(within(group('Step 1')).getByLabelText('Profit target')).toBeTruthy();
});

test('a refused save announces each error and focuses the first invalid field', async () => {
  const r = repo();
  renderApp(<ChallengeForm onClose={() => {}} />, { repository: r });
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  const name = screen.getByLabelText('Challenge name');
  await waitFor(() => expect(document.activeElement).toBe(name));
  expect(name.getAttribute('aria-invalid')).toBe('true');
  const alert = screen.getAllByRole('alert')[0]!;
  expect(name.getAttribute('aria-describedby')).toBe(alert.id);
  expect(await r.challenges.list(WS)).toEqual([]);
});

const RULES: PropRuleSet = {
  firm: 'Apex',
  phase: 'evaluation',
  profitTarget: 800_000,
  dailyLossLimit: 100_000,
  maxDrawdown: 1_000_000,
  drawdownType: 'trailing',
  minTradingDays: 5,
};
const account = (id: string, name: string): Account => ({
  id,
  workspaceId: WS,
  name,
  broker: 'Apex',
  type: 'prop-evaluation',
  currency: 'USD',
  startingBalance: 10_000_000,
  status: 'active',
  propRules: RULES,
});
const existing: Challenge = {
  id: 'c-1',
  workspaceId: WS,
  name: 'Forex 100K',
  firm: 'Apex',
  steps: 1,
  phases: [{ step: 'step-1', accountId: 'p-forex' }, { step: 'funded' }],
  phase: 'evaluation',
  status: 'active',
};

function repoWith(accounts: Account[], challenges: Challenge[]) {
  const sample = fixtureSample();
  sample.accounts.push(...accounts);
  sample.challenges.push(...challenges);
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample,
  });
}

test('the account select disables an account another challenge links, naming that challenge', async () => {
  const r = repoWith(
    [account('p-forex', 'Forex evaluation'), account('p-free', 'Free one')],
    [existing],
  );
  renderApp(<ChallengeForm onClose={() => {}} />, { repository: r });
  await screen.findByRole('dialog');
  const select = within(group('Step 1')).getByLabelText('Account');
  const option = (name: RegExp) =>
    within(select).getByRole('option', { name }) as HTMLOptionElement;
  await waitFor(() => expect(option(/Forex evaluation/)).toBeTruthy());
  expect(option(/Forex evaluation/).textContent).toContain('(in Forex 100K)');
  expect(option(/Forex evaluation/).disabled).toBe(true);
  expect(option(/Free one/).disabled).toBe(false);
});

test('editing a challenge keeps its own accounts selectable', async () => {
  const r = repoWith([account('p-forex', 'Forex evaluation')], [existing]);
  renderApp(<ChallengeForm challenge={existing} onClose={() => {}} />, {
    repository: r,
  });
  await screen.findByRole('dialog');
  const select = within(group('Step 1')).getByLabelText('Account');
  const option = (await within(select).findByRole('option', {
    name: /Forex evaluation/,
  })) as HTMLOptionElement;
  expect(option.disabled).toBe(false);
  expect(option.textContent).not.toContain('(in ');
});

test('a static drawdown has no floor fields; a trailing one does', async () => {
  renderApp(<ChallengeForm onClose={() => {}} />, { repository: repo() });
  await screen.findByRole('dialog');
  const step1 = group('Step 1');
  type('Account', 'new', step1);
  type('Drawdown type', 'trailing', step1);
  expect(within(step1).getByLabelText('Drawdown floor')).toBeTruthy();
  type('Drawdown floor', 'fixed', step1);
  expect(within(step1).getByLabelText('Floor balance')).toBeTruthy();
  type('Drawdown type', 'static', step1);
  expect(within(step1).queryByLabelText('Drawdown floor')).toBeNull();
  expect(within(step1).queryByLabelText('Floor balance')).toBeNull();
  type('Drawdown type', 'eod-trailing', step1);
  expect(within(step1).getByLabelText('Floor balance')).toBeTruthy();
});

test('a failed save writes nothing, and the retry after an edit saves what the form holds now, with one account (C-02)', async () => {
  const r = repo();
  const createMany = r.challenges.createMany.bind(r.challenges);
  r.challenges.createMany = vi
    .fn()
    .mockRejectedValueOnce(new Error('disk full'))
    .mockImplementation(createMany);
  const createAccount = vi.spyOn(r.accounts, 'create');
  const createOne = vi.spyOn(r.challenges, 'create');
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  const step1 = basics('100000');
  rules(step1);
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  expect(await screen.findByText(/Couldn.t save that/)).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  expect(await r.challenges.list(WS)).toEqual([]);
  // The trader edits the account's name and balance, then tries again.
  type('New account name', 'Apex 100K evaluation v2', step1);
  type('Starting balance', '50000', step1);
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const made = (await r.accounts.list(WS)).filter(
    (a) => a.type === 'prop-evaluation',
  );
  expect(made.map((a) => a.name)).toEqual(['Apex 100K evaluation v2']);
  expect(made[0]!.startingBalance).toBe(5_000_000);
  const [saved] = await r.challenges.list(WS);
  expect(saved!.phases[0]!.accountId).toBe(made[0]!.id);
  // One write each time; the form makes no account or challenge on its own.
  expect(r.challenges.createMany).toHaveBeenCalledTimes(2);
  expect(createAccount).not.toHaveBeenCalled();
  expect(createOne).not.toHaveBeenCalled();
});

test('a failed delete keeps the dialog and says so', async () => {
  const r = repoWith([account('p-forex', 'Forex evaluation')], [existing]);
  r.challenges.remove = vi.fn().mockRejectedValue(new Error('no'));
  const onClose = vi.fn();
  renderApp(<ChallengeForm challenge={existing} onClose={onClose} />, {
    repository: r,
  });
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Delete challenge' }));
  const confirm = await screen.findByRole('dialog', {
    name: 'Delete Forex 100K?',
  });
  fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
  expect(await within(confirm).findByRole('alert')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

/** The sample plus a second strategy, for the picker's several. */
function repoWithStrategies() {
  const sample = fixtureSample();
  sample.strategies.push({
    ...sample.strategies[0]!,
    id: 'str-2',
    name: 'Opening range fade',
  });
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample,
  });
}

/** The rules every created phase needs, typed into step 1. */
function rules(step: HTMLElement) {
  type('Profit target', '8000', step);
  type('Daily loss limit', '2500', step);
  type('Max drawdown', '6000', step);
  type('Minimum trading days', '5', step);
}

test('creating offers Active and Breached, not Passed; editing offers Active and Passed, never Breached; the failure reason is gone (C-04, C78)', async () => {
  renderApp(<ChallengeForm onClose={() => {}} />, { repository: repo() });
  await screen.findByRole('dialog');
  const labels = (name: string) =>
    within(screen.getByRole('radiogroup', { name }))
      .getAllByRole('radio')
      .map((r) => r.closest('label')!.textContent);
  expect(labels('Status')).toEqual(['Active', 'Breached']);
  expect(screen.queryByLabelText('Failure reason')).toBeNull();
  cleanup();
  renderApp(<ChallengeForm challenge={existing} onClose={() => {}} />, {
    repository: repoWith([account('p-forex', 'Forex evaluation')], [existing]),
  });
  await screen.findByRole('dialog', { name: 'Edit challenge' });
  expect(labels('Status')).toEqual(['Active', 'Passed']);
});

const REASONS_SHOWN = [
  'Broke the max drawdown',
  'Overtrading or forcing trades',
  'Time pressure',
  'Lack of risk management',
  'OtherIn your own words.',
];
const breachGroup = () =>
  screen.getByRole('radiogroup', { name: 'Why did it break?' });
const chooseBreached = () =>
  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: 'Status' })).getByRole(
      'radio',
      { name: 'Breached' },
    ),
  );
const createButton = () =>
  screen.getByRole('button', { name: 'Create challenge' });

test('Breached on create shows the five reasons with none chosen, and a breach date of today (C-04)', async () => {
  renderApp(<ChallengeForm onClose={() => {}} />, { repository: repo() });
  await screen.findByRole('dialog');
  expect(
    screen.queryByRole('radiogroup', { name: 'Why did it break?' }),
  ).toBeNull();
  expect(screen.queryByLabelText('Breach date')).toBeNull();
  chooseBreached();
  const radios = within(breachGroup()).getAllByRole('radio');
  expect(radios.map((r) => r.closest('label')!.textContent)).toEqual(
    REASONS_SHOWN,
  );
  expect(radios.some((r) => (r as HTMLInputElement).checked)).toBe(false);
  const today = localDate(
    new Date().toISOString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const date = screen.getByLabelText('Breach date') as HTMLInputElement;
  expect(date.value).toBe(today);
  expect(date.max).toBe(today);
  expect(
    screen.queryByRole('textbox', { name: 'In your own words' }),
  ).toBeNull();
  fireEvent.click(within(breachGroup()).getByRole('radio', { name: /^Other/ }));
  expect(
    screen.getByRole('textbox', { name: 'In your own words' }),
  ).toBeTruthy();
  // Back to Active: the breach questions go.
  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: 'Status' })).getByRole(
      'radio',
      { name: 'Active' },
    ),
  );
  expect(
    screen.queryByRole('radiogroup', { name: 'Why did it break?' }),
  ).toBeNull();
});

test('a breached challenge needs a reason; Other needs words; the date cannot be in the future (C-04)', async () => {
  const r = repo();
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  type('Challenge name', 'Broke early');
  type('Firm', 'Apex');
  chooseBreached();
  fireEvent.click(createButton());
  const first = within(breachGroup()).getAllByRole('radio')[0]!;
  await waitFor(() => expect(document.activeElement).toBe(first));
  expect(screen.getAllByRole('alert').map((a) => a.textContent)).toContain(
    'Choose why it broke.',
  );
  expect(first.getAttribute('aria-invalid')).toBe('true');
  expect(await r.challenges.list(WS)).toEqual([]);

  fireEvent.click(within(breachGroup()).getByRole('radio', { name: /^Other/ }));
  fireEvent.click(createButton());
  const words = screen.getByRole('textbox', { name: 'In your own words' });
  await waitFor(() => expect(document.activeElement).toBe(words));
  expect(words.getAttribute('aria-invalid')).toBe('true');
  fireEvent.change(words, { target: { value: '   ' } });
  fireEvent.click(createButton());
  expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
  expect(await r.challenges.list(WS)).toEqual([]);

  fireEvent.change(words, { target: { value: 'Firm closed it' } });
  fireEvent.change(screen.getByLabelText('Breach date'), {
    target: { value: '2999-01-01' },
  });
  fireEvent.click(createButton());
  expect(
    (await screen.findAllByRole('alert')).map((a) => a.textContent),
  ).toContain("The breach date can't be in the future.");
  expect(await r.challenges.list(WS)).toEqual([]);
  expect(onClose).not.toHaveBeenCalled();
});

test('Breached on create makes the challenge breached in the same write, permanent, with its reason and date (C-04)', async () => {
  const r = repo();
  const createMany = vi.spyOn(r.challenges, 'createMany');
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  const step1 = basics('100000');
  rules(step1);
  chooseBreached();
  fireEvent.click(within(breachGroup()).getByRole('radio', { name: /^Other/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'In your own words' }), {
    target: { value: '  Firm closed it  ' },
  });
  fireEvent.change(screen.getByLabelText('Breach date'), {
    target: { value: '2026-11-10' },
  });
  fireEvent.click(createButton());
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(createMany).toHaveBeenCalledTimes(1);
  const [saved] = await r.challenges.list(WS);
  expect(saved).toMatchObject({
    name: 'Apex 100K',
    status: 'breached',
    breachReason: 'other',
    breachedOn: '2026-11-10',
    failureReason: 'Firm closed it',
    phase: 'evaluation',
  });
  // It is permanent: no way back, and no second breach.
  await expect(
    r.challenges.update(WS, saved!.id, { status: 'active' }),
  ).rejects.toThrow(/breach/i);
  await expect(
    r.challenges.markBreached(WS, saved!.id, {
      reason: 'overtrading',
      on: '2026-11-11',
    }),
  ).rejects.toThrow(/breach/i);
});

test('a created-breached challenge with a listed reason keeps no words (C-04)', async () => {
  const r = repo();
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  type('Challenge name', 'Broke early');
  type('Firm', 'Apex');
  chooseBreached();
  fireEvent.click(
    within(breachGroup()).getByRole('radio', { name: /Time pressure/ }),
  );
  fireEvent.click(createButton());
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const [saved] = await r.challenges.list(WS);
  expect(saved).toMatchObject({
    status: 'breached',
    breachReason: 'time-pressure',
  });
  expect(saved!.breachedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect('failureReason' in saved!).toBe(false);
});

const breached: Challenge = {
  ...existing,
  id: 'c-b',
  name: 'Failed one',
  status: 'breached',
  failureReason: 'Held through news',
  breachReason: 'other',
  breachedOn: '2026-11-10',
};

test('a breached challenge has no status or phase to change, says why, and keeps its breach when saved', async () => {
  const r = repoWithBreached();
  const onClose = vi.fn();
  renderApp(<ChallengeForm challenge={breached} onClose={onClose} />, {
    repository: r,
  });
  const dialog = await screen.findByRole('dialog', { name: 'Edit challenge' });
  expect(
    within(dialog).queryByRole('radiogroup', { name: 'Status' }),
  ).toBeNull();
  expect(
    within(dialog).queryByRole('radiogroup', { name: 'Phase' }),
  ).toBeNull();
  expect(dialog.textContent).toContain('A breach is final');
  // Steps are locked too: fewer steps would drop the phase it broke in.
  expect(
    within(dialog).queryByRole('radiogroup', { name: 'Steps' }),
  ).toBeNull();
  type('Challenge name', 'Failed one, renamed');
  fireEvent.click(screen.getByRole('button', { name: 'Save challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const saved = (await r.challenges.list(WS)).find((c) => c.id === 'c-b')!;
  expect(saved).toMatchObject({
    name: 'Failed one, renamed',
    status: 'breached',
    breachReason: 'other',
    breachedOn: '2026-11-10',
    failureReason: 'Held through news',
  });
});

function repoWithBreached() {
  return repoWith([account('p-forex', 'Forex evaluation')], [breached]);
}

test('Strategies: several can be chosen, and are saved on the challenge', async () => {
  const r = repoWithStrategies();
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  type('Challenge name', 'Apex 100K');
  type('Firm', 'Apex');
  const strategies = screen.getByRole('group', { name: 'Strategies' });
  fireEvent.click(
    await within(strategies).findByRole('checkbox', {
      name: 'Opening range breakout',
    }),
  );
  fireEvent.click(
    within(strategies).getByRole('checkbox', { name: 'Opening range fade' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const [saved] = await r.challenges.list(WS);
  expect([...saved!.strategyIds!].sort()).toEqual(['str-1', 'str-2']);
});

test('editing shows the strategies attached, and unchecking them all clears them', async () => {
  const withStrategies: Challenge = { ...existing, strategyIds: ['str-1'] };
  const sample = fixtureSample();
  sample.accounts.push(account('p-forex', 'Forex evaluation'));
  sample.challenges.push(withStrategies);
  const r = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample,
  });
  const onClose = vi.fn();
  renderApp(<ChallengeForm challenge={withStrategies} onClose={onClose} />, {
    repository: r,
  });
  const box = (await screen.findByRole('checkbox', {
    name: 'Opening range breakout',
  })) as HTMLInputElement;
  expect(box.checked).toBe(true);
  fireEvent.click(box);
  fireEvent.click(screen.getByRole('button', { name: 'Save challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect((await r.challenges.list(WS))[0]!.strategyIds ?? []).toEqual([]);
});

test('Broker fills the broker of the account the form creates; blank uses the firm', async () => {
  const r = repo();
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  expect(screen.queryByLabelText('Broker')).toBeNull();
  const step1 = basics('100000');
  rules(step1);
  type('Broker', 'Tradovate');
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const made = (await r.accounts.list(WS)).find(
    (a) => a.name === 'Apex 100K evaluation',
  )!;
  expect(made.broker).toBe('Tradovate');

  cleanup();
  const r2 = repo();
  const close2 = vi.fn();
  renderApp(<ChallengeForm onClose={close2} />, { repository: r2 });
  await screen.findByRole('dialog');
  rules(basics('100000'));
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  await waitFor(() => expect(close2).toHaveBeenCalled());
  expect(
    (await r2.accounts.list(WS)).find((a) => a.name === 'Apex 100K evaluation')!
      .broker,
  ).toBe('Apex');
});

test('Quantity 3 makes three challenges, each with its own new account, named name, name 2, name 3 (C64)', async () => {
  const r = repo();
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  const step1 = basics('100000');
  rules(step1);
  type('Evaluation fee', '549');
  type('Quantity', '3');
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const challenges = await r.challenges.list(WS);
  expect(challenges.map((c) => c.name)).toEqual([
    'Apex 100K',
    'Apex 100K 2',
    'Apex 100K 3',
  ]);
  const accounts = (await r.accounts.list(WS)).filter(
    (a) => a.type === 'prop-evaluation',
  );
  expect(accounts.map((a) => a.name).sort()).toEqual([
    'Apex 100K evaluation',
    'Apex 100K evaluation 2',
    'Apex 100K evaluation 3',
  ]);
  // The same rules and fees, each its own account.
  for (const c of challenges) {
    expect(c).toMatchObject({ evaluationFee: 54_900, steps: 1 });
    const linked = accounts.find((a) => a.id === c.phases[0]!.accountId)!;
    expect(linked.propRules).toMatchObject({
      profitTarget: 800_000,
      dailyLossLimit: 250_000,
      maxDrawdown: 600_000,
    });
  }
  expect(new Set(challenges.map((c) => c.phases[0]!.accountId)).size).toBe(3);
});

test('Quantity is offered only when every phase makes a new account, on a new challenge, and runs 1 to 20', async () => {
  const r = repoWith([account('p-free', 'Free one')], []);
  renderApp(<ChallengeForm onClose={() => {}} />, { repository: r });
  await screen.findByRole('dialog');
  expect(screen.queryByLabelText('Quantity')).toBeNull();
  const step1 = group('Step 1');
  type('Account', 'new', step1);
  expect(screen.getByLabelText('Quantity')).toBeTruthy();
  // Linking an existing account in another phase takes it away.
  const funded = group('Funded');
  await within(funded).findByRole('option', { name: /Free one/ });
  type('Account', 'p-free', funded);
  expect(screen.queryByLabelText('Quantity')).toBeNull();
  type('Account', 'none', funded);
  expect(screen.getByLabelText('Quantity')).toBeTruthy();

  // 0 and 21 are refused, with the reason beside the field.
  type('Challenge name', 'Apex 100K');
  type('Firm', 'Apex');
  type('New account name', 'Apex eval', step1);
  type('Starting balance', '100000', step1);
  rules(step1);
  for (const bad of ['0', '21', '2.5', '']) {
    type('Quantity', bad);
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    expect(
      (await screen.findAllByRole('alert')).map((a) => a.textContent),
    ).toContain('Enter a whole number from 1 to 20.');
  }
  expect(await r.challenges.list(WS)).toEqual([]);
});

test('editing a challenge offers no Quantity', async () => {
  const r = repoWith([account('p-forex', 'Forex evaluation')], [existing]);
  renderApp(<ChallengeForm challenge={existing} onClose={() => {}} />, {
    repository: r,
  });
  await screen.findByRole('dialog');
  type('Account', 'new', group('Funded'));
  expect(screen.queryByLabelText('Quantity')).toBeNull();
});

test('a quantity of 3 is one write of 3 challenges with their accounts, and nothing is written one by one (C-02)', async () => {
  const r = repo();
  const createMany = vi.spyOn(r.challenges, 'createMany');
  const createAccount = vi.spyOn(r.accounts, 'create');
  const createOne = vi.spyOn(r.challenges, 'create');
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  rules(basics('100000'));
  type('Quantity', '3');
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(createMany).toHaveBeenCalledTimes(1);
  expect(createMany.mock.calls[0]![1]).toHaveLength(3);
  expect(createAccount).not.toHaveBeenCalled();
  expect(createOne).not.toHaveBeenCalled();
  expect(await r.challenges.list(WS)).toHaveLength(3);
  expect(
    (await r.accounts.list(WS)).filter((a) => a.type === 'prop-evaluation'),
  ).toHaveLength(3);
});

test('a quantity that fails writes no account and no challenge, and says so (C-02)', async () => {
  const r = repo();
  const before = (await r.accounts.list(WS)).length;
  // The third challenge is refused (a blank name), so the batch is.
  const real = r.challenges.createMany.bind(r.challenges);
  r.challenges.createMany = vi.fn((ws: string, items: NewChallengeEntry[]) =>
    real(
      ws,
      items.map((e, i) =>
        i === 2 ? { ...e, challenge: { ...e.challenge, name: '  ' } } : e,
      ),
    ),
  );
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  rules(basics('100000'));
  type('Quantity', '3');
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  expect(await screen.findByText(/Couldn.t save that/)).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  expect(await r.challenges.list(WS)).toEqual([]);
  expect(await r.accounts.list(WS)).toHaveLength(before);
});

test('editing a challenge to create an account writes the account and the link together, or neither (C-02)', async () => {
  const r = repoWith([account('p-forex', 'Forex evaluation')], [existing]);
  const real = r.challenges.update.bind(r.challenges);
  r.challenges.update = vi
    .fn()
    .mockRejectedValueOnce(new Error('disk full'))
    .mockImplementation(real);
  const before = (await r.accounts.list(WS)).length;
  const onClose = vi.fn();
  renderApp(<ChallengeForm challenge={existing} onClose={onClose} />, {
    repository: r,
  });
  await screen.findByRole('dialog', { name: 'Edit challenge' });
  const funded = group('Funded');
  type('Account', 'new', funded);
  type('New account name', 'Forex funded', funded);
  type('Starting balance', '100000', funded);
  type('Daily loss limit', '2500', funded);
  type('Max drawdown', '6000', funded);
  type('Minimum trading days', '5', funded);
  fireEvent.click(screen.getByRole('button', { name: 'Save challenge' }));
  expect(await screen.findByText(/Couldn.t save that/)).toBeTruthy();
  expect(await r.accounts.list(WS)).toHaveLength(before);
  fireEvent.click(screen.getByRole('button', { name: 'Save challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const made = (await r.accounts.list(WS)).filter(
    (a) => a.name === 'Forex funded',
  );
  expect(made).toHaveLength(1);
  expect(made[0]).toMatchObject({ type: 'prop-funded' });
  const [saved] = (await r.challenges.list(WS)).filter((c) => c.id === 'c-1');
  expect(saved!.phases[1]).toEqual({ step: 'funded', accountId: made[0]!.id });
});

test('a challenge created in the funded phase reads as straight to funded, derived and never stored (C30)', async () => {
  const r = repo();
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  type('Challenge name', 'Funded direct');
  type('Firm', 'Apex');
  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: 'Phase' })).getByRole(
      'radio',
      {
        name: 'Funded',
      },
    ),
  );
  const funded = group('Funded');
  type('Account', 'new', funded);
  type('New account name', 'Funded account', funded);
  type('Starting balance', '50000', funded);
  type('Daily loss limit', '1100', funded);
  type('Max drawdown', '2000', funded);
  type('Minimum trading days', '5', funded);
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const [saved] = await r.challenges.list(WS);
  expect(saved).toMatchObject({ phase: 'funded', steps: 1 });
  expect(challengeType(saved!)).toBe('s2f');
  expect('type' in saved!).toBe(false);
});

test('editing an unlinked evaluation to the funded phase records the move, so it does not read as straight to funded (C-01)', async () => {
  const bare: Challenge = {
    ...existing,
    id: 'c-bare',
    name: 'Bare one',
    phases: [{ step: 'step-1' }, { step: 'funded' }],
  };
  const r = repoWith([], [bare]);
  const onClose = vi.fn();
  renderApp(<ChallengeForm challenge={bare} onClose={onClose} />, {
    repository: r,
  });
  await screen.findByRole('dialog', { name: 'Edit challenge' });
  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: 'Phase' })).getByRole(
      'radio',
      { name: 'Funded' },
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const saved = (await r.challenges.list(WS)).find((c) => c.id === 'c-bare')!;
  expect(saved).toMatchObject({
    phase: 'funded',
    movedToFundedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  });
  expect(challengeType(saved)).toBe('1-step');
});

test('saving a challenge that is already funded records no move', async () => {
  const funded: Challenge = {
    ...existing,
    id: 'c-funded',
    phases: [{ step: 'step-1' }, { step: 'funded' }],
    phase: 'funded',
  };
  const r = repoWith([], [funded]);
  const onClose = vi.fn();
  renderApp(<ChallengeForm challenge={funded} onClose={onClose} />, {
    repository: r,
  });
  await screen.findByRole('dialog', { name: 'Edit challenge' });
  fireEvent.click(screen.getByRole('button', { name: 'Save challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const saved = (await r.challenges.list(WS)).find((c) => c.id === 'c-funded')!;
  expect('movedToFundedOn' in saved).toBe(false);
});

test('editing a breached 2-step keeps both steps and its breach facts (C-05)', async () => {
  const two: Challenge = {
    ...breached,
    id: 'c-b2',
    steps: 2,
    phases: [
      { step: 'step-1', accountId: 'p-forex' },
      { step: 'step-2' },
      { step: 'funded' },
    ],
  };
  const r = repoWith([account('p-forex', 'Forex evaluation')], [two]);
  const onClose = vi.fn();
  renderApp(<ChallengeForm challenge={two} onClose={onClose} />, {
    repository: r,
  });
  await screen.findByRole('dialog', { name: 'Edit challenge' });
  expect(screen.queryByRole('radiogroup', { name: 'Steps' })).toBeNull();
  // Step 2 is still there to edit.
  expect(group('Step 2')).toBeTruthy();
  type('Challenge name', 'Renamed', undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Save challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const saved = (await r.challenges.list(WS)).find((c) => c.id === 'c-b2')!;
  expect(saved).toMatchObject({
    name: 'Renamed',
    steps: 2,
    status: 'breached',
    breachReason: 'other',
    breachedOn: '2026-11-10',
  });
  expect(saved.phases.map((p) => p.step)).toEqual([
    'step-1',
    'step-2',
    'funded',
  ]);
});

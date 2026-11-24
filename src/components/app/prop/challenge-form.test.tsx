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
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
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

test('a retry after a failed challenge write does not create the account twice', async () => {
  const r = repo();
  const create = r.challenges.create.bind(r.challenges);
  r.challenges.create = vi
    .fn()
    .mockRejectedValueOnce(new Error('disk full'))
    .mockImplementation(create);
  const onClose = vi.fn();
  renderApp(<ChallengeForm onClose={onClose} />, { repository: r });
  await screen.findByRole('dialog');
  const step1 = basics('100000');
  type('Profit target', '8000', step1);
  type('Daily loss limit', '2500', step1);
  type('Max drawdown', '6000', step1);
  type('Minimum trading days', '5', step1);
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  expect(await screen.findByText(/Couldn.t save that/)).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const made = (await r.accounts.list(WS)).filter(
    (a) => a.name === 'Apex 100K evaluation',
  );
  expect(made).toHaveLength(1);
  const [saved] = await r.challenges.list(WS);
  expect(saved!.phases[0]!.accountId).toBe(made[0]!.id);
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

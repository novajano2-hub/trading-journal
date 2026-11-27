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
import type { ChallengeCheck } from '@/domain/prop/challenge';
import type { Account, Challenge } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { MarkBreached } from './mark-breached';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = SAMPLE_WORKSPACE.id;
const account: Account = {
  id: 'p-forex',
  workspaceId: WS,
  name: 'Forex evaluation',
  broker: 'Apex',
  type: 'prop-evaluation',
  currency: 'USD',
  startingBalance: 10_000_000,
  status: 'active',
};
const forex: Challenge = {
  id: 'c-1',
  workspaceId: WS,
  name: 'Forex 100K',
  firm: 'Apex',
  steps: 2,
  phases: [
    { step: 'step-1', accountId: 'p-forex' },
    { step: 'step-2' },
    { step: 'funded' },
  ],
  phase: 'evaluation',
  status: 'active',
};
const quiet: ChallengeCheck = {
  currentStep: 'step-1',
  health: 'active',
  daysLeft: null,
  phases: [{ step: 'step-1', accountId: 'p-forex', archived: false }],
};
const broken: ChallengeCheck = {
  ...quiet,
  health: 'breached',
  finding: {
    rule: 'daily-loss',
    date: '2026-11-10',
    value: 150_000,
    limit: 100_000,
  },
};

function repo() {
  const sample = fixtureSample();
  sample.accounts.push(account);
  sample.challenges.push(forex);
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample,
  });
}

function open(
  check: ChallengeCheck,
  r = repo(),
  onClose: () => void = () => {},
) {
  renderApp(
    <MarkBreached
      challenge={forex}
      check={check}
      today="2026-11-20"
      onClose={onClose}
    />,
    { repository: r },
  );
  return r;
}

const confirm = () =>
  screen.getByRole('button', { name: 'Mark as breached' }) as HTMLButtonElement;

test('it names the challenge and its phase, and starts with no reason chosen and the button off', async () => {
  open(quiet);
  const dialog = await screen.findByRole('dialog', {
    name: 'Mark Forex 100K as breached',
  });
  expect(within(dialog).getByText('Step 1, Apex')).toBeTruthy();
  const group = within(dialog).getByRole('radiogroup', {
    name: 'Why did it break?',
  });
  expect(
    within(group)
      .getAllByRole('radio')
      .map((r) => (r.closest('label') as HTMLElement).textContent),
  ).toEqual([
    'Broke the max drawdown',
    'Overtrading or forcing trades',
    'Time pressure',
    'Lack of risk management',
    'OtherIn your own words.',
  ]);
  expect(
    within(group)
      .getAllByRole('radio')
      .some((r) => (r as HTMLInputElement).checked),
  ).toBe(false);
  expect(confirm().disabled).toBe(true);
  // The note that a breach is final.
  expect(dialog.textContent).toContain('A breach is final.');
  expect(dialog.textContent).toContain("can't return to evaluation or funded");
});

test("a reason turns the button on; Other asks for the trader's words first", async () => {
  open(quiet);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('radio', { name: /Time pressure/ }));
  expect(confirm().disabled).toBe(false);
  expect(screen.queryByRole('textbox')).toBeNull();

  fireEvent.click(screen.getByRole('radio', { name: /^Other/ }));
  expect(confirm().disabled).toBe(true);
  const words = screen.getByRole('textbox', { name: 'In your own words' });
  fireEvent.change(words, { target: { value: '   ' } });
  expect(confirm().disabled).toBe(true);
  fireEvent.change(words, { target: { value: 'Revenge traded after a loss' } });
  expect(confirm().disabled).toBe(false);
});

test('confirming writes the reason and the day the rule broke, then closes', async () => {
  const onClose = vi.fn();
  const r = open(broken, repo(), onClose);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('radio', { name: /Overtrading/ }));
  fireEvent.click(confirm());
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const [saved] = await r.challenges.list(WS);
  expect(saved).toMatchObject({
    status: 'breached',
    breachReason: 'overtrading',
    // The rule check's date (C34), not the day the trader confirms it.
    breachedOn: '2026-11-10',
  });
  expect(saved!.failureReason).toBeUndefined();
});

test('with no finding the breach is dated today', async () => {
  const onClose = vi.fn();
  const r = open(quiet, repo(), onClose);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('radio', { name: /Lack of risk/ }));
  fireEvent.click(confirm());
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect((await r.challenges.list(WS))[0]).toMatchObject({
    status: 'breached',
    breachReason: 'risk-management',
    breachedOn: '2026-11-20',
  });
});

test("Other keeps the trader's words as the failure reason", async () => {
  const onClose = vi.fn();
  const r = open(quiet, repo(), onClose);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('radio', { name: /^Other/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'In your own words' }), {
    target: { value: '  Held through news  ' },
  });
  fireEvent.click(confirm());
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect((await r.challenges.list(WS))[0]).toMatchObject({
    breachReason: 'other',
    failureReason: 'Held through news',
  });
});

test('a failed write keeps the dialog open and says so', async () => {
  const r = repo();
  r.challenges.markBreached = vi.fn().mockRejectedValue(new Error('no'));
  const onClose = vi.fn();
  open(quiet, r, onClose);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('radio', { name: /Time pressure/ }));
  fireEvent.click(confirm());
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toMatch(/Couldn.t save that/);
  expect(onClose).not.toHaveBeenCalled();
  expect(confirm().disabled).toBe(false);
});

test('a challenge already breached says so instead of writing again', async () => {
  const r = repo();
  await r.challenges.markBreached(WS, 'c-1', {
    reason: 'other',
    note: 'first',
    on: '2026-11-05',
  });
  const onClose = vi.fn();
  open(quiet, r, onClose);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('radio', { name: /Time pressure/ }));
  fireEvent.click(confirm());
  expect((await screen.findByRole('alert')).textContent).toMatch(
    /already breached/,
  );
  expect((await r.challenges.list(WS))[0]).toMatchObject({
    breachReason: 'other',
    breachedOn: '2026-11-05',
  });
});

test('Cancel closes without writing', async () => {
  const onClose = vi.fn();
  const r = open(quiet, repo(), onClose);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('radio', { name: /Time pressure/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalled();
  expect((await r.challenges.list(WS))[0]!.status).toBe('active');
});

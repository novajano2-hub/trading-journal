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
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { renderApp } from '../__fixtures__/render-app';
import { FirstRunGate } from '../first-run-gate';
import { clearFirstRun, writeFirstRun } from '../welcome/survey-model';
import { HomeScreen } from './home-screen';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

beforeEach(clearFirstRun);
afterEach(cleanup);

const repo = () =>
  createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });

const FINISHED = {
  finished: true,
  draft: {
    experience: '1-3',
    capital: ['prop'],
    broker: 'Other',
    instruments: ['futures'],
    goals: ['journal'],
    heardFrom: 'friend',
  },
};

/** Home behind the gate, as the layout has it, with the survey finished. */
async function open(repository = repo()) {
  writeFirstRun(FINISHED);
  renderApp(
    <FirstRunGate>
      <HomeScreen />
    </FirstRunGate>,
    { url: '/app/home', repository },
  );
  const dialog = await screen.findByRole('dialog', { name: 'Your profile' });
  return { dialog, repository };
}

function fill(first = 'Sam', last = 'Doe', username = 'sam.doe') {
  fireEvent.change(screen.getByLabelText('First name'), {
    target: { value: first },
  });
  fireEvent.change(screen.getByLabelText('Last name'), {
    target: { value: last },
  });
  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: username },
  });
}
const finish = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));

test('after the survey every app route shows Home with the preferences dialog, which has no close', async () => {
  const { dialog } = await open();
  expect(
    within(dialog)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Finish setup']);
  // Home shows behind it as an empty My workspace: no name, 0 of 3.
  expect(
    screen.getByRole('region', { name: 'Get started', hidden: true })
      .textContent,
  ).toContain('0 of 3 complete');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  fireEvent.pointerDown(document.body);
  expect(screen.getByRole('dialog', { name: 'Your profile' })).toBeTruthy();
});

test('the zone opens on US/Eastern', async () => {
  await open();
  const zone = screen.getByRole('combobox', {
    name: 'Time zone',
  }) as HTMLSelectElement;
  expect(zone.value).toBe('America/New_York');
  expect(zone.selectedOptions[0]!.textContent).toMatch(
    /^GMT−[45] US\/Eastern$/,
  );
  const currency = screen.getByRole('combobox', {
    name: 'Default currency',
  }) as HTMLSelectElement;
  expect(currency.value).toBe('USD');
  expect(currency.selectedOptions[0]!.textContent).toBe('USD (US dollar)');
  expect([...currency.options].slice(0, 11).map((o) => o.value)).toEqual([
    'USD',
    'EUR',
    'AUD',
    'GBP',
    'CAD',
    'INR',
    'JPY',
    'CHF',
    'CNY',
    'HKD',
    'CZK',
  ]);
});

test('every field is required', async () => {
  const { repository } = await open();
  finish();
  expect(await screen.findByText('Enter your first name.')).toBeTruthy();
  expect(screen.getByText('Enter your last name.')).toBeTruthy();
  expect(
    screen.getByText('Use 3 to 30 letters, digits, dots or underscores.'),
  ).toBeTruthy();
  expect((await repository.prefs.get()).onboarding).toBeUndefined();
});

test('saving shows the time-zone toast', async () => {
  const { repository } = await open();
  fill();
  fireEvent.change(screen.getByRole('combobox', { name: 'Default currency' }), {
    target: { value: 'EUR' },
  });
  finish();
  expect(
    await screen.findByText('Re-timing your trades to US/Eastern.'),
  ).toBeTruthy();
  // The dialog is gone, and Home shows the first name for My workspace.
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByText(/Sam/)).toBeTruthy();
  expect(screen.getByText('Profile saved')).toBeTruthy();
  const accounts = await repository.accounts.list('mine');
  expect(accounts.map((a) => [a.name, a.currency])).toEqual([
    ['My account', 'EUR'],
  ]);
  expect((await repository.prefs.get()).onboarding?.survey?.heardFrom).toBe(
    'friend',
  );
  // The answers are spent.
  expect(sessionStorage.getItem('keel:first-run')).toBeNull();
});

test('Home never shows the sample as 3 of 3 on the way from the dialog to My workspace', async () => {
  const sample = fixtureSample();
  sample.accounts.push({
    id: 'p-1',
    workspaceId: SAMPLE_WORKSPACE.id,
    name: 'Apex 50K',
    broker: 'Apex',
    type: 'prop-evaluation',
    currency: 'USD',
    startingBalance: 5_000_000,
    status: 'active',
  });
  sample.challenges.push({
    id: 'c-1',
    workspaceId: SAMPLE_WORKSPACE.id,
    name: 'Apex 50K',
    firm: 'Apex',
    steps: 1,
    phases: [{ step: 'step-1', accountId: 'p-1' }, { step: 'funded' }],
    phase: 'evaluation',
    status: 'active',
  });
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample,
  });
  await open(repository);
  fill();
  // Every DOM change from here to the end is checked for the sample's card.
  const seen: string[] = [];
  const watch = new MutationObserver(() => {
    const card = document.querySelector(
      'section[aria-labelledby="gs-heading"]',
    );
    if (card?.textContent) seen.push(card.textContent);
  });
  watch.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  finish();
  expect(await screen.findByText('Profile saved')).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const card = await screen.findByRole('region', { name: 'Get started' });
  await waitFor(() => expect(card.textContent).toContain('0 of 3 complete'));
  watch.disconnect();
  expect(seen.some((t) => t.includes('3 of 3'))).toBe(false);
  expect(seen.some((t) => t.includes('1 of 3'))).toBe(false);
});

test('the time-zone notice region is always there, empty until it has something to say', async () => {
  await open();
  expect(
    screen
      .getAllByRole('status', { hidden: true })
      .some((r) => r.textContent === ''),
  ).toBe(true);
});

test('a failed save keeps the answers in the dialog, and a retry makes one My account', async () => {
  const repository = repo();
  const real = repository.onboarding.complete;
  const complete = vi
    .spyOn(repository.onboarding, 'complete')
    .mockRejectedValueOnce(new Error('disk full'));
  const { dialog } = await open(repository);
  fill('Sam', 'Doe', 'sam.doe');
  finish();
  expect(await within(dialog).findByRole('alert')).toBeTruthy();
  expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe(
    'Sam',
  );
  expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe(
    'sam.doe',
  );
  expect(screen.queryByText('Profile saved')).toBeNull();
  expect(await repository.accounts.list('mine')).toEqual([]);

  complete.mockImplementation(real);
  finish();
  expect(await screen.findByText('Profile saved')).toBeTruthy();
  expect(await repository.accounts.list('mine')).toHaveLength(1);
});

// @vitest-environment happy-dom
import {
  act,
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
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { challengeType, passRates } from '@/domain/prop/finance';
import type { Account, Challenge, PropRuleSet, Trade } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { viewport } from '../__fixtures__/viewport';
import { AccountsTab } from './accounts-tab';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const WS = SAMPLE_WORKSPACE.id;
const URL = '/app/prop-firms/accounts';
const RULES: PropRuleSet = {
  firm: 'Sample firm A',
  phase: 'evaluation',
  profitTarget: 600_000,
  dailyLossLimit: 200_000,
  maxDrawdown: 500_000,
  drawdownType: 'trailing',
  minTradingDays: 5,
};
const prop = (
  id: string,
  name: string,
  extra: Partial<Account> = {},
): Account => ({
  id,
  workspaceId: WS,
  name,
  broker: 'Sample firm A',
  type: 'prop-evaluation',
  currency: 'USD',
  startingBalance: 10_000_000,
  status: 'active',
  propRules: RULES,
  ...extra,
});
const challenge = (id: string, over: Partial<Challenge>): Challenge => ({
  id,
  workspaceId: WS,
  name: id,
  firm: 'Sample firm A',
  steps: 1,
  phases: [],
  phase: 'evaluation',
  status: 'active',
  ...over,
});

// The Plan 6C comps' sample: two evaluations, one funded, two breached.
const ACCOUNTS = [
  prop('p-f100', 'Futures 100K evaluation'),
  prop('p-x100', 'Forex evaluation'),
  prop('p-f50e', 'Futures 50K evaluation', { startingBalance: 5_000_000 }),
  prop('p-f50f', 'Futures 50K funded', {
    type: 'prop-funded',
    startingBalance: 5_000_000,
  }),
  prop('p-f50s', 'Futures 50K September', { startingBalance: 5_000_000 }),
  prop('p-x50', 'Forex 50K', { startingBalance: 5_000_000 }),
];
const F100 = challenge('c-f100', {
  name: 'Futures 100K',
  steps: 2,
  phases: [
    { step: 'step-1', accountId: 'p-f100', startDate: '2026-10-01' },
    { step: 'step-2' },
    { step: 'funded' },
  ],
});
const X100 = challenge('c-x100', {
  name: 'Forex 100K',
  firm: 'Sample firm B',
  steps: 2,
  phases: [
    { step: 'step-1', accountId: 'p-x100', startDate: '2026-11-03' },
    { step: 'step-2' },
    { step: 'funded' },
  ],
});
const F50 = challenge('c-f50', {
  name: 'Futures 50K',
  phases: [
    { step: 'step-1', accountId: 'p-f50e', startDate: '2026-09-14' },
    { step: 'funded', accountId: 'p-f50f', startDate: '2026-09-30' },
  ],
  phase: 'funded',
});
const F50S = challenge('c-f50s', {
  name: 'Futures 50K September',
  phases: [
    { step: 'step-1', accountId: 'p-f50s', startDate: '2026-09-02' },
    { step: 'funded' },
  ],
  status: 'breached',
  breachReason: 'overtrading',
  breachedOn: '2026-09-17',
});
const X50 = challenge('c-x50', {
  name: 'Forex 50K',
  firm: 'Sample firm B',
  phases: [
    { step: 'step-1', accountId: 'p-x50', startDate: '2026-10-05' },
    { step: 'funded' },
  ],
  status: 'breached',
  breachReason: 'max-drawdown',
  breachedOn: '2026-10-16',
});

function repo(
  extra: {
    accounts?: Account[];
    challenges?: Challenge[];
    trades?: Trade[];
  } = {},
): Repository {
  const sample = fixtureSample();
  sample.accounts.push(...(extra.accounts ?? ACCOUNTS));
  sample.challenges.push(...(extra.challenges ?? [F100, X100, F50, F50S, X50]));
  sample.trades.push(...(extra.trades ?? []));
  // Futures 100K is down $1,236.75, so its balance reads $98,763.25.
  sample.trades.push(
    makeTrade({
      id: 'f100-loss',
      workspaceId: WS,
      accountId: 'p-f100',
      net: -123_675,
      serial: 9,
      openedAt: '2026-11-10T14:00:00Z',
      closedAt: '2026-11-10T15:00:00Z',
    }),
  );
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample,
  });
}

const tab = (name: string) => screen.findByRole('tab', { name });
const tabs = () => screen.getByRole('tablist', { name: 'Challenges' });

async function openMenu(name: string) {
  fireEvent.keyDown(
    await screen.findByRole('button', { name: `Actions for ${name}` }),
    { key: 'Enter' },
  );
}

const rowOf = async (name: string) =>
  within(await screen.findByRole('table', { name: 'Challenges' }))
    .getByRole('link', { name })
    .closest('tr')!;

test('the sub-tabs count the challenges: Evaluations 2, Funded 1, Breached 2 (C62)', async () => {
  renderApp(<AccountsTab />, { repository: repo(), url: URL });
  expect(await tab('Evaluations 2')).toBeTruthy();
  expect(
    within(tabs())
      .getAllByRole('tab')
      .map((t) => t.textContent),
  ).toEqual(['Evaluations 2', 'Funded 1', 'Breached 2']);
  expect(
    within(tabs())
      .getAllByRole('tab')
      .map((t) => t.getAttribute('aria-selected')),
  ).toEqual(['true', 'false', 'false']);
  // The Evaluations list holds the two evaluations, equally urgent, by name.
  expect(
    within(screen.getByRole('table', { name: 'Challenges' }))
      .getAllByRole('link')
      .map((l) => l.textContent),
  ).toEqual(['Forex 100K', 'Futures 100K']);
});

test('the sub-tabs switch the list; Breached is its own tab (the address keeps it)', async () => {
  renderApp(<AccountsTab />, { repository: repo(), url: URL });
  fireEvent.click(await tab('Funded 1'));
  expect(window.location.search).toBe('?tab=funded');
  const table = screen.getByRole('table', { name: 'Challenges' });
  expect(
    within(table)
      .getAllByRole('link')
      .map((l) => l.textContent),
  ).toEqual(['Futures 50K']);
  fireEvent.click(screen.getByRole('tab', { name: 'Breached 2' }));
  expect(
    within(screen.getByRole('table', { name: 'Challenges' }))
      .getAllByRole('link')
      .map((l) => l.textContent)
      .sort(),
  ).toEqual(['Forex 50K', 'Futures 50K September']);
  fireEvent.click(screen.getByRole('tab', { name: 'Evaluations 2' }));
  expect(window.location.search).toBe('');
});

test('the list reads challenge, firm, trading account, type, size, phase, status, balance and started (C63)', async () => {
  renderApp(<AccountsTab />, { repository: repo(), url: URL });
  const table = await screen.findByRole('table', { name: 'Challenges' });
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual([
    'Challenge',
    'Firm',
    'Trading account',
    'Type',
    'Size',
    'Phase',
    'Status',
    'Balance',
    'Started',
    'Actions',
  ]);
  const row = await rowOf('Futures 100K');
  const cells = within(row)
    .getAllByRole('cell')
    .map((c) => c.textContent);
  expect(cells.slice(0, 9)).toEqual([
    'Futures 100K',
    'Sample firm A',
    'Futures 100K evaluation',
    '2-step',
    '$100,000.00',
    'Step 1',
    'Active',
    '$98,763.25',
    '1 Oct 2026',
  ]);
  const link = within(row).getByRole('link', { name: 'Futures 100K' });
  expect(link.getAttribute('href')).toBe('/app/prop-firms/accounts/c-f100');
});

test('with no start date typed, Started is the day of the first trade; with neither it reads None', async () => {
  const undated = challenge('c-und', {
    name: 'No start date',
    phases: [{ step: 'step-1', accountId: 'p-f100' }, { step: 'funded' }],
  });
  const empty = challenge('c-none', {
    name: 'Nothing yet',
    phases: [{ step: 'step-1', accountId: 'p-x100' }, { step: 'funded' }],
  });
  renderApp(<AccountsTab />, {
    repository: repo({ challenges: [undated, empty] }),
    url: URL,
  });
  const started = async (name: string) =>
    within(await rowOf(name))
      .getAllByRole('cell')
      .map((c) => c.textContent)[8];
  // The $1,236.75 loss on p-f100 closed on 10 Nov.
  expect(await started('No start date')).toBe('10 Nov 2026');
  expect(await started('Nothing yet')).toBe('None');
});

test('a challenge created in the funded phase reads as straight to funded, derived, never stored (C30)', async () => {
  const s2f = challenge('c-s2f', {
    name: 'Funded direct',
    phase: 'funded',
    phases: [{ step: 'step-1' }, { step: 'funded', accountId: 'p-f50f' }],
  });
  renderApp(<AccountsTab />, {
    repository: repo({ accounts: ACCOUNTS, challenges: [s2f] }),
    url: `${URL}?tab=funded`,
  });
  const row = await rowOf('Funded direct');
  expect(
    within(row)
      .getAllByRole('cell')
      .map((c) => c.textContent)[3],
  ).toBe('Straight to funded');
  expect('type' in s2f).toBe(false);
});

test('the List and Grid switch is remembered in prefs (propLayout); the grid shows balance, start date and trading account (C63)', async () => {
  const r = repo();
  renderApp(<AccountsTab />, { repository: r, url: URL });
  const layout = await screen.findByRole('radiogroup', { name: 'Layout' });
  expect(
    (within(layout).getByRole('radio', { name: 'List' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  fireEvent.click(within(layout).getByRole('radio', { name: 'Grid' }));
  const card = await screen.findByRole('article', { name: 'Futures 100K' });
  expect(screen.queryByRole('table')).toBeNull();
  expect(card.textContent).toContain('$98,763.25');
  expect(card.textContent).toContain('from $100,000.00, 2-step');
  expect(card.textContent).toContain(
    'Futures 100K evaluation, started 1 Oct 2026',
  );
  expect(card.textContent).toContain('Sample firm A, step 1');
  await waitFor(async () =>
    expect((await r.prefs.get()).propLayout).toBe('grid'),
  );
  cleanup();
  // A fresh visit opens on the grid.
  renderApp(<AccountsTab />, { repository: r, url: URL });
  expect(
    await screen.findByRole('article', { name: 'Forex 100K' }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'List' }));
  expect(await screen.findByRole('table', { name: 'Challenges' })).toBeTruthy();
  await waitFor(async () =>
    expect((await r.prefs.get()).propLayout).toBe('list'),
  );
});

test("a breached card says when and why: the listed reason, the trader's words for other, and what a breach before reasons kept; September is Sep", async () => {
  const r = repo({
    challenges: [
      F50S,
      {
        ...X50,
        failureReason: 'Max drawdown limit broken on 16 Oct (rule text).',
      },
      challenge('c-other', {
        name: 'Other words',
        phases: [{ step: 'step-1', accountId: 'p-f100' }, { step: 'funded' }],
        status: 'breached',
        breachReason: 'other',
        failureReason: 'Held through news',
        breachedOn: '2026-11-03',
      }),
      challenge('c-old', {
        name: 'Before reasons',
        phases: [{ step: 'step-1', accountId: 'p-x100' }, { step: 'funded' }],
        status: 'breached',
        failureReason:
          'Daily loss limit broken on 10 Nov (−$1,500.00 of −$1,000.00).',
      }),
    ],
  });
  await r.prefs.update({ propLayout: 'grid' });
  renderApp(<AccountsTab />, { repository: r, url: `${URL}?tab=breached` });
  const text = async (name: string) =>
    (await screen.findByRole('article', { name })).textContent;
  const sep = await text('Futures 50K September');
  expect(sep).toContain('started 2 Sep 2026');
  expect(sep).toContain('Breached Thu 17 Sep: Overtrading or forcing trades');
  // A stored rule sentence beside a listed reason adds nothing.
  const listed = await text('Forex 50K');
  expect(listed).toContain('Breached Fri 16 Oct: Broke the max drawdown');
  expect(listed).not.toContain('rule text');
  expect(await text('Other words')).toContain(
    'Breached Tue 3 Nov: Other: Held through news',
  );
  expect(await text('Before reasons')).toContain(
    'Breached: Daily loss limit broken on 10 Nov',
  );
});

test('the row menu has View details, Move to funded, Mark as breached, Edit and Delete', async () => {
  renderApp(<AccountsTab />, { repository: repo(), url: URL });
  await openMenu('Futures 100K');
  const menu = await screen.findByRole('menu');
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent),
  ).toEqual([
    'View details',
    'Move to funded',
    'Mark as breached',
    'Edit',
    'Delete',
  ]);
  expect(
    within(menu)
      .getByRole('menuitem', { name: 'View details' })
      .getAttribute('href'),
  ).toBe('/app/prop-firms/accounts/c-f100');
});

test('a funded challenge cannot move to funded again, and a breached one has no way back', async () => {
  renderApp(<AccountsTab />, { repository: repo(), url: `${URL}?tab=funded` });
  await openMenu('Futures 50K');
  expect(
    within(await screen.findByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent),
  ).toEqual(['View details', 'Mark as breached', 'Edit', 'Delete']);
  cleanup();

  renderApp(<AccountsTab />, {
    repository: repo(),
    url: `${URL}?tab=breached`,
  });
  await openMenu('Forex 50K');
  expect(
    within(await screen.findByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent),
  ).toEqual(['View details', 'Edit', 'Delete']);
});

test('Move to funded asks first; Cancel leaves the challenge as it was', async () => {
  const r = repo();
  renderApp(<AccountsTab />, { repository: r, url: URL });
  await openMenu('Futures 100K');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Move to funded' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Move Futures 100K to funded?',
  });
  expect(dialog.textContent).toContain('its results stay viewable');
  // Nothing is written until it is confirmed.
  expect(
    (await r.challenges.list(WS)).find((c) => c.id === 'c-f100'),
  ).toMatchObject({ phase: 'evaluation' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    (await r.challenges.list(WS)).find((c) => c.id === 'c-f100'),
  ).toMatchObject({ phase: 'evaluation', status: 'active' });
});

test("a dialog from the row menu hands focus back to that row's menu button when it closes", async () => {
  renderApp(<AccountsTab />, { repository: repo(), url: URL });
  await openMenu('Forex 100K');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Move to funded' }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Actions for Forex 100K' }),
    ),
  );
});

test('confirming Move to funded passes the evaluation: funded phase, active, and the counts follow', async () => {
  const r = repo();
  renderApp(<AccountsTab />, { repository: r, url: URL });
  await openMenu('Futures 100K');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Move to funded' }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Move to funded' }),
  );
  await waitFor(async () =>
    expect(
      (await r.challenges.list(WS)).find((c) => c.id === 'c-f100'),
    ).toMatchObject({ phase: 'funded', status: 'active' }),
  );
  expect(await tab('Evaluations 1')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Funded 2' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Breached 2' })).toBeTruthy();
});

test('Move to funded on a 1-step with no account or date records the move, so it stays 1-step and keeps its passed evaluation (C-01)', async () => {
  const bare = challenge('c-bare', {
    name: 'Bare one',
    phases: [{ step: 'step-1' }, { step: 'funded' }],
  });
  const r = repo({ accounts: [], challenges: [bare] });
  renderApp(<AccountsTab />, { repository: r, url: URL });
  await openMenu('Bare one');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Move to funded' }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Move to funded' }),
  );
  await waitFor(async () =>
    expect((await r.challenges.list(WS))[0]).toMatchObject({
      phase: 'funded',
      movedToFundedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }),
  );
  const [saved] = await r.challenges.list(WS);
  expect(challengeType(saved!)).toBe('1-step');
  expect(passRates([saved!], [], 'firm').overall).toEqual({
    passed: 1,
    attempted: 1,
  });
  fireEvent.click(await tab('Funded 1'));
  expect(within(await rowOf('Bare one')).getByText('1-step')).toBeTruthy();
});

test('Mark as breached starts with no reason, writes the reason and the date, and the challenge cannot return', async () => {
  const r = repo();
  renderApp(<AccountsTab />, { repository: r, url: URL });
  await openMenu('Forex 100K');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Mark as breached' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Mark Forex 100K as breached',
  });
  const confirm = within(dialog).getByRole('button', {
    name: 'Mark as breached',
  }) as HTMLButtonElement;
  expect(
    within(dialog)
      .getAllByRole('radio')
      .some((radio) => (radio as HTMLInputElement).checked),
  ).toBe(false);
  expect(confirm.disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('radio', { name: /Time pressure/ }));
  fireEvent.click(confirm);
  await waitFor(async () =>
    expect(
      (await r.challenges.list(WS)).find((c) => c.id === 'c-x100'),
    ).toMatchObject({ status: 'breached', breachReason: 'time-pressure' }),
  );
  const saved = (await r.challenges.list(WS)).find((c) => c.id === 'c-x100')!;
  expect(saved.breachedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // It moves to Breached; the other tabs lose it.
  expect(await tab('Breached 3')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Evaluations 1' })).toBeTruthy();
  // And there is no way back: the store refuses, and its menu offers none.
  await expect(
    r.challenges.update(WS, 'c-x100', { status: 'active' }),
  ).rejects.toThrow(/breach/i);
  fireEvent.click(screen.getByRole('tab', { name: 'Breached 3' }));
  await openMenu('Forex 100K');
  expect(
    within(await screen.findByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent),
  ).toEqual(['View details', 'Edit', 'Delete']);
});

test('Edit opens the challenge form', async () => {
  renderApp(<AccountsTab />, { repository: repo(), url: URL });
  await openMenu('Forex 100K');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit challenge' });
  expect(
    (within(dialog).getByLabelText('Challenge name') as HTMLInputElement).value,
  ).toBe('Forex 100K');
});

test('Delete asks first, and removes the challenge only once confirmed', async () => {
  const r = repo();
  renderApp(<AccountsTab />, { repository: r, url: URL });
  await openMenu('Forex 100K');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'Delete Forex 100K?',
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await r.challenges.list(WS)).toHaveLength(5);

  await openMenu('Forex 100K');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: 'Delete',
    }),
  );
  await waitFor(async () =>
    expect(await r.challenges.list(WS)).toHaveLength(4),
  );
  expect(await tab('Evaluations 1')).toBeTruthy();
});

test('on a phone the list is two-line rows: name and balance, then account, start and status', async () => {
  viewport({ phone: true });
  renderApp(<AccountsTab />, { repository: repo(), url: URL });
  const list = await screen.findByRole('list', { name: 'Challenges' });
  expect(screen.queryByRole('table')).toBeNull();
  const first = within(list)
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes('Futures 100K'))!;
  const one = first.querySelector('[data-line="1"]')!;
  const two = first.querySelector('[data-line="2"]')!;
  expect(one.textContent).toBe('Futures 100K$98,763.25');
  expect(two.textContent).toContain('Futures 100K evaluation');
  expect(two.textContent).toContain('started 1 Oct 2026');
  expect(two.textContent).toContain('Active');
  // The row menu is still there, 44px on touch.
  expect(
    within(first).getByRole('button', { name: 'Actions for Futures 100K' }),
  ).toBeTruthy();
});

test('with no challenge it says so and offers New challenge; an empty sub-tab says what it lacks', async () => {
  renderApp(<AccountsTab />, {
    repository: repo({ challenges: [] }),
    url: URL,
  });
  expect(await screen.findByText('No challenges yet.')).toBeTruthy();
  expect(screen.getByRole('button', { name: /New challenge/ })).toBeTruthy();
  cleanup();

  renderApp(<AccountsTab />, {
    repository: repo({ challenges: [F100] }),
    url: `${URL}?tab=breached`,
  });
  expect(await screen.findByText('No challenge has breached.')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Breached 0' })).toBeTruthy();
});

test('under Privacy no amount shows in the list or the grid', async () => {
  const r = repo();
  await r.prefs.update({ displayUnit: 'privacy' });
  renderApp(<AccountsTab />, { repository: r, url: URL });
  const table = await screen.findByRole('table', { name: 'Challenges' });
  expect(table.textContent).not.toMatch(/\p{Sc}\s?\d/u);
  expect(table.textContent).not.toMatch(/\d,\d{3}/);
  fireEvent.click(screen.getByRole('radio', { name: 'Grid' }));
  const card = await screen.findByRole('article', { name: 'Futures 100K' });
  expect(card.textContent).not.toMatch(/\p{Sc}\s?\d/u);
  expect(card.textContent).not.toMatch(/\d,\d{3}/);
});

test('the prop filters narrow the challenges, and the sub-tab counts follow them (C37, C62)', async () => {
  renderApp(<AccountsTab />, {
    repository: repo(),
    url: `${URL}?pfirm=${encodeURIComponent('Sample firm B')}`,
  });
  // Forex 100K is the firm's evaluation, Forex 50K its breach; nothing of it is funded.
  expect(await tab('Evaluations 1')).toBeTruthy();
  expect(
    within(tabs())
      .getAllByRole('tab')
      .map((t) => t.textContent),
  ).toEqual(['Evaluations 1', 'Funded 0', 'Breached 1']);
  expect(
    within(screen.getByRole('table', { name: 'Challenges' }))
      .getAllByRole('link')
      .map((l) => l.textContent),
  ).toEqual(['Forex 100K']);
  fireEvent.click(screen.getByRole('tab', { name: 'Funded 0' }));
  expect(await screen.findByText('No challenge is funded yet.')).toBeTruthy();
});

test('status, phase and type read the challenge as the dashboard does', async () => {
  renderApp(<AccountsTab />, {
    repository: repo(),
    url: `${URL}?pstatus=breached`,
  });
  expect(await tab('Breached 2')).toBeTruthy();
  expect(
    within(tabs())
      .getAllByRole('tab')
      .map((t) => t.textContent),
  ).toEqual(['Evaluations 0', 'Funded 0', 'Breached 2']);
  cleanup();

  renderApp(<AccountsTab />, {
    repository: repo(),
    url: `${URL}?pphase=funded&ptype=1-step`,
  });
  expect(await tab('Funded 1')).toBeTruthy();
  expect(
    within(tabs())
      .getAllByRole('tab')
      .map((t) => t.textContent),
  ).toEqual(['Evaluations 0', 'Funded 1', 'Breached 0']);
});

test('the date range tests the challenge’s first start date (C37)', async () => {
  renderApp(<AccountsTab />, {
    repository: repo(),
    url: `${URL}?from=2026-10-01&to=2026-11-30`,
  });
  // Futures 100K (1 Oct), Forex 100K (3 Nov) and Forex 50K (5 Oct) start inside it; the two September ones do not.
  expect(await tab('Evaluations 2')).toBeTruthy();
  expect(
    within(tabs())
      .getAllByRole('tab')
      .map((t) => t.textContent),
  ).toEqual(['Evaluations 2', 'Funded 0', 'Breached 1']);
});

test('a filter that matches no challenge says so, and Clear filters brings them back', async () => {
  renderApp(<AccountsTab />, {
    repository: repo(),
    url: `${URL}?pfirm=Nobody&tab=funded&from=2026-10-01`,
  });
  expect(
    await screen.findByText('No challenges match these filters.'),
  ).toBeTruthy();
  // No sub-tabs over nothing, and not the "no challenges yet" words.
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.queryByText('No challenges yet.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(await tab('Funded 1')).toBeTruthy();
  // The sub-tab the address held stays.
  expect(window.location.search).toBe('?tab=funded');
});

// Run by `npm run test:perf`: the name carries "budget".
test('prop accounts budget: AccountsTab filters 200 challenges in under 50 ms', async () => {
  const firms = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
  const accounts: Account[] = [];
  const challenges: Challenge[] = [];
  const trades: Trade[] = [];
  for (let i = 0; i < 200; i++) {
    accounts.push(prop(`bud-a${i}`, `Budget ${i}`, { currency: 'USD' }));
    challenges.push(
      challenge(`bud-c${i}`, {
        name: `Budget ${i}`,
        firm: firms[i % firms.length]!,
        phases: [
          {
            step: 'step-1',
            accountId: `bud-a${i}`,
            startDate: `2026-10-${String((i % 27) + 1).padStart(2, '0')}`,
          },
          { step: 'funded' },
        ],
      }),
    );
    for (let k = 0; k < 5; k++)
      trades.push(
        makeTrade({
          id: `bud-t${i}-${k}`,
          workspaceId: WS,
          accountId: `bud-a${i}`,
          net: k % 2 === 0 ? 12_000 : -9_000,
          serial: i * 5 + k,
          openedAt: `2026-11-${String(k + 3).padStart(2, '0')}T15:00:00Z`,
          closedAt: `2026-11-${String(k + 3).padStart(2, '0')}T15:30:00Z`,
        }),
      );
  }
  renderApp(<AccountsTab />, {
    repository: repo({ accounts, challenges, trades }),
    url: URL,
  });
  expect(await tab('Evaluations 200')).toBeTruthy();
  // Narrowing the 200 by firm, then by another, five times: the median change.
  const took: number[] = [];
  for (const firm of ['F1', 'F2', 'F3', 'F4', 'F5']) {
    const start = performance.now();
    act(() => {
      window.history.replaceState(null, '', `${URL}?pfirm=${firm}`);
    });
    took.push(performance.now() - start);
    expect(screen.getByRole('tab', { name: 'Evaluations 25' })).toBeTruthy();
  }
  took.sort((a, b) => a - b);
  expect(took[2]!).toBeLessThan(50);
});

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
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { Account, Challenge, PropRuleSet, Trade } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { maskedReason } from './challenge-card';
import { AccountsTab } from './accounts-tab';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = SAMPLE_WORKSPACE.id;
const RULES: PropRuleSet = {
  firm: 'Apex',
  phase: 'evaluation',
  profitTarget: 800_000,
  dailyLossLimit: 100_000,
  maxDrawdown: 1_000_000,
  drawdownType: 'trailing',
  minTradingDays: 5,
  consistencyPct: 0.4,
};
const prop = (
  id: string,
  name: string,
  extra: Partial<Account> = {},
): Account => ({
  id,
  workspaceId: WS,
  name,
  broker: 'Apex',
  type: 'prop-evaluation',
  currency: 'USD',
  startingBalance: 10_000_000,
  status: 'active',
  propRules: RULES,
  ...extra,
});
const challenge = (over: Partial<Challenge>): Challenge => ({
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
  evaluationFee: 54_900,
  activationFee: 14_900,
  ...over,
});

/**
 * The Accounts tab on its Grid layout: a card a challenge, as the Prop firms
 * page listed them before the tabs. `tab` is the sub-tab, for a funded one.
 */
async function renderGrid(opts: { repository: Repository; tab?: string }) {
  await opts.repository.prefs.update({ propLayout: 'grid' });
  return renderApp(<AccountsTab />, {
    repository: opts.repository,
    url: `/app/prop-firms/accounts${opts.tab ? `?tab=${opts.tab}` : ''}`,
  });
}

function repo(
  extra: {
    accounts?: Account[];
    challenges?: Challenge[];
    trades?: Trade[];
    loss?: boolean;
  } = {},
) {
  const sample = fixtureSample();
  sample.accounts.push(...(extra.accounts ?? []));
  sample.challenges.push(...(extra.challenges ?? []));
  sample.trades.push(...(extra.trades ?? []));
  if (extra.loss)
    sample.trades.push(
      makeTrade({
        id: 'loss-1',
        workspaceId: WS,
        accountId: 'p-forex',
        net: -150_000,
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

test('the Forex card reads its firm and step, its balance and type, and labels its drawdown from its type', async () => {
  await renderGrid({
    repository: repo({
      accounts: [prop('p-forex', 'Forex evaluation')],
      challenges: [challenge({})],
    }),
  });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  expect(card.textContent).toContain('Apex, step 1');
  expect(card.textContent).toContain('$100,000.00');
  expect(card.textContent).toContain('from $100,000.00, 2-step');
  expect(within(card).getByText('Max drawdown, trailing')).toBeTruthy();
  expect(within(card).getByText('Active')).toBeTruthy();
  // Nothing suggests a change on a clean phase.
  expect(
    within(card).queryByRole('button', { name: 'Mark as breached' }),
  ).toBeNull();
});

test('a broken rule on an active challenge offers Mark as breached, which asks why before it writes anything', async () => {
  const r = repo({
    accounts: [prop('p-forex', 'Forex evaluation')],
    challenges: [challenge({})],
    loss: true,
  });
  await renderGrid({ repository: r });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  const sentence =
    'Daily loss limit broken on 10 Nov (−$1,500.00 of −$1,000.00).';
  expect(await within(card).findByText(sentence)).toBeTruthy();
  // The stored status is still the trader's.
  expect(within(card).getByText('Active')).toBeTruthy();
  fireEvent.click(
    within(card).getByRole('button', { name: 'Mark as breached' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Mark Forex 100K as breached',
  });
  // No reason is chosen for the trader, and nothing is stored yet.
  expect(
    (
      within(dialog).getByRole('button', {
        name: 'Mark as breached',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect((await r.challenges.list(WS))[0]!.status).toBe('active');
});

test('Mark as breached dates the breach on the day the rule broke, not today (C34), and the card moves to Breached', async () => {
  const r = repo({
    accounts: [prop('p-forex', 'Forex evaluation')],
    challenges: [challenge({})],
    loss: true,
  });
  await renderGrid({ repository: r });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  fireEvent.click(
    await within(card).findByRole('button', { name: 'Mark as breached' }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('radio', { name: /max drawdown/ }));
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Mark as breached' }),
  );
  // The finding is dated 10 Nov, the loss's day: a breach is permanent, so
  // the date it keeps is that one, whenever the trader confirms it.
  await waitFor(async () => {
    const [saved] = await r.challenges.list(WS);
    expect(saved).toMatchObject({
      status: 'breached',
      breachReason: 'max-drawdown',
      breachedOn: '2026-11-10',
    });
  });
  const todayNy = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  });
  expect(todayNy > '2026-11-10').toBe(true);
  // The card leaves Evaluations for Breached, where it reads why, and has no
  // way back.
  await waitFor(() => expect(screen.queryByRole('article')).toBeNull());
  fireEvent.click(await screen.findByRole('tab', { name: 'Breached 1' }));
  const breached = await screen.findByRole('article', { name: 'Forex 100K' });
  expect(within(breached).getByText('Breached')).toBeTruthy();
  expect(breached.textContent).toContain(
    'Breached Tue 10 Nov: Broke the max drawdown',
  );
  expect(
    within(breached).queryByRole('button', { name: 'Mark as breached' }),
  ).toBeNull();
});

test('a target met on the last evaluation step offers Move to funded, which asks first and then moves the challenge to funded and active', async () => {
  const r = repo({
    accounts: [
      prop('p-one', 'Futures 50K evaluation', {
        propRules: {
          ...RULES,
          profitTarget: 300_000,
          minTradingDays: 1,
          consistencyPct: undefined,
        },
      }),
    ],
    challenges: [
      challenge({
        name: 'Futures 50K',
        steps: 1,
        phases: [{ step: 'step-1', accountId: 'p-one' }, { step: 'funded' }],
      }),
    ],
    trades: [
      makeTrade({
        id: 'w-1',
        workspaceId: WS,
        accountId: 'p-one',
        net: 200_000,
        serial: 10,
        openedAt: '2026-11-09T14:00:00Z',
        closedAt: '2026-11-09T15:00:00Z',
      }),
      makeTrade({
        id: 'w-2',
        workspaceId: WS,
        accountId: 'p-one',
        net: 150_000,
        serial: 11,
        openedAt: '2026-11-10T14:00:00Z',
        closedAt: '2026-11-10T15:00:00Z',
      }),
    ],
  });
  await renderGrid({ repository: r });
  const card = await screen.findByRole('article', { name: 'Futures 50K' });
  fireEvent.click(
    await within(card).findByRole('button', { name: 'Move to funded' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Move Futures 50K to funded?',
  });
  // Nothing moves until it is confirmed.
  expect((await r.challenges.list(WS))[0]).toMatchObject({
    phase: 'evaluation',
  });
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Move to funded' }),
  );
  await waitFor(async () => {
    const [saved] = await r.challenges.list(WS);
    // The funded phase starts active, as TradeZella stores it.
    expect(saved).toMatchObject({ phase: 'funded', status: 'active' });
  });
  // The challenge left Evaluations for Funded.
  await waitFor(() => expect(screen.queryByRole('article')).toBeNull());
  expect(screen.getByRole('tab', { name: 'Funded 1' })).toBeTruthy();
});

test('an archived account reads Account archived', async () => {
  await renderGrid({
    repository: repo({
      accounts: [prop('p-forex', 'Forex evaluation', { status: 'archived' })],
      challenges: [challenge({})],
    }),
  });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  expect(within(card).getByText('Account archived')).toBeTruthy();
});

test('with no challenges it says so and offers New challenge', async () => {
  await renderGrid({ repository: repo() });
  expect(await screen.findByText('No challenges yet.')).toBeTruthy();
  expect(
    screen.getAllByRole('button', { name: /New challenge/ }).length,
  ).toBeGreaterThan(0);
});

/** n daily losses of $900 on the account: 90% of a $10,000 drawdown at nine, so the phase is near its limit. */
function losses(accountId: string, n: number): Trade[] {
  const days = [
    '02',
    '03',
    '04',
    '05',
    '06',
    '09',
    '10',
    '11',
    '12',
    '13',
  ].slice(0, n);
  return days.map((d, i) =>
    makeTrade({
      id: `near-${accountId}-${i}`,
      workspaceId: WS,
      accountId,
      net: -90_000,
      serial: 20 + i,
      openedAt: `2026-11-${d}T14:00:00Z`,
      closedAt: `2026-11-${d}T15:00:00Z`,
    }),
  );
}

const stepOneMet = (accountId: string): Trade[] => [
  makeTrade({
    id: `met-a-${accountId}`,
    workspaceId: WS,
    accountId,
    net: 500_000,
    serial: 40,
    openedAt: '2026-11-09T14:00:00Z',
    closedAt: '2026-11-09T15:00:00Z',
  }),
  makeTrade({
    id: `met-b-${accountId}`,
    workspaceId: WS,
    accountId,
    net: 400_000,
    serial: 41,
    openedAt: '2026-11-10T14:00:00Z',
    closedAt: '2026-11-10T15:00:00Z',
  }),
];
const easy: PropRuleSet = {
  ...RULES,
  minTradingDays: 1,
  consistencyPct: undefined,
};

test('a met step before an unlinked one says so and offers Edit to link the next', async () => {
  await renderGrid({
    repository: repo({
      accounts: [prop('p-forex', 'Forex evaluation', { propRules: easy })],
      challenges: [challenge({})],
      trades: stepOneMet('p-forex'),
    }),
  });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  expect(
    await within(card).findByText(
      'This step is on target. Link the next step in Edit to carry on.',
    ),
  ).toBeTruthy();
  expect(
    within(card).queryByRole('button', { name: 'Move to funded' }),
  ).toBeNull();
  fireEvent.click(
    within(card).getByRole('button', { name: 'Link the next step' }),
  );
  expect(await screen.findByRole('dialog')).toBeTruthy();
});

test('every evaluation step met with no funded account reads Passed; once moved to funded it reads Active', async () => {
  const r = repo({
    accounts: [prop('p-forex', 'Forex evaluation', { propRules: easy })],
    challenges: [
      challenge({
        steps: 1,
        phases: [{ step: 'step-1', accountId: 'p-forex' }, { step: 'funded' }],
      }),
    ],
    trades: stepOneMet('p-forex'),
  });
  await renderGrid({ repository: r });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  expect(await within(card).findByText('Passed')).toBeTruthy();
  fireEvent.click(within(card).getByRole('button', { name: 'Move to funded' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: 'Move to funded',
    }),
  );
  // It moves to the Funded tab; there it reads Active.
  fireEvent.click(await screen.findByRole('tab', { name: 'Funded 1' }));
  const funded = await screen.findByRole('article', { name: 'Forex 100K' });
  expect(within(funded).getByText('Active')).toBeTruthy();
  expect(within(funded).queryByText('Passed')).toBeNull();
});

test('a stored passed challenge still gets the suggestion and the near chip, and reads Active', async () => {
  const r = repo({
    accounts: [prop('p-forex', 'Forex evaluation')],
    challenges: [challenge({ status: 'passed' })],
    loss: true,
  });
  // Keel's passed waits under Funded (C62).
  await renderGrid({ repository: r, tab: 'funded' });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  expect(
    await within(card).findByRole('button', { name: 'Mark as breached' }),
  ).toBeTruthy();
  expect(within(card).getByText('Active')).toBeTruthy();
});

test('"Near a limit" shows for a funded challenge, as the loss-outlined chip', async () => {
  await renderGrid({
    repository: repo({
      accounts: [prop('p-forex', 'Forex funded')],
      challenges: [
        challenge({
          steps: 1,
          phase: 'funded',
          phases: [
            { step: 'step-1' },
            { step: 'funded', accountId: 'p-forex' },
          ],
        }),
      ],
      trades: losses('p-forex', 9),
    }),
    tab: 'funded',
  });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  const chip = await within(card).findByText('Near a limit');
  expect(chip.className).toContain('text-loss');
  expect(chip.className).toContain('ring-loss-fill');
  expect(chip.className).not.toContain('bg-warn');
});

test('the card has one live region, and a failed Move to funded says so in its dialog', async () => {
  const r = repo({
    accounts: [
      prop('p-one', 'Futures 50K evaluation', { propRules: { ...easy } }),
    ],
    challenges: [
      challenge({
        name: 'Futures 50K',
        steps: 1,
        phases: [{ step: 'step-1', accountId: 'p-one' }, { step: 'funded' }],
      }),
    ],
    trades: stepOneMet('p-one'),
  });
  r.challenges.update = vi.fn().mockRejectedValue(new Error('no'));
  await renderGrid({ repository: r });
  const card = await screen.findByRole('article', { name: 'Futures 50K' });
  fireEvent.click(
    await within(card).findByRole('button', { name: 'Move to funded' }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Move to funded' }),
  );
  expect(await within(dialog).findByRole('alert')).toBeTruthy();
  // Still where it was, and still one live region on the card.
  expect((await r.challenges.list(WS))[0]).toMatchObject({
    phase: 'evaluation',
  });
  expect(
    card.querySelectorAll('[role="status"], [role="alert"], [aria-live]'),
  ).toHaveLength(1);
});

test('a funded card reads how much has been paid out', async () => {
  const r = repo({
    accounts: [prop('p-fund', 'Futures funded', { type: 'prop-funded' })],
    challenges: [
      challenge({
        steps: 1,
        phase: 'funded',
        phases: [{ step: 'step-1' }, { step: 'funded', accountId: 'p-fund' }],
      }),
    ],
  });
  await r.cashFlows.create(WS, {
    accountId: 'p-fund',
    date: '2026-11-05',
    amount: -100_000,
  });
  await r.cashFlows.create(WS, {
    accountId: 'p-fund',
    date: '2026-11-06',
    amount: -75_000,
  });
  await r.cashFlows.create(WS, {
    accountId: 'p-fund',
    date: '2026-11-04',
    amount: 50_000,
  });
  await renderGrid({ repository: r, tab: 'funded' });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  expect(await within(card).findByText(/\$1,750\.00 paid out/)).toBeTruthy();
  expect(card.textContent).toContain('no target once funded');
});

test('under Privacy no currency symbol is followed by a digit anywhere on a card', async () => {
  const r = repo({
    accounts: [
      prop('p-forex', 'Forex evaluation'),
      prop('p-gbp', 'GBP evaluation', { currency: 'GBP' }),
    ],
    challenges: [
      challenge({}),
      challenge({
        id: 'c-2',
        name: 'Failed GBP',
        steps: 1,
        phases: [{ step: 'step-1', accountId: 'p-gbp' }, { step: 'funded' }],
        status: 'breached',
        failureReason:
          'Daily loss limit broken on 10 Nov (−£1,500.00 of −£1,000.00).',
        evaluationFee: 9_900,
      }),
    ],
    loss: true,
  });
  await r.prefs.update({ displayUnit: 'privacy' });
  await renderGrid({ repository: r });
  const forex = await screen.findByRole('article', { name: 'Forex 100K' });
  await within(forex).findByRole('button', { name: 'Mark as breached' });
  fireEvent.click(screen.getByRole('tab', { name: 'Breached 1' }));
  const gbp = await screen.findByRole('article', { name: 'Failed GBP' });
  for (const card of [forex, gbp]) {
    expect(card.textContent).not.toMatch(/\p{Sc}\s?\d/u);
    expect(card.textContent).not.toMatch(/\d,\d{3}/);
  }
  expect(gbp.textContent).toContain('hidden amount');
});

test.each([
  ['−$1,240.00 of -$1,000.00', 'hidden amount of hidden amount'],
  ['−€1,240.00 and £99.5', 'hidden amount and hidden amount'],
  ['CA$1,240.00 then A$5', 'hidden amount then hidden amount'],
  ['CHF 1,240.00 and CHF 5', 'hidden amount and hidden amount'],
])('maskedReason hides %s', (text, out) => {
  expect(maskedReason(text, true)).toBe(out);
  expect(maskedReason(text, false)).toBe(text);
});

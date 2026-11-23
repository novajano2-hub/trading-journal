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
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { Account, Challenge, PropRuleSet, Trade } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { PropView } from './prop-view';

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

test('the Forex card reads Step 1 of 2 and labels its drawdown from its type', async () => {
  renderApp(<PropView />, {
    repository: repo({
      accounts: [prop('p-forex', 'Forex evaluation')],
      challenges: [challenge({})],
    }),
    url: '/app/prop-firms',
  });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  expect(within(card).getByText('Step 1 of 2')).toBeTruthy();
  expect(within(card).getByText('Trailing drawdown')).toBeTruthy();
  expect(within(card).getByText('Active')).toBeTruthy();
  expect(card.textContent).toContain('Fees $549.00 + $149.00');
  // Nothing suggests a change on a clean phase.
  expect(
    within(card).queryByRole('button', { name: 'Mark as breached' }),
  ).toBeNull();
});

test('a broken rule on an active challenge offers Mark as breached, and saves the status and reason', async () => {
  const r = repo({
    accounts: [prop('p-forex', 'Forex evaluation')],
    challenges: [challenge({})],
    loss: true,
  });
  renderApp(<PropView />, { repository: r, url: '/app/prop-firms' });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  const sentence =
    'Daily loss limit broken on 10 Nov (−$1,500.00 of −$1,000.00).';
  expect(await within(card).findByText(sentence)).toBeTruthy();
  // The stored status is still the trader's.
  expect(within(card).getByText('Active')).toBeTruthy();
  fireEvent.click(
    within(card).getByRole('button', { name: 'Mark as breached' }),
  );
  await waitFor(async () => {
    const [saved] = await r.challenges.list(WS);
    expect(saved).toMatchObject({
      status: 'breached',
      failureReason: sentence,
    });
  });
  expect(await within(card).findByText('Breached')).toBeTruthy();
  expect(
    within(card).queryByRole('button', { name: 'Mark as breached' }),
  ).toBeNull();
});

test('a target met on the last evaluation step offers Mark step passed, which moves the challenge to funded', async () => {
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
  renderApp(<PropView />, { repository: r, url: '/app/prop-firms' });
  const card = await screen.findByRole('article', { name: 'Futures 50K' });
  fireEvent.click(
    await within(card).findByRole('button', { name: 'Mark step passed' }),
  );
  await waitFor(async () => {
    const [saved] = await r.challenges.list(WS);
    expect(saved).toMatchObject({ phase: 'funded', status: 'passed' });
  });
  expect(await within(card).findByText('Passed')).toBeTruthy();
});

test('an archived account reads Account archived', async () => {
  renderApp(<PropView />, {
    repository: repo({
      accounts: [prop('p-forex', 'Forex evaluation', { status: 'archived' })],
      challenges: [challenge({})],
    }),
    url: '/app/prop-firms',
  });
  const card = await screen.findByRole('article', { name: 'Forex 100K' });
  expect(within(card).getByText('Account archived')).toBeTruthy();
});

test('with no challenges it says so and offers New challenge', async () => {
  renderApp(<PropView />, { repository: repo(), url: '/app/prop-firms' });
  expect(await screen.findByText('No challenges yet.')).toBeTruthy();
  expect(
    screen.getAllByRole('button', { name: /New challenge/ }).length,
  ).toBeGreaterThan(0);
});

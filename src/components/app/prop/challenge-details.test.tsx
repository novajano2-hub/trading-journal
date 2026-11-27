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
import type {
  Account,
  Challenge,
  PropRuleSet,
  Strategy,
  Trade,
} from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { viewport } from '../__fixtures__/viewport';
import { ChallengeDetails } from './challenge-details';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const WS = SAMPLE_WORKSPACE.id;
const NY = 'America/New_York';
const URL = '/app/prop-firms/accounts/c-f50';

const EVAL_RULES: PropRuleSet = {
  firm: 'Sample firm A',
  phase: 'evaluation',
  profitTarget: 300_000,
  dailyLossLimit: 110_000,
  maxDrawdown: 200_000,
  drawdownType: 'eod-trailing',
  minTradingDays: 5,
  consistencyPct: 0.5,
};
const FUNDED_RULES: PropRuleSet = {
  firm: 'Sample firm A',
  phase: 'funded',
  profitTarget: 0,
  dailyLossLimit: 110_000,
  maxDrawdown: 200_000,
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
  startingBalance: 5_000_000,
  status: 'active',
  propRules: EVAL_RULES,
  ...extra,
});
const ACCOUNTS = [
  prop('p-f50e', 'Futures 50K evaluation'),
  prop('p-f50f', 'Futures 50K funded', {
    type: 'prop-funded',
    propRules: FUNDED_RULES,
  }),
  prop('p-f100', 'Futures 100K evaluation', { startingBalance: 10_000_000 }),
];
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
// The comp's sample: a 1-step challenge, passed, now funded, with one strategy.
const F50 = challenge('c-f50', {
  name: 'Futures 50K',
  phases: [
    { step: 'step-1', accountId: 'p-f50e', startDate: '2026-09-14' },
    { step: 'funded', accountId: 'p-f50f', startDate: '2026-09-30' },
  ],
  phase: 'funded',
  strategyIds: ['str-1'],
});
// An evaluation in progress, with its funded phase not linked yet.
const F100 = challenge('c-f100', {
  name: 'Futures 100K',
  steps: 2,
  phases: [
    { step: 'step-1', accountId: 'p-f100', startDate: '2026-10-01' },
    { step: 'step-2' },
    { step: 'funded' },
  ],
});

const MEAN_REVERSION: Strategy = {
  id: 'str-2',
  workspaceId: WS,
  name: 'Mean reversion',
  description: '',
  assetClasses: ['future'],
  groups: [],
  checklist: [],
  status: 'active',
};

let serial = 0;
const trade = (accountId: string, closedAt: string, net: number): Trade =>
  makeTrade({
    id: `tr-${(serial += 1)}`,
    workspaceId: WS,
    accountId,
    serial,
    net,
    openedAt: new Date(Date.parse(closedAt) - 600_000).toISOString(),
    closedAt,
  });

// October 2026 is daylight time: New York is UTC-4. Seven funded trades on
// three days and six hours: the balance goes 50,400 50,300 50,550 50,330
// 50,480 50,400 50,700.
const FUNDED_TRADES: [string, number][] = [
  ['2026-10-01T13:40:00Z', 40_000], // Thu 09:40
  ['2026-10-01T13:55:00Z', -10_000], // Thu 09:55, the same hour
  ['2026-10-01T15:10:00Z', 25_000], // Thu 11:10
  ['2026-10-02T14:00:00Z', -22_000], // Fri 10:00
  ['2026-10-02T18:30:00Z', 15_000], // Fri 14:30
  ['2026-10-05T13:35:00Z', -8_000], // Mon 09:35
  ['2026-10-05T17:20:00Z', 30_000], // Mon 13:20
];

async function repo(
  extra: {
    challenges?: Challenge[];
    prefs?: Parameters<Repository['prefs']['update']>[0];
  } = {},
): Promise<Repository> {
  const sample = fixtureSample();
  sample.accounts.push(...ACCOUNTS);
  sample.strategies.push(MEAN_REVERSION);
  sample.challenges.push(...(extra.challenges ?? [F50, F100]));
  sample.trades.push(
    ...FUNDED_TRADES.map(([at, net]) => trade('p-f50f', at, net)),
    trade('p-f50e', '2026-09-15T13:40:00Z', 180_000),
    trade('p-f50e', '2026-09-16T13:40:00Z', 130_000),
    trade('p-f100', '2026-10-06T14:00:00Z', 50_000),
  );
  const r = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample,
  });
  await r.prefs.update({ timeZone: NY, ...extra.prefs });
  return r;
}

const phases = async () =>
  within(await screen.findByRole('navigation', { name: 'Phases' }));

test('the Futures 50K sample: Step 1 passed, Funded active, the funded phase shown', async () => {
  renderApp(<ChallengeDetails id="c-f50" />, {
    repository: await repo(),
    url: URL,
  });
  const nav = await phases();
  const links = nav.getAllByRole('link');
  expect(links.map((l) => l.textContent)).toEqual([
    'Step 1 Passed',
    'Funded Active',
  ]);
  expect(links.map((l) => l.getAttribute('aria-current'))).toEqual([
    null,
    'page',
  ]);
  expect(links.map((l) => l.getAttribute('href'))).toEqual([
    `${URL}?phase=step-1`,
    `${URL}?phase=funded`,
  ]);
  // The head: the name, the chip, the firm, the type, the size and the start.
  expect(screen.getByRole('heading', { name: 'Futures 50K' })).toBeTruthy();
  expect(document.querySelector('[data-status]')!.textContent).toBe('Funded');
  expect(
    screen.getByText('Sample firm A, 1-step, $50,000.00, started 14 Sep 2026'),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Accounts' }).getAttribute('href'),
  ).toBe('/app/prop-firms/accounts?tab=funded');
  expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
});

test('the address names the phase shown; a step shows its own account and rules', async () => {
  renderApp(<ChallengeDetails id="c-f50" />, {
    repository: await repo(),
    url: `${URL}?phase=step-1`,
  });
  const nav = await phases();
  expect(nav.getByRole('link', { current: 'page' }).textContent).toBe(
    'Step 1 Passed',
  );
  expect(screen.getByRole('heading', { name: 'Step 1 rules' })).toBeTruthy();
  expect(
    screen.getByText('Step 1 account, Futures 50K evaluation'),
  ).toBeTruthy();
  // A step that is not the current phase offers no pass or breach.
  expect(screen.queryByRole('button', { name: 'Mark as breached' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Move to funded' })).toBeNull();
  // The evaluation's profit target is a rule line; its trades are its own.
  expect(screen.getByText('Profit target')).toBeTruthy();
  expect(screen.getByText('Step 1 phase, 2 trades')).toBeTruthy();
});

test('Mark as breached sits on the current phase of an open challenge, Move to funded only while it is an evaluation', async () => {
  renderApp(<ChallengeDetails id="c-f50" />, {
    repository: await repo(),
    url: URL,
  });
  expect(
    await screen.findByRole('button', { name: 'Mark as breached' }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Move to funded' })).toBeNull();
  cleanup();
  renderApp(<ChallengeDetails id="c-f100" />, {
    repository: await repo(),
    url: '/app/prop-firms/accounts/c-f100',
  });
  expect(
    await screen.findByRole('button', { name: 'Move to funded' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Mark as breached' })).toBeTruthy();
});

test('the balance by Day, Hour or Trade: 3, 6 and 7 points (C65)', async () => {
  renderApp(<ChallengeDetails id="c-f50" />, {
    repository: await repo(),
    url: URL,
  });
  const group = await screen.findByRole('radiogroup', { name: 'Balance by' });
  expect(
    within(group)
      .getAllByRole('radio')
      .map((r) => (r as HTMLInputElement).labels?.[0]?.textContent),
  ).toEqual(['Day', 'Hour', 'Trade']);
  const points = (name: RegExp) =>
    within(screen.getByRole('table', { name })).getAllByRole('row').length - 1;
  expect(points(/^Balance by day/)).toBe(3);
  expect(
    screen
      .getByRole('img', { name: /^Balance by day/ })
      .getAttribute('aria-label'),
  ).toContain('Ends at $50,700.00');
  fireEvent.click(within(group).getByRole('radio', { name: 'Hour' }));
  expect(points(/^Balance by hour/)).toBe(6);
  fireEvent.click(within(group).getByRole('radio', { name: 'Trade' }));
  expect(points(/^Balance by trade/)).toBe(7);
  // The last trade's balance in the table: after every trade.
  const rows = within(
    screen.getByRole('table', { name: /^Balance by trade/ }),
  ).getAllByRole('row');
  expect(rows[1]!.textContent).toContain('$50,400.00');
  expect(rows[7]!.textContent).toContain('$50,700.00');
});

test('a deposit or withdrawal moves the balance and can be a point of its own on Day', async () => {
  const r = await repo();
  // A payout on a day with no trade: a withdrawal of $1,000.
  await r.cashFlows.create(WS, {
    accountId: 'p-f50f',
    date: '2026-10-06',
    amount: -100_000,
  });
  renderApp(<ChallengeDetails id="c-f50" />, { repository: r, url: URL });
  await screen.findByRole('radiogroup', { name: 'Balance by' });
  expect(
    within(screen.getByRole('table', { name: /^Balance by day/ })).getAllByRole(
      'row',
    ).length - 1,
  ).toBe(4);
  expect(
    screen
      .getByRole('img', { name: /^Balance by day/ })
      .getAttribute('aria-label'),
  ).toContain('Ends at $49,700.00');
});

test('the five stats: win rate, average win, average loss, best day and worst day, on net', async () => {
  renderApp(<ChallengeDetails id="c-f50" />, {
    repository: await repo(),
    url: URL,
  });
  const strip = await screen.findByRole('region', {
    name: 'Funded phase figures',
  });
  const figures = Array.from(strip.querySelectorAll('[data-stat]')).map(
    (el) => [
      el.getAttribute('data-stat'),
      el.querySelector('[data-value]')?.textContent,
    ],
  );
  expect(figures).toEqual([
    ['Win rate', '57.1%'],
    ['Average win', '+$275.00'],
    ['Average loss', '−$133.33'],
    ['Best day', '+$550.00'],
    ['Worst day', '−$70.00'],
  ]);
});

test('the rules: a funded phase has no profit target; an evaluation has one against its target', async () => {
  renderApp(<ChallengeDetails id="c-f50" />, {
    repository: await repo(),
    url: URL,
  });
  const card = (
    await screen.findByRole('heading', { name: 'Funded rules' })
  ).closest('section')!;
  expect(card.textContent).toContain('Since 30 Sep');
  const lines = Array.from(card.querySelectorAll('[data-rule]')).map((l) =>
    l.getAttribute('data-rule'),
  );
  expect(lines).toEqual([
    'daily-loss',
    'drawdown',
    'trading-days',
    'consistency',
  ]);
  expect(card.textContent).not.toContain('Profit target');
  // The worst day against the limit, over the phase; the days against the minimum.
  expect(card.textContent).toContain('$0.00 of $1,100.00 used today');
  expect(card.textContent).toContain('3 of 5');
  cleanup();
  renderApp(<ChallengeDetails id="c-f50" />, {
    repository: await repo(),
    url: `${URL}?phase=step-1`,
  });
  const step = (
    await screen.findByRole('heading', { name: 'Step 1 rules' })
  ).closest('section')!;
  expect(step.textContent).toContain('Since 14 Sep');
  expect(step.textContent).toContain('Profit target');
  expect(step.textContent).toContain('$3,100.00 of $3,000.00');
});

test('the trades: the five newest, then a link to Trades for the account, and Import into this account (C65)', async () => {
  renderApp(<ChallengeDetails id="c-f50" />, {
    repository: await repo(),
    url: URL,
  });
  const section = (
    await screen.findByRole('heading', { name: 'Trades' })
  ).closest('section')!;
  expect(section.textContent).toContain('Funded phase, 7 trades');
  const table = within(section).getByRole('table', { name: 'Phase trades' });
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual(['Closed', 'Instrument', 'Side', 'Net P&L']);
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(5);
  expect(
    rows.map((r) => within(r).getAllByRole('cell')[3]!.textContent),
  ).toEqual(['+$300.00', '−$80.00', '+$150.00', '−$220.00', '+$250.00']);
  expect(rows[0]!.textContent).toContain('05 Oct');
  expect(rows[0]!.textContent).toContain('13:20');
  const all = within(section).getByRole('link', {
    name: 'All 7 trades in Trades',
  });
  const href = new window.URL(all.getAttribute('href')!, 'http://x');
  expect(href.pathname).toBe('/app/trades');
  // The phase's trades: its account, from its start day.
  expect(href.searchParams.get('account')).toBe('p-f50f');
  expect(href.searchParams.get('from')).toBe('2026-09-30');
  expect(
    within(section)
      .getByRole('link', { name: 'Import into this account' })
      .getAttribute('href'),
  ).toBe('/app/import?account=p-f50f');
});

test('on a phone the trades are two-line rows, and the stats and rules stack', async () => {
  viewport({ phone: true });
  renderApp(<ChallengeDetails id="c-f50" />, {
    repository: await repo(),
    url: URL,
  });
  const section = (
    await screen.findByRole('heading', { name: 'Trades' })
  ).closest('section')!;
  expect(within(section).queryByRole('table')).toBeNull();
  const list = within(section).getByRole('list', { name: 'Phase trades' });
  const rows = within(list).getAllByRole('listitem');
  expect(rows).toHaveLength(5);
  expect(rows[0]!.textContent).toContain('+$300.00');
  expect(rows[0]!.textContent).toContain('05 Oct 13:20');
  expect(rows[0]!.textContent).toContain('Long');
  expect(rows[0]!.querySelector('a')!.getAttribute('href')).toMatch(
    /^\/app\/trades\/tr-\d+$/,
  );
});

test('a phase with no trades says so, and offers Import into its account', async () => {
  const r = await repo({
    challenges: [
      challenge('c-new', {
        name: 'Fresh',
        phases: [
          { step: 'step-1', accountId: 'p-f100', startDate: '2026-11-01' },
          { step: 'funded' },
        ],
      }),
    ],
  });
  renderApp(<ChallengeDetails id="c-new" />, {
    repository: r,
    url: '/app/prop-firms/accounts/c-new',
  });
  const section = (
    await screen.findByRole('heading', { name: 'Trades' })
  ).closest('section')!;
  expect(section.textContent).toContain('No trades in this phase yet.');
  expect(
    within(section).getByRole('link', { name: 'Import into this account' }),
  ).toBeTruthy();
  expect(
    within(section).queryByRole('link', { name: /trades in Trades/ }),
  ).toBeNull();
  expect(screen.getByText('No closed trades in this phase yet.')).toBeTruthy();
});

test('a phase with no linked account says so on each card and offers no import', async () => {
  renderApp(<ChallengeDetails id="c-f100" />, {
    repository: await repo(),
    url: '/app/prop-firms/accounts/c-f100?phase=funded',
  });
  await screen.findByRole('heading', { name: 'Funded rules' });
  expect(
    screen.getAllByText(/No account linked to this phase yet/).length,
  ).toBeGreaterThan(0);
  expect(
    screen.queryByRole('link', { name: 'Import into this account' }),
  ).toBeNull();
  // Not the current phase: no pass or breach here.
  expect(screen.queryByRole('button', { name: 'Mark as breached' })).toBeNull();
});

test('the strategies: the challenge’s own, with a detach control and no counts (C66, C73)', async () => {
  const r = await repo();
  renderApp(<ChallengeDetails id="c-f50" />, { repository: r, url: URL });
  const section = (
    await screen.findByRole('heading', { name: 'Strategies' })
  ).closest('section')!;
  const list = within(section).getByRole('list', {
    name: 'Attached strategies',
  });
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['Opening range breakout']);
  // Nothing counted: no trades, no number at all.
  expect(section.textContent).not.toMatch(/\d/);
  fireEvent.click(
    within(section).getByRole('button', {
      name: 'Detach Opening range breakout',
    }),
  );
  await waitFor(async () =>
    expect(
      (await r.challenges.list(WS)).find((c) => c.id === 'c-f50')!.strategyIds,
    ).toEqual([]),
  );
  expect(
    await within(section).findByText('No strategy attached.'),
  ).toBeTruthy();
});

test('Attach is the form’s multi-select: choosing a strategy writes strategyIds', async () => {
  const r = await repo();
  renderApp(<ChallengeDetails id="c-f50" />, { repository: r, url: URL });
  const section = (
    await screen.findByRole('heading', { name: 'Strategies' })
  ).closest('section')!;
  fireEvent.click(within(section).getByRole('button', { name: 'Attach' }));
  const picker = await screen.findByRole('dialog', {
    name: 'Attach strategies',
  });
  const boxes = within(picker).getAllByRole('checkbox') as HTMLInputElement[];
  expect(boxes.map((b) => [b.labels?.[0]?.textContent, b.checked])).toEqual([
    // By name, as Strategies lists them.
    ['Mean reversion', false],
    ['Opening range breakout', true],
  ]);
  fireEvent.click(
    within(picker).getByRole('checkbox', { name: 'Mean reversion' }),
  );
  await waitFor(async () =>
    expect(
      (await r.challenges.list(WS)).find((c) => c.id === 'c-f50')!.strategyIds,
    ).toEqual(['str-1', 'str-2']),
  );
  expect(
    await within(section).findByRole('button', {
      name: 'Detach Mean reversion',
    }),
  ).toBeTruthy();
  // Unchecking detaches the same way.
  fireEvent.click(
    within(picker).getByRole('checkbox', { name: 'Opening range breakout' }),
  );
  await waitFor(async () =>
    expect(
      (await r.challenges.list(WS)).find((c) => c.id === 'c-f50')!.strategyIds,
    ).toEqual(['str-2']),
  );
});

test('Mark as breached asks why, then the challenge is breached and offers no way back', async () => {
  const r = await repo();
  renderApp(<ChallengeDetails id="c-f50" />, { repository: r, url: URL });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Mark as breached' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Mark Futures 50K as breached',
  });
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Time pressure' }));
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Mark as breached' }),
  );
  await waitFor(async () =>
    expect(
      (await r.challenges.list(WS)).find((c) => c.id === 'c-f50')!.status,
    ).toBe('breached'),
  );
  await waitFor(() =>
    expect(document.querySelector('[data-status]')!.textContent).toBe(
      'Breached',
    ),
  );
  expect(screen.queryByRole('button', { name: 'Mark as breached' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Move to funded' })).toBeNull();
  expect(
    (await phases()).getAllByRole('link').map((l) => l.textContent),
  ).toEqual(['Step 1 Passed', 'Funded Breached']);
  // Edit and Delete stay.
  expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
});

test('Move to funded asks first, then the funded phase is the one shown', async () => {
  const r = await repo();
  renderApp(<ChallengeDetails id="c-f100" />, {
    repository: r,
    url: '/app/prop-firms/accounts/c-f100',
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Move to funded' }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('Move Futures 100K to funded?');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    (await r.challenges.list(WS)).find((c) => c.id === 'c-f100')!.phase,
  ).toBe('evaluation');
  fireEvent.click(screen.getByRole('button', { name: 'Move to funded' }));
  const again = await screen.findByRole('dialog');
  fireEvent.click(
    within(again).getByRole('button', { name: 'Move to funded' }),
  );
  await waitFor(async () =>
    expect(
      (await r.challenges.list(WS)).find((c) => c.id === 'c-f100')!.phase,
    ).toBe('funded'),
  );
  await waitFor(async () =>
    expect(
      (await phases()).getByRole('link', { current: 'page' }).textContent,
    ).toBe('Funded Active'),
  );
  expect(screen.queryByRole('button', { name: 'Move to funded' })).toBeNull();
});

test('Move to funded leaves the address clean, so the funded phase is the one shown', async () => {
  const r = await repo();
  renderApp(<ChallengeDetails id="c-f100" />, {
    repository: r,
    url: '/app/prop-firms/accounts/c-f100?phase=step-1',
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Move to funded' }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Move to funded' }),
  );
  await waitFor(() => expect(window.location.search).toBe(''));
  await waitFor(async () =>
    expect(
      (await phases()).getByRole('link', { current: 'page' }).textContent,
    ).toBe('Funded Active'),
  );
});

test('a dialog opened from the page hands focus back to its button', async () => {
  renderApp(<ChallengeDetails id="c-f100" />, {
    repository: await repo(),
    url: '/app/prop-firms/accounts/c-f100',
  });
  for (const [button, dialog, away] of [
    ['Edit', 'Edit challenge', 'Escape'],
    ['Move to funded', 'Move Futures 100K to funded?', 'Cancel'],
    ['Delete', 'Delete Futures 100K?', 'Cancel'],
    ['Mark as breached', 'Mark Futures 100K as breached', 'Escape'],
  ] as const) {
    const opener = await screen.findByRole('button', { name: button });
    fireEvent.click(opener);
    const open = await screen.findByRole('dialog', { name: dialog });
    if (away === 'Escape')
      fireEvent.keyDown(open, { key: 'Escape', code: 'Escape' });
    else fireEvent.click(within(open).getByRole('button', { name: away }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  }
});

test('Edit opens the challenge form', async () => {
  renderApp(<ChallengeDetails id="c-f50" />, {
    repository: await repo(),
    url: URL,
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  expect(
    await screen.findByRole('dialog', { name: 'Edit challenge' }),
  ).toBeTruthy();
});

test('Delete asks first, then leaves for the Accounts tab', async () => {
  const r = await repo();
  renderApp(<ChallengeDetails id="c-f50" />, { repository: r, url: URL });
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('Delete Futures 50K?');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(() =>
    expect(window.location.pathname).toBe('/app/prop-firms/accounts'),
  );
  expect((await r.challenges.list(WS)).map((c) => c.id)).toEqual(['c-f100']);
});

test('a bad id is a plain page with a link to Accounts', async () => {
  renderApp(<ChallengeDetails id="nope" />, {
    repository: await repo(),
    url: '/app/prop-firms/accounts/nope',
  });
  expect(await screen.findByText("That challenge isn't here.")).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Back to accounts' }).getAttribute('href'),
  ).toBe('/app/prop-firms/accounts');
  expect(screen.queryByRole('navigation', { name: 'Phases' })).toBeNull();
});

test('a breached challenge shows why and when, and neither action', async () => {
  const breached = challenge('c-brk', {
    name: 'Broken one',
    phases: [
      { step: 'step-1', accountId: 'p-f100', startDate: '2026-10-01' },
      { step: 'funded' },
    ],
    status: 'breached',
    breachReason: 'overtrading',
    breachedOn: '2026-10-09',
  });
  renderApp(<ChallengeDetails id="c-brk" />, {
    repository: await repo({ challenges: [breached] }),
    url: '/app/prop-firms/accounts/c-brk',
  });
  expect(
    await screen.findByText(
      /Breached Fri 9 Oct: Overtrading or forcing trades/,
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Mark as breached' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Move to funded' })).toBeNull();
  expect(
    screen.getByRole('link', { name: 'Accounts' }).getAttribute('href'),
  ).toBe('/app/prop-firms/accounts?tab=breached');
  expect(
    (await phases()).getAllByRole('link').map((l) => l.textContent),
  ).toEqual(['Step 1 Breached', 'Funded Not started']);
});

test('a straight-to-funded challenge has only its funded phase', async () => {
  const s2f = challenge('c-s2f', {
    name: 'Direct',
    phase: 'funded',
    phases: [{ step: 'step-1' }, { step: 'funded', accountId: 'p-f50f' }],
  });
  renderApp(<ChallengeDetails id="c-s2f" />, {
    repository: await repo({ challenges: [s2f] }),
    url: '/app/prop-firms/accounts/c-s2f',
  });
  expect(
    (await phases()).getAllByRole('link').map((l) => l.textContent),
  ).toEqual(['Funded Active']);
  expect(screen.getByText(/Straight to funded/)).toBeTruthy();
});

test('money reads in dollars whatever the unit, and Privacy hides every amount', async () => {
  const pct = await repo({ prefs: { displayUnit: 'percent' } });
  renderApp(<ChallengeDetails id="c-f50" />, { repository: pct, url: URL });
  const strip = await screen.findByRole('region', {
    name: 'Funded phase figures',
  });
  expect(strip.textContent).toContain('+$275.00');
  // The chart's axis too: short dollar labels, not a percentage of anything.
  await screen.findByRole('img', { name: /^Balance by day/ });
  const ticks = Array.from(document.querySelectorAll('[data-tick="left"]')).map(
    (t) => t.textContent,
  );
  expect(ticks.length).toBeGreaterThan(1);
  for (const t of ticks) expect(t).toMatch(/^\$\d+(\.\d)?k$/);
  cleanup();
  const hidden = await repo({ prefs: { displayUnit: 'privacy' } });
  const { container } = renderApp(<ChallengeDetails id="c-f50" />, {
    repository: hidden,
    url: URL,
  });
  await screen.findByRole('region', { name: 'Funded phase figures' });
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/\p{Sc}\s?\d/u);
  expect(text).not.toMatch(/\d,\d{3}/);
  for (const img of screen.getAllByRole('img'))
    expect(img.getAttribute('aria-label')).not.toMatch(/\d,\d{3}/);
});

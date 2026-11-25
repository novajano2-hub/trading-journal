// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import type { Account, Challenge } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { AppLanding } from './landing';
import { HomeView } from './home-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const WS = SAMPLE_WORKSPACE.id;
const PROP: Account = {
  id: 'p-1',
  workspaceId: WS,
  name: 'Apex 50K',
  broker: 'Apex',
  type: 'prop-evaluation',
  currency: 'USD',
  startingBalance: 5_000_000,
  status: 'active',
};
const CHALLENGE: Challenge = {
  id: 'c-1',
  workspaceId: WS,
  name: 'Apex 50K',
  firm: 'Apex',
  steps: 1,
  phases: [{ step: 'step-1', accountId: 'p-1' }, { step: 'funded' }],
  phase: 'evaluation',
  status: 'active',
};

/** The fixture sample has accounts and trades only; `prop` adds step 1 and 2's rows. */
function repo(opts: { prop?: boolean; empty?: boolean } = {}) {
  const sample = fixtureSample();
  if (opts.prop) {
    sample.accounts.push(PROP);
    sample.challenges.push(CHALLENGE);
  }
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample,
  });
}

async function emptyRepo() {
  const r = repo();
  await r.workspaces.setActive('mine');
  return r;
}

const TITLES = [
  'Add your prop firm',
  'Create your first challenge',
  'Add your first trade',
] as const;
/** The list item holding step n's title. */
const step = async (n: 1 | 2 | 3): Promise<HTMLElement> =>
  (await screen.findByText(TITLES[n - 1]!)).closest('li')!;

test('an empty workspace is 0 of 3, the first step is ringed and each open step has its button', async () => {
  renderApp(<HomeView />, { repository: await emptyRepo(), url: '/app/home' });
  const card = await screen.findByRole('region', { name: 'Get started' });
  expect(card.textContent).toContain('0 of 3 complete');
  expect(
    within(card).getByRole('progressbar').getAttribute('aria-valuenow'),
  ).toBe('0');
  expect((await step(1)).getAttribute('aria-current')).toBe('step');
  expect((await step(2)).getAttribute('aria-current')).toBeNull();
  const add = within(card).getByRole('link', { name: 'Add account' });
  expect(add.getAttribute('href')).toBe('/app/settings/accounts?new=prop');
  const next = within(card).getByRole('link', { name: 'New challenge' });
  expect(next.getAttribute('href')).toBe('/app/prop-firms?new=challenge');
  const trade = within(card).getByRole('link', { name: 'Add trade' });
  expect(trade.getAttribute('href')).toBe('/app/trades/new');
  // The next step's button is the filled one; the others are outlined.
  expect(add.className).toContain('bg-accent');
  expect(next.className).not.toContain('bg-accent');
  expect(trade.className).not.toContain('bg-accent');
  expect(card.textContent).toContain("Automatic sync isn't live yet");
});

test('the next step is ringed, and done steps show Done without a button', async () => {
  // The fixture has trades: step 3 is done, steps 1 and 2 are open.
  renderApp(<HomeView />, { repository: repo(), url: '/app/home' });
  const card = await screen.findByRole('region', { name: 'Get started' });
  await waitFor(() => expect(card.textContent).toContain('1 of 3 complete'));
  const three = await step(3);
  expect(within(three).getByText('Done', { selector: 'span' })).toBeTruthy();
  expect(within(three).queryByRole('link')).toBeNull();
  expect(three.getAttribute('aria-current')).toBeNull();
  expect(within(three).getByText('Add your first trade').className).toContain(
    'line-through',
  );
  // A done step 3 talks about the challenge account.
  expect(three.textContent).toContain('challenge account');
  expect((await step(1)).getAttribute('aria-current')).toBe('step');
  expect(within(await step(1)).getByRole('link')).toBeTruthy();
});

test('with every step done the card stays at 3 of 3, with no button', async () => {
  renderApp(<HomeView />, {
    repository: repo({ prop: true }),
    url: '/app/home',
  });
  const card = await screen.findByRole('region', { name: 'Get started' });
  await waitFor(() => expect(card.textContent).toContain('3 of 3 complete'));
  expect(within(card).queryByRole('link')).toBeNull();
  expect(within(card).getAllByText('Done', { selector: 'span' })).toHaveLength(
    3,
  );
  expect(card.querySelector('[aria-current]')).toBeNull();
  // Neither Home's other cards nor a dismiss react to it.
  expect(
    screen.queryByRole('button', { name: /dismiss|hide|close/i }),
  ).toBeNull();
});

test('recommended focus lists the four rows and their links, and does not react to the checklist', async () => {
  renderApp(<HomeView />, {
    repository: repo({ prop: true }),
    url: '/app/home',
  });
  const focus = await screen.findByRole('region', {
    name: 'Recommended focus',
  });
  const rows = within(focus).getAllByRole('link');
  expect(rows.map((a) => a.getAttribute('href'))).toEqual([
    '/app/settings/accounts?new=prop',
    '/app/prop-firms?new=challenge',
    '/app/trades/new',
    '/app/prop-firms',
  ]);
  expect(
    rows.map((a) => within(a).getByText(/./, { selector: 'b' }).textContent),
  ).toEqual([
    'Add your prop account',
    'Set up rule monitoring',
    'Add your first challenge trade',
    'Review your challenge dashboard',
  ]);
  expect(focus.textContent).toContain("Automatic sync isn't live yet");
});

test('Explore links Prop firms, the Dashboard and Backtesting, which is not live yet; Resources has the Changelog', async () => {
  renderApp(<HomeView />, { repository: repo(), url: '/app/home' });
  const explore = await screen.findByRole('region', { name: 'Explore' });
  expect(
    within(explore)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href')),
  ).toEqual(['/app/prop-firms', '/app/dashboard', '/app/backtesting']);
  expect(within(explore).getByText('Not live yet')).toBeTruthy();
  const res = await screen.findByRole('region', { name: 'Resources' });
  const log = within(res).getByRole('link', { name: /Changelog/ });
  expect(log.getAttribute('href')).toBe('/changelog');
  expect(log.getAttribute('target')).toBeNull();
});

test('the greeting uses the first name and the time of day in the profile zone', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T14:00:00Z'));
  const r = repo();
  await r.prefs.update({
    firstName: 'Sam',
    timeZone: 'America/New_York',
  });
  renderApp(<HomeView />, { repository: r, url: '/app/home' });
  expect(await screen.findByText('Good morning, Sam')).toBeTruthy();
  expect(screen.getByText('Wednesday 25 November')).toBeTruthy();
});

test('an old display name reads as the first name', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T19:00:00Z'));
  const r = repo();
  await r.prefs.update({ displayName: 'Alex', timeZone: 'UTC' });
  renderApp(<HomeView />, { repository: r, url: '/app/home' });
  expect(await screen.findByText('Good evening, Alex')).toBeTruthy();
});

test('skeleton mode is the greeting, with no name, over skeleton cards', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T09:00:00Z'));
  const r = repo();
  await r.prefs.update({ firstName: 'Sam', timeZone: 'UTC' });
  renderApp(<HomeView skeleton />, { repository: r, url: '/app/home' });
  expect(await screen.findByText('Good morning')).toBeTruthy();
  expect(screen.queryByText(/Sam/)).toBeNull();
  expect(screen.queryByRole('region', { name: 'Get started' })).toBeNull();
  expect(screen.getByRole('status', { name: 'Loading Home' })).toBeTruthy();
});

test('/app lands on Home until the checklist is complete, then on the Dashboard', async () => {
  const first = renderApp(<AppLanding />, {
    repository: await emptyRepo(),
    url: '/app',
  });
  // Nothing renders while it reads.
  expect(first.container.textContent).toBe('');
  await waitFor(() => expect(window.location.pathname).toBe('/app/home'));
  cleanup();

  renderApp(<AppLanding />, {
    repository: repo({ prop: true }),
    url: '/app',
  });
  await waitFor(() => expect(window.location.pathname).toBe('/app/dashboard'));
});

test('/app stays on Home for a partly done checklist', async () => {
  renderApp(<AppLanding />, { repository: repo(), url: '/app' });
  await waitFor(() => expect(window.location.pathname).toBe('/app/home'));
});

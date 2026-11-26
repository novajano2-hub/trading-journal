// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import { USER_WORKSPACE } from '@/data/workspaces';
import type { ImportJob } from '@/domain/types';
import type { SampleWorkspace } from '@/data/seed/generate';
import type { UserPrefs } from '@/domain/types';
import { dashboardFixture } from '../__fixtures__/dashboard-sample';
import { renderApp } from '../__fixtures__/render-app';
import { DashboardView } from './dashboard-view';
import { ProgressCard } from './progress-card';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

// As in dashboard-view.test.tsx: animations finish at once here.
MotionGlobalConfig.skipAnimations = true;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T15:00:00Z')); // Friday 20 Nov, 10:00 in New York
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * The Dashboard over `dashboardFixture`, in New York, with `prefs` on top.
 * Weeks start on Monday here.
 */
async function renderDashboard(
  opts: {
    graded?: boolean;
    prefs?: Partial<UserPrefs>;
    /** Leave weekStart unset: the default, Sunday weeks. */
    defaultWeek?: boolean;
    edit?: (s: SampleWorkspace) => void;
    url?: string;
    patch?: (repo: Repository) => Partial<Repository>;
  } = {},
) {
  const base = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const s = dashboardFixture({ graded: opts.graded ?? true });
      opts.edit?.(s);
      return s;
    },
  });
  await base.prefs.update({
    timeZone: 'America/New_York',
    ...(opts.defaultWeek ? {} : { weekStart: 'monday' as const }),
    ...opts.prefs,
  });
  const repository = { ...base, ...opts.patch?.(base) };
  return renderApp(<DashboardView />, { repository, url: opts.url });
}

const trackerCard = () =>
  screen.findByRole('region', { name: 'Progress tracker' });

test("the card shows today's score and links to the tracker", async () => {
  await renderDashboard();
  const card = await trackerCard();
  await waitFor(() => expect(card.textContent).toMatch(/\d+ of \d+ rules met/));
  expect(
    within(card)
      .getByRole('link', { name: 'Open tracker' })
      .getAttribute('href'),
  ).toBe('/app/progress');
  expect(
    within(card).getByRole('button', { name: 'About the progress tracker' })
      .dataset.metricTip,
  ).toBe('tracker-card');
  // The grid is there, today's square is not marked, and there is no paging.
  expect(within(card).getByRole('grid')).toBeTruthy();
  expect(card.querySelector('[data-today]')).toBeNull();
  expect(
    within(card).queryByRole('button', { name: 'Earlier weeks' }),
  ).toBeNull();
});

test('Open tracker keeps the date range and the account selection', async () => {
  await renderDashboard({
    url: '/app/dashboard?from=2026-11-02&to=2026-11-19&account=acc-b',
  });
  const card = await trackerCard();
  expect(
    within(card)
      .getByRole('link', { name: 'Open tracker' })
      .getAttribute('href'),
  ).toBe('/app/progress?from=2026-11-02&to=2026-11-19&account=acc-b');
});

test('the checklist link keeps the date range and the account selection', async () => {
  await renderDashboard({
    url: '/app/dashboard?from=2026-11-02&to=2026-11-19&account=acc-b',
  });
  const card = await trackerCard();
  expect(
    (
      await within(card).findByRole('link', { name: "Today's checklist" })
    ).getAttribute('href'),
  ).toBe(
    '/app/day/2026-11-19/plan?from=2026-11-02&to=2026-11-19&account=acc-b',
  );
});

test('a non-trading today reads 0 of 0 rules met, with the grid and no caption line', async () => {
  await renderDashboard({
    edit: (s) => {
      // Saturday 21 Nov.
      s.tracker = { ...s.tracker, asOf: '2026-11-21' };
    },
  });
  const card = await trackerCard();
  await waitFor(() => expect(card.textContent).toContain('0 of 0 rules met'));
  expect(card.textContent).not.toContain('No rules apply');
  expect(within(card).getByRole('grid')).toBeTruthy();
  expect(card.textContent).not.toContain("Blank days aren't scored");
});

test('while it loads the card shows a skeleton and no figures', () => {
  renderApp(<ProgressCard />, {
    repository: createLocalRepository({
      indexedDB: new IDBFactory(),
      IDBKeyRange,
      sample: async () => fixtureSample(),
    }),
  });
  const card = screen.getByRole('region', { name: 'Progress tracker' });
  expect(card.textContent).not.toMatch(/\d|None|rules met/);
  expect(within(card).queryByRole('grid')).toBeNull();
});

test("its checklist button opens today's day page in plan mode", async () => {
  await renderDashboard();
  const card = await trackerCard();
  const checklist = await within(card).findByRole('link', {
    name: "Today's checklist",
  });
  expect(checklist.getAttribute('href')).toBe('/app/day/2026-11-19/plan'); // the sample's own today (Tracker.asOf)
});

test('the dashboard has no Goals region', async () => {
  await renderDashboard();
  await trackerCard();
  expect(screen.queryByRole('region', { name: 'Goals' })).toBeNull();
  expect(screen.queryByText(/Weekly net goal|Daily loss limit/)).toBeNull();
});

const job = (p: Partial<ImportJob>): ImportJob => ({
  id: 'job',
  workspaceId: USER_WORKSPACE.id,
  accountId: 'u-acc',
  fileName: 'x.csv',
  mapping: {} as ImportJob['mapping'],
  rowCount: 1,
  tradeCount: 1,
  skippedCount: 0,
  duplicateCount: 0,
  status: 'active',
  createdAt: '2026-11-10T14:30:00.000Z',
  ...p,
});

function withImports(jobs: ImportJob[]) {
  return (repo: Repository): Partial<Repository> => ({
    imports: { ...repo.imports, list: async () => jobs },
    accounts: {
      ...repo.accounts,
      list: async (ws: string) =>
        ws === USER_WORKSPACE.id
          ? [
              {
                id: 'u-acc',
                workspaceId: ws,
                name: 'Live ES',
                broker: 'B',
                type: 'live' as const,
                currency: 'USD',
                startingBalance: 0,
                status: 'active' as const,
              },
            ]
          : repo.accounts.list(ws),
    },
  });
}

test('the last import line names the newest import that is not undone, with its account and a link', async () => {
  await renderDashboard({
    patch: withImports([
      job({ id: 'a', createdAt: '2026-11-05T14:30:00.000Z' }),
      job({ id: 'b', createdAt: '2026-11-18T14:30:00.000Z' }),
      job({
        id: 'c',
        createdAt: '2026-11-19T14:30:00.000Z',
        status: 'undone',
      }),
    ]),
  });
  const ready = await screen.findByTestId('dashboard-ready');
  const line = await within(ready).findByText(/Last import/);
  expect(line.textContent).toContain('18 Nov 09:30');
  expect(line.textContent).toContain('Live ES');
  expect(line.textContent).not.toContain('19 Nov');
  expect(
    within(ready)
      .getByRole('link', { name: 'Import history' })
      .getAttribute('href'),
  ).toBe('/app/settings/import-history');
});

test('with no import, or only undone ones, there is no last import line', async () => {
  await renderDashboard({
    patch: withImports([job({ status: 'undone' })]),
  });
  const ready = await screen.findByTestId('dashboard-ready');
  await new Promise((r) => setTimeout(r, 20));
  expect(ready.textContent).not.toContain('Last import');
  expect(
    within(ready).queryByRole('link', { name: 'Import history' }),
  ).toBeNull();
});

test('the last import line waits for the account name instead of jumping', async () => {
  await renderDashboard({
    patch: (repo) => ({
      imports: { ...repo.imports, list: async () => [job({})] },
      accounts: {
        ...repo.accounts,
        list: async (ws: string) =>
          ws === USER_WORKSPACE.id
            ? new Promise<never>(() => {})
            : repo.accounts.list(ws),
      },
    }),
  });
  const ready = await screen.findByTestId('dashboard-ready');
  await new Promise((r) => setTimeout(r, 30));
  expect(ready.textContent).not.toContain('Last import');
});

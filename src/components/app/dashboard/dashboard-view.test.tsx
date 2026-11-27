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
import { createLocalRepository } from '@/data/local/local-repository';
import { StorageUnavailableError, type Repository } from '@/data/repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { DEFAULT_TEMPLATE } from '@/domain/dashboard/templates';
import { WIDGETS } from '@/domain/dashboard/widgets';
import type { DashTemplate, WidgetKey } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { dashboardFixture } from '../__fixtures__/dashboard-sample';
import { renderApp } from '../__fixtures__/render-app';
import { DashboardView } from './dashboard-view';
import { useWidgetPage, useWidgetValue } from './widgets/context';
import { WIDGET_RENDER } from './widgets/registry';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

// happy-dom rejects a cancelled animation's `finished` promise unhandled
// (browsers mark it handled), and a pressed button's ripple is cancelled when
// its empty state gives way. Animations finish at once here.
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const graded = async () => dashboardFixture();

/** The graded fixture with `edit` applied. */
function sampleWith(edit: (s: SampleWorkspace) => void) {
  return async () => {
    const s = dashboardFixture();
    edit(s);
    return s;
  };
}

/** A fresh local repository over `sample`, with some methods replaced. */
function repositoryWith(
  patch: (repo: Repository) => Partial<Repository>,
  sample = graded,
): Repository {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample,
  });
  return { ...repo, ...patch(repo) };
}

/** The widgets on screen, in document order, by their `data-widget`. */
const widgetsOnScreen = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('[data-widget]')].map(
    (el) => el.dataset.widget!,
  );

const keysOf = (t: DashTemplate): string[] =>
  [...t.upper, ...t.lower].map((r) => r.key);

/** A repository whose prefs hold `templates`, the one named `inUse` shown. */
async function withTemplates(inUse: string, templates: DashTemplate[]) {
  const repository = repositoryWith(() => ({}));
  await repository.prefs.update({ dashboards: { inUse, templates } });
  return repository;
}

test('loading first', () => {
  renderApp(<DashboardView />, { sample: graded });
  expect(
    screen.getByRole('status', { name: 'Loading your dashboard' }),
  ).toBeTruthy();
});

test('with no template pref the page renders the default templates 15 widgets, in order', async () => {
  renderApp(<DashboardView />, { sample: graded });
  await screen.findByTestId('dashboard-ready');
  expect(widgetsOnScreen()).toHaveLength(15);
  expect(widgetsOnScreen()).toEqual(keysOf(DEFAULT_TEMPLATE));
  // Five figures above, then the rest below.
  const figures = screen.getByRole('group', { name: 'Figures' });
  expect(
    [...figures.querySelectorAll<HTMLElement>('[data-widget]')].map(
      (el) => el.dataset.widget,
    ),
  ).toEqual(DEFAULT_TEMPLATE.upper.map((r) => r.key));
});

test('a template from the prefs renders its own widgets, in its own order', async () => {
  const review: DashTemplate = {
    id: 'review',
    name: 'Review',
    upper: [{ key: 'expectancy' }, { key: 'streaks' }],
    lower: [{ key: 'year' }, { key: 'drawdown' }, { key: 'progress' }],
  };
  renderApp(<DashboardView />, {
    repository: await withTemplates('review', [DEFAULT_TEMPLATE, review]),
  });
  await screen.findByTestId('dashboard-ready');
  expect(widgetsOnScreen()).toEqual([
    'expectancy',
    'streaks',
    'year',
    'drawdown',
    'progress',
  ]);
});

test('a widget this build does not know is skipped, and the rest still render', async () => {
  const future: DashTemplate = {
    id: 'later',
    name: 'Later',
    upper: [{ key: 'net-pnl' }, { key: 'holo-pnl' }],
    lower: [{ key: 'from-the-future' }, { key: 'score' }],
  };
  renderApp(<DashboardView />, {
    repository: await withTemplates('later', [future]),
  });
  await screen.findByTestId('dashboard-ready');
  expect(widgetsOnScreen()).toEqual(['net-pnl', 'score']);
});

test('every widget carries the info tip of its catalogue metric', async () => {
  renderApp(<DashboardView />, { sample: graded });
  await screen.findByTestId('dashboard-ready');
  for (const root of document.querySelectorAll<HTMLElement>('[data-widget]')) {
    const key = root.dataset.widget as WidgetKey;
    const tips = [...root.querySelectorAll<HTMLElement>('[data-metric-tip]')];
    expect(
      tips.map((t) => t.dataset.metricTip),
      key,
    ).toContain(WIDGETS[key].metric);
  }
});

test('Keel’s own cards, Your plan, Mistakes and Performance, are gone', async () => {
  renderApp(<DashboardView />, { sample: graded });
  await screen.findByTestId('dashboard-ready');
  for (const name of [
    /your plan/i,
    /^mistakes/i,
    /^performance/i,
    /^rules$/i,
  ]) {
    expect(screen.queryByRole('region', { name })).toBeNull();
    expect(screen.queryByRole('heading', { name })).toBeNull();
  }
  expect(screen.queryByRole('table', { name: 'Rules' })).toBeNull();
});

test('the progress tracker widget is 6As card, drawn once, with no frame around it', async () => {
  renderApp(<DashboardView />, { sample: graded });
  const card = await screen.findByRole('region', { name: 'Progress tracker' });
  expect(card.getAttribute('data-widget')).toBe('progress');
  // One card: nothing between the grid cell and the card's own section.
  expect(document.querySelectorAll('[data-widget="progress"]')).toHaveLength(1);
  expect(card.parentElement?.closest('section')).toBeNull();
  await waitFor(() => expect(card.textContent).toMatch(/\d+ of \d+ rules met/));
});

test('the upper strip is 2 columns, 3 from md and 5 from xl; the lower grid is dense, 1 column, 2 from md and 3 from xl, and a wide widget spans 2 columns and 2 rows', async () => {
  const wide: DashTemplate = {
    id: 'w',
    name: 'Wide',
    upper: [{ key: 'net-pnl' }],
    lower: [{ key: 'calendar-adv' }, { key: 'drawdown' }],
  };
  renderApp(<DashboardView />, {
    repository: await withTemplates('w', [wide]),
  });
  await screen.findByTestId('dashboard-ready');
  const upper = screen.getByRole('group', { name: 'Figures' });
  for (const c of ['grid-cols-2', 'md:grid-cols-3', 'xl:grid-cols-5'])
    expect(upper.className).toContain(c);
  // Comp 01 holds 3 columns up to 1280px: five 22px figures do not fit 1024.
  expect(upper.className).not.toContain('lg:grid-cols-5');
  const calendar = document.querySelector('[data-widget="calendar-adv"]')!;
  const lower = calendar.closest('[data-grid="lower"]')!;
  for (const c of [
    'grid-flow-dense',
    'grid-cols-1',
    'md:grid-cols-2',
    'xl:grid-cols-3',
  ])
    expect(lower.className).toContain(c);
  const cell = calendar.parentElement!;
  expect(cell.className).toContain('md:col-span-2');
  expect(cell.className).toContain('xl:row-span-2');
  const third = document.querySelector(
    '[data-widget="drawdown"]',
  )!.parentElement!;
  expect(third.className).not.toContain('col-span-2');
});

/** A widget that prints what the page gives it: the currency, the closed trades and a bare $100.00 in the display unit. */
function Probe(): React.JSX.Element {
  const page = useWidgetPage();
  const net = useWidgetValue('net-pnl');
  const display = useDisplay();
  return (
    <p data-widget="net-pnl" data-testid="probe">
      {page?.currency}:{net?.closedCount}:{display.cash(10_000).text}
    </p>
  );
}

/** Runs `body` with the net P&L widget replaced by the probe. */
async function withProbe(body: () => Promise<void>): Promise<void> {
  const original = WIDGET_RENDER['net-pnl'];
  WIDGET_RENDER['net-pnl'] = () => <Probe />;
  try {
    await body();
  } finally {
    WIDGET_RENDER['net-pnl'] = original;
  }
}

test('every widget reads the one data the page computed, in the currency chosen', () =>
  withProbe(async () => {
    renderApp(<DashboardView />, {
      sample: sampleWith((s) => {
        s.trades.find((t) => t.id === 'f-2')!.pnlCurrency = 'EUR';
      }),
    });
    const probe = await screen.findByTestId('probe');
    expect(probe.textContent).toBe('USD:1:+$100.00');
    const currency = screen.getByRole('radiogroup', { name: 'Currency' });
    fireEvent.click(within(currency).getByRole('radio', { name: 'EUR' }));
    await waitFor(() =>
      expect(screen.getByTestId('probe').textContent).toMatch(/^EUR:1:/),
    );
  }));

test('the page gives every widget the display unit: money reads over the accounts in Percentage', () =>
  withProbe(async () => {
    const repository = repositoryWith(() => ({}));
    await repository.prefs.update({ displayUnit: 'percent' });
    renderApp(<DashboardView />, { repository });
    const probe = await screen.findByTestId('probe');
    // $100.00 over the fixture's $50,000.00 of starting balance.
    expect(probe.textContent).toMatch(/^USD:2:\+0\.20%$/);
  }));

test('two currencies: one at a time, with a switch and a plain note', async () => {
  renderApp(<DashboardView />, {
    sample: sampleWith((s) => {
      s.trades.find((t) => t.id === 'f-2')!.pnlCurrency = 'EUR';
    }),
  });
  await screen.findByTestId('dashboard-ready');
  expect(
    screen.getByText(
      "Each currency is shown on its own. Converting between them isn't built yet.",
    ),
  ).toBeTruthy();
  const currency = screen.getByRole('radiogroup', { name: 'Currency' });
  expect(
    (within(currency).getByRole('radio', { name: 'USD' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  fireEvent.click(within(currency).getByRole('radio', { name: 'EUR' }));
  expect(
    (within(currency).getByRole('radio', { name: 'EUR' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  // The widgets stay: the switch changes what they read, not which there are.
  expect(widgetsOnScreen()).toEqual(keysOf(DEFAULT_TEMPLATE));
});

test('one currency with closed trades shows no switch', async () => {
  renderApp(<DashboardView />, { sample: graded });
  await screen.findByTestId('dashboard-ready');
  expect(screen.queryByRole('radiogroup', { name: 'Currency' })).toBeNull();
});

test('a filter that matches nothing keeps the widgets: each one reports its own empty state', async () => {
  renderApp(<DashboardView />, {
    sample: graded,
    url: '/app/dashboard?symbol=ZZZ',
  });
  await screen.findByTestId('dashboard-ready');
  expect(widgetsOnScreen()).toEqual(keysOf(DEFAULT_TEMPLATE));
  expect(screen.queryByText('No trades match these filters.')).toBeNull();
});

test('open trades only keep the widgets too', async () => {
  renderApp(<DashboardView />, {
    sample: sampleWith((s) => {
      for (const t of s.trades) {
        t.status = 'open';
        delete t.closedAt;
        delete t.avgExit;
      }
    }),
  });
  await screen.findByTestId('dashboard-ready');
  expect(widgetsOnScreen()).toEqual(keysOf(DEFAULT_TEMPLATE));
  expect(screen.queryByRole('radiogroup', { name: 'Currency' })).toBeNull();
});

test('an empty workspace offers Import and the sample, with a preview of the dashboard that will fill', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: graded,
  });
  await repository.workspaces.setActive('mine');
  renderApp(<DashboardView />, { repository });
  expect(
    await screen.findByText('No trades in My workspace yet.'),
  ).toBeTruthy();
  expect(screen.queryByText('No trades match these filters.')).toBeNull();
  // A ghosted, labelled dashboard: bars and blocks, no numbers, and none of the retired cards.
  const preview = screen.getByRole('figure', {
    name: 'Your figures, charts and calendar will show here.',
  });
  expect(preview.textContent).not.toMatch(/\d/);
  expect(
    screen.queryByText(/your rules and what breaking them costs/i),
  ).toBeNull();
  expect(
    screen.getByRole('link', { name: 'Import' }).getAttribute('href'),
  ).toBe('/app/import');
  fireEvent.click(
    screen.getByRole('button', { name: 'Open the sample workspace' }),
  );
  const ready = await screen.findByTestId('dashboard-ready');
  expect(widgetsOnScreen()).toEqual(keysOf(DEFAULT_TEMPLATE));
  // The button is gone: focus lands on the dashboard that replaced it.
  await waitFor(() => expect(document.activeElement).toBe(ready));
});

test('a workspace whose accounts are all archived says where the trades are, with a link to Accounts', async () => {
  renderApp(<DashboardView />, {
    sample: sampleWith((s) => {
      for (const a of s.accounts) a.status = 'archived';
    }),
  });
  expect(
    await screen.findByText('Your trades are in archived accounts.'),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Open Accounts' }).getAttribute('href'),
  ).toBe('/app/settings/accounts');
  expect(screen.queryByText('No trades match these filters.')).toBeNull();
});

test('a display unit that leaves out every trade keeps the widgets (the score stays); the line under the top bar says why', async () => {
  const repository = repositoryWith(() => ({}));
  await repository.prefs.update({ displayUnit: 'r' });
  renderApp(<DashboardView />, { repository });
  await screen.findByTestId('dashboard-ready');
  expect(widgetsOnScreen()).toEqual(keysOf(DEFAULT_TEMPLATE));
  expect(
    screen.queryByText('No closed trades with a stop in these filters.'),
  ).toBeNull();
});

test('storage failure is an alert with a retry that reloads the page', async () => {
  const repository = repositoryWith((repo) => ({
    trades: {
      ...repo.trades,
      list: () => Promise.reject(new StorageUnavailableError()),
    },
  }));
  renderApp(<DashboardView />, { repository });
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("can't open storage");
  const reload = vi.fn();
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    reload,
  });
  fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  expect(reload).toHaveBeenCalledOnce();
});

test('any other failure retries in place', async () => {
  let fail = true;
  const repository = repositoryWith((repo) => ({
    trades: {
      ...repo.trades,
      list: (ws: string) =>
        fail ? Promise.reject(new Error('boom')) : repo.trades.list(ws),
    },
  }));
  renderApp(<DashboardView />, { repository });
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("Your dashboard couldn't load.");
  expect(alert.textContent).not.toContain('boom');
  fail = false;
  fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByTestId('dashboard-ready')).toBeTruthy();
  expect(widgetsOnScreen()).toEqual(keysOf(DEFAULT_TEMPLATE));
});

// Widgets are asked for by key: a type check that the registry covers the catalogue.
test('the registry has a renderer for every widget of the catalogue', () => {
  const keys = Object.keys(WIDGET_RENDER) as WidgetKey[];
  expect(keys).toHaveLength(29);
  for (const key of keys) expect(typeof WIDGET_RENDER[key]).toBe('function');
});

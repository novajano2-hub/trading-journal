// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { renderApp } from '../__fixtures__/render-app';
import { AppShell } from '../app-shell';
import { TopBar } from '../top-bar';
import { DayRedirect, DayView } from './day-view';
import { useElapsed } from './session-button';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

afterEach(cleanup);

// The fixture sample's routine today is 2026-11-19.
const TODAY = '2026-11-19';
const WS = SAMPLE_WORKSPACE.id;

function repository(): Repository {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}

/** Closes `date` the way Close the day does. */
async function close(repo: Repository, date: string) {
  const tracker = await repo.tracker.get(WS);
  await repo.days.finish(WS, date, {
    version: tracker.versions[0]!,
    inputs: {},
    ticks: {},
  });
}

/** The bar over the day page, as the shell lays them out. */
function Day({
  date,
  mode,
}: {
  date: string;
  mode: 'plan' | 'review';
}): React.JSX.Element {
  return (
    <>
      <TopBar basis={<button type="button">Display</button>} />
      <DayView date={date} mode={mode} />
    </>
  );
}

const stages = () => screen.getByRole('navigation', { name: 'Day stages' });

test('the bare day URL routes today and future dates to plan, past dates to review', async () => {
  for (const [date, to] of [
    [TODAY, 'plan'],
    ['2026-11-28', 'plan'],
    ['2026-11-03', 'review'],
  ] as const) {
    renderApp(<DayRedirect date={date} />, { url: `/app/day/${date}` });
    await vi.waitFor(() =>
      expect(window.location.pathname, date).toBe(`/app/day/${date}/${to}`),
    );
    cleanup();
  }
});

test('a future date has no review', async () => {
  renderApp(<Day date="2026-11-28" mode="review" />, {
    url: '/app/day/2026-11-28/review',
  });
  await vi.waitFor(() =>
    expect(window.location.pathname).toBe('/app/day/2026-11-28/plan'),
  );
});

test('a bad date shows the plain page with a link to today', async () => {
  renderApp(<DayView date="2026-02-30" mode="plan" />, {
    url: '/app/day/2026-02-30/plan',
  });
  expect(await screen.findByText(/isn.t a date/)).toBeTruthy();
  const link = await screen.findByRole('link', { name: 'Go to today' });
  expect(link.getAttribute('href')).toBe(`/app/day/${TODAY}/plan`);
  expect(screen.queryByRole('navigation', { name: 'Day stages' })).toBeNull();
});

test('a bad date in the bare URL shows the same page', async () => {
  renderApp(<DayRedirect date="soon" />, { url: '/app/day/soon' });
  expect(await screen.findByRole('link', { name: 'Go to today' })).toBeTruthy();
  expect(window.location.pathname).toBe('/app/day/soon');
});

test('stage links keep the date and push history', async () => {
  renderApp(<Day date="2026-11-03" mode="review" />, {
    url: '/app/day/2026-11-03/review',
  });
  const bar = within(stages());
  expect(bar.getByRole('link', { name: 'Plan' }).getAttribute('href')).toBe(
    '/app/day/2026-11-03/plan',
  );
  const review = bar.getByRole('link', { name: 'Review' });
  expect(review.getAttribute('href')).toBe('/app/day/2026-11-03/review');
  expect(review.getAttribute('aria-current')).toBe('step');
  // Next's Link pushes; a stage never replaces the entry it leaves. Trade is
  // the third link, disabled off today, and has no href.
  expect(
    bar.getAllByRole('link').filter((a) => a.hasAttribute('href')),
  ).toHaveLength(2);
  expect(
    bar.getByRole('button', { name: 'Import' }).getAttribute('aria-haspopup'),
  ).toBe('dialog');
});

test('Trade starts the session today and is disabled on other dates', async () => {
  renderApp(<Day date={TODAY} mode="plan" />, {
    url: `/app/day/${TODAY}/plan`,
  });
  const trade = await within(stages()).findByRole('link', { name: 'Trade' });
  expect(trade.getAttribute('href')).toBe(`/app/day/${TODAY}/plan`);
  expect(screen.queryByRole('button', { name: /End session/ })).toBeNull();
  fireEvent.click(trade);
  expect(
    await screen.findByRole('button', { name: /End session/ }),
  ).toBeTruthy();
  // Its clock sits on the stage.
  expect(
    within(stages()).getByRole('link', { name: /Trade/ }).textContent,
  ).toMatch(/\d:\d\d/);
  cleanup();

  renderApp(<Day date="2026-11-03" mode="review" />, {
    url: '/app/day/2026-11-03/review',
  });
  const past = await screen.findByText('Trade', {
    selector: '[aria-disabled]',
  });
  expect(past.hasAttribute('href')).toBe(false);
  // ARIA 1.2: aria-disabled on a link, not on a bare span.
  expect(past.getAttribute('role')).toBe('link');
  expect(past.getAttribute('aria-disabled')).toBe('true');
  expect(past.textContent).toMatch(/today/i);
  expect(screen.queryByRole('button', { name: /session/i })).toBeNull();
});

test('the session runs once and End session stops it', async () => {
  const { repo } = renderApp(<Day date={TODAY} mode="plan" />, {
    url: `/app/day/${TODAY}/plan`,
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Start session' }));
  const end = await screen.findByRole('button', { name: /End session/ });
  expect(end.textContent).toMatch(/\d:\d\d:\d\d/);
  expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
  fireEvent.click(end);
  await vi.waitFor(() =>
    expect(screen.queryByRole('button', { name: /End session/ })).toBeNull(),
  );
  // Once a day: no second start.
  expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
  const days = await repo.days.list((await repo.workspaces.getActive()).id);
  expect(days.find((d) => d.id === TODAY)?.session?.end).toBeDefined();
});

test("review's date control opens the month popover; plan's is a plain label", async () => {
  renderApp(<Day date="2026-11-03" mode="review" />, {
    url: '/app/day/2026-11-03/review',
  });
  const pick = await screen.findByRole('button', {
    name: /Tue 3 Nov, change date/,
  });
  expect(pick.getAttribute('aria-haspopup')).toBe('dialog');
  fireEvent.click(pick);
  fireEvent.click(
    await screen.findByRole('gridcell', { name: '4 November 2026' }),
  );
  expect(window.location.pathname).toBe('/app/day/2026-11-04/review');
  cleanup();

  renderApp(<Day date={TODAY} mode="plan" />, {
    url: `/app/day/${TODAY}/plan`,
  });
  const title = screen.getByRole('heading', { level: 1 });
  expect(title.textContent).toBe('Thu 19 Nov');
  expect(screen.queryByRole('button', { name: /change date/ })).toBeNull();
});

test('Import opens the method picker, and Auto-sync is not live', async () => {
  renderApp(<Day date={TODAY} mode="plan" />, {
    url: `/app/day/${TODAY}/plan`,
  });
  const bar = screen.getByRole('banner');
  fireEvent.click(within(bar).getAllByRole('button', { name: 'Import' })[0]!);
  const dialog = await screen.findByRole('dialog');
  expect(
    within(dialog)
      .getByRole('link', { name: /Upload a file/ })
      .getAttribute('href'),
  ).toBe('/app/import');
  expect(
    within(dialog)
      .getByRole('link', { name: /Enter a trade by hand/ })
      .getAttribute('href'),
  ).toBe('/app/trades/new');
  const auto = within(dialog).getByRole('button', { name: /Auto-sync/ });
  expect((auto as HTMLButtonElement).disabled).toBe(true);
  expect(auto.textContent).toContain('Not live yet');
});

test('the Import stage opens the same picker', async () => {
  renderApp(<Day date={TODAY} mode="plan" />, {
    url: `/app/day/${TODAY}/plan`,
  });
  fireEvent.click(within(stages()).getByRole('button', { name: 'Import' }));
  expect(
    within(await screen.findByRole('dialog')).getByRole('link', {
      name: /Upload a file/,
    }),
  ).toBeTruthy();
});

test('day pages show the slim rail with add trade', async () => {
  renderApp(<AppShell>{null}</AppShell>, { url: `/app/day/${TODAY}/plan` });
  const add = await screen.findByRole('link', { name: 'Add trade' });
  expect(add.getAttribute('href')).toBe('/app/trades/new');
  // Icons only: the modules keep their names as labels, and Trades is current.
  const trades = screen
    .getAllByRole('link', { name: 'Trades' })
    .find((a) => a.getAttribute('title') === 'Trades');
  expect(trades?.getAttribute('aria-current')).toBe('page');
  expect(
    await screen.findByRole('button', { name: /^Workspace:/ }),
  ).toBeTruthy();
  expect(screen.queryByText('Not live yet')).toBeNull();
});

test('other pages keep the full sidebar, without add trade', async () => {
  renderApp(<AppShell>{null}</AppShell>, { url: '/app/trades' });
  expect(await screen.findByText('Not live yet')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Add trade' })).toBeNull();
});

test('day pages have no Display menu', () => {
  renderApp(<Day date={TODAY} mode="plan" />, {
    url: `/app/day/${TODAY}/plan`,
  });
  expect(screen.queryByRole('button', { name: 'Display' })).toBeNull();
  cleanup();
  renderApp(<TopBar basis={<button type="button">Display</button>} />, {
    url: '/app/progress',
  });
  expect(screen.queryByRole('button', { name: 'Display' })).toBeNull();
  cleanup();
  renderApp(<TopBar basis={<button type="button">Display</button>} />, {
    url: '/app/trades',
  });
  expect(screen.getByRole('button', { name: 'Display' })).toBeTruthy();
});

test('a closed today with no session offers no Start session, and Trade starts nothing', async () => {
  const repo = repository();
  await close(repo, TODAY);
  renderApp(<Day date={TODAY} mode="plan" />, {
    repository: repo,
    url: `/app/day/${TODAY}/plan`,
  });
  const trade = await within(stages()).findByRole('link', { name: 'Trade' });
  // Plan on a closed day: the session control is gone.
  expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
  fireEvent.click(trade);
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button', { name: /End session/ })).toBeNull();
  const day = (await repo.days.list(WS)).find((d) => d.id === TODAY);
  expect(day?.session).toBeUndefined();
});

test("a refused session write says Couldn't save", async () => {
  const repo = repository();
  repo.days.startSession = async () => {
    throw new Error('refused');
  };
  renderApp(<Day date={TODAY} mode="plan" />, {
    repository: repo,
    url: `/app/day/${TODAY}/plan`,
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Start session' }));
  expect((await screen.findByRole('alert')).textContent).toBe("Couldn't save");
  cleanup();

  // The Trade stage starts the same session and says the same.
  renderApp(<Day date={TODAY} mode="plan" />, {
    repository: repo,
    url: `/app/day/${TODAY}/plan`,
  });
  fireEvent.click(await within(stages()).findByRole('link', { name: 'Trade' }));
  await vi.waitFor(() =>
    expect(within(stages()).getByRole('alert').textContent).toBe(
      "Couldn't save",
    ),
  );
  cleanup();

  // End session, on a session that is running.
  const ending = repository();
  await ending.days.startSession(WS, TODAY);
  ending.days.endSession = async () => {
    throw new Error('refused');
  };
  renderApp(<Day date={TODAY} mode="plan" />, {
    repository: ending,
    url: `/app/day/${TODAY}/plan`,
  });
  fireEvent.click(await screen.findByRole('button', { name: /End session/ }));
  expect((await screen.findByRole('alert')).textContent).toBe("Couldn't save");
});

test('review on today has no session control', async () => {
  const repo = repository();
  await repo.days.startSession(WS, TODAY);
  renderApp(<Day date={TODAY} mode="review" />, {
    repository: repo,
    url: `/app/day/${TODAY}/review`,
  });
  await screen.findByRole('region', { name: 'The day in figures' });
  expect(screen.queryByRole('button', { name: /End session/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
  // The running session still shows on the Trade stage.
  expect(
    within(stages()).getByRole('link', { name: /Trade/ }).textContent,
  ).toMatch(/\d:\d\d/);
});

test("the clock ticks for today's running session only", async () => {
  const running = { start: '2026-11-03T14:00:00.000Z' };
  function Clock({ date }: { date: string }) {
    useElapsed(date, TODAY, running);
    return null;
  }
  const tick = vi.spyOn(globalThis, 'setInterval');
  renderApp(<Clock date="2026-11-03" />);
  await new Promise((r) => setTimeout(r, 20));
  const ticks = () => tick.mock.calls.filter(([, ms]) => ms === 1000).length;
  expect(ticks()).toBe(0);
  cleanup();
  renderApp(<Clock date={TODAY} />);
  await vi.waitFor(() => expect(ticks()).toBeGreaterThan(0));
  tick.mockRestore();
});

test('the header chip says Closed with no time; the time shows once, on the rules card', async () => {
  const repo = repository();
  await close(repo, '2026-11-18');
  renderApp(<Day date="2026-11-18" mode="review" />, {
    repository: repo,
    url: '/app/day/2026-11-18/review',
  });
  const bar = screen.getByRole('banner');
  const chip = await within(bar).findByText('Closed');
  expect(chip.textContent).toBe('Closed');
  expect(await screen.findAllByText(/Closed at \d\d:\d\d/)).toHaveLength(1);
});

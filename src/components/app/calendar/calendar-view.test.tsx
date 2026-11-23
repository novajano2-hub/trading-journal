// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createLocalRepository } from '@/data/local/local-repository';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { defaultMetricContext } from '@/domain/metrics/context';
import type { SampleWorkspace } from '@/data/seed/generate';
import { calendarYear } from '@/data/calendar';
import { everyString } from '../__fixtures__/every-string';
import { renderApp } from '../__fixtures__/render-app';
import { CalendarView } from './calendar-view';
import { YearGrid } from './year-grid';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

/** The viewport the day panel's `matchMedia` reads. */
const viewport = (width: number) => {
  window.innerWidth = width;
};
beforeEach(() => viewport(1440));

const WS = fixtureSample().trades[0]!.workspaceId;

/** The fixture with its trades replaced by closed ones on given days (NY 11:00). */
function withTrades(
  days: [date: string, net: number, extra?: object][],
  over: (s: SampleWorkspace) => void = () => {},
) {
  return async () => {
    const s = fixtureSample();
    const base = s.trades[0]!;
    s.trades = days.map(([date, net, extra], i) =>
      makeTrade({
        ...base,
        id: `c-${i}`,
        serial: i + 1,
        workspaceId: WS,
        accountId: 'acc-a',
        net,
        gross: net,
        fees: 0,
        openedAt: `${date}T15:00:00Z`,
        closedAt: `${date}T16:00:00Z`,
        ruleChecks: [],
        tagIds: [],
        ...extra,
      }),
    );
    over(s);
    return s;
  };
}

const NOV = [
  ['2026-11-02', 102093],
  ['2026-11-03', -72763],
  ['2026-11-19', 4405],
  ['2026-11-19', 1000],
  ['2026-11-19', -500],
] as [string, number][];

const url = (q = '') => `/app/calendar?month=2026-11${q}`;

test('November 2026 renders six week rows, Monday first, with each week total', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  const grid = await screen.findByRole('grid', { name: 'November 2026' });
  expect(within(grid).getAllByTestId('week-row')).toHaveLength(6);
  expect(
    within(grid).getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)[0]!
      .textContent,
  ).toBe('Mon');
  const w1 = within(grid).getAllByTestId('week-row')[1]!;
  expect(w1.textContent).toContain('2 days');
});

test('a day cell shows net and trades by default, and the summary reads the month', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  const cell = await screen.findByRole('button', { name: /^Mon 2 Nov/ });
  expect(cell.textContent).toContain('+$1,020.93');
  expect(cell.textContent).toContain('1 trade');
  expect(await screen.findByText('2 of 3 green days')).toBeTruthy();
});

test('selecting 19 Nov lists its trades and links the daily note', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  fireEvent.click(await screen.findByRole('button', { name: /^Thu 19 Nov/ }));
  expect(window.location.search).toContain('day=2026-11-19');
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  expect(within(panel).getAllByRole('row').length).toBeGreaterThanOrEqual(3);
  const note = within(panel).getByRole('link', { name: /Open daily note/ });
  expect(note.getAttribute('href')).toBe('/app/notebook/daily/2026-11-19');
});

test('?day opens the panel on load', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: url('&day=2026-11-19'),
  });
  expect(
    await screen.findByRole('complementary', { name: /Thu 19 Nov/ }),
  ).toBeTruthy();
});

test('month buttons write ?month', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  fireEvent.click(await screen.findByRole('button', { name: 'Next month' }));
  expect(window.location.search).toContain('month=2026-12');
  fireEvent.click(
    await screen.findByRole('button', { name: 'Previous month' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Previous month' }),
  );
  expect(window.location.search).toContain('month=2026-10');
  fireEvent.click(screen.getByRole('button', { name: 'This month' }));
  expect(window.location.search).not.toContain('month=2026-10');
});

test('choosing Win rate as a third stat shows it in the cells', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  const cell = await screen.findByRole('button', { name: /^Thu 19 Nov/ });
  expect(cell.textContent).not.toContain('win rate');
  fireEvent.click(screen.getByRole('button', { name: 'Stats shown' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Win rate' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /^Thu 19 Nov/ }).textContent,
    ).toContain('67% win rate'),
  );
  // Three is the most: the others are now disabled.
  expect(
    (screen.getByRole('checkbox', { name: 'Fees' }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
});

test('with Privacy on, the cells show $••• and no digit follows a $', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: withTrades(NOV),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  const { container } = renderApp(<CalendarView />, {
    repository,
    url: url('&day=2026-11-19'),
  });
  const cell = await screen.findByRole('button', {
    name: /^Mon 2 Nov, hidden amount/,
  });
  expect(cell.textContent).toContain('+$•••');
  expect(everyString(container).filter((x) => /\$\d/.test(x))).toEqual([]);
});

test('YearGrid draws twelve months with their nets', async () => {
  const trades = withTrades(NOV);
  const s = await trades();
  const months = calendarYear(
    s.trades,
    2026,
    defaultMetricContext('America/New_York'),
  );
  renderApp(<YearGrid year={2026} months={months} />, { sample: trades });
  const items = await screen.findAllByTestId('year-month');
  expect(items).toHaveLength(12);
  const nov = items[10]!;
  expect(nov.textContent).toContain('November');
  expect(nov.textContent).toContain('+$342.35');
});

/** The day buttons of the grid by their label's start. */
const dayButton = (label: RegExp) =>
  screen.findByRole('button', { name: label });
const focused = () => document.activeElement?.getAttribute('aria-label') ?? '';

test('the month is a grid: weekday column headers, a row per week, a gridcell per day, aria-selected on the pick', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: url('&day=2026-11-19'),
  });
  const grid = await screen.findByRole('grid', { name: 'November 2026' });
  const heads = within(grid).getAllByRole('columnheader');
  expect(heads.slice(0, 7).map((h) => h.textContent)).toEqual([
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ]);
  // The header row and six weeks.
  expect(within(grid).getAllByRole('row')).toHaveLength(7);
  const cells = within(grid).getAllByRole('gridcell');
  const picked = cells.filter(
    (c) => c.getAttribute('aria-selected') === 'true',
  );
  expect(picked).toHaveLength(1);
  expect(
    within(picked[0]!).getByRole('button').getAttribute('aria-label'),
  ).toMatch(/^Thu 19 Nov/);
  expect(
    within(grid)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') !== null),
  ).toHaveLength(0);
});

test('one day is in the tab order; arrows, Home and End move between days', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: url('&day=2026-11-19'),
  });
  const thu = await dayButton(/^Thu 19 Nov/);
  const grid = screen.getByRole('grid', { name: 'November 2026' });
  const tabbable = () =>
    within(grid)
      .getAllByRole('button')
      .filter((b) => b.tabIndex === 0)
      .map((b) => b.getAttribute('aria-label')!.slice(0, 10));
  expect(tabbable()).toEqual(['Thu 19 Nov']);
  thu.focus();
  fireEvent.keyDown(thu, { key: 'ArrowRight' });
  expect(focused()).toMatch(/^Fri 20 Nov/);
  expect(tabbable()).toEqual(['Fri 20 Nov']);
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
  expect(focused()).toMatch(/^Fri 27 Nov/);
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
  expect(focused()).toMatch(/^Thu 19 Nov/);
  fireEvent.keyDown(document.activeElement!, { key: 'Home' });
  expect(focused()).toMatch(/^Mon 16 Nov/);
  fireEvent.keyDown(document.activeElement!, { key: 'End' });
  expect(focused()).toMatch(/^Sun 22 Nov/);
  // Right from Sunday goes on to Monday's cell; the month's last day stops.
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
  expect(focused()).toMatch(/^Mon 23 Nov/);
  fireEvent.keyDown(await dayButton(/^Mon 30 Nov/), { key: 'ArrowRight' });
  expect(focused()).toMatch(/^Mon 23 Nov|^Mon 30 Nov/);
  fireEvent.keyDown(await dayButton(/^Sun 1 Nov/), { key: 'ArrowLeft' });
  fireEvent.keyDown(await dayButton(/^Sun 1 Nov/), { key: 'ArrowUp' });
  expect(tabbable()).toHaveLength(1);
});

test('modified keys pass through the grid: Alt+Left is the browser back, Ctrl/Cmd+Home is the page', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: url('&day=2026-11-19'),
  });
  const thu = await dayButton(/^Thu 19 Nov/);
  thu.focus();
  for (const mod of ['altKey', 'ctrlKey', 'metaKey'] as const) {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      // fireEvent returns false when something called preventDefault.
      expect(
        fireEvent.keyDown(thu, { key, [mod]: true }),
        `${mod} ${key}`,
      ).toBe(true);
      expect(focused()).toMatch(/^Thu 19 Nov/);
    }
  }
  // Unmodified, and Shift (which only selects text elsewhere), still move.
  expect(fireEvent.keyDown(thu, { key: 'ArrowRight' })).toBe(false);
  expect(focused()).toMatch(/^Fri 20 Nov/);
});

test('the legend explains the journal-entry glyph', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  expect(await screen.findByText('Journal entry')).toBeTruthy();
});

test('?day alone opens its month; a day outside the shown month or not a real date is ignored', async () => {
  const first = renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: '/app/calendar?day=2026-11-19',
  });
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  expect(within(panel).getAllByRole('row').length).toBeGreaterThanOrEqual(3);
  expect(screen.getByRole('grid', { name: 'November 2026' })).toBeTruthy();
  first.unmount();

  for (const bad of ['2026-10-15', '2026-02-31', '2026-11-00']) {
    const r = renderApp(<CalendarView />, {
      sample: withTrades(NOV),
      url: url(`&day=${bad}`),
    });
    await screen.findByRole('grid', { name: 'November 2026' });
    expect(
      screen.getByRole('complementary', { name: 'Day' }).textContent,
    ).toMatch(/Pick a day/);
    expect(screen.queryByText(/No trades exited this day/)).toBeNull();
    r.unmount();
  }
});

test('a date range leaves days outside it muted and unselectable, and the page says so', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: url('&from=2026-11-10&to=2026-11-20&day=2026-11-02'),
  });
  const grid = await screen.findByRole('grid', { name: 'November 2026' });
  expect(screen.queryByRole('button', { name: /^Mon 2 Nov/ })).toBeNull();
  const out = within(grid).getByRole('gridcell', { name: /^Mon 2 Nov/ });
  expect(out.getAttribute('aria-disabled')).toBe('true');
  expect(out.textContent).not.toMatch(/\$/);
  expect(await dayButton(/^Thu 19 Nov/)).toBeTruthy();
  // The picked day is outside the range: no panel for it.
  expect(screen.getByRole('complementary', { name: 'Day' })).toBeTruthy();
  expect(screen.getByText(/Your date range applies/)).toBeTruthy();
  // Only 19 Nov is inside the range (4405 + 1000 - 500); 2 Nov's $1,020.93 is left out.
  expect(screen.getAllByText('+$49.05').length).toBeGreaterThan(0);
  expect(screen.queryByText('+$1,020.93')).toBeNull();
  fireEvent.keyDown(await dayButton(/^Thu 19 Nov/), { key: 'ArrowRight' });
  expect(focused()).toMatch(/^Fri 20 Nov/);
});

test('below 1280px the day panel is a sheet, from 1280px it sits beside the grid', async () => {
  viewport(1100);
  const narrow = renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: url('&day=2026-11-19'),
  });
  expect(
    await screen.findByRole('dialog', { name: /Thu 19 Nov/ }),
  ).toBeTruthy();
  expect(screen.queryByRole('complementary')).toBeNull();
  narrow.unmount();
  cleanup();
  viewport(1280);
  renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: url('&day=2026-11-19'),
  });
  expect(
    await screen.findByRole('complementary', { name: /Thu 19 Nov/ }),
  ).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});

const GRADED = withTrades([
  [
    '2026-11-19',
    4405,
    {
      strategyIds: ['str-1'],
      ruleChecks: [
        { ruleId: 'r-1', followed: true },
        { ruleId: 'r-2', followed: false },
      ],
    },
  ],
  [
    '2026-11-19',
    1000,
    {
      strategyIds: ['str-1'],
      ruleChecks: [
        { ruleId: 'r-1', followed: true },
        { ruleId: 'r-2', followed: true },
      ],
    },
  ],
  [
    '2026-11-19',
    -500,
    {
      strategyIds: ['str-1'],
      ruleChecks: [
        { ruleId: 'r-1', followed: false },
        { ruleId: 'r-2', followed: null },
      ],
      tagIds: ['tag-fomo'],
    },
  ],
]);

test('the day panel shows Rules kept and Mistakes, each with a metric tip', async () => {
  renderApp(<CalendarView />, { sample: GRADED, url: url('&day=2026-11-19') });
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  const dd = (label: string) =>
    within(panel)
      .getByRole('button', { name: label })
      .closest('div')!
      .querySelector('dd')!;
  // Kept 3 of 5 graded checks (one check is ungraded).
  expect(dd('Rules kept').textContent).toBe('3 of 5');
  // One trade carries the mistake tag; it made -$5.00 that day.
  expect(dd('Mistakes').textContent).toMatch(/1.*5\.00/);
  expect(
    panel.querySelector('[data-metric-tip="rule-adherence"]'),
  ).not.toBeNull();
  expect(
    panel.querySelector('[data-metric-tip="mistake-cost"]'),
  ).not.toBeNull();
});

test('every metric label on the page carries a metric tip', async () => {
  renderApp(<CalendarView />, { sample: GRADED, url: url('&day=2026-11-19') });
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  const page = panel.closest('[data-testid="calendar-ready"]')!;
  for (const id of [
    'pnl',
    'trading-days',
    'green-days',
    'best-day',
    'worst-day',
  ])
    expect(page.querySelector(`[data-metric-tip="${id}"]`), id).not.toBeNull();
  for (const id of ['trades', 'win-rate', 'fees', 'gross-pnl'])
    expect(panel.querySelector(`[data-metric-tip="${id}"]`), id).not.toBeNull();
});

test('Privacy hides the Mistakes P&L in the panel too', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: GRADED,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  const { container } = renderApp(<CalendarView />, {
    repository,
    url: url('&day=2026-11-19'),
  });
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  expect(panel.textContent).toContain('Mistakes');
  expect(everyString(container).filter((x) => /\$\d/.test(x))).toEqual([]);
});

test('a failed cashFlows read shows the failure, not a loader or a false empty state', async () => {
  const real = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  const broken = {
    ...real,
    cashFlows: {
      ...real.cashFlows,
      list: async () => {
        throw new Error('no read');
      },
    },
  };
  const { container } = renderApp(<CalendarView />, {
    repository: broken,
    url: '/app/calendar',
  });
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByRole('alert').textContent).toContain(
    "couldn't load the calendar",
  );
  expect(container.textContent).not.toContain('Loading');
});

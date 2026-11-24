// @vitest-environment happy-dom
import {
  act,
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
import { resolveInstrument } from '@/domain/instruments';
import { defaultMetricContext } from '@/domain/metrics/context';
import type { SampleWorkspace } from '@/data/seed/generate';
import { calendarYear } from '@/data/calendar';
import { everyString } from '../__fixtures__/every-string';
import { commitNavigation, deferNavigation } from '../__fixtures__/navigation';
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
  // The green and red days read once, under Trading days; no second tile repeats them.
  expect(
    await screen.findByText(/^\d+ green, \d+ red, \d+ flat$/),
  ).toBeTruthy();
  expect(screen.queryByText(/green days$/)).toBeNull();
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

test('two quick clicks on Next month before the address catches up move two months (I5)', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  const next = await screen.findByRole('button', { name: 'Next month' });
  deferNavigation();
  fireEvent.click(next);
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(
    screen.getAllByRole('heading', { name: 'January 2027' }).length,
  ).toBeGreaterThan(0);
  act(() => commitNavigation());
  expect(new URLSearchParams(window.location.search).get('month')).toBe(
    '2027-01',
  );
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

test('the day sheet opens with focus on its heading, not the close button', async () => {
  viewport(390);
  renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: url('&day=2026-11-19'),
  });
  const dialog = await screen.findByRole('dialog', { name: /Thu 19 Nov/ });
  const heading = within(dialog).getByRole('heading', { name: /Thu 19 Nov/ });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  expect(document.activeElement).not.toBe(
    within(dialog).getByRole('button', { name: 'Close day' }),
  );
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
  expect(dd('Mistakes').textContent).toBe('1 trade, net −$5.00');
  // The cell spans the panel and wraps, never clips.
  expect(dd('Mistakes').className).not.toContain('truncate');
  expect(dd('Mistakes').closest('div')!.className).toContain('col-span-full');
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
  for (const id of ['pnl', 'trading-days', 'best-day', 'worst-day'])
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

test('with no ?day the latest trading day of the shown month is picked, and written without a new history entry', async () => {
  const entries = window.history.length;
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  expect(
    await screen.findByRole('complementary', { name: /Thu 19 Nov/ }),
  ).toBeTruthy();
  await waitFor(() =>
    expect(window.location.search).toContain('day=2026-11-19'),
  );
  expect(window.location.search).toContain('month=2026-11');
  expect(window.history.length).toBe(entries);
  // Clicking the picked day keeps it: the panel is never left empty on a month with trades.
  fireEvent.click(await dayButton(/^Thu 19 Nov/));
  expect(window.location.search).toContain('day=2026-11-19');
  expect(
    screen.getByRole('complementary', { name: /Thu 19 Nov/ }),
  ).toBeTruthy();
  // Another month picks its own latest day.
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  expect(window.location.search).not.toContain('day=2026-11-19');
});

test('an explicit ?day wins over the default, and a sheet layout is not opened by it', async () => {
  const explicit = renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: url('&day=2026-11-03'),
  });
  expect(
    await screen.findByRole('complementary', { name: /Tue 3 Nov/ }),
  ).toBeTruthy();
  explicit.unmount();
  cleanup();
  viewport(1100);
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  await screen.findByRole('grid', { name: 'November 2026' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(window.location.search).not.toContain('day=');
});

test('a month with no trades fills the panel with the month: net, trading days, best and worst', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: '/app/calendar?month=2026-09',
  });
  const panel = await screen.findByRole('complementary', {
    name: 'September 2026',
  });
  expect(window.location.search).not.toContain('day=');
  expect(
    within(panel).getByText(/No trades exited in September 2026/),
  ).toBeTruthy();
  for (const label of ['Net P&L', 'Trading days', 'Best day', 'Worst day'])
    expect(within(panel).getByText(label)).toBeTruthy();
  // The nearest month that has trades is one step away.
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Go to November 2026' }),
  );
  expect(window.location.search).not.toContain('month=2026-09');
  expect(screen.getByRole('grid', { name: 'November 2026' })).toBeTruthy();
});

test('each day cell carries a compact signed figure for the phone, and Privacy hides it as +$•••', async () => {
  const wide = renderApp(<CalendarView />, {
    sample: withTrades([
      ['2026-11-02', 112_000],
      ['2026-11-03', -38_800],
    ]),
    url: url(),
  });
  const up = await screen.findByRole('button', { name: /^Mon 2 Nov/ });
  expect(within(up).getByTestId('day-compact').textContent).toBe('+1.1k');
  expect(
    within(screen.getByRole('button', { name: /^Tue 3 Nov/ })).getByTestId(
      'day-compact',
    ).textContent,
  ).toBe('−388');
  wide.unmount();
  cleanup();
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: withTrades([['2026-11-02', 112_000]]),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<CalendarView />, { repository, url: url() });
  const hidden = await screen.findByRole('button', { name: /^Mon 2 Nov/ });
  expect(within(hidden).getByTestId('day-compact').textContent).toBe('+$•••');
});

test('the week cell keeps its days and trades on two lines, never wrapped mid-phrase', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  await screen.findByRole('grid', { name: 'November 2026' });
  const total = screen.getAllByTestId('week-total')[1]!;
  const lines = within(total).getByText('2 days');
  expect(lines.className).toContain('whitespace-nowrap');
  expect(within(total).getByText('2 trades').className).toContain(
    'whitespace-nowrap',
  );
});

/** ES on 2 Nov (+40 ticks), EUR/USD on 3 Nov (+12 pips), and three ES trades on 19 Nov. */
const UNITS = withTrades(
  [
    ['2026-11-02', 5000, { avgEntry: 5000, avgExit: 5010 }],
    [
      '2026-11-03',
      1000,
      {
        instrument: resolveInstrument('EURUSD')!,
        avgEntry: 1.1,
        avgExit: 1.1012,
        pnlCurrency: 'USD',
      },
    ],
    ['2026-11-19', 4405],
    ['2026-11-19', 1000],
    ['2026-11-19', -500],
  ].map(([d, n, x]) => [
    d,
    n,
    {
      executions: [],
      maxPosition: 1,
      avgEntry: 5000,
      avgExit: 5010,
      ...(x as object),
    },
  ]) as [string, number, object][],
);

test('C1: the day panel adds winners, losers, volume and the profit factor', async () => {
  renderApp(<CalendarView />, {
    sample: UNITS,
    url: url('&day=2026-11-19'),
  });
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  const read = (label: string) =>
    within(panel).getByText(label).closest('div')!.textContent;
  expect(read('Winners')).toContain('2');
  expect(read('Losers')).toContain('1');
  expect(read('Volume')).toContain('3');
  expect(read('Profit factor')).toContain('10.81');
});

test('C1: a day without a loss shows None for its profit factor', async () => {
  renderApp(<CalendarView />, {
    sample: UNITS,
    url: url('&day=2026-11-02'),
  });
  const panel = await screen.findByRole('complementary', { name: /Mon 2 Nov/ });
  expect(
    within(panel).getByText('Profit factor').closest('div')!.textContent,
  ).toContain('None');
});

test('C1: the new rows are not truncated at 1440', async () => {
  renderApp(<CalendarView />, {
    sample: UNITS,
    url: url('&day=2026-11-19'),
  });
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  for (const label of ['Winners', 'Losers', 'Volume', 'Profit factor']) {
    const dd = within(panel)
      .getByText(label)
      .closest('div')!
      .querySelector('dd')!;
    expect(dd.className).not.toContain('truncate');
  }
});

test('C2: the stats menu offers Ticks, Pips and Points within the cap of three', async () => {
  renderApp(<CalendarView />, { sample: UNITS, url: url() });
  await screen.findByRole('grid', { name: 'November 2026' });
  fireEvent.click(screen.getByRole('button', { name: 'Stats shown' }));
  for (const name of ['Ticks', 'Pips', 'Points'])
    expect(await screen.findByRole('checkbox', { name })).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ticks' }));
  await waitFor(() =>
    expect(
      (screen.getByRole('checkbox', { name: 'Pips' }) as HTMLInputElement)
        .disabled,
    ).toBe(true),
  );
});

test('C2: a cell shows the day sum in the unit, and None on a day without an eligible trade', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: UNITS,
  });
  await repository.prefs.update({ calendarStats: ['ticks', 'pips', 'net'] });
  renderApp(<CalendarView />, { repository, url: url() });
  const es = await screen.findByRole('button', { name: /^Mon 2 Nov/ });
  expect(es.textContent).toContain('+40.0 ticks');
  expect(es.textContent).toContain('None');
  const fx = screen.getByRole('button', { name: /^Tue 3 Nov/ });
  expect(fx.textContent).toContain('+12.0 pips');
  expect(fx.textContent).toContain('None');
  expect(fx.textContent).not.toMatch(/[–—-]\s*$/);
});

test('C2: on a phone the lead unit stat is compact, with its suffix', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: UNITS,
  });
  await repository.prefs.update({ calendarStats: ['ticks', 'net'] });
  viewport(390);
  renderApp(<CalendarView />, { repository, url: url() });
  const es = await screen.findByRole('button', { name: /^Mon 2 Nov/ });
  expect(within(es).getByTestId('day-compact').textContent).toBe('+40t');
});

test('E65: under the Ticks display unit the day panel reads in ticks, not dollars', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: UNITS,
  });
  await repository.prefs.update({ displayUnit: 'ticks' });
  renderApp(<CalendarView />, { repository, url: url('&day=2026-11-02') });
  const panel = await screen.findByRole('complementary', { name: /Mon 2 Nov/ });
  expect(within(panel).getAllByText('+40.0 ticks').length).toBeGreaterThan(0);
  // The net, the Ticks row and the exit row each read in ticks.
  expect(
    within(panel).getAllByText('+40.0 ticks').length,
  ).toBeGreaterThanOrEqual(3);
});

test('C3: the month shows winners, losers and the trade win rate, and links to Reports for that month', async () => {
  renderApp(<CalendarView />, {
    sample: UNITS,
    url: url('&account=acc-a&day=2026-11-19'),
  });
  await screen.findByRole('grid', { name: 'November 2026' });
  const strip = screen.getByText('Trade win rate').closest('div')!;
  expect(strip.textContent).toContain('4 winners, 1 loser');
  expect(strip.textContent).toContain('80.0%');
  const link = screen.getByRole('link', { name: /Month in Reports/ });
  const href = new URL(link.getAttribute('href')!, 'http://x');
  expect(href.pathname).toBe('/app/reports');
  expect(href.searchParams.get('from')).toBe('2026-11-01');
  expect(href.searchParams.get('to')).toBe('2026-11-30');
  expect(href.searchParams.get('account')).toBe('acc-a');
});

test('C3: a month without trades has the rate row and one link', async () => {
  renderApp(<CalendarView />, {
    sample: UNITS,
    url: '/app/calendar?month=2026-12',
  });
  const panel = await screen.findByRole('complementary');
  expect(
    within(panel).getByText('Trade win rate').closest('div')!.textContent,
  ).toContain('None');
  const links = screen.getAllByRole('link', { name: /Month in Reports/ });
  expect(links).toHaveLength(1);
  const href = links[0]!.getAttribute('href')!;
  expect(href).toContain('from=2026-12-01');
  expect(href).toContain('to=2026-12-31');
});

test('C3: at 390 the link is in the month strip, once, and not hidden', async () => {
  viewport(390);
  renderApp(<CalendarView />, { sample: UNITS, url: url() });
  await screen.findByRole('grid', { name: 'November 2026' });
  const links = screen.getAllByRole('link', { name: /Month in Reports/ });
  expect(links).toHaveLength(1);
  const strip = screen.getByText('Trade win rate').closest('div')!;
  expect(strip.contains(links[0]!)).toBe(true);
  expect(links[0]!.className).not.toContain('hidden');
});

test('Privacy masks money cells but unit cells still read in ticks and pips', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: UNITS,
  });
  await repository.prefs.update({
    displayUnit: 'privacy',
    calendarStats: ['ticks', 'pips', 'net'],
  });
  renderApp(<CalendarView />, { repository, url: url() });
  const es = await screen.findByRole('button', { name: /^Mon 2 Nov/ });
  expect(es.textContent).toContain('+40.0 ticks');
  expect(es.textContent).toContain('+$•••');
  expect(es.textContent).not.toMatch(/\$\d/);
  const fx = screen.getByRole('button', { name: /^Tue 3 Nov/ });
  expect(fx.textContent).toContain('+12.0 pips');
});

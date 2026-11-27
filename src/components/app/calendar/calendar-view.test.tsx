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
import { metricDefinition } from '@/content/metric-definitions';
import { defaultPrefs } from '@/data/repository';
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
// The page has no canvas here: the image is made, not drawn.
vi.mock('@/lib/calendar-image', async (original) => ({
  ...(await original<typeof import('@/lib/calendar-image')>()),
  calendarPng: async () => new Blob(['png'], { type: 'image/png' }),
}));
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

test('November 2026 renders five week rows, Sunday first, with each week total', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  const grid = await screen.findByRole('grid', { name: 'November 2026' });
  expect(within(grid).getAllByTestId('week-row')).toHaveLength(5);
  expect(
    within(grid).getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)[0]!
      .textContent,
  ).toBe('Sun');
  const w0 = within(grid).getAllByTestId('week-row')[0]!;
  expect(w0.textContent).toContain('2 days');
});

test('with Monday weeks the grid has six rows, Monday first, and the week total follows', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: withTrades(NOV),
  });
  await repository.prefs.update({ weekStart: 'monday' });
  renderApp(<CalendarView />, { repository, url: url() });
  const grid = await screen.findByRole('grid', { name: 'November 2026' });
  expect(within(grid).getAllByTestId('week-row')).toHaveLength(6);
  expect(
    within(grid).getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)[0]!
      .textContent,
  ).toBe('Mon');
  expect(
    within(within(grid).getAllByTestId('week-row')[1]!).getByTestId(
      'week-total',
    ).textContent,
  ).toContain('2 days');
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

test('the Calendar day panel opens the Day view on that date (equal from and to), with the current filters', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: url('&side=long&symbol=ES'),
  });
  fireEvent.click(await screen.findByRole('button', { name: /^Thu 19 Nov/ }));
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  const link = within(panel).getByRole('link', { name: 'Open in Trades' });
  const href = link.getAttribute('href')!;
  const [path, query] = href.split('?') as [string, string];
  // The Day view, filtered to the date (equal from and to), the filters kept.
  expect(path).toBe('/app/trades/day');
  const params = new URLSearchParams(query);
  expect(params.get('from')).toBe('2026-11-19');
  expect(params.get('to')).toBe('2026-11-19');
  expect(params.get('side')).toBe('long');
  expect(params.get('symbol')).toBe('ES');
  // The calendar's own month and day are not carried over.
  expect(params.has('month')).toBe(false);
  expect(params.has('day')).toBe(false);
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

test('the currency is in the address: ?cur opens it, the switch writes it, and the month report link carries it (M4)', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades([
      ['2026-11-18', 5000],
      ['2026-11-19', 7000, { pnlCurrency: 'EUR' }],
    ]),
    url: url('&cur=EUR'),
  });
  const currency = await screen.findByRole('radiogroup', { name: 'Currency' });
  expect(
    (within(currency).getByRole('radio', { name: 'EUR' }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  // Only the euro trade's day is booked.
  expect(
    screen.getByRole('button', { name: /^Thu 19 Nov/ }).textContent,
  ).toContain('70');
  const report = screen.getByRole('link', {
    name: /Open .*November.* report|report/i,
  });
  expect(
    new URL(report.getAttribute('href')!, 'http://x').searchParams.get('cur'),
  ).toBe('EUR');
  fireEvent.click(within(currency).getByRole('radio', { name: 'USD' }));
  await waitFor(() =>
    expect(new URLSearchParams(window.location.search).get('cur')).toBe('USD'),
  );
});

test('choosing Win rate as a third stat shows it in the cells', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: withTrades(NOV),
  });
  await repository.prefs.update({ calendarStats: ['net', 'trades'] });
  renderApp(<CalendarView />, { repository, url: url() });
  const cell = await screen.findByRole('button', { name: /^Thu 19 Nov/ });
  expect(cell.textContent).not.toContain('win rate');
  fireEvent.click(screen.getByRole('button', { name: 'Stats shown' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Win rate' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /^Thu 19 Nov/ }).textContent,
    ).toContain('67% win rate'),
  );
  // There is no cap: Fees is still free to tick, and it stacks under the others.
  const fees = screen.getByRole('checkbox', { name: 'Fees' });
  expect((fees as HTMLInputElement).disabled).toBe(false);
  fireEvent.click(fees);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /^Thu 19 Nov/ }).textContent,
    ).toContain('fees'),
  );
});

test('with every stat ticked a cell stacks every line in the chosen order, and the day panel shows them all', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: UNITS,
  });
  await repository.prefs.update({
    calendarStats: [
      'winRate',
      'net',
      'trades',
      'r',
      'fees',
      'ticks',
      'pips',
      'points',
    ],
  });
  renderApp(<CalendarView />, { repository, url: url('&day=2026-11-19') });
  const cell = await screen.findByRole('button', { name: /^Thu 19 Nov/ });
  const text = cell.textContent ?? '';
  const at = (s: string) => text.indexOf(s);
  expect(at('win rate')).toBeGreaterThan(-1);
  expect(at('win rate')).toBeLessThan(at('3 trades'));
  expect(at('3 trades')).toBeLessThan(at(' fees'));
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  for (const term of ['Win rate', 'Trades', 'Fees', 'Ticks'])
    expect(panel.textContent, term).toContain(term);
});

test('E146: under the lead a line has a compact form, and the full values sit in the tooltip and the accessible label', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: UNITS,
  });
  await repository.prefs.update({
    calendarStats: ['net', 'winRate', 'trades', 'fees', 'ticks', 'pips'],
  });
  renderApp(<CalendarView />, { repository, url: url() });
  const es = await screen.findByRole('button', { name: /^Mon 2 Nov/ });
  const lines = [...es.querySelectorAll('span[title]')];
  const titles = lines.map((l) => l.getAttribute('title'));
  // Each line under the lead carries its full value as a tooltip.
  expect(titles).toContain('+40.0 ticks');
  expect(titles.some((t) => t?.endsWith(' fees'))).toBe(true);
  expect(titles).toContain('Pips: None');
  const compact = lines.map(
    (l) => l.querySelector('[aria-hidden="true"]')?.textContent,
  );
  expect(compact).toContain('+40t');
  // The full value of every ticked stat is in the cell's name.
  const name = es.getAttribute('aria-label')!;
  expect(name).toContain('+40.0 ticks');
  expect(name).toContain(' fees');
  expect(name).toMatch(/win rate/);
  // The compact forms never carry a dollar sign and the lead keeps its figure.
  expect(compact.join(' ')).not.toMatch(/\$/);
});

test('M6: a five-figure day reads short in a narrow cell, with the full value in the tooltip and the label; a short one is written out', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades([
      ['2026-11-18', 1_234_567],
      ['2026-11-19', -1_234_567],
      ['2026-11-20', 95_110],
    ]),
    url: url(),
  });
  const big = await screen.findByRole('button', { name: /^Wed 18 Nov/ });
  const lead = big.querySelector('span[title="+$12,345.67"]')!;
  expect(lead).not.toBeNull();
  expect(lead.querySelector('[aria-hidden="true"]')!.textContent).toBe('+12k');
  expect(big.getAttribute('aria-label')).toContain('+$12,345.67');
  const loss = screen.getByRole('button', { name: /^Thu 19 Nov/ });
  expect(loss.querySelector('span[title]')!.getAttribute('title')).toBe(
    '−$12,345.67',
  );
  expect(
    loss.querySelector('span[title] [aria-hidden="true"]')!.textContent,
  ).toBe('−12k');
  // "+$951.10" fits as written: no second form.
  const small = screen.getByRole('button', { name: /^Fri 20 Nov/ });
  // Only the lead line: the win rate under it has its own short form.
  expect(
    small.querySelector('span[title]')!.querySelector('[aria-hidden="true"]'),
  ).toBeNull();
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
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
  ]);
  // The header row and five weeks.
  expect(within(grid).getAllByRole('row')).toHaveLength(6);
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
  expect(focused()).toMatch(/^Sun 15 Nov/);
  fireEvent.keyDown(document.activeElement!, { key: 'End' });
  expect(focused()).toMatch(/^Sat 21 Nov/);
  // Right from Saturday goes on to the next row's Sunday; the month's last day stops.
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
  expect(focused()).toMatch(/^Sun 22 Nov/);
  fireEvent.keyDown(await dayButton(/^Mon 30 Nov/), { key: 'ArrowRight' });
  expect(focused()).toMatch(/^Sun 22 Nov|^Mon 30 Nov/);
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

test('the date range does not touch the month: every day is live, the totals cover the whole month, and there is no range note', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: url('&from=2026-11-10&to=2026-11-20&day=2026-11-02'),
  });
  const grid = await screen.findByRole('grid', { name: 'November 2026' });
  // 2 Nov is outside the range and still a day with its figures, and the pick opens.
  const cell = await dayButton(/^Mon 2 Nov/);
  expect(cell.textContent).toContain('+$1,020.93');
  expect(within(grid).queryAllByRole('gridcell', { name: /outside/ })).toEqual(
    [],
  );
  expect(
    await screen.findByRole('complementary', { name: /Mon 2 Nov/ }),
  ).toBeTruthy();
  expect(screen.queryByText(/Your date range applies/)).toBeNull();
  expect(screen.queryByText(/sit outside it/)).toBeNull();
  // The month total: 1,020.93 - 727.63 + 49.05.
  expect(screen.getAllByText('+$342.35').length).toBeGreaterThan(0);
  fireEvent.keyDown(cell, { key: 'ArrowRight' });
  expect(focused()).toMatch(/^Tue 3 Nov/);
  // Month navigation is free of the range.
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(window.location.search).toContain('month=2026-12');
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

test('Privacy hides the day panel profit factor', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: GRADED,
  });
  const { unmount } = renderApp(<CalendarView />, {
    repository,
    url: url('&day=2026-11-19'),
  });
  const shown = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  expect(shown.textContent).toMatch(/Profit factor\s*\d+\.\d\d/);
  unmount();
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<CalendarView />, { repository, url: url('&day=2026-11-19') });
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  await waitFor(() => expect(panel.textContent).toContain('hidden ratio'));
  expect(panel.textContent).not.toMatch(/Profit factor\s*\d/);
  expect(panel.textContent).toMatch(/Win rate\s*\d+(\.\d)?%/);
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
  const total = screen.getAllByTestId('week-total')[0]!;
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

test('C2: the stats menu offers Ticks, Pips and Points with no cap', async () => {
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
    ).toBe(false),
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

const RATED = [
  ['2026-11-02', 102093, { rating: 5 }],
  ['2026-11-03', -72763, { rating: undefined }],
  ['2026-11-19', 4405, { rating: 5 }],
  ['2026-11-19', 1000, { rating: 4 }],
  ['2026-11-19', -500, { rating: 4 }],
  ['2026-11-19', 200, { rating: undefined }],
] as [string, number, object?][];

test('Day rating: the cell shows the average of the rated trades to one decimal with a star, unrated trades left out', async () => {
  renderApp(<CalendarView />, { sample: withTrades(RATED), url: url() });
  const cell = await screen.findByRole('button', { name: /^Thu 19 Nov/ });
  // (5 + 4 + 4) / 3 = 4.33, and the unrated fourth trade is not a zero.
  expect(cell.textContent).toContain('4.3★');
  expect(cell.getAttribute('aria-label')).toContain('Day rating 4.3 of 5');
  const one = await screen.findByRole('button', { name: /^Mon 2 Nov/ });
  expect(one.textContent).toContain('5.0★');
});

test('Day rating: a traded day with nothing rated leaves the line out of the cell and says None in the panel', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(RATED),
    url: url('&day=2026-11-03'),
  });
  const cell = await screen.findByRole('button', { name: /^Tue 3 Nov/ });
  expect(cell.textContent).not.toContain('★');
  expect(cell.getAttribute('aria-label')).not.toContain('Day rating');
  const panel = await screen.findByRole('complementary', {
    name: /Tue 3 Nov/,
  });
  const term = within(panel).getByText('Day rating');
  expect(term.closest('div')!.textContent).toContain('None');
});

test('Day rating: the panel lists the average of the day', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(RATED),
    url: url('&day=2026-11-19'),
  });
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  expect(
    within(panel).getByText('Day rating').closest('div')!.textContent,
  ).toContain('4.3★');
});

test('Day rating: the new-prefs default is Net P&L, Trades, Win rate and Day rating; the menu offers it', async () => {
  expect(defaultPrefs().calendarStats).toEqual([
    'net',
    'trades',
    'winRate',
    'rating',
  ]);
  renderApp(<CalendarView />, { sample: withTrades(RATED), url: url() });
  await screen.findByRole('grid', { name: 'November 2026' });
  fireEvent.click(screen.getByRole('button', { name: 'Stats shown' }));
  const box = (await screen.findByRole('checkbox', {
    name: 'Day rating',
  })) as HTMLInputElement;
  expect(box.getAttribute('aria-checked') ?? String(box.checked)).toBe('true');
});

test('Day rating: an existing choice of stats is left alone, so no rating shows', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: withTrades(RATED),
  });
  await repository.prefs.update({ calendarStats: ['net', 'trades'] });
  renderApp(<CalendarView />, { repository, url: url() });
  const cell = await screen.findByRole('button', { name: /^Thu 19 Nov/ });
  expect(cell.textContent).not.toContain('★');
});

test('Day rating: Privacy leaves the rating readable, it is not money', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: withTrades(RATED),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<CalendarView />, { repository, url: url('&day=2026-11-19') });
  const cell = await screen.findByRole('button', { name: /^Thu 19 Nov/ });
  expect(cell.textContent).toContain('4.3★');
});

test('Day rating in the day panel carries a metric tip that says how it is worked out', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(RATED),
    url: url('&day=2026-11-19'),
  });
  const panel = await screen.findByRole('complementary', {
    name: /Thu 19 Nov/,
  });
  const tip = panel.querySelector('[data-metric-tip="day-rating"]');
  expect(tip).not.toBeNull();
  expect(metricDefinition('day-rating' as never, 'net').definition).toContain(
    'no rating',
  );
});

/** The SVG the open Calendar image panel previews. */
async function previewSvg(month = 'November 2026') {
  const img = await screen.findByRole('img', {
    name: `Preview of the ${month} calendar image`,
  });
  const src = img.getAttribute('src')!;
  return decodeURIComponent(src.slice(src.indexOf(',') + 1));
}

test('Snapshot sits in the month header beside Stats shown and Year view, and opens the Calendar image', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  const section = await screen.findByRole('region', { name: 'November 2026' });
  const snapshot = await within(section).findByRole('button', {
    name: 'Snapshot',
  });
  expect(snapshot.getAttribute('aria-haspopup')).toBe('dialog');
  // In the header's own row, after Stats shown and before Year view.
  const header = snapshot.parentElement!;
  expect(
    within(header).getByRole('button', { name: 'Stats shown' }),
  ).toBeTruthy();
  const order = [...header.querySelectorAll('button, a')].map(
    (el) => el.textContent?.trim() || el.getAttribute('aria-label'),
  );
  expect(order.indexOf('Stats shown')).toBeLessThan(order.indexOf('Snapshot'));
  expect(order.indexOf('Snapshot')).toBeLessThan(order.indexOf('Year view'));
  expect(screen.queryByRole('dialog', { name: 'Calendar image' })).toBeNull();

  fireEvent.click(snapshot);
  const panel = await screen.findByRole('dialog', { name: 'Calendar image' });
  expect(snapshot.getAttribute('aria-expanded')).toBe('true');
  const svg = await previewSvg();
  // The month as the grid shows it: each traded day, its trades, the week and its days, the month, the foot.
  for (const figure of ['+$1,020.93', '−$727.63', '+$49.05'])
    expect(svg).toContain(`>${figure}<`);
  expect(svg).toContain('>3 trades<');
  expect(svg).toContain('>Week 3<');
  expect(svg).toContain('>1 day<');
  expect(svg).toContain('+$342.35');
  expect(svg).toContain('3 trading days');
  expect(svg).toContain('Sample workspace, all accounts');
  expect(svg).toContain('>Keel<');
  expect(panel.textContent).toContain('keel-calendar-2026-11.png');
});

test('the image is the month shown: another month, another file', async () => {
  renderApp(<CalendarView />, {
    sample: withTrades(NOV),
    url: '/app/calendar?month=2026-10',
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Snapshot' }));
  const panel = await screen.findByRole('dialog', { name: 'Calendar image' });
  const svg = await previewSvg('October 2026');
  expect(svg).toContain('>October 2026<');
  expect(svg).not.toContain('1,020.93');
  expect(panel.textContent).toContain('keel-calendar-2026-10.png');
});

test('the image carries the chosen cell stats, and no more', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: withTrades(NOV),
  });
  await repository.prefs.update({ calendarStats: ['net'] });
  renderApp(<CalendarView />, { repository, url: url() });
  fireEvent.click(await screen.findByRole('button', { name: 'Snapshot' }));
  const svg = await previewSvg();
  expect(svg).toContain('>+$1,020.93<');
  expect(svg).not.toMatch(/\d trades?</);
  expect(svg).not.toContain('win rate');
});

test('the image follows a stat switched on while it is open', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  fireEvent.click(await screen.findByRole('button', { name: 'Snapshot' }));
  expect(await previewSvg()).toContain('>3 trades<');
  fireEvent.click(screen.getByRole('button', { name: 'Stats shown' }));
  const menu = await screen.findByRole('list', { name: 'Stats shown' });
  fireEvent.click(within(menu).getByRole('checkbox', { name: 'Trades' }));
  await waitFor(async () =>
    expect(await previewSvg()).not.toMatch(/\d trades?</),
  );
});

test('under Privacy the image carries no amount, and the caption says so', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: withTrades(NOV),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<CalendarView />, { repository, url: url() });
  fireEvent.click(await screen.findByRole('button', { name: 'Snapshot' }));
  const panel = await screen.findByRole('dialog', { name: 'Calendar image' });
  const svg = await previewSvg();
  expect(svg).not.toMatch(/\$\d/);
  expect(svg).toContain('+$•••');
  expect(panel.textContent).toContain('with amounts hidden');
});

test('the image follows the appearance: graphite when it is dark', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: withTrades(NOV),
  });
  await repository.prefs.update({ appearance: 'dark' });
  renderApp(<CalendarView />, { repository, url: url() });
  fireEvent.click(await screen.findByRole('button', { name: 'Snapshot' }));
  const svg = await previewSvg();
  expect(svg).toContain('#141414');
  expect(svg).not.toContain('#ffffff');
});

test('closing the panel hands focus back to Snapshot, and the panel leaves a day sheet and the grid alone', async () => {
  renderApp(<CalendarView />, { sample: withTrades(NOV), url: url() });
  const snapshot = await screen.findByRole('button', { name: 'Snapshot' });
  snapshot.focus();
  fireEvent.click(snapshot);
  const panel = await screen.findByRole('dialog', { name: 'Calendar image' });
  fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Calendar image' })).toBeNull(),
  );
  await waitFor(() => expect(document.activeElement).toBe(snapshot));
  expect(snapshot.getAttribute('aria-expanded')).toBe('false');
});

test('with no trades at all the Snapshot still opens: an empty month is a month', async () => {
  renderApp(<CalendarView />, { sample: withTrades([]), url: url() });
  fireEvent.click(await screen.findByRole('button', { name: 'Snapshot' }));
  const svg = await previewSvg();
  expect(svg).toContain('0 trading days');
  expect(svg.match(/>No trades</g)).toHaveLength(5);
});

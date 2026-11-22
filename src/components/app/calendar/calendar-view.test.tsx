// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
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
  const grid = await screen.findByRole('group', { name: 'November 2026' });
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

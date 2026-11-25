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
import { groupDays } from '@/data/day-log';
import { createLocalRepository } from '@/data/local/local-repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { MetricContext } from '@/domain/metrics/context';
import type { Trade, UserPrefs, WeekStart } from '@/domain/types';
import { FilterBar } from '../../filter-bar';
import { renderApp as render } from '../../__fixtures__/render-app';
import {
  CalendarSheetButton,
  MiniCalendar,
  TradesMiniCalendar,
} from './mini-calendar';
import { TradesDayView } from './day-view';
import { TradesWeekView } from './week-view';

vi.mock('next/navigation', () => import('../../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = fixtureSample().trades[0]!.workspaceId;

const trade = (p: Partial<Trade> & { net: number }): Trade =>
  makeTrade({ workspaceId: WS, accountId: 'acc-a', ...p });

const CTX: MetricContext = {
  timeZone: 'UTC',
  pnlBasis: 'net',
  breakevenRange: { unit: 'amount', from: 0, to: 0 },
};

/**
 * Tue 24 Nov: +$100, -$40 and an open trade (a gain day, 3 trades). Mon 23:
 * +$25. Fri 20: -$50 (a loss day). Thu 19: $0 (flat). Wed 18: one open trade
 * (no net). Tue 17: one euro trade only.
 */
function trades(): Trade[] {
  return [
    trade({
      id: 'a1',
      serial: 1,
      net: 10_000,
      openedAt: '2026-11-24T14:30:00Z',
      closedAt: '2026-11-24T14:50:00Z',
    }),
    trade({
      id: 'a2',
      serial: 2,
      net: -4000,
      openedAt: '2026-11-24T15:00:00Z',
      closedAt: '2026-11-24T15:20:00Z',
    }),
    trade({
      id: 'a3',
      serial: 3,
      status: 'open',
      net: 0,
      openedAt: '2026-11-24T16:00:00Z',
    }),
    trade({
      id: 'b1',
      serial: 4,
      net: 2500,
      openedAt: '2026-11-23T15:00:00Z',
      closedAt: '2026-11-23T15:30:00Z',
    }),
    trade({
      id: 'c1',
      serial: 5,
      net: -5000,
      openedAt: '2026-11-20T15:00:00Z',
      closedAt: '2026-11-20T15:30:00Z',
    }),
    trade({
      id: 'd1',
      serial: 6,
      net: 0,
      openedAt: '2026-11-19T15:00:00Z',
      closedAt: '2026-11-19T15:30:00Z',
    }),
    trade({
      id: 'e1',
      serial: 7,
      status: 'open',
      net: 0,
      openedAt: '2026-11-18T15:00:00Z',
    }),
    trade({
      id: 'f1',
      serial: 8,
      net: 900,
      pnlCurrency: 'EUR',
      openedAt: '2026-11-17T15:00:00Z',
      closedAt: '2026-11-17T15:30:00Z',
    }),
  ];
}

function groupsOf(list: Trade[], weekStart: WeekStart = 'sunday') {
  return groupDays(list, {
    timeZone: 'UTC',
    baseCurrency: 'USD',
    ctx: CTX,
    weekStart,
    noteDates: new Set(),
  });
}

function sample(list: Trade[] = trades()) {
  return async (): Promise<SampleWorkspace> => ({
    ...fixtureSample(),
    trades: list,
    journal: [],
    days: [],
  });
}

/** Renders over a repository whose prefs are set first (UTC, so a day reads as written). */
async function renderApp(
  ui: React.ReactElement,
  opts: { url?: string; prefs?: Partial<UserPrefs>; list?: Trade[] } = {},
) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(opts.list),
  });
  await repository.prefs.update({ timeZone: 'UTC', ...opts.prefs });
  return render(ui, { repository, url: opts.url ?? '/app/trades/day' });
}

const day = (name: RegExp | string) => screen.findByRole('button', { name });

function mini(props: Partial<Parameters<typeof MiniCalendar>[0]> = {}) {
  return (
    <MiniCalendar
      groups={groupsOf(trades())}
      today="2026-11-24"
      onPick={() => {}}
      weekStart="sunday"
      {...props}
    />
  );
}

test("underlines follow the net's sign, and flat days are neutral", async () => {
  await renderApp(mini());
  const tone = async (name: RegExp) =>
    (await day(name)).getAttribute('data-tone');
  expect(await tone(/^Tue 24 Nov/)).toBe('gain');
  expect(await tone(/^Mon 23 Nov/)).toBe('gain');
  expect(await tone(/^Fri 20 Nov/)).toBe('loss');
  // K39: a flat day is neutral, not green or red.
  expect(await tone(/^Thu 19 Nov/)).toBe('flat');
  // Keel's call: a day of open trades, or of another currency's, has no net and reads neutral.
  expect(await tone(/^Wed 18 Nov/)).toBe('flat');
  expect(await tone(/^Tue 17 Nov/)).toBe('flat');
  // A day with no trades has no underline.
  expect((await day(/^Thu 12 Nov/)).hasAttribute('data-tone')).toBe(false);
});

test('today is bold, and the selected day is marked', async () => {
  await renderApp(mini({ selected: '2026-11-23' }));
  expect((await day(/^Tue 24 Nov/)).getAttribute('aria-current')).toBe('date');
  expect((await day(/^Mon 23 Nov/)).getAttribute('aria-pressed')).toBe('true');
  expect((await day(/^Tue 24 Nov/)).getAttribute('aria-pressed')).toBe('false');
});

test('the month title and arrows change the month, starting on the selected day, else today', async () => {
  await renderApp(mini({ selected: '2026-10-14', today: '2026-11-24' }));
  expect(await screen.findByText('October 2026')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(screen.getByText('November 2026')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(screen.getByText('December 2026')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByText('September 2026')).toBeTruthy();
  cleanup();
  // With nothing selected it opens on today's month.
  await renderApp(mini());
  expect(await screen.findByText('November 2026')).toBeTruthy();
});

test('the weekday header follows the week-start preference', async () => {
  await renderApp(
    mini({ weekStart: 'monday', groups: groupsOf(trades(), 'monday') }),
  );
  const header = await screen.findByTestId('mini-weekdays');
  expect(header.textContent).toBe('MonTueWedThuFriSatSun');
  cleanup();
  await renderApp(mini());
  expect((await screen.findByTestId('mini-weekdays')).textContent).toBe(
    'SunMonTueWedThuFriSat',
  );
});

test('hover and focus preview the day net and count', async () => {
  await renderApp(mini());
  const button = await day(/^Tue 24 Nov/);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.mouseEnter(button);
  const tip = await screen.findByRole('tooltip');
  expect(tip.textContent).toBe('Tue 24 Nov+$60.00, 3 trades');
  fireEvent.mouseLeave(button);
  expect(screen.queryByRole('tooltip')).toBeNull();
  // Focus shows it too, and Escape hides it.
  fireEvent.focus(button);
  expect((await screen.findByRole('tooltip')).textContent).toContain('+$60.00');
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
  // A day with no trades previews nothing.
  fireEvent.mouseEnter(await day(/^Thu 12 Nov/));
  expect(screen.queryByRole('tooltip')).toBeNull();
  // A day with no closed trade reads None.
  fireEvent.mouseEnter(await day(/^Wed 18 Nov/));
  expect((await screen.findByRole('tooltip')).textContent).toBe(
    'Wed 18 NovNone, 1 trade',
  );
});

test('hover previews net and count, masked under Privacy: the sign and the count stay, the amount does not', async () => {
  await renderApp(mini(), { prefs: { displayUnit: 'privacy' } });
  const button = await day(/^Tue 24 Nov/);
  await waitFor(() =>
    expect(button.getAttribute('aria-label')).toBe(
      'Tue 24 Nov, hidden amount, 3 trades',
    ),
  );
  fireEvent.mouseEnter(button);
  const tip = await screen.findByRole('tooltip');
  expect(tip.textContent).toBe('Tue 24 Nov+$•••, 3 trades');
  expect(document.body.innerHTML).not.toMatch(/\$\d/);
  fireEvent.mouseLeave(button);
  fireEvent.mouseEnter(await day(/^Fri 20 Nov/));
  expect((await screen.findByRole('tooltip')).textContent).toContain('−$•••');
});

test('a click picks the day', async () => {
  const onPick = vi.fn();
  await renderApp(mini({ onPick }));
  fireEvent.click(await day(/^Mon 23 Nov/));
  expect(onPick).toHaveBeenCalledWith('2026-11-23');
});

test('arrow keys move across days and months, with one tab stop', async () => {
  await renderApp(mini({ selected: '2026-11-24' }));
  const start = await day(/^Tue 24 Nov/);
  // The tab stop is the selected day; the others are out of the tab order.
  expect(start.tabIndex).toBe(0);
  expect((await day(/^Mon 23 Nov/)).tabIndex).toBe(-1);
  start.focus();
  fireEvent.keyDown(start, { key: 'ArrowRight' });
  await waitFor(() =>
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      /^Wed 25 Nov/,
    ),
  );
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
  await waitFor(() =>
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      /^Wed 2 Dec/,
    ),
  );
  expect(screen.getByText('December 2026')).toBeTruthy();
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
  await waitFor(() =>
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      /^Tue 1 Dec/,
    ),
  );
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
  await waitFor(() =>
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      /^Mon 30 Nov/,
    ),
  );
  expect(screen.getByText('November 2026')).toBeTruthy();
});

/** The connected calendar beside the Day view, and the filter bar's chips. */
function Page(): React.JSX.Element {
  return (
    <>
      <FilterBar />
      <TradesDayView aside={<TradesMiniCalendar />} />
    </>
  );
}

const cardHeadings = async () =>
  (await screen.findAllByRole('article')).map(
    (c) => within(c).getByRole('heading').textContent,
  );

test('a pick filters to the day and the chip can clear it', async () => {
  await renderApp(<Page />);
  expect(await cardHeadings()).toEqual([
    'Tue 24 Nov 2026',
    'Mon 23 Nov 2026',
    'Fri 20 Nov 2026',
    'Thu 19 Nov 2026',
    'Wed 18 Nov 2026',
    'Tue 17 Nov 2026',
  ]);
  const aside = await screen.findByRole('complementary', {
    name: 'November 2026',
  });
  fireEvent.click(within(aside).getByRole('button', { name: /^Mon 23 Nov/ }));
  // The URL gets equal from and to.
  await waitFor(() =>
    expect(window.location.search).toBe('?from=2026-11-23&to=2026-11-23'),
  );
  await waitFor(async () =>
    expect(await cardHeadings()).toEqual(['Mon 23 Nov 2026']),
  );
  expect(
    within(aside)
      .getByRole('button', { name: /^Mon 23 Nov/ })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  // R23: the other days stay underlined, so another can be picked.
  expect(
    within(aside)
      .getByRole('button', { name: /^Tue 24 Nov/ })
      .getAttribute('data-tone'),
  ).toBe('gain');
  // The date chip shows the day and clears it.
  const chip = within(screen.getByRole('group', { name: 'Filters' })).getByRole(
    'button',
    { name: /23 Nov 2026/ },
  );
  fireEvent.click(chip);
  fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
  await waitFor(() => expect(window.location.search).toBe(''));
  await waitFor(async () => expect(await cardHeadings()).toHaveLength(6));
  expect(
    within(aside)
      .getByRole('button', { name: /^Mon 23 Nov/ })
      .getAttribute('aria-pressed'),
  ).toBe('false');
});

test('the calendar follows a day picked in the address, and keeps the other filters', async () => {
  await renderApp(<Page />, {
    url: '/app/trades/day?from=2026-10-12&to=2026-10-12&side=long',
  });
  const aside = await screen.findByRole('complementary', {
    name: 'October 2026',
  });
  expect(
    within(aside)
      .getByRole('button', { name: /^Mon 12 Oct/ })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.click(within(aside).getByRole('button', { name: 'Next month' }));
  fireEvent.click(await screen.findByRole('button', { name: /^Tue 24 Nov/ }));
  await waitFor(() =>
    expect(window.location.search).toBe(
      '?from=2026-11-24&to=2026-11-24&side=long',
    ),
  );
});

test('every filter but the date range reads in the calendar: a side filter leaves the other side out', async () => {
  const list = [
    trade({
      id: 'l1',
      serial: 1,
      direction: 'long',
      net: 1000,
      openedAt: '2026-11-23T15:00:00Z',
      closedAt: '2026-11-23T15:30:00Z',
    }),
    trade({
      id: 's1',
      serial: 2,
      direction: 'short',
      net: 2000,
      openedAt: '2026-11-20T15:00:00Z',
      closedAt: '2026-11-20T15:30:00Z',
    }),
  ];
  await renderApp(<Page />, { list, url: '/app/trades/day?side=long' });
  const aside = await screen.findByRole('complementary', {
    name: 'November 2026',
  });
  expect(
    within(aside)
      .getByRole('button', { name: /^Mon 23 Nov/ })
      .getAttribute('data-tone'),
  ).toBe('gain');
  expect(
    within(aside)
      .getByRole('button', { name: /^Fri 20 Nov/ })
      .hasAttribute('data-tone'),
  ).toBe(false);
});

function phoneMedia() {
  return vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

test('on a phone the Calendar button opens the calendar as a sheet, and a pick closes it and filters', async () => {
  const match = phoneMedia();
  await renderApp(
    <TradesDayView
      aside={<TradesMiniCalendar />}
      calendarAction={<CalendarSheetButton />}
    />,
  );
  await screen.findAllByRole('article');
  // No column on a phone: the calendar waits behind its button.
  expect(screen.queryByRole('button', { name: /^Mon 23 Nov/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Calendar' });
  fireEvent.click(
    await within(dialog).findByRole('button', { name: /^Mon 23 Nov/ }),
  );
  await waitFor(() =>
    expect(window.location.search).toBe('?from=2026-11-23&to=2026-11-23'),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  match.mockRestore();
});

test('the Calendar button sits first in the phone action row, before Plan the day', async () => {
  const match = phoneMedia();
  await renderApp(
    <TradesDayView
      aside={<TradesMiniCalendar />}
      calendarAction={<CalendarSheetButton />}
    />,
  );
  await screen.findAllByRole('article');
  const calendar = screen.getByRole('button', { name: 'Calendar' });
  const plan = screen.getByRole('button', { name: 'Plan the day' });
  expect(
    calendar.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  match.mockRestore();
});

test('the Week view carries the calendar too, and a pick filters its weeks to that day', async () => {
  await renderApp(
    <>
      <FilterBar />
      <TradesWeekView aside={<TradesMiniCalendar />} />
    </>,
    { url: '/app/trades/week' },
  );
  const aside = await screen.findByRole('complementary', {
    name: 'November 2026',
  });
  // Two weeks hold the trades (Sun 15 to Sat 21, Sun 22 to Sat 28).
  expect(await screen.findAllByRole('article')).toHaveLength(2);
  fireEvent.click(within(aside).getByRole('button', { name: /^Fri 20 Nov/ }));
  await waitFor(() =>
    expect(window.location.search).toBe('?from=2026-11-20&to=2026-11-20'),
  );
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
  // The other days stay underlined, so a click on another moves on.
  expect(
    within(aside)
      .getByRole('button', { name: /^Tue 24 Nov/ })
      .getAttribute('data-tone'),
  ).toBe('gain');
});

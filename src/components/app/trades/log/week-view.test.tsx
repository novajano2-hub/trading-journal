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
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import { WEEK_COLUMNS } from '@/data/trade-columns';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { Trade, UserPrefs } from '@/domain/types';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import { resolveInstrument } from '@/domain/instruments';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { act } from '@testing-library/react';
import { commitNavigation } from '../../__fixtures__/navigation';
import { renderApp as render } from '../../__fixtures__/render-app';
import { TradesWeekView } from './week-view';

vi.mock('next/navigation', () => import('../../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = fixtureSample().trades[0]!.workspaceId;

const trade = (p: Partial<Trade> & { net: number }): Trade =>
  makeTrade({ workspaceId: WS, accountId: 'acc-a', ...p });

/**
 * Week of Sun 22 Nov: Mon 23 +$25; Tue 24 +$100, -$40 and an open trade.
 * Week of Sun 8 Nov: Wed 11 -$30. Nothing in the week of 15 Nov.
 */
function trades(): Trade[] {
  return [
    trade({
      id: 'a1',
      serial: 1,
      net: 10_000,
      fees: 1000,
      openedAt: '2026-11-24T14:30:00Z',
      closedAt: '2026-11-24T14:50:00Z',
    }),
    trade({
      id: 'a2',
      serial: 2,
      net: -4000,
      fees: 500,
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
      net: -3000,
      openedAt: '2026-11-11T15:00:00Z',
      closedAt: '2026-11-11T15:30:00Z',
    }),
  ];
}

function sample(list: Trade[] = trades()) {
  return async (): Promise<SampleWorkspace> => ({
    ...fixtureSample(),
    trades: list,
    journal: [],
    days: [],
  });
}

async function renderApp(
  ui: React.ReactElement,
  opts: {
    sample?: () => Promise<SampleWorkspace>;
    url?: string;
    prefs?: Partial<UserPrefs>;
    /** Replaces parts of the repository, to make a query fail. */
    patch?: (repo: Repository) => Partial<Repository>;
  } = {},
) {
  const base = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: opts.sample ?? sample(),
  });
  await base.prefs.update({ timeZone: 'UTC', ...opts.prefs });
  const repository = { ...base, ...opts.patch?.(base) };
  const out = render(ui, {
    repository,
    url: opts.url ?? '/app/trades/week',
  });
  return { ...out, repo: repository };
}

const cards = () => screen.findAllByRole('article');
const heading = (card: HTMLElement) =>
  within(card).getByRole('heading').textContent;

test('weeks with trades only, latest first, the first expanded', async () => {
  await renderApp(<TradesWeekView />);
  const list = await cards();
  // The week of 15 Nov has no trades, so it has no card (K41).
  expect(list.map(heading)).toEqual(['22 to 28 Nov 2026', '8 to 14 Nov 2026']);
  const first = within(list[0]!).getByRole('button', {
    name: 'Collapse 22 to 28 Nov 2026',
  });
  expect(first.getAttribute('aria-expanded')).toBe('true');
  const second = within(list[1]!).getByRole('button', {
    name: 'Expand 8 to 14 Nov 2026',
  });
  expect(second.getAttribute('aria-expanded')).toBe('false');
  // Only the first week's table is shown, with its four trades.
  const table = within(list[0]!).getByRole('table', {
    name: 'Trades in 22 to 28 Nov 2026',
  });
  expect(within(table).getAllByRole('row')).toHaveLength(5);
  expect(within(list[1]!).queryByRole('table')).toBeNull();
  // The header holds the span and the net only: 25 + 60 net of the closed trades.
  expect(within(list[0]!).getByRole('heading').parentElement!.textContent).toBe(
    '22 to 28 Nov 2026Net P&L +$85.00',
  );
  // A collapsed card still shows its tiles, bars and figures.
  expect(
    within(list[1]!).getByRole('img', { name: /Net P&L by day/ }),
  ).toBeTruthy();
  expect(within(list[1]!).getByText('Win rate')).toBeTruthy();
  // The chevron opens it.
  fireEvent.click(second);
  expect(
    await within(list[1]!).findByRole('table', {
      name: 'Trades in 8 to 14 Nov 2026',
    }),
  ).toBeTruthy();
});

test('tiles follow the week start', async () => {
  await renderApp(<TradesWeekView />);
  const sunday = (await cards())[0]!;
  const tiles = (card: HTMLElement) =>
    within(within(card).getByRole('list', { name: /^Days of/ }))
      .getAllByRole('listitem')
      .map((li) => li.textContent!.slice(0, 6));
  expect(tiles(sunday)).toEqual([
    'Sun 22',
    'Mon 23',
    'Tue 24',
    'Wed 25',
    'Thu 26',
    'Fri 27',
    'Sat 28',
  ]);
  cleanup();
  await renderApp(<TradesWeekView />, { prefs: { weekStart: 'monday' } });
  const monday = (await cards())[0]!;
  expect(heading(monday)).toBe('23 to 29 Nov 2026');
  expect(tiles(monday)[0]).toBe('Mon 23');
  expect(tiles(monday)[6]).toBe('Sun 29');
});

test('a tile without trades is not a button', async () => {
  await renderApp(<TradesWeekView />);
  const first = (await cards())[0]!;
  const list = within(first).getByRole('list', { name: /^Days of/ });
  const sunday = within(list).getAllByRole('listitem')[0]!;
  expect(sunday.textContent).toBe('Sun 22');
  expect(within(sunday).queryByRole('button')).toBeNull();
  expect(within(list).queryByText('No trades')).toBeNull();
  // Tue and Mon are buttons, with the net and the count in their names.
  expect(
    within(list).getByRole('button', { name: 'Tue 24 Nov, +$60.00, 3 trades' }),
  ).toBeTruthy();
  expect(
    within(list).getByRole('button', { name: 'Mon 23 Nov, +$25.00, 1 trade' }),
  ).toBeTruthy();
  expect(within(list).getAllByRole('button')).toHaveLength(2);
});

test("a tile opens that day's card body", async () => {
  await renderApp(<TradesWeekView />);
  const first = (await cards())[0]!;
  fireEvent.click(
    within(first).getByRole('button', {
      name: 'Tue 24 Nov, +$60.00, 3 trades',
    }),
  );
  const dialog = await screen.findByRole('dialog', { name: /Tue 24 Nov 2026/ });
  expect(within(dialog).getByText('Gross P&L')).toBeTruthy();
  expect(
    within(dialog).getByText('Gross P&L').closest('div')!.querySelector('dd')!
      .textContent,
  ).toBe('+$75.00');
  // The day's table has the Day view's columns: no Day column.
  const table = within(dialog).getByRole('table', {
    name: 'Trades on Tue 24 Nov 2026',
  });
  const headers = within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(headers).not.toContain('Day');
  expect(headers[0]).toBe('Open');
  expect(within(table).getAllByRole('row')).toHaveLength(4);
  // No Review link on the dialog (the record shows none).
  expect(within(dialog).queryByRole('link', { name: /Review/ })).toBeNull();
  // The tile is still the week's own: Escape closes it.
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test("a one-day filter fills one tile while the table keeps the week's other days", async () => {
  await renderApp(<TradesWeekView />, {
    url: '/app/trades/week?from=2026-11-23&to=2026-11-23',
  });
  const list = await cards();
  expect(list.map(heading)).toEqual(['22 to 28 Nov 2026']);
  const card = list[0]!;
  const tiles = within(card).getByRole('list', { name: /^Days of/ });
  // Only Monday is filled.
  expect(within(tiles).getAllByRole('button')).toHaveLength(1);
  expect(
    within(tiles).getByRole('button', { name: 'Mon 23 Nov, +$25.00, 1 trade' }),
  ).toBeTruthy();
  // The figures cover the filtered trade.
  expect(
    within(card).getByText('Trades').closest('div')!.querySelector('dd')!
      .textContent,
  ).toBe('1');
  // The table lists the whole week: Tuesday's three trades and Monday's one.
  const table = within(card).getByRole('table', {
    name: 'Trades in 22 to 28 Nov 2026',
  });
  expect(within(table).getAllByRole('row')).toHaveLength(5);
  expect(table.textContent).toContain('Tue 24');
});

test('weekColumns has Day by default and is saved apart from the Day view', async () => {
  expect(WEEK_COLUMNS[0]).toBe('day');
  await renderApp(<TradesWeekView />);
  const first = (await cards())[0]!;
  const table = within(first).getByRole('table', {
    name: 'Trades in 22 to 28 Nov 2026',
  });
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
      .slice(0, 3),
  ).toEqual(['Day', 'Open', 'Ticker']);
  cleanup();
  await renderApp(<TradesWeekView />, {
    prefs: { weekColumns: ['net', 'day'], dayColumns: ['open'] },
  });
  const again = (await cards())[0]!;
  expect(
    within(
      within(again).getByRole('table', { name: 'Trades in 22 to 28 Nov 2026' }),
    )
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual(['Net P&L', 'Day']);
});

test('a flat day, a day with nothing closed and a trend glyph for each sign', async () => {
  await renderApp(<TradesWeekView />, {
    sample: sample([
      ...trades(),
      trade({
        id: 'f1',
        serial: 8,
        net: 0,
        openedAt: '2026-11-26T15:00:00Z',
        closedAt: '2026-11-26T15:30:00Z',
      }),
      trade({
        id: 'o1',
        serial: 9,
        status: 'open',
        net: 0,
        openedAt: '2026-11-27T15:00:00Z',
      }),
    ]),
  });
  const first = (await cards())[0]!;
  const tiles = within(first).getByRole('list', { name: /^Days of/ });
  const thu = within(tiles).getByRole('button', { name: /^Thu 26 Nov/ });
  expect(thu.getAttribute('aria-label')).toBe('Thu 26 Nov, $0.00, 1 trade');
  const fri = within(tiles).getByRole('button', { name: /^Fri 27 Nov/ });
  expect(fri.getAttribute('aria-label')).toBe(
    'Fri 27 Nov, no closed trades, 1 trade',
  );
  expect(
    within(tiles)
      .getByRole('button', { name: /^Tue 24 Nov/ })
      .getAttribute('data-trend'),
  ).toBe('up');
  expect(thu.getAttribute('data-trend')).toBe('flat');
});

test('the bars are one image labelled with every day, and a focus reads one', async () => {
  await renderApp(<TradesWeekView />);
  const first = (await cards())[0]!;
  const bars = within(first).getByRole('img', {
    name: /^Net P&L by day, 22 to 28 Nov 2026/,
  });
  const label = bars.getAttribute('aria-label')!;
  expect(label).toContain('Mon +$25.00');
  expect(label).toContain('Tue +$60.00');
  expect(label).toContain('Wed none');
  fireEvent.focus(bars);
  expect(await within(first).findByRole('status')).toBeTruthy();
  expect(within(first).getByRole('status').textContent).toContain('Mon 23 Nov');
  fireEvent.keyDown(bars, { key: 'ArrowRight' });
  await waitFor(() =>
    expect(within(first).getByRole('status').textContent).toContain(
      'Tue 24 Nov',
    ),
  );
});

test('Privacy hides every amount, in names and labels too', async () => {
  const { container } = await renderApp(<TradesWeekView />, {
    prefs: { displayUnit: 'privacy' },
  });
  const first = (await cards())[0]!;
  const tiles = within(first).getByRole('list', { name: /^Days of/ });
  const names = within(tiles)
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label')!);
  expect(names.length).toBe(2);
  for (const n of names) expect(n).not.toMatch(/\d{2}\.\d{2}|\$\d/);
  expect(
    within(first).getByRole('heading').parentElement!.textContent,
  ).not.toMatch(/\d{2}\.\d{2}/);
  // The bars' label, a focus readout and the tile dialog.
  const bars = within(first).getByRole('img', { name: /Net P&L by day/ });
  fireEvent.focus(bars);
  expect(await within(first).findByRole('status')).toBeTruthy();
  fireEvent.click(within(tiles).getAllByRole('button')[1]!);
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).not.toMatch(/\$\d/);
  // Nothing anywhere in the page, text or attribute: a dollar sign is never followed by a digit.
  expect(container.ownerDocument.body.innerHTML).not.toMatch(/\$\d/);
  expect(container.ownerDocument.body.innerHTML).not.toMatch(
    /aria-label="[^"]*\d{2}\.\d{2}/,
  );
});

test('a day with only other-currency trades keeps the Day view call and lists them apart', async () => {
  await renderApp(<TradesWeekView />, {
    sample: sample([
      ...trades(),
      trade({
        id: 'e1',
        serial: 9,
        net: 5000,
        pnlCurrency: 'EUR',
        openedAt: '2026-11-26T13:00:00Z',
        closedAt: '2026-11-26T13:10:00Z',
      }),
    ]),
  });
  const first = (await cards())[0]!;
  const tiles = within(first).getByRole('list', { name: /^Days of/ });
  const thu = within(tiles).getByRole('button', { name: /^Thu 26 Nov/ });
  expect(thu.getAttribute('aria-label')).toBe(
    'Thu 26 Nov, 1 trade in other currencies',
  );
  expect(
    within(first).getByRole('heading').parentElement!.textContent,
  ).toContain('+$85.00');
  const other = within(first).getByRole('table', {
    name: 'Trades in other currencies in 22 to 28 Nov 2026',
  });
  expect(other.textContent).toContain('€');
  fireEvent.click(thu);
  const dialog = await screen.findByRole('dialog', { name: /Thu 26 Nov 2026/ });
  expect(dialog.textContent).toContain('1 trade in other currencies');
  // The dialog's own description reads the count as the trades, not as "0 trades, 1 in other currencies".
  const described = document.getElementById(
    dialog.getAttribute('aria-describedby')!,
  )!;
  expect(described.textContent).toBe(
    '1 trade in other currencies, listed apart',
  );
  expect(dialog.textContent).not.toContain('0 trades');
});

test('weeks load 8 at a time with a Show more button', async () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    trade({
      id: `w${i}`,
      serial: 100 + i,
      net: 1000,
      openedAt: new Date(Date.UTC(2026, 10, 24 - 7 * i, 15)).toISOString(),
      closedAt: new Date(Date.UTC(2026, 10, 24 - 7 * i, 16)).toISOString(),
    }),
  );
  await renderApp(<TradesWeekView />, { sample: sample(many) });
  expect(await cards()).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(10));
  expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
});

test('the empty states and the switch', async () => {
  await renderApp(<TradesWeekView />, {
    sample: sample([]),
  });
  expect(await screen.findByText('No trades yet.')).toBeTruthy();
  cleanup();
  await renderApp(<TradesWeekView />, {
    url: '/app/trades/week?symbol=ZZZ&side=long',
  });
  expect(
    await screen.findByText('No trades match these filters.'),
  ).toBeTruthy();
  const nav = screen.getByRole('navigation', { name: 'Trade views' });
  expect(
    within(nav)
      .getByRole('link', { name: 'Week' })
      .getAttribute('aria-current'),
  ).toBe('page');
  expect(
    within(nav).getByRole('link', { name: 'Day' }).getAttribute('href'),
  ).toBe('/app/trades/day?symbol=ZZZ&side=long');
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(await cards()).toHaveLength(2);
});

test('below sm: seven narrow tiles with a compact net, the count in the label', async () => {
  const match = vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  await renderApp(<TradesWeekView />);
  const first = (await cards())[0]!;
  const tiles = within(first).getByRole('list', { name: /^Days of/ });
  const items = within(tiles).getAllByRole('listitem');
  expect(items).toHaveLength(7);
  expect(items[0]!.textContent).toBe('S22');
  expect(items[2]!.textContent).toBe('T24+60');
  expect(
    within(tiles).getByRole('button', {
      name: 'Tue 24 Nov, +$60.00, 3 trades',
    }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull();
  match.mockRestore();
});

const nq = () => resolveInstrument('NQZ5')!;

test('a symbol plus one day still honours the symbol in the week table', async () => {
  const list = [
    ...trades(),
    trade({
      id: 'n1',
      serial: 6,
      net: 700,
      instrument: nq(),
      openedAt: '2026-11-24T17:00:00Z',
      closedAt: '2026-11-24T17:10:00Z',
    }),
  ];
  await renderApp(<TradesWeekView />, {
    sample: sample(list),
    url: '/app/trades/week?from=2026-11-23&to=2026-11-23&symbol=ES',
  });
  const card = (await cards())[0]!;
  const table = within(card).getByRole('table', {
    name: 'Trades in 22 to 28 Nov 2026',
  });
  // The week's other ES days are listed (Tuesday's three), but not the NQ trade.
  expect(within(table).getAllByRole('row')).toHaveLength(5);
  expect(table.textContent).toContain('ES');
  expect(table.textContent).not.toContain('NQ');
});

test('the week table pages at 50 rows', async () => {
  const many = Array.from({ length: 60 }, (_, i) =>
    trade({
      id: `r${i}`,
      serial: 100 + i,
      net: 100,
      openedAt: new Date(Date.UTC(2026, 10, 24, 12, i)).toISOString(),
      closedAt: new Date(Date.UTC(2026, 10, 24, 12, i, 30)).toISOString(),
    }),
  );
  await renderApp(<TradesWeekView />, { sample: sample(many) });
  const first = (await cards())[0]!;
  const table = within(first).getByRole('table', {
    name: 'Trades in 22 to 28 Nov 2026',
  });
  expect(within(table).getAllByRole('row')).toHaveLength(51);
  fireEvent.click(
    within(first).getByRole('button', {
      name: 'Show more, Trades in 22 to 28 Nov 2026',
    }),
  );
  await waitFor(() =>
    expect(within(table).getAllByRole('row')).toHaveLength(61),
  );
});

test('a failed load shows the error, not the skeleton for ever', async () => {
  await renderApp(<TradesWeekView />, {
    patch: (r) => ({
      tagCategories: {
        ...r.tagCategories,
        list: () => Promise.reject(new Error('boom')),
      },
    }),
  });
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("Your trades couldn't load.");
});

test('a trade lands on its local week in the profile zone (New York, a close after 00:00 UTC)', async () => {
  // 02:00 UTC on Sun 22 Nov is 21:00 on Sat 21 Nov in New York: the week before.
  await renderApp(<TradesWeekView />, {
    sample: sample([
      trade({
        id: 'sat',
        serial: 1,
        net: 5000,
        openedAt: '2026-11-22T01:30:00Z',
        closedAt: '2026-11-22T02:00:00Z',
      }),
    ]),
    prefs: { timeZone: 'America/New_York' },
  });
  expect((await cards()).map(heading)).toEqual(['15 to 21 Nov 2026']);
  const tiles = within((await cards())[0]!).getByRole('list', {
    name: /^Days of/,
  });
  expect(
    within(tiles).getByRole('button', { name: /^Sat 21 Nov/ }),
  ).toBeTruthy();
});

test('the tile and its dialog count the same trades, other currencies apart', async () => {
  await renderApp(<TradesWeekView />, {
    sample: sample([
      ...trades(),
      trade({
        id: 'e2',
        serial: 10,
        net: 5000,
        pnlCurrency: 'EUR',
        openedAt: '2026-11-24T13:00:00Z',
        closedAt: '2026-11-24T13:10:00Z',
      }),
    ]),
  });
  const first = (await cards())[0]!;
  const tue = within(first).getByRole('button', { name: /^Tue 24 Nov/ });
  expect(tue.getAttribute('aria-label')).toBe('Tue 24 Nov, +$60.00, 3 trades');
  fireEvent.click(tue);
  const dialog = await screen.findByRole('dialog', { name: /Tue 24 Nov 2026/ });
  expect(dialog.textContent).toContain(
    '3 trades, 1 in other currencies, listed apart',
  );
});

test('the expanded weeks start again when the filters change', async () => {
  await renderApp(<TradesWeekView />);
  const list = await cards();
  fireEvent.click(
    within(list[1]!).getByRole('button', { name: 'Expand 8 to 14 Nov 2026' }),
  );
  await within(list[1]!).findByRole('table');
  act(() => {
    window.history.replaceState(null, '', '/app/trades/week?symbol=ES');
    commitNavigation();
  });
  await waitFor(() =>
    expect(
      within(screen.getAllByRole('article')[1]!).queryByRole('table'),
    ).toBeNull(),
  );
  expect(
    within(screen.getAllByRole('article')[1]!)
      .getByRole('button', { name: /8 to 14 Nov 2026/ })
      .getAttribute('aria-expanded'),
  ).toBe('false');
});

test('the bars readout is announced beside the image, not inside it', async () => {
  await renderApp(<TradesWeekView />);
  const first = (await cards())[0]!;
  const bars = within(first).getByRole('img', { name: /Net P&L by day/ });
  fireEvent.focus(bars);
  const status = await within(first).findByRole('status');
  expect(bars.contains(status)).toBe(false);
});

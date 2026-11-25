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
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { DayRecord, JournalEntry, Trade } from '@/domain/types';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { renderApp as render } from '../../__fixtures__/render-app';
import type { UserPrefs } from '@/domain/types';
import { TradesDayView } from './day-view';

vi.mock('next/navigation', () => import('../../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = fixtureSample().trades[0]!.workspaceId;

const trade = (p: Partial<Trade> & { net: number }): Trade =>
  makeTrade({ workspaceId: WS, accountId: 'acc-a', ...p });

/** Tue 24 Nov: +$100, -$40 (closed) and one open trade; fees $10 and $5. Mon 23 Nov: +$25. */
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
  ];
}

const dailyNote = (date: string, extra: Partial<JournalEntry> = {}) =>
  ({
    id: `note-${date}`,
    workspaceId: WS,
    kind: 'daily-review',
    date,
    title: date,
    body: {},
    linkedTradeIds: [],
    tags: [],
    updatedAt: '2026-11-25T00:00:00Z',
    ...extra,
  }) satisfies JournalEntry;

function sample(
  opts: {
    trades?: Trade[];
    journal?: JournalEntry[];
    days?: DayRecord[];
  } = {},
) {
  return async (): Promise<SampleWorkspace> => ({
    ...fixtureSample(),
    trades: opts.trades ?? trades(),
    journal: opts.journal ?? [dailyNote('2026-11-22')],
    days: opts.days ?? [
      { id: '2026-11-24', workspaceId: WS, mood: { value: 4 } },
    ],
  });
}

/** Renders over a repository whose prefs are set first (UTC, so a clock reads as written). */
async function renderApp(
  ui: React.ReactElement,
  opts: {
    sample: () => Promise<SampleWorkspace>;
    url: string;
    prefs?: Partial<UserPrefs>;
    /** Replaces parts of the repository, to make a query fail. */
    patch?: (repo: Repository) => Partial<Repository>;
  },
) {
  const base = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: opts.sample,
  });
  await base.prefs.update({ timeZone: 'UTC', ...opts.prefs });
  const repository = { ...base, ...opts.patch?.(base) };
  const out = render(ui, { repository, url: opts.url });
  return { ...out, repo: repository };
}

const cards = () => screen.findAllByRole('article');
const heading = (card: HTMLElement) =>
  within(card).getByRole('heading').textContent;

test('cards run newest first, start collapsed and expand to the table', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const list = await cards();
  expect(list.map(heading)).toEqual([
    'Tue 24 Nov 2026',
    'Mon 23 Nov 2026',
    'Sun 22 Nov 2026',
  ]);
  expect(screen.queryByRole('table')).toBeNull();
  const toggle = within(list[0]!).getByRole('button', {
    name: 'Expand Tue 24 Nov 2026',
  });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  const table = await screen.findByRole('table', {
    name: 'Trades on Tue 24 Nov 2026',
  });
  // Newest open time first: the open trade, then 15:00, then 14:30.
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(3);
  expect(rows[0]!.textContent).toContain('(open)');
  expect(
    within(list[0]!)
      .getByRole('button', { name: 'Collapse Tue 24 Nov 2026' })
      .getAttribute('aria-expanded'),
  ).toBe('true');
});

test('the card header shows net after costs whatever the P&L basis', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
    prefs: { pnlBasis: 'gross' },
  });
  const first = (await cards())[0]!;
  expect(
    within(first).getByText('Gross P&L').closest('div')!.querySelector('dd')!
      .textContent,
  ).toBe('+$75.00');
  await waitFor(() => {
    // Net after costs: 100 - 40 = $60.00; gross would be $75.00 and sits in the grid.
    expect(
      within(first).getByRole('heading').parentElement!.textContent,
    ).toContain('+$60.00');
  });
  expect(
    within(first).getByRole('heading').parentElement!.textContent,
  ).not.toContain('75.00');
});

test('the stat grid matches day-log', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  const value = (name: string) =>
    within(first).getByText(name).closest('div')!.querySelector('dd')!
      .textContent;
  expect(value('Trades')).toBe('3');
  expect(value('Gross P&L')).toBe('+$75.00');
  expect(value('Won / lost')).toBe('1 / 1');
  expect(value('Commissions')).toBe('$15.00');
  expect(value('Win rate')).toBe('50.0%');
  // Both sides: two closed trades of one contract (2 each) and one open (1).
  expect(value('Volume')).toBe('5');
  expect(value('Profit factor')).toBe('2.50');
});

test('chart hover reads the trade and the running net', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  const chart = within(first).getByRole('button', {
    name: /Enlarge the chart/,
  });
  fireEvent.focus(chart);
  // 15:20 is the last point.
  expect(within(first).getByRole('status').textContent).toMatch(
    /^15:20, ES .* [−-]\$40\.00, running net \+\$60\.00$/,
  );
  fireEvent.keyDown(chart, { key: 'ArrowLeft' });
  expect(within(first).getByRole('status').textContent).toMatch(
    /^14:50, ES .* \+\$100\.00, running net \+\$100\.00$/,
  );
  // The picture itself carries the range and the key values.
  const label = within(first).getByRole('img').getAttribute('aria-label')!;
  expect(label).toContain('from 14:30 to 15:20');
  expect(label).toContain('ending +$60.00');
});

test('Privacy hides money on cards, chart labels and readouts', async () => {
  const { container } = await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
    prefs: { displayUnit: 'privacy' },
  });
  await cards();
  const first = (await cards())[0]!;
  fireEvent.focus(
    within(first).getByRole('button', { name: /Enlarge the chart/ }),
  );
  expect(within(first).getByRole('status').textContent).toContain('$•••');
  // No amount in any text or label of the page: a dollar sign is never followed by a digit.
  expect(container.innerHTML).not.toMatch(/\$\d/);
  // The profit factor is a ratio of money, hidden as well.
  expect(
    within(first).getByText('Profit factor').closest('div')!.textContent,
  ).toContain('•••');
});

test('mood shows only where the date has a day record', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const list = await cards();
  expect(
    within(list[0]!).getByRole('button', { name: 'Mood, Good' }),
  ).toBeTruthy();
  expect(within(list[1]!).queryByRole('button', { name: /mood/i })).toBeNull();
  expect(within(list[2]!).queryByRole('button', { name: /mood/i })).toBeNull();
  expect(screen.getAllByRole('button', { name: /mood/i })).toHaveLength(1);
});

test('mood is read-only on a finished day', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample({
      days: [
        {
          id: '2026-11-24',
          workspaceId: WS,
          mood: { value: 4 },
          finishedAt: '2026-11-24T22:00:00Z',
        },
      ],
    }),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  expect(within(first).queryByRole('button', { name: /mood/i })).toBeNull();
  expect(first.textContent).toContain('Mood Good');
});

test('a mood is saved through the menu', async () => {
  const { repo } = await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  fireEvent.click(within(first).getByRole('button', { name: 'Mood, Good' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'Great' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(async () => {
    const days = await repo.days.list(WS);
    expect(days.find((d) => d.id === '2026-11-24')?.mood?.value).toBe(5);
  });
});

test('note-only cards read $0.00', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const note = (await cards())[2]!;
  expect(note.textContent).toContain('$0.00');
  expect(note.textContent).toContain('No trades this day.');
  expect(within(note).queryByRole('img')).toBeNull();
});

test('a day with open trades only reads None and has no chart', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample({
      trades: [
        trade({
          id: 'o1',
          serial: 1,
          status: 'open',
          net: 0,
          openedAt: '2026-11-24T16:00:00Z',
        }),
      ],
      journal: [],
      days: [],
    }),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  expect(
    within(first).getByRole('heading').parentElement!.textContent,
  ).toContain('None');
  expect(within(first).queryByRole('img')).toBeNull();
  expect(
    within(first).getByText('Trades').closest('div')!.textContent,
  ).toContain('1');
});

test('daily notes in Trash, or any trade-level filter, leave their days out', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample({
      journal: [dailyNote('2026-11-22', { deletedAt: '2026-11-25T00:00:00Z' })],
    }),
    url: '/app/trades/day',
  });
  expect((await cards()).map(heading)).toEqual([
    'Tue 24 Nov 2026',
    'Mon 23 Nov 2026',
  ]);
  cleanup();
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day?side=long',
  });
  expect((await cards()).map(heading)).not.toContain('Sun 22 Nov 2026');
});

test('the card chart has $ labels and no time labels; the enlarged chart has three times', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  const chart = within(first).getByRole('button', {
    name: /Enlarge the chart/,
  });
  expect(chart.textContent).toContain('$0.00');
  expect(chart.textContent).toMatch(/\+\$\d/);
  expect(chart.textContent).not.toMatch(/\d:\d\d/);
  expect(within(first).queryByRole('list', { name: 'Times' })).toBeNull();
  fireEvent.click(chart);
  const dialog = await screen.findByRole('dialog');
  const times = within(within(dialog).getByRole('list', { name: 'Times' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);
  // First open to last close of the day's closed trades (Keel's call): 14:30 to 15:20.
  expect(times).toEqual(['14:30:00', '14:55:00', '15:20:00']);
  expect(dialog.textContent).toContain('$0.00');
});

test("columns are TradeZella's: Ticker and Instrument, with no asset class", async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  fireEvent.click(
    within(first).getByRole('button', { name: 'Expand Tue 24 Nov 2026' }),
  );
  const table = await screen.findByRole('table', {
    name: 'Trades on Tue 24 Nov 2026',
  });
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual([
    'Open',
    'Ticker',
    'Side',
    'Instrument',
    'Net P&L',
    'Net ROI',
    'Realized R',
    'Strategy',
    'Tags',
  ]);
  const row = within(table).getAllByRole('row')[2]!;
  expect(row.textContent).toContain('15:00:00');
  expect(within(row).getAllByText('ES').length).toBeGreaterThan(1);
  expect(within(row).getByRole('button', { name: /Add tags/ })).toBeTruthy();
});

test('20 cards, then more', async () => {
  const many = Array.from({ length: 45 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 9, 1 + i, 15)).toISOString();
    return trade({
      id: `m${i}`,
      serial: i + 1,
      net: 1000,
      openedAt: day,
      closedAt: new Date(Date.parse(day) + 600_000).toISOString(),
    });
  });
  await renderApp(<TradesDayView />, {
    sample: sample({ trades: many, journal: [], days: [] }),
    url: '/app/trades/day',
  });
  expect(await cards()).toHaveLength(20);
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(40));
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(45));
  expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
});

test("dayColumns saves apart from the trade log's columns", async () => {
  const { repo } = await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  await cards();
  fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Tags' }));
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  await waitFor(async () => {
    const prefs = await repo.prefs.get();
    expect(prefs.dayColumns).toEqual([
      'open',
      'ticker',
      'side',
      'instrument',
      'net',
      'roi',
      'realizedR',
      'strategies',
    ]);
    expect(prefs.tradeColumns).toBeUndefined();
  });
});

test('no trades and no notes show the empty state with Import only', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample({ trades: [], journal: [], days: [] }),
    url: '/app/trades/day',
  });
  expect(await screen.findByText('No trades yet.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Import' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Add a trade' })).toBeNull();
});

test('filters that match nothing say so and clear', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day?symbol=ZZZ',
  });
  expect(
    await screen.findByText('No trades match these filters.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(await cards()).toHaveLength(3);
});

test('the switch links keep the filters', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day?side=long',
  });
  await cards();
  const nav = screen.getByRole('navigation', { name: 'Trade views' });
  expect(
    within(nav).getByRole('link', { name: 'Week' }).getAttribute('href'),
  ).toBe('/app/trades/week?side=long');
  expect(
    within(nav).getByRole('link', { name: 'All' }).getAttribute('href'),
  ).toBe('/app/trades?side=long');
  expect(
    within(nav).getByRole('link', { name: 'Day' }).getAttribute('aria-current'),
  ).toBe('page');
});

test('other-currency trades are listed apart', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample({
      trades: [
        ...trades(),
        trade({
          id: 'e1',
          serial: 9,
          net: 5000,
          pnlCurrency: 'EUR',
          openedAt: '2026-11-24T13:00:00Z',
          closedAt: '2026-11-24T13:10:00Z',
        }),
      ],
    }),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  // The figures stay the base currency's.
  expect(
    within(first).getByRole('heading').parentElement!.textContent,
  ).toContain('+$60.00');
  fireEvent.click(
    within(first).getByRole('button', { name: 'Expand Tue 24 Nov 2026' }),
  );
  const other = await screen.findByRole('table', {
    name: 'Trades in other currencies on Tue 24 Nov 2026',
  });
  expect(other.textContent).toContain('€');
});

test('below sm the quick actions are glyph buttons, Plan the day sits in the page and rows are two lines', async () => {
  const match = vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  expect(screen.getByRole('button', { name: 'Plan the day' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull();
  expect(
    within(first).getByRole('link', { name: 'Review Tue 24 Nov 2026' }),
  ).toBeTruthy();
  fireEvent.click(
    within(first).getByRole('button', { name: 'Expand Tue 24 Nov 2026' }),
  );
  const list = await within(first).findByRole('list', { name: 'Trades' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  match.mockRestore();
});

test('under the R unit the header is net R and Gross P&L is gross R', async () => {
  const withRisk = trades()
    .slice(0, 2)
    .map((t) => ({ ...t, initialRisk: 10_000 }));
  await renderApp(<TradesDayView />, {
    sample: sample({ trades: withRisk, journal: [], days: [] }),
    url: '/app/trades/day',
    prefs: { displayUnit: 'r' },
  });
  const first = (await cards())[0]!;
  // Net 100 - 40 = $60 over $100 risk; gross 110 - 35 = $75.
  expect(
    within(first).getByRole('heading').parentElement!.textContent,
  ).toContain('+0.60R');
  expect(
    within(first).getByText('Gross P&L').closest('div')!.querySelector('dd')!
      .textContent,
  ).toBe('+0.75R');
});

test('a workspace with no trades shows the Import state whatever the filters', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample({ trades: [], journal: [], days: [] }),
    url: '/app/trades/day?range=last-week',
  });
  expect(await screen.findByText('No trades yet.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Import' })).toBeTruthy();
  expect(screen.queryByText('No trades match these filters.')).toBeNull();
});

test('the tag panel is named for the trade and its day', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  fireEvent.click(
    within(first).getByRole('button', { name: 'Expand Tue 24 Nov 2026' }),
  );
  const [add] = await screen.findAllByRole('button', { name: /Add tags/ });
  fireEvent.click(add!);
  const panel = await screen.findByRole('dialog', {
    name: 'Tags for ES, Tue 24 Nov 2026',
  });
  expect(panel).toBeTruthy();
});

/** A phone: `matchMedia` says every query is false, so `usePhone` is true. */
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

test('a trade opened days before it closes does not stretch the chart: the span starts at 00:00 of the day', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample({
      trades: [
        trade({
          id: 'swing',
          serial: 1,
          net: 5000,
          openedAt: '2026-11-22T15:00:00Z',
          closedAt: '2026-11-24T14:50:00Z',
        }),
      ],
      journal: [],
      days: [],
    }),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  const chart = within(first).getByRole('button', {
    name: /Enlarge the chart/,
  });
  // The card's own label reads from 00:00, not from two days earlier.
  expect(chart.getAttribute('aria-label')).toContain('from 00:00 to 14:50');
  fireEvent.click(chart);
  const dialog = await screen.findByRole('dialog');
  const times = within(within(dialog).getByRole('list', { name: 'Times' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);
  expect(times).toEqual(['00:00:00', '07:25:00', '14:50:00']);
});

test('a trade lands on its local date in the profile zone (New York, a close after 00:00 UTC)', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample({
      trades: [
        trade({
          id: 'late',
          serial: 1,
          net: 5000,
          openedAt: '2026-11-25T01:30:00Z',
          closedAt: '2026-11-25T02:00:00Z',
        }),
      ],
      journal: [],
      days: [],
    }),
    url: '/app/trades/day',
    prefs: { timeZone: 'America/New_York' },
  });
  const list = await cards();
  // 21:00 on Tue 24 Nov in New York, though it is 25 Nov in UTC.
  expect(list.map(heading)).toEqual(['Tue 24 Nov 2026']);
  fireEvent.click(
    within(list[0]!).getByRole('button', { name: 'Expand Tue 24 Nov 2026' }),
  );
  const table = await screen.findByRole('table', {
    name: 'Trades on Tue 24 Nov 2026',
  });
  expect(table.textContent).toContain('20:30:00');
});

const sixty = () =>
  Array.from({ length: 60 }, (_, i) =>
    trade({
      id: `r${i}`,
      serial: i + 1,
      net: 100,
      openedAt: new Date(Date.UTC(2026, 10, 24, 12, i)).toISOString(),
      closedAt: new Date(Date.UTC(2026, 10, 24, 12, i, 30)).toISOString(),
    }),
  );

test('a day table pages at 50 rows with a Show more', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample({ trades: sixty(), journal: [], days: [] }),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  fireEvent.click(
    within(first).getByRole('button', { name: 'Expand Tue 24 Nov 2026' }),
  );
  const table = await within(first).findByRole('table', {
    name: 'Trades on Tue 24 Nov 2026',
  });
  expect(within(table).getAllByRole('row')).toHaveLength(51);
  fireEvent.click(
    within(first).getByRole('button', {
      name: 'Show more, Trades on Tue 24 Nov 2026',
    }),
  );
  await waitFor(() =>
    expect(within(table).getAllByRole('row')).toHaveLength(61),
  );
  expect(
    within(first).queryByRole('button', { name: /^Show more/ }),
  ).toBeNull();
});

test('a changed filter starts a day table again at 50 rows', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample({ trades: sixty(), journal: [], days: [] }),
    url: '/app/trades/day?from=2026-11-24&to=2026-11-24',
  });
  const first = (await cards())[0]!;
  fireEvent.click(
    within(first).getByRole('button', { name: 'Expand Tue 24 Nov 2026' }),
  );
  const table = await within(first).findByRole('table', {
    name: 'Trades on Tue 24 Nov 2026',
  });
  fireEvent.click(
    within(first).getByRole('button', {
      name: 'Show more, Trades on Tue 24 Nov 2026',
    }),
  );
  await waitFor(() =>
    expect(within(table).getAllByRole('row')).toHaveLength(61),
  );
  // The date range widens; the day's trades are the same sixty.
  act(() => {
    window.history.replaceState(
      null,
      '',
      '/app/trades/day?from=2026-11-23&to=2026-11-24',
    );
  });
  await waitFor(() =>
    expect(within(table).getAllByRole('row')).toHaveLength(51),
  );
  expect(
    within(first).getByRole('button', {
      name: 'Show more, Trades on Tue 24 Nov 2026',
    }),
  ).toBeTruthy();
});

test('the phone rows page at 50 too', async () => {
  const match = phoneMedia();
  await renderApp(<TradesDayView />, {
    sample: sample({ trades: sixty(), journal: [], days: [] }),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  fireEvent.click(
    within(first).getByRole('button', { name: 'Expand Tue 24 Nov 2026' }),
  );
  const list = await within(first).findByRole('list', { name: 'Trades' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(50);
  fireEvent.click(
    within(first).getByRole('button', {
      name: 'Show more, Trades on Tue 24 Nov 2026',
    }),
  );
  await waitFor(() =>
    expect(within(list).getAllByRole('listitem')).toHaveLength(60),
  );
  match.mockRestore();
});

test.each([
  [
    'the tag categories',
    (r: Repository) => ({
      tagCategories: {
        ...r.tagCategories,
        list: () => Promise.reject(new Error('boom')),
      },
    }),
  ],
  [
    'the day records',
    (r: Repository) => ({
      days: { ...r.days, list: () => Promise.reject(new Error('boom')) },
    }),
  ],
  [
    'the journal',
    (r: Repository) => ({
      journal: { ...r.journal, list: () => Promise.reject(new Error('boom')) },
    }),
  ],
])(
  'a failed load of %s shows the error, not the skeleton for ever',
  async (_name, patch) => {
    await renderApp(<TradesDayView />, {
      sample: sample(),
      url: '/app/trades/day',
      patch: patch as (r: Repository) => Partial<Repository>,
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Your trades couldn't load.");
    expect(
      screen.queryByRole('status', { name: 'Loading your trades' }),
    ).toBeNull();
  },
);

test('a note-only card has a chevron that reveals the empty table area', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const note = (await cards())[2]!;
  const toggle = within(note).getByRole('button', {
    name: 'Expand Sun 22 Nov 2026',
  });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  // No review link on a note-only card.
  expect(within(note).queryByRole('link', { name: /Review/ })).toBeNull();
  fireEvent.click(toggle);
  const table = await within(note).findByRole('table', {
    name: 'Trades on Sun 22 Nov 2026',
  });
  expect(within(table).getAllByRole('row')).toHaveLength(1);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
});

test('a stale strategy in the address does not hide note-only days', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day?strategy=gone',
  });
  expect((await cards()).map(heading)).toContain('Sun 22 Nov 2026');
});

test('below sm the header reads the date without the year, and the actions may wrap', async () => {
  const match = phoneMedia();
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  expect(heading(first)).toBe('Tue 24 Nov');
  const header = within(first).getByRole('heading').parentElement!;
  expect(header.className).toContain('flex-wrap');
  // The toggle still names the full date.
  expect(
    within(first).getByRole('button', { name: 'Expand Tue 24 Nov 2026' }),
  ).toBeTruthy();
  match.mockRestore();
});

test('the enlarged chart has a group focus stop, and the card chart readout sits beside its button', async () => {
  await renderApp(<TradesDayView />, {
    sample: sample(),
    url: '/app/trades/day',
  });
  const first = (await cards())[0]!;
  const chart = within(first).getByRole('button', {
    name: /Enlarge the chart/,
  });
  fireEvent.focus(chart);
  const status = within(first).getByRole('status');
  expect(chart.contains(status)).toBe(false);
  fireEvent.click(chart);
  const dialog = await screen.findByRole('dialog');
  expect(
    within(dialog).getByRole('group', {
      name: 'Points of the running net on Tue 24 Nov 2026',
    }),
  ).toBeTruthy();
});

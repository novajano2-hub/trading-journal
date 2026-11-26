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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { ALL_COLUMNS, DEFAULT_COLUMNS } from '@/data/trade-columns';
import { equityPath } from '@/lib/landing/equity-path';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { Trade } from '@/domain/types';
import { everyString } from '../__fixtures__/every-string';
import { renderApp } from '../__fixtures__/render-app';
import { TradesView } from './trades-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const WS = fixtureSample().trades[0]!.workspaceId;
const START = Date.UTC(2026, 10, 2, 14, 0);

/**
 * 120 closed trades, serial 1 to 120, opened ten minutes apart. Trade n nets
 * (121 - n) x $10, so the newest open is the smallest net. Even serials follow
 * Opening range breakout; serial 7 carries the breakout tag.
 */
function sample(opts: { open?: number; closed?: number } = {}) {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    const count = opts.closed ?? 120;
    const closed = Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      const openedAt = START + i * 600_000;
      return makeTrade({
        id: `t-${n}`,
        serial: n,
        workspaceId: WS,
        accountId: 'acc-a',
        openedAt: new Date(openedAt).toISOString(),
        closedAt: new Date(openedAt + 300_000).toISOString(),
        net: (count + 1 - n) * 1000,
        strategyIds: n % 2 === 0 ? ['str-1'] : [],
        tagIds: n === 7 ? ['tag-setup'] : [],
      });
    });
    const open = Array.from({ length: opts.open ?? 0 }, (_, i) =>
      makeTrade({
        id: `o-${i + 1}`,
        serial: 200 + i,
        workspaceId: WS,
        accountId: 'acc-a',
        status: 'open',
        openedAt: new Date(START + (200 + i) * 600_000).toISOString(),
        net: 0,
      }),
    );
    return { ...fx, trades: [...closed, ...open] };
  };
}

const table = () => screen.findByRole('table', { name: 'Trades' });
const bodyRows = (t: HTMLElement) => within(t).getAllByRole('row').slice(1);
/** The trade a row's instrument link points to. */
const idOf = (row: HTMLElement) =>
  within(row)
    .getByRole('link')
    .getAttribute('href')!
    .split('?')[0]!
    .split('/')
    .pop();

test('the summary strip counts the filtered closed trades', async () => {
  renderApp(<TradesView />, {
    sample: sample({ open: 3 }),
    url: '/app/trades',
  });
  const strip = await screen.findByRole('region', { name: 'Summary' });
  expect(within(strip).getByText('120')).toBeTruthy();
  expect(strip.textContent).toContain('closed, 3 still open');
  // Net: sum of 10..1200 dollars.
  expect(strip.textContent).toContain('+$72,600.00');
  expect(within(strip).getByRole('button', { name: 'Win rate' })).toBeTruthy();
});

test('counts over a thousand read with a separator, in the strip and on the Closed tab', async () => {
  renderApp(<TradesView />, {
    sample: sample({ closed: 1200, open: 3 }),
    url: '/app/trades',
  });
  const strip = await screen.findByRole('region', { name: 'Summary' });
  expect(within(strip).getByText('1,200')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Closed 1,200' })).toBeTruthy();
});

test('a signed amount never breaks between its sign and its digits, and the note sits under the cards below 1360px', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  const strip = await screen.findByRole('region', { name: 'Summary' });
  const amounts = [...strip.querySelectorAll('span')].filter((el) =>
    /^[+\u2212]\$[\d,.]+$/.test(el.textContent ?? ''),
  );
  expect(amounts.length).toBeGreaterThan(0);
  for (const el of amounts)
    expect(
      el.closest('.whitespace-nowrap'),
      el.textContent ?? '',
    ).not.toBeNull();
  const note = strip.querySelector('p')!.parentElement!;
  expect(note.className).toContain('col-span-full');
  expect(note.className).toContain('min-[1360px]:col-span-1');
  expect(strip.className).toContain('min-[1360px]:grid-cols-');
});

test('each count in the win-rate line keeps its word, so it breaks only between the counts', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  const strip = await screen.findByRole('region', { name: 'Summary' });
  for (const part of [/^\d+ won$/, /^\d+ breakeven$/, /^\d+ lost$/]) {
    const el = [...strip.querySelectorAll('span')].find((s) =>
      part.test(s.textContent ?? ''),
    );
    expect(el, String(part)).toBeTruthy();
    expect(el!.className).toContain('whitespace-nowrap');
  }
  expect(strip.textContent).toMatch(/\d+ won, \d+ breakeven, \d+ lost/);
});

test('Hide summary saves the preference and leaves a way back', async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample(),
    url: '/app/trades',
  });
  await screen.findByRole('region', { name: 'Summary' });
  fireEvent.click(screen.getByRole('button', { name: 'Hide summary' }));
  await waitFor(async () =>
    expect((await repo.prefs.get()).hideTradeSummary).toBe(true),
  );
  expect(screen.queryByRole('region', { name: 'Summary' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show summary' }));
  await screen.findByRole('region', { name: 'Summary' });
});

test('Add trade is a secondary button beside the top bar Import, at the one md size; Strategy gets its own gap', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  const t = await table();
  const add = screen.getByRole('link', { name: 'Add trade' });
  expect(add.className).toContain('border-line-2');
  expect(add.className).not.toContain('bg-accent');
  expect(add.className).toContain('h-[34px]');
  // Duration is right-aligned and Strategy starts after a gap, so the headers never meet.
  const strategy = within(t).getByRole('columnheader', { name: /Strategy/ });
  expect(strategy.className).toContain('pl-4');
  const cell =
    bodyRows(t)[0]!.querySelectorAll('td')[
      [...strategy.parentElement!.children].indexOf(strategy)
    ]!;
  expect(cell.className).toContain('pl-4');
});

test('newest open first; sorting by Net puts the largest first', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  const t = await table();
  expect(bodyRows(t)).toHaveLength(50);
  expect(idOf(bodyRows(t)[0]!)).toBe('t-120');
  const open = within(t).getByRole('columnheader', { name: /Open/ });
  expect(open.getAttribute('aria-sort')).toBe('descending');

  fireEvent.click(within(t).getByRole('button', { name: /Net P&L/ }));
  const net = within(t).getByRole('columnheader', { name: /Net P&L/ });
  expect(net.getAttribute('aria-sort')).toBe('descending');
  expect(idOf(bodyRows(t)[0]!)).toBe('t-1');
  expect(open.getAttribute('aria-sort')).toBe('none');

  fireEvent.click(within(t).getByRole('button', { name: /Net P&L/ }));
  expect(net.getAttribute('aria-sort')).toBe('ascending');
  expect(idOf(bodyRows(t)[0]!)).toBe('t-120');
});

test('hiding Rating removes the column and saves the columns', async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample(),
    url: '/app/trades',
  });
  const t = await table();
  expect(within(t).getByRole('columnheader', { name: 'Rating' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Rating' }));
  // Nothing saves until Update.
  expect(within(t).getByRole('columnheader', { name: 'Rating' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  await waitFor(() =>
    expect(
      within(t).queryByRole('columnheader', { name: 'Rating' }),
    ).toBeNull(),
  );
  await waitFor(async () =>
    expect((await repo.prefs.get()).tradeColumns).toEqual(
      DEFAULT_COLUMNS.filter((c) => c !== 'rating'),
    ),
  );
  // Reset to default, then Update, brings it back.
  fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reset to default' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  await within(t).findByRole('columnheader', { name: 'Rating' });
});

test('a column moves up and down in the Columns menu', async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample(),
    url: '/app/trades',
  });
  const t = await table();
  fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Move Side up' }));
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  await waitFor(() => {
    const names = within(t)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    // The first header is the selection box's, with no text.
    expect(names.slice(1, 4)).toEqual(['Open', 'Side', 'Instrument']);
  });
  await waitFor(async () =>
    expect((await repo.prefs.get()).tradeColumns?.slice(0, 3)).toEqual([
      'open',
      'side',
      'instrument',
    ]),
  );
});

test('search matches #serial, strategy and tag names', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  const t = await table();
  const search = screen.getByRole('searchbox', { name: 'Search trades' });

  fireEvent.change(search, { target: { value: '#12' } });
  await waitFor(() => expect(bodyRows(t)).toHaveLength(1));
  expect(idOf(bodyRows(t)[0]!)).toBe('t-12');

  fireEvent.change(search, { target: { value: 'opening range' } });
  await waitFor(() => expect(screen.getByText(/1-50 of 60/)).toBeTruthy());

  fireEvent.change(search, { target: { value: 'breakout' } });
  // The strategy is named "Opening range breakout" (60) and trade 7 has the tag (odd, so not in those).
  await waitFor(() => expect(screen.getByText(/1-50 of 61/)).toBeTruthy());
});

test("search also reads a trade note's text, but not one in Trash", async () => {
  const base = sample();
  const note = (id: string, tradeId: string, deletedAt?: string) => ({
    id,
    workspaceId: WS,
    kind: 'trade-note' as const,
    title: 'ES : 2 Nov 2026',
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Chased the Gapfill, late again.' }],
        },
      ],
    },
    linkedTradeIds: [tradeId],
    tags: [],
    updatedAt: '2026-11-03T00:00:00.000Z',
    ...(deletedAt ? { deletedAt } : {}),
  });
  renderApp(<TradesView />, {
    url: '/app/trades',
    sample: async () => {
      const fx = await base();
      fx.trades.find((t) => t.id === 't-33')!.noteId = 'n-33';
      fx.trades.find((t) => t.id === 't-44')!.noteId = 'n-44';
      fx.journal.push(
        note('n-33', 't-33'),
        note('n-44', 't-44', '2026-11-10T00:00:00.000Z'),
      );
      return fx;
    },
  });
  const t = await table();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search trades' }), {
    target: { value: 'gapfill' },
  });
  await waitFor(() => expect(bodyRows(t)).toHaveLength(1));
  expect(idOf(bodyRows(t)[0]!)).toBe('t-33');
});

test('Next page shows rows 51 to 100', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  const t = await table();
  expect(screen.getByText(/1-50 of 120/)).toBeTruthy();
  const prev = screen.getByRole('button', { name: 'Previous page' });
  expect(prev.hasAttribute('disabled')).toBe(true);
  expect(idOf(bodyRows(t)[0]!)).toBe('t-120');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(screen.getByText(/51-100 of 120/)).toBeTruthy());
  expect(idOf(bodyRows(t)[0]!)).toBe('t-70');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(screen.getByText(/101-120 of 120/)).toBeTruthy());
  expect(bodyRows(t)).toHaveLength(20);
});

test('the Open switch writes ?status= and lists the open trades', async () => {
  renderApp(<TradesView />, {
    sample: sample({ open: 3 }),
    url: '/app/trades',
  });
  const t = await table();
  fireEvent.click(await screen.findByRole('radio', { name: /Open/ }));
  await waitFor(() => expect(window.location.search).toContain('status=open'));
  await waitFor(() => expect(bodyRows(t)).toHaveLength(3));
  fireEvent.click(screen.getByRole('radio', { name: /Closed/ }));
  await waitFor(() => expect(bodyRows(t)).toHaveLength(50));
  expect(window.location.search).not.toContain('status=open');
});

test('no match shows Clear filters, which brings the trades back', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  await table();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search trades' }), {
    target: { value: 'zzzz' },
  });
  await screen.findByText('No trades match these filters.');
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() =>
    expect(
      bodyRows(screen.getByRole('table', { name: 'Trades' })),
    ).toHaveLength(50),
  );
});

test('a workspace with no trades says so', async () => {
  renderApp(<TradesView />, {
    sample: async () => ({ ...fixtureSample(), trades: [] }),
    url: '/app/trades',
  });
  await screen.findByText('No trades yet.');
  expect(
    screen.getByRole('link', { name: 'Import' }).getAttribute('href'),
  ).toBe('/app/import');
  expect(
    screen
      .getAllByRole('link', { name: 'Add a trade' })[0]!
      .getAttribute('href'),
  ).toBe('/app/trades/new');
});

test("each trade link keeps the log's filters, so the trade page can come back to them", async () => {
  renderApp(<TradesView />, {
    sample: sample(),
    url: '/app/trades?symbol=ES&outcome=win',
  });
  const table = await screen.findByRole('table');
  const link = (await within(table).findAllByRole('link', { name: /ES/ })).find(
    (a) => a.getAttribute('href')?.startsWith('/app/trades/'),
  )!;
  expect(link.getAttribute('href')).toMatch(
    /^\/app\/trades\/[^?]+\?symbol=ES&outcome=win$/,
  );
});

test('Reviewed reads as a check or nothing, in words', async () => {
  renderApp(<TradesView />, {
    sample: async () => {
      const s = await sample()();
      s.trades[119]!.reviewed = true;
      return s;
    },
    url: '/app/trades',
  });
  const t = await table();
  const rows = bodyRows(t);
  expect(within(rows[0]!).getByText('Reviewed')).toBeTruthy();
  expect(within(rows[1]!).getByText('Not reviewed')).toBeTruthy();
});

test('Export CSV downloads real values even under Privacy', async () => {
  const { repo } = renderApp(<TradesView />, {
    sample: sample(),
    url: '/app/trades',
  });
  await repo.prefs.update({ displayUnit: 'privacy' });
  let blob: Blob | undefined;
  const create = vi.fn((b: Blob) => {
    blob = b;
    return 'blob:keel';
  });
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await table();
  fireEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));
  await waitFor(() => expect(create).toHaveBeenCalled());
  const text = await blob!.text();
  const lines = text.split('\r\n');
  expect(lines[0]).toContain('Open,Instrument,Side');
  expect(lines).toHaveLength(121);
  expect(text).toContain(',1200.00,');
  expect(text).not.toContain('•');
});

test('the summary strip shows its fees in the chosen unit, as it does the P&L', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  await repository.prefs.update({ displayUnit: 'percent' });
  renderApp(<TradesView />, { repository, url: '/app/trades' });
  await table();
  const strip = await screen.findByRole('region', { name: 'Summary' });
  await waitFor(() => {
    // "fees" sits beside its figure: the percentage, not dollars.
    const text = strip.textContent ?? '';
    expect(text).toMatch(/[\d.]+% fees/);
    expect(text).not.toMatch(/\$[\d,.]+ fees/);
  });
});

test("the default columns are comp 01's with Patterns after Tags (6B comp 02), Net ROI in and Mistake off", async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  const t = await table();
  const heads = within(t)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(heads.slice(1)).toEqual([
    'Open',
    'Instrument',
    'Side',
    'Qty',
    'Entry',
    'Exit',
    'Net P&L',
    'Net ROI',
    'R',
    'Duration',
    'Strategy',
    'Tags',
    'Patterns',
    'Rules',
    'Rating',
    'Reviewed',
  ]);
  expect(DEFAULT_COLUMNS).toContain('roi');
  expect(DEFAULT_COLUMNS).not.toContain('mistakes');
  expect(ALL_COLUMNS).toContain('mistakes');
  fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
  expect(await screen.findByRole('checkbox', { name: 'Mistake' })).toBeTruthy();
});

test('every column has a fixed width in the colgroup, one for the selection box too', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  const t = await table();
  expect(t.className).toContain('table-fixed');
  const cols = [...t.querySelectorAll('colgroup > col')];
  expect(cols).toHaveLength(1 + DEFAULT_COLUMNS.length);
  for (const c of cols)
    expect(`${c.className} ${c.getAttribute('style') ?? ''}`).toMatch(
      /\bw-8\b|width: \d+px/,
    );
});

test('the Net ROI and R headers carry their definitions, and still sort', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  const t = await table();
  const roi = within(t).getByRole('columnheader', { name: /Net ROI/ });
  const r = within(t).getByRole('columnheader', { name: /^R(\s|$)/ });
  expect(roi.querySelector('[data-metric-tip="net-roi"]')).not.toBeNull();
  expect(r.querySelector('[data-metric-tip="realized-r"]')).not.toBeNull();
  // The tip is not inside the sort button.
  expect(roi.querySelector('button button')).toBeNull();
  fireEvent.click(within(roi).getByRole('button', { name: 'Sort by Net ROI' }));
  expect(roi.getAttribute('aria-sort')).toBe('descending');
});

test('a mistake shows in the Tags cell in the warn tone, ahead of the other tags', async () => {
  renderApp(<TradesView />, {
    sample: async () => {
      const w = await sample()();
      return {
        ...w,
        trades: w.trades.map((t) =>
          t.id === 't-7' ? { ...t, tagIds: ['tag-setup', 'tag-fomo'] } : t,
        ),
      };
    },
    url: '/app/trades',
  });
  const t = await table();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search trades' }), {
    target: { value: '#7' },
  });
  await waitFor(() =>
    expect(bodyRows(t).some((r) => idOf(r) === 't-7')).toBe(true),
  );
  const row = bodyRows(t).find((r) => idOf(r) === 't-7')!;
  const warn = within(row).getByText('fomo');
  expect(warn.closest('span[class*="warn"]')).not.toBeNull();
  expect(within(row).getByText('+1')).toBeTruthy();
});

test('under Privacy no amount survives anywhere in the trade log', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample({ open: 2 }),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<TradesView />, { repository, url: '/app/trades' });
  await screen.findByRole('region', { name: 'Summary' });
  expect(everyString(document.body).filter((s) => /\$\d/.test(s))).toEqual([]);
  const strip = screen.getByRole('region', { name: 'Summary' });
  expect(within(strip).getAllByText('hidden amount').length).toBeGreaterThan(0);
  const t = await table();
  expect(within(t).getAllByText('hidden amount').length).toBeGreaterThan(0);
});

test('Privacy hides the profit factor and the average win to loss, and keeps the win rate and the counts', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: mixed(),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<TradesView />, { repository, url: '/app/trades' });
  const strip = await screen.findByRole('region', { name: 'Summary' });
  const card = strip.querySelector('[data-kpi="profit-factor"]') as HTMLElement;
  expect(card.textContent).not.toMatch(/\d\.\d\d/);
  expect(card.textContent).toContain('•••');
  expect(within(card).getAllByText('hidden ratio')).toHaveLength(2);
  expect(strip.querySelector('[data-kpi="win-rate"]')!.textContent).toMatch(
    /\d+(\.\d)?%/,
  );
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
  const { container } = renderApp(<TradesView />, {
    repository: broken,
    url: '/app/trades',
  });
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByRole('alert').textContent).toContain(
    "Your trades couldn't load.",
  );
  expect(container.textContent).not.toContain('Loading');
});

/**
 * Three trades on two days (New York): A and B on Mon 2 Nov, C alone on Tue 3 Nov.
 * A has two entries and one exit (one pattern), B two entries, two exits and a
 * size above A's (three), C no fills (none), but it is the day's one trade, a
 * win of 3R: a pattern of its day.
 */
function patternLog() {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    const fill = (
      id: string,
      side: 'buy' | 'sell',
      qty: number,
      time: string,
    ) => ({
      id,
      accountId: 'acc-a',
      symbol: 'ESZ5',
      side,
      qty,
      price: 4500,
      time,
      fees: 0,
      commission: 0,
    });
    const a = makeTrade({
      id: 'pa',
      serial: 1,
      workspaceId: WS,
      accountId: 'acc-a',
      net: 1_000,
      openedAt: '2026-11-02T14:00:00Z',
      closedAt: '2026-11-02T14:30:00Z',
      maxPosition: 2,
      executions: [
        fill('a1', 'buy', 1, '2026-11-02T14:00:00Z'),
        fill('a2', 'buy', 1, '2026-11-02T14:05:00Z'),
        fill('a3', 'sell', 2, '2026-11-02T14:30:00Z'),
      ],
    });
    const b = makeTrade({
      id: 'pb',
      serial: 2,
      workspaceId: WS,
      accountId: 'acc-a',
      net: 2_000,
      openedAt: '2026-11-02T15:00:00Z',
      closedAt: '2026-11-02T15:30:00Z',
      maxPosition: 4,
      executions: [
        fill('b1', 'buy', 2, '2026-11-02T15:00:00Z'),
        fill('b2', 'buy', 2, '2026-11-02T15:05:00Z'),
        fill('b3', 'sell', 2, '2026-11-02T15:20:00Z'),
        fill('b4', 'sell', 2, '2026-11-02T15:30:00Z'),
      ],
    });
    const c = makeTrade({
      id: 'pc',
      serial: 3,
      workspaceId: WS,
      accountId: 'acc-a',
      net: 30_000,
      initialRisk: 10_000,
      openedAt: '2026-11-03T15:00:00Z',
      closedAt: '2026-11-03T15:30:00Z',
    });
    return { ...fx, trades: [a, b, c] };
  };
}

/** A body row's cell under the named column. */
const cellOf = (t: HTMLElement, row: HTMLElement, name: string) => {
  const at = within(t)
    .getAllByRole('columnheader')
    .findIndex((h) => h.textContent?.startsWith(name));
  return within(row).getAllByRole('cell')[at]!;
};

test("the column counts each trade's patterns", async () => {
  renderApp(<TradesView />, { sample: patternLog(), url: '/app/trades' });
  const t = await table();
  // The column is a default, between Tags and Rules, and its header carries its definition.
  const heads = within(t)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(heads.indexOf('Patterns')).toBe(heads.indexOf('Tags') + 1);
  expect(heads.indexOf('Rules')).toBe(heads.indexOf('Patterns') + 1);
  const head = within(t).getByRole('columnheader', { name: /Patterns/ });
  expect(head.querySelector('[data-metric-tip="patterns"]')).not.toBeNull();
  await waitFor(() => {
    const counts = Object.fromEntries(
      bodyRows(t).map((r) => [idOf(r), cellOf(t, r, 'Patterns').textContent]),
    );
    // A: Added to the position; B: that, Exited in parts and Large size; C: none of its own.
    expect(counts).toEqual({ pa: '1', pb: '3', pc: '0' });
  });
  // A zero reads in the faint ink, a count in the text's.
  const rows = Object.fromEntries(bodyRows(t).map((r) => [idOf(r), r]));
  expect(
    cellOf(t, rows['pc']!, 'Patterns').querySelector('.text-faint'),
  ).not.toBeNull();
  expect(
    cellOf(t, rows['pb']!, 'Patterns').querySelector('.text-faint'),
  ).toBeNull();
  // It sorts by the count, the largest first.
  fireEvent.click(
    within(head).getByRole('button', { name: 'Sort by Patterns' }),
  );
  expect(head.getAttribute('aria-sort')).toBe('descending');
  expect(bodyRows(t).map(idOf)).toEqual(['pb', 'pa', 'pc']);
});

test('the log, Columns menu and CSV all know the Patterns column', async () => {
  renderApp(<TradesView />, { sample: patternLog(), url: '/app/trades' });
  await table();
  fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
  expect(
    (await screen.findByRole('checkbox', {
      name: 'Patterns',
    })) as HTMLInputElement,
  ).toHaveProperty('checked', true);
  let blob: Blob | undefined;
  Object.assign(URL, {
    createObjectURL: vi.fn((b: Blob) => {
      blob = b;
      return 'blob:keel';
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByRole('checkbox', { name: 'Patterns' })).toBeNull(),
  );
  await waitFor(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(blob).toBeDefined();
    const [head, ...lines] = (await blob!.text()).split('\r\n');
    const at = head!.split(',').indexOf('Patterns');
    expect(at).toBeGreaterThan(0);
    expect(lines.join('\n')).toContain(
      'Added to the position; Exited in parts; Large size',
    );
  });
});

test('a Patterns pick in the address keeps the trades, and the trades of the days, where it fired', async () => {
  renderApp(<TradesView />, {
    sample: patternLog(),
    url: '/app/trades?pat=exited-in-parts',
  });
  const t = await table();
  // A trade pattern: only the trade it fired on.
  await waitFor(() => expect(bodyRows(t).map(idOf)).toEqual(['pb']));
  // The pick shows as a chip with a way to take it off.
  expect(screen.getByText('Patterns: Exited in parts')).toBeTruthy();
  cleanup();
  renderApp(<TradesView />, {
    sample: patternLog(),
    url: '/app/trades?pat=one-strong-trade',
  });
  const day = await table();
  // A day pattern: the trade of that day, which has no pattern of its own.
  await waitFor(() => expect(bodyRows(day).map(idOf)).toEqual(['pc']));
  expect(cellOf(day, bodyRows(day)[0]!, 'Patterns').textContent).toBe('0');
});

describe('at 390px', () => {
  beforeEach(() => {
    window.innerWidth = 390;
  });
  afterEach(() => {
    window.innerWidth = 1024;
  });

  test('a row ends its second line with a count of patterns', async () => {
    renderApp(<TradesView />, { sample: patternLog(), url: '/app/trades' });
    const list = await screen.findByRole('list', { name: 'Trades' });
    await waitFor(() => {
      const lines = within(list)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('[data-line="2"]')!.textContent);
      // Newest first: C, B, A.
      expect(lines[0]).toMatch(/0 patterns$/);
      expect(lines[1]).toMatch(/3 patterns$/);
      expect(lines[2]).toMatch(/1 pattern$/);
    });
  });

  test('the summary is a 2 by 2 grid: net, win rate, profit factor, trades', async () => {
    renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
    const strip = await screen.findByRole('region', { name: 'Summary' });
    const kpis = [...strip.querySelectorAll('[data-kpi]')].map((k) =>
      k.getAttribute('data-kpi'),
    );
    // Four figures, two across: net, win rate, profit factor, trades.
    expect(kpis).toEqual(['pnl', 'win-rate', 'profit-factor', 'trades']);
    expect(strip.className).toContain('grid-cols-2');
  });

  test('trades are two-line rows, each one link to the trade page, with the selection box kept', async () => {
    renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
    const list = await screen.findByRole('list', { name: 'Trades' });
    expect(screen.queryByRole('table')).toBeNull();
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(50);
    const first = items[0]!;
    const link = within(first).getByRole('link');
    expect(link.getAttribute('href')).toBe('/app/trades/t-120');
    // Line one: the instrument, the time, the signed net. Line two: R, rules, tags.
    const lines = link.querySelectorAll('[data-line]');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.textContent).toContain('+$10.00');
    // Line two opens with the side, before the R.
    for (const item of items.slice(0, 10))
      expect(item.querySelector('[data-line="2"]')!.textContent).toMatch(
        /^(Long|Short)/,
      );
    expect(within(first).getAllByRole('link')).toHaveLength(1);
    const box = within(first).getByRole('checkbox', {
      name: 'Select trade 120',
    });
    fireEvent.click(box);
    expect(
      (within(first).getByRole('checkbox') as HTMLInputElement).checked,
    ).toBe(true);
  });

  test('Sort is a dropdown; Net, best first reorders, and pagination stays', async () => {
    renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
    const list = await screen.findByRole('list', { name: 'Trades' });
    expect(screen.queryByRole('button', { name: /Sort by/ })).toBeNull();
    const sort = screen.getByRole('button', { name: 'Sort, Newest first' });
    fireEvent.keyDown(sort, { key: 'Enter' });
    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Net, best first' }),
    );
    await waitFor(() =>
      expect(
        within(within(list).getAllByRole('listitem')[0]!)
          .getByRole('link')
          .getAttribute('href'),
      ).toBe('/app/trades/t-1'),
    );
    expect(
      screen.getByRole('button', { name: 'Sort, Net, best first' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeTruthy();
  });
});

test('above 640px the log is the table and has no Sort dropdown', async () => {
  renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
  await table();
  expect(screen.queryByRole('button', { name: /^Sort,/ })).toBeNull();
  expect(screen.queryByRole('list', { name: 'Trades' })).toBeNull();
});

test('when the unit leaves out every trade the log says so, and keeps Clear filters while a filter is set', async () => {
  // The sample's trades are all ES with no stop: R reads none of them.
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  await repository.prefs.update({ displayUnit: 'r' });
  renderApp(<TradesView />, { repository, url: '/app/trades?symbol=ES' });
  expect(
    await screen.findByText('No closed trades with a stop in these filters.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(window.location.search).toBe(''));
  // With no filter set there is nothing to clear.
  expect(
    await screen.findByText('No closed trades with a stop in these filters.'),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
});

/** Two wins (+$30, +$10), a loss (-$10), a flat trade and an open one, each on its own day. */
function mixed() {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    const day = (d: number) => Date.UTC(2026, 10, d, 15, 0);
    const mk = (n: number, net: number, p: Partial<Trade> = {}) =>
      makeTrade({
        id: `m-${n}`,
        serial: n,
        workspaceId: WS,
        accountId: 'acc-a',
        openedAt: new Date(day(n)).toISOString(),
        closedAt: new Date(day(n) + 300_000).toISOString(),
        ...p,
        net,
      });
    return {
      ...fx,
      trades: [
        mk(2, 3000),
        mk(3, 1000),
        mk(4, -1000),
        mk(5, 0),
        mk(6, 0, { status: 'open', closedAt: undefined }),
      ],
    };
  };
}

describe('the summary strip, win/loss and running P&L', () => {
  test('the win-rate line counts won, breakeven and lost', async () => {
    renderApp(<TradesView />, { sample: mixed(), url: '/app/trades' });
    const strip = await screen.findByRole('region', { name: 'Summary' });
    expect(strip.textContent).toContain('2 won, 1 breakeven, 1 lost');
  });

  test('the profit-factor card carries the average win to loss and both amounts; there is no sixth card', async () => {
    renderApp(<TradesView />, { sample: mixed(), url: '/app/trades' });
    const strip = await screen.findByRole('region', { name: 'Summary' });
    expect(strip.querySelector('[data-kpi="avg-win-loss"]')).toBeNull();
    // Desktop: trades, net, win rate, profit factor, expectancy.
    expect(strip.querySelectorAll('[data-kpi]')).toHaveLength(5);
    const card = strip.querySelector(
      '[data-kpi="profit-factor"]',
    ) as HTMLElement;
    expect(
      within(card).getByRole('button', { name: 'Avg win/loss' }),
    ).toBeTruthy();
    expect(card.textContent).toContain('2.00');
    expect(card.textContent).toContain('+$20.00');
    expect(card.textContent).toMatch(/[-\u2212]\$10\.00/);
  });

  test("on touch the Avg win/loss tip's 44px target overlaps its line, as the KPI labels' do, so the line does not grow (M3)", async () => {
    renderApp(<TradesView />, { sample: mixed(), url: '/app/trades' });
    const strip = await screen.findByRole('region', { name: 'Summary' });
    const card = strip.querySelector(
      '[data-kpi="profit-factor"]',
    ) as HTMLElement;
    const line = within(card).getByRole('button', {
      name: 'Avg win/loss',
    }).parentElement!;
    const label = card.querySelector(
      '[data-metric-tip="profit-factor"]',
    )!.parentElement!;
    expect(label.className).toContain('pointer-coarse:-my-3');
    expect(line.className).toContain('pointer-coarse:-my-3');
  });

  test('with no losing trade the ratio says None', async () => {
    renderApp(<TradesView />, { sample: sample(), url: '/app/trades' });
    const strip = await screen.findByRole('region', { name: 'Summary' });
    const card = strip.querySelector(
      '[data-kpi="profit-factor"]',
    ) as HTMLElement;
    expect(card.textContent).toContain('Avg win/loss None');
  });

  test('the net card carries a running P&L line by exit date, labelled without amounts', async () => {
    renderApp(<TradesView />, { sample: mixed(), url: '/app/trades' });
    const strip = await screen.findByRole('region', { name: 'Summary' });
    const net = strip.querySelector('[data-kpi="pnl"]') as HTMLElement;
    const line = within(net).getByRole('img', {
      name: /Running P&L by exit date/,
    });
    expect(line.getAttribute('aria-label')).not.toMatch(/\$/);
  });

  test('the average win and loss follow the display unit', async () => {
    const repository = createLocalRepository({
      indexedDB: new IDBFactory(),
      IDBKeyRange,
      sample: mixed(),
    });
    await repository.prefs.update({ displayUnit: 'percent' });
    renderApp(<TradesView />, { repository, url: '/app/trades' });
    const strip = await screen.findByRole('region', { name: 'Summary' });
    await waitFor(() => {
      const card = strip.querySelector(
        '[data-kpi="profit-factor"]',
      ) as HTMLElement;
      expect(card.textContent).toContain('%');
      expect(card.textContent).not.toContain('$');
    });
  });

  describe('under a unit that narrows the set', () => {
    /** Three ES trades on three days: +40 and +16 ticks, then -12; money nets chosen so the money line has another shape. */
    function unitSample() {
      return async (): Promise<SampleWorkspace> => {
        const fx = fixtureSample();
        const mk = (n: number, net: number, exit: number) =>
          makeTrade({
            id: `u-${n}`,
            serial: n,
            workspaceId: WS,
            accountId: 'acc-a',
            openedAt: new Date(Date.UTC(2026, 10, n, 15, 0)).toISOString(),
            closedAt: new Date(Date.UTC(2026, 10, n, 15, 5)).toISOString(),
            avgEntry: 4500,
            avgExit: exit,
            initialRisk: 1000,
            net,
          });
        return {
          ...fx,
          trades: [mk(2, 3000, 4510), mk(3, 1000, 4504), mk(4, -500, 4497)],
        };
      };
    }
    async function strip(unit: 'ticks' | 'r') {
      const repository = createLocalRepository({
        indexedDB: new IDBFactory(),
        IDBKeyRange,
        sample: unitSample(),
      });
      await repository.prefs.update({ displayUnit: unit });
      renderApp(<TradesView />, { repository, url: '/app/trades' });
      return screen.findByRole('region', { name: 'Summary' });
    }
    const lineOf = (series: number[]) =>
      equityPath(series, { xMax: 56, top: 2.5, bottom: 21.5, floor: 24 }).line;

    test('Ticks: the ratio, the amounts and the running line are in ticks', async () => {
      const el = await strip('ticks');
      await waitFor(() => {
        const card = el.querySelector('[data-kpi="profit-factor"]')!;
        // Average win (40 + 16) / 2 = 28 ticks, average loss -12 ticks.
        expect(card.textContent).toContain('2.33');
        expect(card.textContent).toMatch(/28/);
        expect(card.textContent).toMatch(/12/);
        expect(card.textContent).not.toContain('$');
      });
      const path = el.querySelector('[data-kpi="pnl"] svg path')!;
      expect(path.getAttribute('d')).toBe(lineOf([40, 56, 44]));
    });

    test('R: the ratio, the amounts and the running line are in R', async () => {
      const el = await strip('r');
      await waitFor(() => {
        const card = el.querySelector('[data-kpi="profit-factor"]')!;
        // Average win (3R + 1R) / 2 = 2R, average loss -0.5R.
        expect(card.textContent).toContain('4.00');
        expect(card.textContent).toMatch(/2(\.00)?R/);
        expect(card.textContent).not.toContain('$');
      });
      const path = el.querySelector('[data-kpi="pnl"] svg path')!;
      expect(path.getAttribute('d')).toBe(lineOf([3, 4, 3.5]));
    });
  });
});

describe('the Status column reads the outcome', () => {
  async function statuses(url: string) {
    const repository = createLocalRepository({
      indexedDB: new IDBFactory(),
      IDBKeyRange,
      sample: mixed(),
    });
    await repository.prefs.update({
      tradeColumns: [...DEFAULT_COLUMNS, 'status'],
    });
    renderApp(<TradesView />, { repository, url });
    const t = await table();
    const heads = within(t).getAllByRole('columnheader');
    const at = heads.findIndex((h) => /Status/.test(h.textContent ?? ''));
    return {
      t,
      read: () =>
        bodyRows(t).map((r) => r.querySelectorAll('td')[at]!.textContent),
    };
  }

  test('Win, Loss and Breakeven for closed trades, never Closed', async () => {
    const { read } = await statuses('/app/trades');
    await waitFor(() => expect(read()).toContain('Win'));
    expect(read().sort()).toEqual(['Breakeven', 'Loss', 'Win', 'Win']);
  });

  test('an open trade reads Open', async () => {
    const { read } = await statuses('/app/trades?status=open');
    await waitFor(() => expect(read()).toEqual(['Open']));
  });

  test('the column sorts by outcome', async () => {
    const { t, read } = await statuses('/app/trades');
    await waitFor(() => expect(read()).toContain('Win'));
    fireEvent.click(within(t).getByRole('button', { name: 'Status' }));
    await waitFor(() =>
      expect(
        within(t)
          .getByRole('columnheader', { name: /Status/ })
          .getAttribute('aria-sort'),
      ).not.toBe('none'),
    );
    const rank: Record<string, number> = { Win: 0, Breakeven: 1, Loss: 2 };
    const ranks = read().map((s) => rank[s!]!);
    const asc = [...ranks].sort((a, b) => a - b);
    const desc = [...asc].reverse();
    expect([asc, desc]).toContainEqual(ranks);
  });
});

describe('paging in the URL', () => {
  const at = (search: string) => '/app/trades' + search;

  test('?per= and ?page= set the rows and the page on load', async () => {
    renderApp(<TradesView />, { sample: sample(), url: at('?per=25&page=2') });
    await table();
    expect(screen.getByText(/26-50 of 120/)).toBeTruthy();
  });

  test('a bad ?per= falls back to 50 and a page past the end to the last', async () => {
    renderApp(<TradesView />, { sample: sample(), url: at('?per=7&page=99') });
    const t = await table();
    expect(screen.getByText(/101-120 of 120/)).toBeTruthy();
    expect(bodyRows(t)).toHaveLength(20);
  });

  test('Rows per page offers 25, 50 and 100 in the app dropdown and writes ?per=', async () => {
    renderApp(<TradesView />, { sample: sample(), url: at('') });
    const t = await table();
    expect(document.querySelector('select')).toBeNull();
    const trigger = screen.getByRole('button', {
      name: 'Rows per page, 50 per page',
    });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(
      (await screen.findAllByRole('menuitemradio')).map((o) => o.textContent),
    ).toEqual(['25 per page', '50 per page', '100 per page']);
    fireEvent.click(screen.getByRole('menuitemradio', { name: '25 per page' }));
    await waitFor(() => expect(window.location.search).toContain('per=25'));
    expect(screen.getByText(/1-25 of 120/)).toBeTruthy();
    expect(bodyRows(t)).toHaveLength(25);
  });

  test('choosing the default again leaves ?per= off the URL, and a new size starts at page 1', async () => {
    renderApp(<TradesView />, { sample: sample(), url: at('?per=25&page=3') });
    await table();
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Rows per page, 25 per page' }),
      {
        key: 'Enter',
      },
    );
    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: '50 per page' }),
    );
    await waitFor(() => expect(screen.getByText(/1-50 of 120/)).toBeTruthy());
    expect(window.location.search).not.toContain('per=');
    expect(window.location.search).not.toContain('page=');
  });

  test('Next page writes ?page=, and the jump field goes to a page and reads "of N"', async () => {
    renderApp(<TradesView />, { sample: sample(), url: at('') });
    const t = await table();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(window.location.search).toContain('page=2'));
    const jump = screen.getByRole('spinbutton', { name: 'Go to page' });
    expect((jump as HTMLInputElement).value).toBe('2');
    expect(screen.getByText('of 3')).toBeTruthy();
    fireEvent.change(jump, { target: { value: '3' } });
    fireEvent.keyDown(jump, { key: 'Enter' });
    await waitFor(() =>
      expect(screen.getByText(/101-120 of 120/)).toBeTruthy(),
    );
    expect(window.location.search).toContain('page=3');
    expect(bodyRows(t)).toHaveLength(20);
    // Going back to page 1 leaves it off the URL.
    const again = screen.getByRole('spinbutton', { name: 'Go to page' });
    fireEvent.change(again, { target: { value: '1' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText(/1-50 of 120/)).toBeTruthy());
    expect(window.location.search).not.toContain('page=');
  });

  test('a jump past the last page lands on the last', async () => {
    renderApp(<TradesView />, { sample: sample(), url: at('') });
    await table();
    const jump = screen.getByRole('spinbutton', { name: 'Go to page' });
    fireEvent.change(jump, { target: { value: '40' } });
    fireEvent.keyDown(jump, { key: 'Enter' });
    await waitFor(() =>
      expect(screen.getByText(/101-120 of 120/)).toBeTruthy(),
    );
  });

  test('a typed page number is not applied when the next click follows it', async () => {
    renderApp(<TradesView />, { sample: sample(), url: at('') });
    await table();
    const jump = screen.getByRole('spinbutton', { name: 'Go to page' });
    fireEvent.change(jump, { target: { value: '3' } });
    fireEvent.blur(jump);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(screen.getByText(/51-100 of 120/)).toBeTruthy());
    expect(window.location.search).toContain('page=2');
    expect(
      (
        screen.getByRole('spinbutton', {
          name: 'Go to page',
        }) as HTMLInputElement
      ).value,
    ).toBe('2');
  });

  test('changing a filter sends the log back to page 1', async () => {
    renderApp(<TradesView />, {
      sample: sample({ open: 3 }),
      url: at('?page=2'),
    });
    await table();
    expect(screen.getByText(/51-100 of 120/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Open/ }));
    await waitFor(() =>
      expect(window.location.search).toContain('status=open'),
    );
    expect(window.location.search).not.toContain('page=');
  });
});

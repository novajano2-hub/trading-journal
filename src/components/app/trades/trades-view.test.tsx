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
import { createLocalRepository } from '@/data/local/local-repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { ALL_COLUMNS, DEFAULT_COLUMNS } from '@/data/trade-columns';
import { makeTrade } from '@/domain/__fixtures__/trades';
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
function sample(opts: { open?: number } = {}) {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    const closed = Array.from({ length: 120 }, (_, i) => {
      const n = i + 1;
      const openedAt = START + i * 600_000;
      return makeTrade({
        id: `t-${n}`,
        serial: n,
        workspaceId: WS,
        accountId: 'acc-a',
        openedAt: new Date(openedAt).toISOString(),
        closedAt: new Date(openedAt + 300_000).toISOString(),
        net: (121 - n) * 1000,
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
  within(row).getByRole('link').getAttribute('href')!.split('/').pop();

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
  // Reset to default brings it back.
  fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
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

test("the default columns are comp 01's, Net ROI in and Mistake off", async () => {
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

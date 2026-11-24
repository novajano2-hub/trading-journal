// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { SampleWorkspace } from '@/data/seed/generate';
import { breakdown2D } from '@/domain/metrics/breakdowns';
import { breakdownSample } from '../__fixtures__/breakdown-sample';
import { renderApp } from '../__fixtures__/render-app';
import { StrategiesView, SymbolsView, TagsView } from './breakdown-report';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
vi.mock('@/domain/metrics/breakdowns', async (original) => {
  const real = await original<typeof import('@/domain/metrics/breakdowns')>();
  return { ...real, breakdown2D: vi.fn(real.breakdown2D) };
});
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const rowOf = (table: HTMLElement, name: RegExp) =>
  within(within(table).getByRole('row', { name }));

test('symbols: a chart of net, and a table with each symbol', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols',
  });
  const page = await screen.findByTestId('reports-symbols');
  expect(
    within(page).getByRole('img', { name: /Net P&L by symbol/ }),
  ).toBeTruthy();
  const table = within(page).getByRole('table', { name: 'Symbols summary' });
  // ES +$60.00 on 2 trades, NQ +$50.00 on 2, SPY +$15.00 on 3.
  const es = rowOf(table, /^ES/)
    .getAllByRole('cell')
    .map((c) => c.textContent);
  expect(es.slice(0, 4)).toEqual(['ES', '2', '50.0%', '+$60.00']);
  expect(rowOf(table, /^SPY/).getAllByRole('cell')[3]!.textContent).toBe(
    '+$15.00',
  );
  // Every header with a metric carries its definition.
  expect(
    table.querySelector('[data-metric-tip="profit-factor"]'),
  ).not.toBeNull();
});

test('cross-analysed by side the table swaps for a symbol by side matrix', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols?x=side',
  });
  const page = await screen.findByTestId('reports-symbols');
  expect(
    within(page).queryByRole('table', { name: 'Symbols summary' }),
  ).toBeNull();
  const matrix = within(page).getByRole('table', { name: 'Symbols by side' });
  const nq = rowOf(matrix, /^NQ/).getAllByRole('cell');
  expect(nq[0]!.textContent).toContain('+$70.00');
  expect(nq[1]!.textContent).toContain('−$20.00');
  const pick = async (name: RegExp, option: string) => {
    fireEvent.keyDown(within(page).getByRole('button', { name }), {
      key: 'Enter',
    });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: option }));
  };
  expect(
    within(page).getByRole('button', { name: 'Cross-analyse by, Side' }),
  ).toBeTruthy();
  // Back to none restores the table and clears the address.
  await pick(/^Cross-analyse by/, 'None');
  expect(
    await within(page).findByRole('table', { name: 'Symbols summary' }),
  ).toBeTruthy();
  expect(new URLSearchParams(window.location.search).get('x')).toBeNull();
  // The matrix can show win rate instead of net.
  await pick(/^Cross-analyse by/, 'Side');
  await pick(/^Cross-analysis metric/, 'Win rate');
  const rate = rowOf(
    within(page).getByRole('table', { name: 'Symbols by side' }),
    /^NQ/,
  ).getAllByRole('cell');
  expect(rate[0]!.textContent).toContain('100.0%');
  expect(rate[1]!.textContent).toContain('0.0%');
});

test('a trade with two strategies counts under each', async () => {
  renderApp(<StrategiesView />, {
    sample: breakdownSample,
    url: '/app/reports/strategies',
  });
  const page = await screen.findByTestId('reports-strategies');
  const table = within(page).getByRole('table', { name: 'Strategies summary' });
  // Opening range breakout: b-1 and b-3. Pullback: b-3. No strategy: the other five.
  expect(
    rowOf(table, /^Opening range breakout/).getAllByRole('cell')[1]!
      .textContent,
  ).toBe('2');
  expect(rowOf(table, /^Pullback/).getAllByRole('cell')[1]!.textContent).toBe(
    '1',
  );
  expect(
    rowOf(table, /^No strategy/).getAllByRole('cell')[1]!.textContent,
  ).toBe('5');
});

test('tags have a category select', async () => {
  renderApp(<TagsView />, {
    sample: breakdownSample,
    url: '/app/reports/tags',
  });
  const page = await screen.findByTestId('reports-tags');
  const table = () => within(page).getByRole('table', { name: 'Tags summary' });
  expect(rowOf(table(), /^breakout/)).toBeTruthy();
  expect(rowOf(table(), /^fomo/)).toBeTruthy();
  fireEvent.keyDown(
    within(page).getByRole('button', { name: 'Category, All categories' }),
    { key: 'Enter' },
  );
  const items = await screen.findAllByRole('menuitemradio');
  expect(items.map((o) => o.textContent)).toEqual([
    'All categories',
    'Custom tags',
    'Mistakes',
    'Setups',
  ]);
  fireEvent.click(items[2]!);
  expect(within(table()).queryByRole('row', { name: /^breakout/ })).toBeNull();
  expect(rowOf(table(), /^fomo/).getAllByRole('cell')[4]!.textContent).toBe(
    '−$40.00',
  );
  expect(new URLSearchParams(window.location.search).get('cat')).toBe(
    'mistakes',
  );
});

test('Privacy leaves no dollar amount in the table, the matrix or the chart', async () => {
  const { createLocalRepository } =
    await import('@/data/local/local-repository');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: breakdownSample,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  const { container } = renderApp(<SymbolsView />, {
    repository,
    url: '/app/reports/symbols?x=side',
  });
  await screen.findByTestId('reports-symbols');
  expect(container.textContent).toContain('$•••');
  expect(container.textContent).not.toMatch(/\$\d/);
  expect(container.innerHTML).not.toMatch(/aria-label="[^"]*\$\d/);
});

async function repositoryWith(
  prefs: Record<string, unknown>,
  sample: (now: Date) => Promise<SampleWorkspace> = breakdownSample,
) {
  const { createLocalRepository } =
    await import('@/data/local/local-repository');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample,
  });
  await repository.prefs.update(prefs);
  return repository;
}

test('in R the table, the average, the best and worst and the matrix read in R', async () => {
  const repository = await repositoryWith({ displayUnit: 'r' });
  renderApp(<SymbolsView />, {
    repository,
    url: '/app/reports/symbols',
  });
  const page = await screen.findByTestId('reports-symbols');
  const table = within(page).getByRole('table', { name: 'Symbols summary' });
  // ES: b-1 is +2R and b-2 is -1R.
  const es = rowOf(table, /^ES/)
    .getAllByRole('cell')
    .map((c) => c.textContent);
  expect(es[3]).toContain('+1.00R');
  expect(es[5]).toContain('+0.50R');
  expect(
    within(
      within(page).getByRole('list', { name: 'Best and worst' }),
    ).getByText(/\+1\.00R/),
  ).toBeTruthy();
});

test('in R the matrix cells read in R', async () => {
  const repository = await repositoryWith({ displayUnit: 'r' });
  renderApp(<SymbolsView />, {
    repository,
    url: '/app/reports/symbols?x=side',
  });
  const page = await screen.findByTestId('reports-symbols');
  const es = rowOf(
    within(page).getByRole('table', { name: 'Symbols by side' }),
    /^ES/,
  ).getAllByRole('cell');
  expect(es[0]!.textContent).toContain('+2.00R');
  expect(es[1]!.textContent).toContain('−1.00R');
});

/** The breakdown sample, with a second "fomo" tag in another category on the two NQ trades. */
async function twinTags(): Promise<SampleWorkspace> {
  const s = await breakdownSample();
  s.tags.push({
    ...s.tags[1]!,
    id: 'tag-fomo-custom',
    categoryId: 'custom-tags',
  });
  s.trades = s.trades.map((t) =>
    t.id === 'b-3' || t.id === 'b-4'
      ? { ...t, tagIds: ['tag-fomo-custom'] }
      : t,
  );
  return s;
}

test('two tags with one name in different categories stay apart under a category and in the matrix', async () => {
  renderApp(<TagsView />, {
    sample: twinTags,
    url: '/app/reports/tags?cat=mistakes',
  });
  const page = await screen.findByTestId('reports-tags');
  const table = within(page).getByRole('table', { name: 'Tags summary' });
  // Mistakes holds only the first fomo (b-2, -$40.00), not the Custom tags one.
  const rows = within(table).getAllByRole('row', { name: /^fomo/ });
  expect(rows).toHaveLength(1);
  expect(within(rows[0]!).getAllByRole('cell')[4]!.textContent).toBe('−$40.00');
  cleanup();
  renderApp(<TagsView />, {
    sample: twinTags,
    url: '/app/reports/tags?x=side',
  });
  const all = await screen.findByTestId('reports-tags');
  const matrix = within(all).getByRole('table', { name: 'Tags by side' });
  const text = within(matrix)
    .getAllByRole('row', { name: /^fomo/ })
    .map((r) => r.textContent!);
  // Mistakes fomo: one short loss. Custom tags fomo: a long win and a short loss.
  const mistakes = text.find((t) => t.includes('−$40.00'))!;
  const custom = text.find((t) => t.includes('+$70.00'))!;
  expect(mistakes).toBeTruthy();
  expect(custom).toBeTruthy();
  expect(mistakes).not.toContain('+$70.00');
  expect(custom).not.toContain('−$40.00');
  expect(custom).toContain('−$20.00');
});

test('the charts say the range and the best and worst; Privacy hides the amounts in them', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols',
  });
  const page = await screen.findByTestId('reports-symbols');
  expect(
    within(page).getByRole('img', {
      name: /Net P&L by symbol, all time\. Best ES \+\$60\.00, worst SPY \+\$15\.00/,
    }),
  ).toBeTruthy();
  cleanup();
  const repository = await repositoryWith({ displayUnit: 'privacy' });
  renderApp(<SymbolsView />, { repository, url: '/app/reports/symbols' });
  const hidden = await screen.findByTestId('reports-symbols');
  expect(
    within(hidden).getByRole('img', {
      name: /Net P&L by symbol, all time\. Best ES hidden amount, worst SPY hidden amount/,
    }),
  ).toBeTruthy();
});

test('the matrix is computed once per view, not once for the metric and again for the counts', async () => {
  const calls = vi.mocked(breakdown2D);
  calls.mockClear();
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols?x=side',
  });
  const page = await screen.findByTestId('reports-symbols');
  within(page).getByRole('table', { name: 'Symbols by side' });
  expect(calls).toHaveBeenCalledTimes(1);
});

test('the table has Largest win and Largest loss columns', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols',
  });
  const page = await screen.findByTestId('reports-symbols');
  const table = within(page).getByRole('table', { name: 'Symbols summary' });
  const heads = within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(heads.slice(-2)).toEqual(['Largest win', 'Largest loss']);
  // ES: b-1 won 100.00 and b-2 lost 40.00.
  const es = rowOf(table, /^ES/)
    .getAllByRole('cell')
    .map((c) => c.textContent);
  expect(es.slice(-2)).toEqual(['+$100.00', '−$40.00']);
  // NQ: b-3 won 70.00 and b-4 lost 20.00.
  const nq = rowOf(table, /^NQ/)
    .getAllByRole('cell')
    .map((c) => c.textContent);
  expect(nq.slice(-2)).toEqual(['+$70.00', '−$20.00']);
});

function captureDownload() {
  let blob: Blob | undefined;
  let name = '';
  Object.assign(URL, {
    createObjectURL: vi.fn((b: Blob) => {
      blob = b;
      return 'blob:keel';
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    name = this.download;
  });
  return {
    name: () => name,
    text: async () => (await blob!.text()).replace(/^﻿/, ''),
  };
}

test('Export CSV writes the visible columns with real values even under Privacy, on the current filters', async () => {
  const repository = await repositoryWith({ displayUnit: 'privacy' });
  renderApp(<SymbolsView />, {
    repository,
    url: '/app/reports/symbols?side=short',
  });
  const page = await screen.findByTestId('reports-symbols');
  const saved = captureDownload();
  fireEvent.click(
    await within(page).findByRole('button', { name: 'Export CSV' }),
  );
  await vi.waitFor(() => expect(saved.name()).not.toBe(''));
  expect(saved.name()).toMatch(/^keel-symbols-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = (await saved.text()).split('\r\n').filter(Boolean);
  expect(lines[0]).toBe(
    'Symbol,Trades,Win rate (%),Net P&L (USD),Profit factor,Average (USD),Largest win (USD),Largest loss (USD)',
  );
  // Only the shorts: ES b-2 (-40.00) and NQ b-4 (-20.00).
  expect(lines.slice(1).sort()).toEqual([
    'ES,1,0.0,-40.00,0.00,-40.00,,-40.00',
    'NQ,1,0.0,-20.00,0.00,-20.00,,-20.00',
  ]);
  expect(lines.join('')).not.toContain('•');
});

test('Export CSV of a cross-analysis writes the matrix', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols?x=side',
  });
  const page = await screen.findByTestId('reports-symbols');
  const saved = captureDownload();
  fireEvent.click(
    await within(page).findByRole('button', { name: 'Export CSV' }),
  );
  await vi.waitFor(() => expect(saved.name()).not.toBe(''));
  const lines = (await saved.text()).split('\r\n').filter(Boolean);
  expect(lines[0]).toBe('Symbol,Long,Short');
  expect(lines).toContain('NQ,70.00,-20.00');
});

test('the chart has metric chips: Net P&L and Win rate, removable, with + Metric to add up to three', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols',
  });
  const page = await screen.findByTestId('reports-symbols');
  const chips = within(
    await within(page).findByRole('group', { name: 'Chart metrics' }),
  );
  expect(chips.getByRole('button', { name: /^Net P&L, bars/ })).toBeTruthy();
  expect(chips.getByRole('button', { name: /^Win rate, line/ })).toBeTruthy();
  // A chip's kind toggles.
  fireEvent.click(chips.getByRole('button', { name: /^Net P&L, bars/ }));
  expect(new URLSearchParams(window.location.search).get('m')).toBe(
    'net:line,win-rate:line',
  );
  fireEvent.click(chips.getByRole('button', { name: 'Remove Win rate' }));
  expect(new URLSearchParams(window.location.search).get('m')).toBe('net:line');
  // Add Trades from the menu.
  fireEvent.keyDown(chips.getByRole('button', { name: 'Add metric' }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Trades' }));
  expect(new URLSearchParams(window.location.search).get('m')).toBe(
    'net:line,trades:bar',
  );
  // The chart now holds those two series.
  const chart = within(page).getByRole('table', { name: /Net P&L by symbol/ });
  expect(
    within(chart)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual(['Period', 'Net P&L', 'Trades']);
});

test('at three metrics the menu offers no more', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols?m=net:bar,win-rate:line,trades:bar',
  });
  const page = await screen.findByTestId('reports-symbols');
  const add = await within(page).findByRole('button', { name: 'Add metric' });
  expect((add as HTMLButtonElement).disabled).toBe(true);
});

test('the chart readout gives the trades in the bucket', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols',
  });
  const page = await screen.findByTestId('reports-symbols');
  const chart = await within(page).findByRole('img', {
    name: /Net P&L by symbol/,
  });
  act(() => chart.focus());
  const readout = within(page).getAllByRole('status')[0]!;
  expect(readout.textContent).toMatch(/Trades\s*\d/);
});

test('in Ticks the largest-win column shows and sorts by the ticks, not the dollars', async () => {
  const { createLocalRepository } =
    await import('@/data/local/local-repository');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  const { resolveInstrument } = await import('@/domain/instruments');
  const sample = async (): Promise<SampleWorkspace> => {
    const s = await breakdownSample();
    const es = s.trades[0]!;
    // ES: $1,000 on 8 ticks. NQ: $100 on 20 ticks.
    s.trades = [
      {
        ...es,
        id: 'w-es',
        net: 100000,
        gross: 100000,
        avgEntry: 4500,
        avgExit: 4502,
        maxPosition: 1,
      },
      {
        ...es,
        id: 'w-nq',
        instrument: resolveInstrument('NQZ5')!,
        net: 10000,
        gross: 10000,
        avgEntry: 21000,
        avgExit: 21005,
        maxPosition: 1,
      },
    ];
    return s;
  };
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample,
  });
  await repository.prefs.update({ displayUnit: 'ticks' });
  renderApp(<SymbolsView />, { repository, url: '/app/reports/symbols' });
  const page = await screen.findByTestId('reports-symbols');
  const table = within(page).getByRole('table', { name: 'Symbols summary' });
  const header = within(table)
    .getAllByRole('columnheader')
    .find((h) => h.querySelector('[data-metric-tip="largest-win"]'))!;
  const column = within(table).getAllByRole('columnheader').indexOf(header);
  fireEvent.click(
    within(header).getByRole('button', { name: 'Sort by Largest win' }),
  );
  const rows = within(table).getAllByRole('row').slice(1);
  expect(header.getAttribute('aria-sort')).toBe('descending');
  expect(rows.map((r) => r.children[column]!.textContent)).toEqual([
    '+20.0 ticks',
    '+8.0 ticks',
  ]);
});

const hrefOf = (el: HTMLElement) =>
  new URL(el.getAttribute('href')!, 'http://k');

test('a symbol row is a link to the log filtered to that symbol, named for where it goes', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols?range=ytd&side=long',
  });
  const page = await screen.findByTestId('reports-symbols');
  const table = within(page).getByRole('table', { name: 'Symbols summary' });
  const link = within(table).getByRole('link', {
    name: /^ES, open \d+ trades? in the trade log$/,
  });
  const url = hrefOf(link);
  expect(url.pathname).toBe('/app/trades');
  // The page's range and side stay; the symbol is added.
  expect(url.searchParams.get('symbol')).toBe('ES');
  expect(url.searchParams.get('range')).toBe('ytd');
  expect(url.searchParams.get('side')).toBe('long');
});

test('every bar of the chart is a link too, out of the tab order, over the keyboard table', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols',
  });
  const page = await screen.findByTestId('reports-symbols');
  const chart = within(page).getByRole('img', { name: /Net P&L by symbol/ });
  const bars = [...chart.querySelectorAll('a')];
  expect(bars.length).toBeGreaterThan(0);
  for (const bar of bars) {
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect(bar.getAttribute('tabindex')).toBe('-1');
  }
  const symbols = bars.map((b) => hrefOf(b).searchParams.get('symbol'));
  expect(symbols).toContain('ES');
  // Each has a focusable link in the table, so the keyboard loses nothing.
  const table = within(page).getByRole('table', { name: 'Symbols summary' });
  const inTable = within(table)
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'));
  for (const bar of bars) expect(inTable).toContain(bar.getAttribute('href'));
});

test('a cross-analysis cell links to the trades in both buckets', async () => {
  renderApp(<SymbolsView />, {
    sample: breakdownSample,
    url: '/app/reports/symbols?x=side',
  });
  const page = await screen.findByTestId('reports-symbols');
  const matrix = within(page).getByRole('table', { name: 'Symbols by side' });
  const cell = within(matrix).getAllByRole('link')[0]!;
  const url = hrefOf(cell);
  expect(url.pathname).toBe('/app/trades');
  expect(url.searchParams.get('symbol')).not.toBeNull();
  expect(['long', 'short']).toContain(url.searchParams.get('side'));
  expect(cell.getAttribute('aria-label')).toMatch(/open in the trade log$/);
});

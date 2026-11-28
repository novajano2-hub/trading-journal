// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import type { UserPrefs } from '@/domain/types';
import { everyString } from '../__fixtures__/every-string';
import { patternsReportSample } from '../__fixtures__/patterns-report-sample';
import { renderApp } from '../__fixtures__/render-app';
import { PatternsView } from './patterns-report';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(() => {
  cleanup();
  window.innerWidth = 1024;
});

/** Renders over a repository read in UTC, so a clock reads as written. */
async function renderReport(
  url = '/app/reports/patterns',
  opts: {
    sample?: () => Promise<SampleWorkspace>;
    prefs?: Partial<UserPrefs>;
  } = {},
) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: opts.sample ?? (async () => patternsReportSample()),
  });
  await repository.prefs.update({ timeZone: 'UTC', ...opts.prefs });
  const out = renderApp(<PatternsView />, { repository, url });
  const page = await screen.findByTestId('reports-patterns');
  // The page is ready before the patterns are read: wait out its skeleton.
  await vi.waitFor(() =>
    expect(
      within(page).queryByRole('status', { name: 'Loading the report' }),
    ).toBeNull(),
  );
  return { ...out, page };
}

const tableOf = (page: HTMLElement) =>
  within(page).getByRole('table', { name: 'Patterns summary' });
const rowOf = (page: HTMLElement, name: RegExp) =>
  within(within(tableOf(page)).getByRole('row', { name }));
const cells = (page: HTMLElement, name: RegExp) =>
  rowOf(page, name)
    .getAllByRole('cell')
    .map((c) => c.textContent);

test('the report lists each pattern with its trades', async () => {
  const { page } = await renderReport();
  expect(
    within(page).getByRole('img', { name: /^Net P&L by pattern/ }),
  ).toBeTruthy();
  // One row per pattern that fired, the best net first: trades, win rate, net P&L.
  const rows = within(tableOf(page))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]!.textContent);
  expect(rows).toEqual([
    'Added to the position',
    'Loss after a loss',
    'Quick re-entries after a loss',
  ]);
  expect(cells(page, /^Added to the position/).slice(0, 4)).toEqual([
    'Added to the position',
    '1',
    '0.0%',
    '−$20.00',
  ]);
  expect(cells(page, /^Loss after a loss/).slice(0, 4)).toEqual([
    'Loss after a loss',
    '2',
    '0.0%',
    '−$30.00',
  ]);
  // The shared columns of a breakdown are all there.
  const heads = within(tableOf(page))
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(heads).toEqual([
    'Pattern',
    'Trades',
    'Win rate',
    'Net P&L',
    'Profit factor',
    'Average',
    'Avg win',
    'Avg loss',
    'Largest win',
    'Largest loss',
    'Avg daily vol',
  ]);
  // A trade with no pattern has no row of its own.
  expect(within(tableOf(page)).queryByText(/No pattern/)).toBeNull();
});

test('a trade with two patterns counts in both rows', async () => {
  const { page } = await renderReport();
  // q-2 (-$20.00) fired Added to the position and Loss after a loss: it is in each row,
  // beside q-3 (-$10.00) in the second.
  expect(cells(page, /^Added to the position/)[3]).toBe('−$20.00');
  expect(cells(page, /^Loss after a loss/)[3]).toBe('−$30.00');
  // So the rows hold more trades than there are trades with a pattern.
  const trades = ['Added to the position', 'Loss after a loss'].map((n) =>
    Number(cells(page, new RegExp(`^${n}`))[1]),
  );
  expect(trades.reduce((a, b) => a + b, 0)).toBe(3);
});

test("a day pattern counts that day's trades, and the caption says so", async () => {
  const { page } = await renderReport();
  // Quick re-entries fired on Mon 2 Nov: its three trades (-$30, -$20, -$10) are in the row,
  // though the pattern was read from two of them.
  expect(cells(page, /^Quick re-entries after a loss/).slice(0, 4)).toEqual([
    'Quick re-entries after a loss',
    '3',
    '0.0%',
    '−$60.00',
  ]);
  expect(
    within(page).getByText(
      "A trade counts under each of its patterns; a day pattern counts that day's trades",
    ),
  ).toBeTruthy();
  // Tue 3 Nov's winner fired nothing, on a day with none: it is in no row.
  expect(within(page).queryByRole('row', { name: /\+\$50\.00/ })).toBeNull();
});

test('each row opens the trade log on its pattern, under the page filters', async () => {
  const { page } = await renderReport('/app/reports/patterns?side=long');
  const link = within(tableOf(page)).getByRole('link', {
    name: 'Quick re-entries after a loss, open 3 trades in the trade log',
  });
  const url = new URL(link.getAttribute('href')!, 'http://k');
  expect(url.pathname).toBe('/app/trades');
  expect(url.searchParams.get('pat')).toBe('quick-reentries');
  expect(url.searchParams.get('side')).toBe('long');
});

test('there is no cross-analysis, and a stale address for one is ignored', async () => {
  const { page } = await renderReport('/app/reports/patterns?x=side');
  expect(
    within(page).queryByRole('button', { name: /Cross-analyse by/ }),
  ).toBeNull();
  // The table stays a table of patterns.
  expect(tableOf(page)).toBeTruthy();
  expect(within(page).queryByRole('table', { name: /by side/ })).toBeNull();
});

test('best and worst and the highlights read over the patterns', async () => {
  const { page } = await renderReport();
  const ranking = within(page).getByRole('list', { name: 'Best and worst' });
  expect(
    within(ranking)
      .getAllByRole('listitem')
      .map((li) => within(li).getByText(/.+/, { selector: 'b' }).textContent),
  ).toEqual([
    'Added to the position',
    'Loss after a loss',
    'Quick re-entries after a loss',
  ]);
  const highlights = within(page).getByRole('list', { name: 'Highlights' });
  expect(highlights.textContent).toContain(
    'Most active' + 'Quick re-entries after a loss' + '3 trades',
  );
});

test("the Trades header's tip says how a pattern counts a trade, a day pattern's trades included", async () => {
  const { page } = await renderReport();
  const tip = tableOf(page).querySelector('[data-metric-tip="pattern-trades"]');
  expect(tip).not.toBeNull();
  expect(tip!.textContent).toBe('Trades');
  // Not the plain breakdown's definition: the other columns keep theirs.
  expect(tableOf(page).querySelector('[data-metric-tip="trades"]')).toBeNull();
  expect(
    tableOf(page).querySelector('[data-metric-tip="profit-factor"]'),
  ).not.toBeNull();
});

test('a pattern name with "to" in it stays one name: only range labels split there', async () => {
  const { page } = await renderReport();
  const link = within(tableOf(page)).getByRole('link', {
    name: /^Added to the position, open/,
  });
  // One name in ink, not "Added" in ink and "to the position" muted as a range reads.
  expect(link.querySelectorAll('b')).toHaveLength(1);
  expect(link.querySelector('b')!.textContent).toBe('Added to the position');
  expect(link.querySelector('.text-muted')).toBeNull();
});

test('a long name in Best and worst is cut with its whole name on hover', async () => {
  const { page } = await renderReport();
  const ranking = within(page).getByRole('list', { name: 'Best and worst' });
  const name = within(ranking).getByText('Quick re-entries after a loss');
  expect(name.getAttribute('title')).toBe('Quick re-entries after a loss');
});

test('on a phone the table becomes two-line rows: the name and net, then trades, win rate and profit factor', async () => {
  window.innerWidth = 390;
  const { page } = await renderReport();
  // The chart keeps its own data table for the keyboard; the summary is no table.
  expect(
    within(page).queryByRole('table', { name: 'Patterns summary' }),
  ).toBeNull();
  const list = within(page).getByRole('list', { name: 'Patterns summary' });
  const rows = within(list).getAllByRole('listitem');
  expect(rows).toHaveLength(3);
  // The best net first, as the table sorts.
  expect(
    rows.map((r) => r.querySelector('[data-line="1"]')!.textContent),
  ).toEqual([
    'Added to the position−$20.00',
    'Loss after a loss−$30.00',
    'Quick re-entries after a loss−$60.00',
  ]);
  expect(rows[2]!.querySelector('[data-line="2"]')!.textContent).toBe(
    '3 trades0.0% wonPF 0.00',
  );
  expect(rows[0]!.querySelector('[data-line="2"]')!.textContent).toContain(
    '1 trade0.0% won',
  );
  // The row opens the log on its pattern.
  const link = within(rows[2]!).getByRole('link', {
    name: 'Quick re-entries after a loss, open 3 trades in the trade log',
  });
  expect(
    new URL(link.getAttribute('href')!, 'http://k').searchParams.get('pat'),
  ).toBe('quick-reentries');
  // Columns choose the table's columns, so they are not offered; the export stays.
  expect(within(page).queryByRole('button', { name: /^Columns/ })).toBeNull();
  expect(within(page).getByRole('button', { name: 'Export CSV' })).toBeTruthy();
});

test('on a phone Privacy hides the net and the profit factor in the rows', async () => {
  window.innerWidth = 390;
  const { container, page } = await renderReport('/app/reports/patterns', {
    prefs: { displayUnit: 'privacy' },
  });
  within(page).getByRole('list', { name: 'Patterns summary' });
  expect(container.textContent).toContain('$•••');
  expect(everyString(container).filter((t) => /\$\d|0\.00/.test(t))).toEqual(
    [],
  );
});

test('Privacy leaves no dollar amount in the table, the chart or the links', async () => {
  const { container, page } = await renderReport('/app/reports/patterns', {
    prefs: { displayUnit: 'privacy' },
  });
  await within(page).findByRole('table', { name: 'Patterns summary' });
  expect(container.textContent).toContain('$•••');
  expect(everyString(container).filter((t) => /\$\d/.test(t))).toEqual([]);
});

test('with no pattern fired the report says so once, instead of three empty cards', async () => {
  // The fixture sample's two closed trades fire nothing.
  const { page } = await renderReport('/app/reports/patterns', {
    sample: async () => fixtureSample(),
  });
  expect(
    within(page).getByRole('heading', {
      name: 'No patterns have fired in these trades.',
    }),
  ).toBeTruthy();
  expect(within(page).queryByRole('table')).toBeNull();
  expect(within(page).queryByText('No closed trades here yet.')).toBeNull();
});

test('Export CSV writes one row per pattern, with real values even under Privacy', async () => {
  const { page } = await renderReport('/app/reports/patterns', {
    prefs: { displayUnit: 'privacy' },
  });
  let saved = '';
  const create = URL.createObjectURL;
  URL.createObjectURL = (b: Blob | MediaSource) => {
    void (b as Blob).text().then((t) => (saved = t));
    return 'blob:k';
  };
  try {
    fireEvent.click(
      await within(page).findByRole('button', { name: 'Export CSV' }),
    );
    await vi.waitFor(() => expect(saved).not.toBe(''));
  } finally {
    URL.createObjectURL = create;
  }
  const lines = saved.replace(/^﻿/, '').split('\r\n').filter(Boolean);
  expect(
    lines[0]!.startsWith('Pattern,Trades,Win rate (%),Net P&L (USD)'),
  ).toBe(true);
  expect(lines.slice(1).map((l) => l.split(',').slice(0, 4).join(','))).toEqual(
    [
      'Added to the position,1,0.0,-20.00',
      'Loss after a loss,2,0.0,-30.00',
      'Quick re-entries after a loss,3,0.0,-60.00',
    ],
  );
});

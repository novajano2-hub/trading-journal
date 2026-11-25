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
import type { Repository } from '@/data/repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { renderApp } from '../__fixtures__/render-app';
import { NotebookView } from '../notebook/notebook-view';
import { DayNote } from '../trades/trade-journal';
import { DayView } from './day-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = SAMPLE_WORKSPACE.id;
// The fixture sample's routine today is 2026-11-19; it has one trade on each
// of the 16th (+$245.50), 17th (-$129.50) and 18th (+$50.00).
const TODAY = '2026-11-19';
const GREEN = '2026-11-16';
const EMPTY = '2026-11-12';

function repository(): Repository {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}

async function open(date: string, repo: Repository = repository()) {
  await repo.prefs.update({ seenTips: ['day-plan-templates'] });
  renderApp(<DayView date={date} mode="review" />, {
    repository: repo,
    url: `/app/day/${date}/review`,
  });
  return repo;
}

const tile = async (name: string) => {
  const strip = await screen.findByRole('region', {
    name: 'The day in figures',
  });
  return within(strip).getByText(name).closest('div')!;
};

test('review tiles read net, win rate and session; None without trades', async () => {
  const repo = repository();
  await repo.days.startSession(WS, TODAY);
  await repo.days.endSession(WS, TODAY);
  await open(GREEN, repo);
  expect((await tile('Net P&L')).textContent).toContain('+$245.50');
  expect((await tile('Win rate')).textContent).toContain('100');
  expect((await tile('Session')).textContent).toContain('None');
  cleanup();

  await open(EMPTY);
  expect((await tile('Net P&L')).textContent).toContain('$0.00');
  expect((await tile('Win rate')).textContent).toContain('None');
  expect((await tile('Session')).textContent).toContain('None');
});

test('review tiles show only their values', async () => {
  await open(GREEN);
  const strip = await screen.findByRole('region', {
    name: 'The day in figures',
  });
  for (const label of ['Net P&L', 'Win rate', 'Session']) {
    const cell = within(strip).getByText(label).closest('div')!;
    // A label and a value: nothing else.
    expect(cell.querySelectorAll('b').length, label).toBe(1);
    expect(cell.children.length, label).toBe(2);
  }
  expect(strip.querySelectorAll(':scope > div').length).toBe(3);
});

test('the trades card lists every trade of the day and opens a trade', async () => {
  await open(GREEN);
  const table = await screen.findByRole('table', { name: 'Trades' });
  const heads = within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(heads).toEqual([
    'Symbol',
    'Status',
    'Entry',
    'Exit',
    'Net P&L',
    'Net ROI',
  ]);
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.textContent).toContain('Win');
  expect(rows[0]!.textContent).toContain('+$245.50');
  const link = within(rows[0]!).getByRole('link');
  expect(link.getAttribute('href')).toBe('/app/trades/f-1');
  expect(screen.getByText(/1 trade/)).toBeTruthy();
});

test('the trades card offers Import only when the day has no trades', async () => {
  await open(GREEN);
  await screen.findByRole('table', { name: 'Trades' });
  expect(screen.queryByRole('button', { name: /Import/ })).toBeNull();
  cleanup();

  await open(EMPTY);
  expect(await screen.findByText('No trades on this day.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  expect(await screen.findByText("Add the day's trades")).toBeTruthy();
});

test('the day rating writes the day record and Clear removes it', async () => {
  const repo = await open(GREEN);
  const group = await screen.findByRole('radiogroup', {
    name: 'Day rating, none',
  });
  fireEvent.click(within(group).getByLabelText('4 stars'));
  await waitFor(async () =>
    expect((await repo.days.list(WS)).find((d) => d.id === GREEN)?.rating).toBe(
      4,
    ),
  );
  expect(
    await screen.findByRole('radiogroup', { name: 'Day rating, 4 of 5' }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  await waitFor(async () =>
    expect(
      (await repo.days.list(WS)).find((d) => d.id === GREEN)?.rating,
    ).toBeUndefined(),
  );
});

test('the day page has no mood control', async () => {
  await open(GREEN);
  await screen.findByRole('radiogroup', { name: /Day rating/ });
  expect(screen.queryByText(/mood/i)).toBeNull();
  for (const word of ['Rough', 'Low', 'Steady', 'Good', 'Great'])
    expect(screen.queryByText(word)).toBeNull();
});

test('Close the day asks first, then locks the rules, note, rating and shots', async () => {
  const repo = await open(GREEN);
  const close = await screen.findByRole('button', { name: 'Close the day' });
  fireEvent.click(close);
  const dialog = await screen.findByRole('dialog');
  // Asking changes nothing.
  expect((await repo.days.list(WS)).find((d) => d.id === GREEN)?.locked).toBe(
    undefined,
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Close the day' }),
  );
  await waitFor(async () =>
    expect(
      (await repo.days.list(WS)).find((d) => d.id === GREEN)?.locked,
    ).toBeDefined(),
  );
  expect(await screen.findByText(/^Closed at \d\d:\d\d$/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Close the day' })).toBeNull();
  // Everything on the page is read-only.
  expect(screen.getByText('Locked')).toBeTruthy();
  const stars = screen.getByRole('radiogroup', { name: /Day rating/ });
  for (const r of within(stars).getAllByRole('radio'))
    expect((r as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  expect(
    screen
      .queryAllByRole('checkbox')
      .every(
        (c) =>
          (c as HTMLInputElement).disabled ||
          c.getAttribute('aria-disabled') === 'true',
      ),
  ).toBe(true);
  await expect(repo.days.setRating(WS, GREEN, 5)).rejects.toThrow();
});

test('Close the day is not offered before the start, on a non-trading day or in the future', async () => {
  // 2026-11-01 is before the tracker started (the 2nd); the 14th is a Saturday.
  for (const date of ['2026-10-30', '2026-11-14']) {
    await open(date);
    await screen.findByRole('radiogroup', { name: /Day rating/ });
    expect(
      screen.queryByRole('button', { name: 'Close the day' }),
      date,
    ).toBeNull();
    cleanup();
  }
  // A future date has no review at all.
  renderApp(<DayView date="2026-11-28" mode="review" />, {
    url: '/app/day/2026-11-28/review',
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByRole('button', { name: 'Close the day' })).toBeNull();
});

test("a finished day is read-only in the trade page's Daily note and in the Notebook", async () => {
  const repo = repository();
  const tracker = await repo.tracker.get(WS);
  await repo.days.finish(WS, '2026-11-18', {
    version: tracker.versions[0]!,
    inputs: {},
    ticks: {},
  });
  renderApp(
    <DayNote date="2026-11-18" readOnly={false} onStatus={() => {}} />,
    { repository: repo, url: '/app/trades/f-3' },
  );
  const note = await screen.findByRole('textbox', { name: 'Daily note' });
  await waitFor(() =>
    expect(note.getAttribute('contenteditable')).toBe('false'),
  );
  expect(screen.getByText(/This day is closed/)).toBeTruthy();
  cleanup();

  renderApp(<NotebookView />, {
    repository: repo,
    url: '/app/notebook/daily/2026-11-18',
  });
  const pane = await screen.findByRole('textbox', { name: 'Note' });
  await waitFor(() =>
    expect(pane.getAttribute('contenteditable')).toBe('false'),
  );
  expect(screen.getByText(/This day is closed/)).toBeTruthy();
});

test('Privacy masks the review tiles and the trade amounts', async () => {
  const repo = repository();
  await repo.prefs.update({ displayUnit: 'privacy' });
  await open(GREEN, repo);
  const strip = await screen.findByRole('region', {
    name: 'The day in figures',
  });
  const table = await screen.findByRole('table', { name: 'Trades' });
  expect(strip.textContent).not.toContain('245');
  expect(table.textContent).not.toContain('245');
});

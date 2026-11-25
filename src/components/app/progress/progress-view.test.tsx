// @vitest-environment happy-dom
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { EMPTY_FILTERS } from '@/data/filters';
import { createLocalRepository } from '@/data/local/local-repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { defaultVersion } from '@/domain/tracker/defaults';
import type { DayRecord, TrackerVersion, Weekdays } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { FilterBarView } from '../filter-bar';
import { TopBar } from '../top-bar';
import { ProgressView } from './progress-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

beforeEach(() => window.history.replaceState(null, '', '/app/progress'));
afterEach(cleanup);

const ALL_DAYS: Weekdays = [true, true, true, true, true, true, true];
/** Every built-in rule off: the rules are the custom ones, ticked by hand. */
const HAND_RULES = (
  from: string,
  custom: TrackerVersion['custom'],
): TrackerVersion => {
  const v = defaultVersion(from);
  return {
    ...v,
    builtIn: {
      startBy: { ...v.builtIn.startBy, on: false },
      hours: { ...v.builtIn.hours, on: false },
      strategy: { on: false },
      stop: { on: false },
      lossPerTrade: { ...v.builtIn.lossPerTrade, on: false },
      lossPerDay: { ...v.builtIn.lossPerDay, on: false },
    },
    custom,
  };
};
const c1 = {
  id: 'c1',
  name: 'Mark key levels before the open',
  stage: 'prepare' as const,
  days: ALL_DAYS,
};
const cOld = {
  id: 'c-old',
  name: 'Old habit',
  stage: 'trade' as const,
  days: ALL_DAYS,
};
const tick = (date: string, ticks: Record<string, boolean>): DayRecord => ({
  id: date,
  workspaceId: SAMPLE_WORKSPACE.id,
  ticks,
});

/**
 * Thu 19 Nov is today. Mon 2 Nov to Wed 18 Nov are 13 scored days plus today,
 * 14 in all. Only "Mark key levels" counts from Mon 16 Nov; "Old habit" was a
 * rule until the 15th. It is ticked on the 16th, 17th and 18th, so the streak
 * is 3 and today is 0 of 1.
 */
function handSample(): SampleWorkspace {
  const sample = fixtureSample();
  return {
    ...sample,
    tracker: {
      ...sample.tracker,
      versions: [
        HAND_RULES('2026-11-02', [c1, cOld]),
        HAND_RULES('2026-11-16', [c1]),
      ],
    },
    days: [
      tick('2026-11-16', { c1: true }),
      tick('2026-11-17', { c1: true }),
      tick('2026-11-18', { c1: true }),
    ],
  };
}

function show(
  url = '/app/progress',
  sample: () => SampleWorkspace = handSample,
) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample(),
  });
  return renderApp(<ProgressView />, { url, repository });
}
const ready = () => screen.findByRole('heading', { name: 'Rules' });
const tiles = () => screen.getByRole('region', { name: 'Summary' });
const rulesCard = () =>
  screen.getByRole('heading', { name: 'Rules' }).closest('section')!;
const row = (name: string) => {
  const cell = within(rulesCard())
    .getAllByText(name)
    .find((el) => el.closest('tr'));
  return cell!.closest('tr') as HTMLElement;
};

test('loading shows skeletons and no figures', () => {
  show();
  const loading = screen.getByRole('status', {
    name: 'Loading your progress tracker',
  });
  expect(loading.textContent).toBe('');
  expect(screen.queryByText(/\d/)).toBeNull();
});

test("tiles read the streak, the period score and today's progress, with no other lines", async () => {
  show();
  await ready();
  // The labels are the metrics' tips; nothing else is in a tile.
  expect(tiles().textContent).toBe(
    'Current streak3 daysScore, all time21%Today0 of 1 rules met',
  );
  const labels = within(tiles())
    .getAllByRole('button')
    .map((b) => b.getAttribute('data-metric-tip'));
  expect(labels).toEqual(['tracker-streak', 'tracker-score', 'tracker-today']);
});

test('a new tracker with nothing done yet reads 0 days and None, with its one scored day pending', async () => {
  show('/app/progress', () => {
    const s = fixtureSample();
    return {
      ...s,
      tracker: {
        ...s.tracker,
        startedOn: '2026-11-19',
        versions: [HAND_RULES('2026-11-19', [c1])],
      },
    };
  });
  await ready();
  const t = tiles().textContent!;
  expect(t).toContain('0 days');
  expect(t).toContain('0 of 1 rules met');
  // One scored day, today, and it is pending: no rule has been decided.
  expect(within(rulesCard()).getByText(/1 scored day$/)).toBeTruthy();
  expect(row('Mark key levels before the open').textContent).toContain('None');
});

test('the date range moves the score and the rules table, not the streak or the grid', async () => {
  const all = show();
  await ready();
  const gridBefore = screen
    .getAllByRole('gridcell')
    .map((c) => `${c.getAttribute('aria-label')}|${c.dataset.step}`);
  expect(
    within(rulesCard()).getByText(/all time, 14 scored days/),
  ).toBeTruthy();
  expect(row('Mark key levels before the open').textContent).toContain('23%');
  all.unmount();
  cleanup();

  show('/app/progress?from=2026-11-16&to=2026-11-19');
  await ready();
  const t = tiles().textContent!;
  expect(t).toContain('Score, 16-19 Nov');
  expect(t).toContain('75%');
  // The streak is still 3.
  expect(t).toContain('3 days');
  expect(
    within(rulesCard()).getByText(/16-19 Nov, 4 scored days/),
  ).toBeTruthy();
  const mark = row('Mark key levels before the open');
  expect(mark.textContent).toContain('100%');
  // Its streak is the same too.
  expect(mark.textContent).toContain('3 days');
  const gridAfter = screen
    .getAllByRole('gridcell')
    .map((c) => `${c.getAttribute('aria-label')}|${c.dataset.step}`);
  expect(gridAfter).toEqual(gridBefore);
});

test('the rules table lists the current rules only, in stage order, with their stage line', async () => {
  show();
  await ready();
  const names = [...rulesCard().querySelectorAll('tbody tr')].map(
    (tr) => tr.querySelector('td:nth-child(2) span')?.textContent,
  );
  // "Old habit" is a rule of the past, and the built-ins are off.
  expect(names).toEqual(['Mark key levels before the open']);
  expect(within(rulesCard()).queryByText('Old habit')).toBeNull();
  expect(row('Mark key levels before the open').textContent).toContain(
    'Prepare, ticked by hand',
  );
  expect(row('Mark key levels before the open').textContent).toContain(
    'Ticked by hand',
  );
  const heads = within(rulesCard())
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(heads).toEqual([
    'Today',
    'Rule',
    'Condition',
    'Streak',
    'Average',
    'Follow rate',
  ]);
  expect(
    within(rulesCard()).getByRole('button', { name: 'Edit rules' }),
  ).toBeTruthy();
});

test('the default rules fill the table with their conditions, average and follow rate', async () => {
  show('/app/progress', fixtureSample);
  await ready();
  const names = [...rulesCard().querySelectorAll('tbody tr')].map(
    (tr) => tr.querySelector('td:nth-child(2) span')?.textContent,
  );
  expect(names).toEqual([
    'Start the day note by 09:30',
    'Every trade has a strategy',
    'Every trade has a planned stop',
    'Keep every loss to $100 or less',
    "Keep the day's loss to $100 or less",
  ]);
  const start = row('Start the day note by 09:30');
  expect(start.textContent).toContain('By 09:30');
  // No logged start, so the average is None.
  expect(start.textContent).toContain('None');
  expect(row('Keep every loss to $100 or less').textContent).toContain(
    '$100 a trade',
  );
  expect(row("Keep the day's loss to $100 or less").textContent).toMatch(
    /\$\d+\.\d\d/,
  );
});

test('a non-trading today shows the empty checklist, Edit rules and 0 of 0', async () => {
  show('/app/progress', () => {
    const s = handSample();
    // Saturday 21 Nov.
    return { ...s, tracker: { ...s.tracker, asOf: '2026-11-21' } };
  });
  await ready();
  expect(tiles().textContent).toContain('0 of 0 rules met');
  const today = screen
    .getByRole('heading', { name: 'Today' })
    .closest('section')!;
  expect(today.textContent).toContain("Today isn't a trading day");
  expect(within(today).queryByRole('checkbox')).toBeNull();
  expect(
    within(today).getByRole('button', { name: 'Edit rules' }),
  ).toBeTruthy();
  expect(
    within(today).getByRole('button', { name: 'Plan the day' }),
  ).toBeTruthy();
});

test('it follows the global account selection', async () => {
  const everything = show('/app/progress', fixtureSample);
  await ready();
  const all = tiles().textContent;
  const strategyAll = row('Every trade has a strategy').textContent;
  everything.unmount();
  cleanup();

  show('/app/progress?account=acc-b', fixtureSample);
  await ready();
  // acc-b is one account: its own trades score, so its figures differ.
  expect(tiles().textContent).not.toBe(all);
  expect(row('Every trade has a strategy').textContent).not.toBe(strategyAll);
});

test('ticking a custom rule writes the tick', async () => {
  const { repo } = show();
  await ready();
  const today = screen
    .getByRole('heading', { name: 'Today' })
    .closest('section')!;
  const box = within(today).getByRole('checkbox', {
    name: 'Mark key levels before the open',
  }) as HTMLInputElement;
  expect(box.checked).toBe(false);
  fireEvent.click(box);
  await waitFor(async () => {
    const day = (await repo.days.list(SAMPLE_WORKSPACE.id)).find(
      (d) => d.id === '2026-11-19',
    );
    expect(day?.ticks).toEqual({ c1: true });
  });
  // Today is now perfect: 1 of 1 and the streak grows to 4.
  await waitFor(() =>
    expect(tiles().textContent).toContain('1 of 1 rules met'),
  );
  expect(tiles().textContent).toContain('4 days');
});

test("History carries the grid's paging controls in its header, and the legend and caption below", async () => {
  show();
  await ready();
  const history = screen
    .getByRole('heading', { name: 'History' })
    .closest('section')!;
  const header = screen.getByRole('heading', {
    name: 'History',
  }).parentElement!;
  for (const name of ['Earlier weeks', 'Later weeks', 'Today'])
    expect(within(header).getByRole('button', { name })).toBeTruthy();
  expect(
    within(header).getByRole('button', { name: /About History/ }),
  ).toBeTruthy();
  expect(header.textContent).toContain('Since Mon 2 Nov');
  expect(history.textContent).toContain(
    "Blank days aren't scored: weekends and other non-trading days.",
  );
});

test('the tracker has no Display menu, and its phone header shows only the date range', () => {
  const bar = (path: string) => {
    renderApp(
      <TopBar
        filters={<div data-testid="chips" />}
        basis={<button data-testid="display">Display</button>}
      />,
      { url: path },
    );
  };
  bar('/app/progress');
  expect(screen.queryByTestId('display')).toBeNull();
  expect(screen.getByTestId('chips')).toBeTruthy();
  cleanup();
  bar('/app/dashboard');
  expect(screen.getByTestId('display')).toBeTruthy();
  cleanup();

  // The chips: the date range alone, and no Filters entry.
  render(
    <FilterBarView
      filters={EMPTY_FILTERS}
      options={{ symbols: ['ES'], strategies: [], tags: [], categories: [] }}
      today="2026-11-19"
      onChange={() => {}}
      dateOnly
    />,
  );
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
    'All time',
  ]);
  cleanup();

  // A phone: one calendar button, and its sheet holds the date and nothing else.
  window.innerWidth = 390;
  try {
    render(
      <FilterBarView
        filters={EMPTY_FILTERS}
        options={{ symbols: ['ES'], strategies: [], tags: [], categories: [] }}
        today="2026-11-19"
        onChange={() => {}}
        dateOnly
      />,
    );
    const only = screen.getAllByRole('button');
    expect(only).toHaveLength(1);
    expect(only[0]!.getAttribute('aria-label')).toBe('Date, All time');
    expect(screen.queryByRole('button', { name: /Filters/ })).toBeNull();
  } finally {
    window.innerWidth = 1024;
  }
});

test('a custom rule added today has a row before any day is scored with it, with zeros', async () => {
  show('/app/progress', () => {
    const s = fixtureSample();
    return {
      ...s,
      tracker: {
        ...s.tracker,
        startedOn: '2026-11-19',
        versions: [
          HAND_RULES('2026-11-19', [
            {
              ...c1,
              id: 'c-new',
              name: 'Walk before the open',
              // Sundays only, so no day has been scored with it.
              days: [true, false, false, false, false, false, false],
            },
          ]),
        ],
      },
    };
  });
  await ready();
  const text = row('Walk before the open').textContent!;
  expect(text).toContain('0 days');
  expect(text).toContain('None');
  expect(text).toContain('0%');
});

test('Edit rules opens the dialog from the rules card', async () => {
  show();
  await ready();
  fireEvent.click(
    within(rulesCard()).getByRole('button', { name: 'Edit rules' }),
  );
  expect(
    await screen.findByRole('dialog', { name: 'Edit rules' }),
  ).toBeTruthy();
});

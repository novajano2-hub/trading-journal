// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { METRIC_IDS } from '@/content/metric-definitions';
import { resolveInstrument } from '@/domain/instruments';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { Repository } from '@/data/repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { strategyRules, type UserPrefs } from '@/domain/types';
import { keepHyphens } from '@/lib/format';
import { dashboardFixture } from '../__fixtures__/dashboard-sample';
import { renderApp } from '../__fixtures__/render-app';
import { DashboardView } from './dashboard-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

// As in dashboard-view.test.tsx: animations finish at once here.
MotionGlobalConfig.skipAnimations = true;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T15:00:00Z')); // Friday 20 Nov, 10:00 in New York
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const fx = fixtureSample();
const rule = (id: string) =>
  strategyRules(fx.strategies[0]!).find((r) => r.id === id)!.text;
const r1 = rule('r-1');
const r2 = rule('r-2');
const fomo = fx.tags.find((t) => t.id === 'tag-fomo')!.name;

/** No 0% that isn't part of a larger figure (50.0% and 40% are fine), and no NaN. */
const ZERO_OR_NAN = /(?<![\d.])0%|NaN/;

/**
 * The Dashboard over `dashboardFixture`, in New York, with a $100 weekly net
 * goal and a $300 daily loss limit on the sample, and `prefs` on top.
 */
async function renderDashboard(
  opts: {
    graded?: boolean;
    prefs?: Partial<UserPrefs>;
    edit?: (s: SampleWorkspace) => void;
    url?: string;
    patch?: (repo: Repository) => Partial<Repository>;
  } = {},
) {
  const base = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const s = dashboardFixture({ graded: opts.graded ?? true });
      opts.edit?.(s);
      return s;
    },
  });
  await base.prefs.update({
    timeZone: 'America/New_York',
    goals: { sample: { weeklyNet: 10000, dailyLossLimit: 30000 } },
    ...opts.prefs,
  });
  const repository = { ...base, ...opts.patch?.(base) };
  return renderApp(<DashboardView />, { repository, url: opts.url });
}

const goalsCard = () => screen.findByRole('region', { name: 'Goals' });

test('goals: reached this week; one day broke the loss limit', async () => {
  await renderDashboard();
  const goals = await goalsCard();
  expect(goals.textContent).toContain('Weekly net goal');
  expect(goals.textContent).toContain('$100.00');
  expect(within(goals).getByText('Reached')).toBeTruthy();
  expect(goals.textContent).not.toContain('of goal');
  expect(goals.textContent).toContain('+$200.00 this week, 16-20 Nov');
  expect(goals.textContent).toContain('Daily loss limit');
  expect(goals.textContent).toContain('$300.00');
  expect(goals.textContent).toContain('Kept 1 of 2 days');
  expect(goals.textContent).toContain(
    'Broken once, all time: Thu 19 Nov at −$400.00.',
  );
  // The kept count is said once, beside the label.
  expect(goals.textContent?.match(/1 of 2 days/g)).toHaveLength(1);
  expect(
    within(goals).getByRole('button', { name: 'Edit goals' }),
  ).toBeTruthy();
});

test('goals: a week in progress, and a limit kept every day', async () => {
  await renderDashboard({
    prefs: { goals: { sample: { weeklyNet: 50000, dailyLossLimit: 50000 } } },
  });
  const goals = await goalsCard();
  expect(goals.textContent).toContain('40% of goal');
  expect(within(goals).queryByText('Reached')).toBeNull();
  expect(goals.textContent).toContain('+$200.00 this week, 16-20 Nov');
  expect(goals.textContent).toContain('2 of 2 days');
  expect(goals.textContent).toContain('Kept every day, all time.');
});

test('percent of goal rounds down exactly: $145 of $500 is 29%, not 28%', async () => {
  await renderDashboard({
    prefs: { goals: { sample: { weeklyNet: 50000, dailyLossLimit: 50000 } } },
    edit: (s) => {
      s.trades.find((t) => t.id === 'f-2')!.net = 54_500; // week: +$545 − $400
    },
  });
  const goals = await goalsCard();
  expect(goals.textContent).toContain('+$145.00 this week');
  expect(goals.textContent).toContain('29% of goal'); // 0.29 * 100 is 28.999… in floats
});

test('goals: several broken days name the latest and the count', async () => {
  await renderDashboard({
    prefs: { goals: { sample: { weeklyNet: 50000, dailyLossLimit: 10000 } } },
    edit: (s) => {
      const f2 = s.trades.find((t) => t.id === 'f-2')!;
      f2.net = -20_000;
      f2.gross = -19_500;
    },
  });
  const goals = await goalsCard();
  expect(goals.textContent).toContain(
    'Last broken Thu 19 Nov at −$400.00. 2 days broken, all time.',
  );
  // A losing week reads 0% of its goal: an honest figure, not an empty one.
  expect(goals.textContent).toContain('0% of goal');
  expect(goals.textContent).toContain('−$600.00 this week, 16-20 Nov');
});

test("a range that ended before this week reads 'that week'", async () => {
  await renderDashboard({
    url: '/app/dashboard?from=2026-11-09&to=2026-11-15',
    edit: (s) => {
      const f2 = s.trades.find((t) => t.id === 'f-2')!;
      f2.openedAt = '2026-11-12T14:00:00.000Z';
      f2.closedAt = '2026-11-12T15:00:00.000Z';
    },
  });
  const goals = await goalsCard();
  expect(goals.textContent).toContain('+$600.00 that week, 9-15 Nov');
  // The daily row names its own period: the range, as the other cards' captions do.
  expect(goals.textContent).toContain('Kept every day, 9-15 Nov.');
});

test('unset goals say so, and the button reads Set goals', async () => {
  await renderDashboard({ prefs: { goals: { sample: {} } } });
  const goals = await goalsCard();
  expect(goals.textContent).toContain('No weekly net goal set.');
  expect(goals.textContent).toContain('No daily loss limit set.');
  expect(within(goals).getByRole('button', { name: 'Set goals' })).toBeTruthy();
  expect(
    within(goals).queryByRole('button', { name: 'Edit goals' }),
  ).toBeNull();
});

test('editing goals saves per workspace; bad input writes nothing', async () => {
  const { repo } = await renderDashboard({
    prefs: {
      goals: {
        sample: { weeklyNet: 10000, dailyLossLimit: 30000 },
        mine: { dailyLossLimit: 20000 },
      },
    },
  });
  const goals = await goalsCard();
  const edit = within(goals).getByRole('button', { name: 'Edit goals' });
  fireEvent.click(edit);

  const weekly = within(goals).getByRole('textbox', {
    name: 'Weekly net goal',
  }) as HTMLInputElement;
  const daily = within(goals).getByRole('textbox', {
    name: 'Daily loss limit',
  }) as HTMLInputElement;
  expect(weekly.inputMode).toBe('decimal');
  expect(daily.inputMode).toBe('decimal');
  expect(weekly.value).toBe('100');
  expect(daily.value).toBe('300');
  expect(document.activeElement).toBe(weekly);

  fireEvent.change(weekly, { target: { value: '-5' } });
  fireEvent.click(within(goals).getByRole('button', { name: 'Save' }));
  const message = within(goals).getByText(
    'Enter an amount above zero, or leave it empty.',
  );
  expect(weekly.getAttribute('aria-invalid')).toBe('true');
  expect(weekly.getAttribute('aria-describedby')).toContain(
    message.closest('[id]')!.id,
  );
  expect(document.activeElement).toBe(weekly);
  // The message sits in a polite live region, and a second Save re-adds it so it is announced again.
  expect(message.closest('[aria-live="polite"]')).toBeTruthy();
  fireEvent.click(within(goals).getByRole('button', { name: 'Save' }));
  const again = within(goals).getByText(
    'Enter an amount above zero, or leave it empty.',
  );
  expect(again).not.toBe(message);
  expect(message.isConnected).toBe(false);

  // Too large never reaches the repository: a field error, not "Try again".
  fireEvent.change(weekly, { target: { value: '99999999999999' } });
  fireEvent.click(within(goals).getByRole('button', { name: 'Save' }));
  expect(
    within(goals).getByText('Enter an amount up to $10,000,000.'),
  ).toBeTruthy();
  expect(within(goals).queryByRole('alert')).toBeNull();
  expect((await repo.prefs.get()).goals).toEqual({
    sample: { weeklyNet: 10000, dailyLossLimit: 30000 },
    mine: { dailyLossLimit: 20000 },
  });

  fireEvent.change(weekly, { target: { value: '1,500' } });
  fireEvent.change(daily, { target: { value: '' } });
  fireEvent.click(within(goals).getByRole('button', { name: 'Save' }));
  await waitFor(async () =>
    expect((await repo.prefs.get()).goals!.sample).toEqual({
      weeklyNet: 150000,
    }),
  );
  expect((await repo.prefs.get()).goals!.mine).toEqual({
    dailyLossLimit: 20000,
  });
  await waitFor(() =>
    expect(goals.textContent).toContain('No daily loss limit set.'),
  );
  expect(goals.textContent).toContain('$1,500.00');
  expect(within(goals).queryByRole('textbox')).toBeNull();
  // The form is gone: focus goes back to the button that opened it.
  expect(document.activeElement).toBe(
    within(goals).getByRole('button', { name: 'Edit goals' }),
  );
});

test('Escape in the form cancels it, like Cancel', async () => {
  const { repo } = await renderDashboard();
  const goals = await goalsCard();
  fireEvent.click(within(goals).getByRole('button', { name: 'Edit goals' }));
  const weekly = within(goals).getByRole('textbox', {
    name: 'Weekly net goal',
  });
  fireEvent.change(weekly, { target: { value: '9,999' } });
  fireEvent.keyDown(weekly, { key: 'Escape' });
  expect(within(goals).queryByRole('textbox')).toBeNull();
  expect(goals.textContent).toContain('$100.00');
  expect(document.activeElement).toBe(
    within(goals).getByRole('button', { name: 'Edit goals' }),
  );
  expect((await repo.prefs.get()).goals!.sample).toEqual({
    weeklyNet: 10000,
    dailyLossLimit: 30000,
  });
});

test('cancel leaves the goals as they were', async () => {
  const { repo } = await renderDashboard();
  const goals = await goalsCard();
  fireEvent.click(within(goals).getByRole('button', { name: 'Edit goals' }));
  fireEvent.change(
    within(goals).getByRole('textbox', { name: 'Weekly net goal' }),
    { target: { value: '9,999' } },
  );
  fireEvent.click(within(goals).getByRole('button', { name: 'Cancel' }));
  expect(within(goals).queryByRole('textbox')).toBeNull();
  expect(goals.textContent).toContain('$100.00');
  expect(document.activeElement).toBe(
    within(goals).getByRole('button', { name: 'Edit goals' }),
  );
  expect((await repo.prefs.get()).goals!.sample).toEqual({
    weeklyNet: 10000,
    dailyLossLimit: 30000,
  });
});

test('a goals save that fails keeps the form with a plain error', async () => {
  await renderDashboard({
    patch: (repo) => ({
      prefs: {
        ...repo.prefs,
        update: () => Promise.reject(new Error('disk full')),
      },
    }),
  });
  const goals = await goalsCard();
  fireEvent.click(within(goals).getByRole('button', { name: 'Edit goals' }));
  fireEvent.change(
    within(goals).getByRole('textbox', { name: 'Weekly net goal' }),
    { target: { value: '200' } },
  );
  fireEvent.click(within(goals).getByRole('button', { name: 'Save' }));
  const alert = await within(goals).findByRole('alert');
  expect(alert.textContent).toBe("Couldn't save your goals. Try again.");
  expect(alert.className).not.toContain('loss');
  expect(
    within(goals).getByRole('textbox', { name: 'Weekly net goal' }),
  ).toBeTruthy();
});

test('Escape and Cancel wait for a save in flight, so its failure still shows', async () => {
  let fail: ((e: Error) => void) | undefined;
  await renderDashboard({
    patch: (repo) => ({
      prefs: {
        ...repo.prefs,
        update: () =>
          new Promise((_, reject) => {
            fail = reject;
          }),
      },
    }),
  });
  const goals = await goalsCard();
  fireEvent.click(within(goals).getByRole('button', { name: 'Edit goals' }));
  const weekly = within(goals).getByRole('textbox', {
    name: 'Weekly net goal',
  });
  fireEvent.change(weekly, { target: { value: '200' } });
  fireEvent.click(within(goals).getByRole('button', { name: 'Save' }));
  fireEvent.keyDown(weekly, { key: 'Escape' });
  expect(weekly.isConnected).toBe(true);
  const cancel = within(goals).getByRole('button', {
    name: 'Cancel',
  }) as HTMLButtonElement;
  expect(cancel.disabled).toBe(true);
  await waitFor(() => expect(fail).toBeDefined());
  fireEvent.keyDown(weekly, { key: 'Escape' }); // and again, now the write has started
  expect(weekly.isConnected).toBe(true);
  await act(async () => fail!(new Error('disk full')));
  expect((await within(goals).findByRole('alert')).textContent).toBe(
    "Couldn't save your goals. Try again.",
  );
  expect(cancel.disabled).toBe(false);
});

test('goals in another currency say they use the base currency', async () => {
  await renderDashboard({
    edit: (s) => {
      s.trades.find((t) => t.id === 'f-2')!.pnlCurrency = 'EUR';
    },
  });
  expect((await goalsCard()).textContent).toContain('Weekly net goal');
  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: 'Currency' })).getByRole(
      'radio',
      { name: 'EUR' },
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Goals' }).textContent).toContain(
      'Goals use your base currency (USD).',
    ),
  );
  const goals = screen.getByRole('region', { name: 'Goals' });
  expect(goals.textContent).not.toContain('Weekly net goal');
  expect(goals.textContent).not.toContain('Daily loss limit');
});

test('performance follows the basis', async () => {
  await renderDashboard();
  const perf = await screen.findByRole('region', { name: 'Performance' });
  const pnl = within(perf).getByTestId('kpi-pnl');
  expect(pnl.textContent).toContain('Net P&L');
  expect(pnl.textContent).toContain('+$200.00');
  expect(perf.textContent).toContain('Win rate');
  expect(perf.textContent).toContain('50.0%');
  expect(perf.textContent).toContain('Profit factor');
  expect(perf.textContent).toContain('1.50');
  expect(perf.textContent).toContain('Expectancy');
  expect(perf.textContent).toContain('+$100.00');
  expect(
    within(perf).getByRole('img', {
      name: 'Equity, from $50,000.00 to $50,200.00',
    }),
  ).toBeTruthy();
  expect(
    within(perf).getByRole('button', { name: 'Equity' }).dataset.metricTip,
  ).toBe('equity');
});

test('gross drives the KPIs and the equity line; goals stay net (Review Focus 3)', async () => {
  await renderDashboard({ prefs: { pnlBasis: 'gross' } });
  const perf = await screen.findByRole('region', { name: 'Performance' });
  const pnl = within(perf).getByTestId('kpi-pnl');
  expect(pnl.textContent).toContain('Gross P&L');
  expect(pnl.textContent).toContain('+$210.00');
  expect(
    within(perf).getByRole('img', {
      name: 'Equity, from $50,000.00 to $50,210.00',
    }),
  ).toBeTruthy();
  const goals = await goalsCard();
  expect(goals.textContent).toContain('+$200.00 this week, 16-20 Nov');
  expect(goals.textContent).toContain(
    'Broken once, all time: Thu 19 Nov at −$400.00.',
  );
  const table = screen.getByRole('table', { name: 'Recent trades' });
  expect(
    within(table).getByRole('columnheader', { name: 'Gross P&L' }),
  ).toBeTruthy();
  expect(table.textContent).toContain('−$395.00');
});

test('a missing profit factor reads None yet', async () => {
  await renderDashboard({
    edit: (s) => {
      const f1 = s.trades.find((t) => t.id === 'f-1')!;
      f1.net = 40_000;
      f1.gross = 40_500;
    },
  });
  const perf = await screen.findByRole('region', { name: 'Performance' });
  const pf = within(perf)
    .getByRole('button', { name: 'Profit factor' })
    .closest('[data-kpi]')!;
  expect(pf.textContent).toContain('None yet');
  expect(perf.textContent).not.toMatch(/NaN|Infinity/);
});

test('recent trades: newest first, with the rules column', async () => {
  await renderDashboard();
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  const headers = within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(headers).toEqual([
    'Time',
    'Instrument',
    'Side',
    'Strategy',
    'Mistake',
    'Net P&L',
    'Rules',
  ]);
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  expect(rows[0]!.textContent).toContain('19 Nov 10:00');
  expect(rows[0]!.textContent).toContain('Opening range breakout');
  // A cut-short strategy name keeps its whole text in the title.
  expect(within(rows[0]!).getByTitle('Opening range breakout')).toBeTruthy();
  expect(rows[0]!.textContent).toContain(fomo);
  expect(rows[0]!.textContent).toContain('−$400.00');
  expect(rows[0]!.textContent).toContain(`Broke: ${r1}`);
  expect(rows[1]!.textContent).toContain('18 Nov 10:00');
  expect(rows[1]!.textContent).toContain('+$600.00');
  expect(rows[1]!.textContent).toContain('2 of 2 kept');
  const region = screen.getByRole('region', { name: 'Recent trades' });
  expect(region.textContent).toContain('all time');
});

test('a trade that broke two rules and carries two mistakes', async () => {
  await renderDashboard({
    edit: (s) => {
      s.tags.push({
        id: 'tag-size',
        workspaceId: 'sample',
        name: 'Oversized',
        categoryId: 'mistakes',
      });
      const f1 = s.trades.find((t) => t.id === 'f-1')!;
      f1.ruleChecks = [
        { ruleId: 'r-1', followed: false },
        { ruleId: 'r-2', followed: false },
      ];
      f1.tagIds = ['tag-fomo', 'tag-size'];
    },
  });
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  const row = within(table).getAllByRole('row')[1]!;
  // The full list rides in the title, and whole in the text a screen reader gets.
  const rules = within(row).getByTitle(`${r1}, ${r2}`);
  // Below xl the rule wraps to two lines rather than cutting to a stub; from xl it reads on one line.
  // "Broke:" (loss red) and the rule (ink) are two runs in one clamped line.
  const text = rules.querySelector('.line-clamp-2')!;
  expect(text.textContent).toBe(`Broke: ${keepHyphens(r1)}`);
  expect(text.className).toContain('line-clamp-2');
  expect(text.className).toContain('xl:truncate');
  expect(text.className).not.toMatch(/(^|\s)truncate/);
  // The rest is a small loss chip right after the rule, not stranded at the cell's edge.
  const count = text.nextElementSibling!;
  expect(count.textContent).toBe('+1');
  expect(count.className).toContain('bg-loss-soft');
  expect(rules.textContent).not.toContain('more');
  expect(row.textContent).toContain(`Broke: ${r1} and ${r2}`);
  // The first mistake as a chip, then +1 that names the rest.
  expect(row.textContent).toContain(fomo);
  const more = within(row).getByTitle('Oversized');
  expect(more.textContent).toContain('+1');
});

test('recent trades name the instrument, keeping the symbol in the title', async () => {
  await renderDashboard({
    edit: (s) => {
      const f1 = s.trades.find((t) => t.id === 'f-1')!;
      f1.instrument = resolveInstrument('TSLA261120P00370000')!;
    },
  });
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  const [option, future] = within(table).getAllByRole('row').slice(1);
  const name = within(option!).getByTitle('TSLA261120P00370000');
  expect(name.textContent).toBe('TSLA 370 Putexpires 20 Nov');
  expect(option!.textContent).not.toContain('TSLA261120P00370000');
  expect(within(future!).getByTitle('ESZ5').textContent).toBe('ES Dec 25');
});

test('ungraded imports still show performance and trades (Review Focus 1)', async () => {
  await renderDashboard({ graded: false });
  const pnl = await screen.findByTestId('kpi-pnl');
  expect(pnl.textContent).toContain('+$200.00');
  const perf = screen.getByRole('region', { name: 'Performance' });
  expect(perf.textContent).toContain('50.0%');
  expect(perf.textContent).toContain('1.50');
  const rows = within(screen.getByRole('table', { name: 'Recent trades' }))
    .getAllByRole('row')
    .slice(1);
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.textContent).toContain('Not graded');
    expect(row.textContent).toContain('No strategy');
  }
  expect(rows[0]!.textContent).toContain('−$400.00');
  const ready = screen.getByTestId('dashboard-ready');
  expect(ready.textContent).not.toMatch(ZERO_OR_NAN);
});

test('every metric carries its definition', async () => {
  await renderDashboard();
  const tips = (root: Element) =>
    [...root.querySelectorAll('[data-metric-tip]')].map(
      (e) => (e as HTMLElement).dataset.metricTip,
    );
  const ids = tips(await screen.findByTestId('dashboard-ready'));
  // A rule's drill-down carries the last: its Kept column.
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(`^${r1}\\.`) }),
  );
  ids.push(...tips(await screen.findByRole('dialog')));
  // Defined ahead of the screens that show them (Plan 5, later tasks).
  const notOnDashboard = new Set<string>([
    'trades',
    'net-roi',
    'realized-r',
    'planned-r',
    'mae',
    'mfe',
    'sharpe',
    'sortino',
    'avg-daily-win-rate',
    'longest-day',
    'day-streaks',
    // On the calendar (Task 13).
    'trading-days',
    'green-days',
    'best-day',
    'worst-day',
    'fees',
    'gross-pnl',
    'net-pnl',
    // On the reports (Task 14).
    'cumulative-pnl',
    'avg-win',
    'avg-loss',
    'largest-win',
    'largest-loss',
    'max-drawdown',
    'win-streak',
    'loss-streak',
    // On the reports (Task 15).
    'avg-duration',
    'avg-size',
    'long-share',
    'no-stop',
    'r-expectancy',
    'avg-trade',
    // On the Overview's Days card (fix round 1).
    'avg-green-day',
    'avg-red-day',
    'trades-per-day',
  ]);
  expect(new Set(ids)).toEqual(
    new Set(METRIC_IDS.filter((id) => !notOnDashboard.has(id))),
  );
});

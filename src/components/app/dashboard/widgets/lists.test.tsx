// @vitest-environment happy-dom
// The list widgets (#46, Task 9B): the recent and open trades, the challenge
// and the report, over the small workspaces whose answers are worked by hand.
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SampleWorkspace } from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import {
  strategyRules,
  type Account,
  type Challenge,
  type PropRuleSet,
  type Trade,
  type UserPrefs,
} from '@/domain/types';
import { keepHyphens } from '@/lib/format';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { dashboardFixture } from '../../__fixtures__/dashboard-sample';
import {
  byDay,
  renderWidgets,
  said,
  widget,
} from '../../__fixtures__/dashboard-widgets';

vi.mock('next/navigation', () => import('../../__fixtures__/navigation'));

// Animations finish at once here, as in dashboard-view.test.tsx.
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

/**
 * The recent trades widget over `dashboardFixture`, in New York, with `prefs`
 * on top. Weeks start on Monday here. Waits for the closed table, or for the
 * widget's own words with none.
 */
async function renderRecent(
  opts: {
    graded?: boolean;
    prefs?: Partial<UserPrefs>;
    edit?: (s: SampleWorkspace) => void;
    url?: string;
  } = {},
) {
  const rendered = await renderWidgets(['recent'], {
    sample: () => {
      const s = dashboardFixture({ graded: opts.graded ?? true });
      opts.edit?.(s);
      return s;
    },
    prefs: { weekStart: 'monday', ...opts.prefs },
    url: opts.url,
  });
  await waitFor(() =>
    expect(widget('recent').querySelector('[aria-busy]')).toBeNull(),
  );
  return rendered;
}

test('recent trades: newest first, with the rules column', async () => {
  await renderRecent();
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
  // A trade with no mistake says so in its Mistake cell, never a blank.
  expect(within(rows[1]!).getAllByRole('cell')[4]!.textContent).toBe('None');
  // A row opens its trade; the card has an info tip and no link of its own to the log.
  expect(within(rows[0]!).getByRole('link').getAttribute('href')).toContain(
    '/app/trades/f-1',
  );
  const region = screen.getByRole('region', { name: 'Recent trades' });
  expect(
    region.querySelector('[data-metric-tip="recent-trades"]'),
  ).not.toBeNull();
});

test('a trade that broke two rules and carries two mistakes', async () => {
  await renderRecent({
    edit: (s) => {
      s.tags.push({
        id: 'tag-size',
        workspaceId: 'sample',
        name: 'oversized',
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
  // In a narrow card the rule wraps to two lines rather than cutting to a stub; from a 64rem card it reads on one line.
  // "Broke:" (loss red) and the rule (ink) are two runs in one clamped line.
  const text = rules.querySelector('.line-clamp-2')!;
  expect(text.textContent).toBe(`Broke: ${keepHyphens(r1)}`);
  expect(text.className).toContain('line-clamp-2');
  expect(text.className).toContain('@[64rem]:truncate');
  expect(text.className).not.toMatch(/(^|\s)truncate/);
  // The rest is a small loss chip right after the rule, not stranded at the cell's edge.
  const count = text.nextElementSibling!;
  expect(count.textContent).toBe('+1');
  expect(count.className).toContain('bg-loss-soft');
  expect(rules.textContent).not.toContain('more');
  expect(row.textContent).toContain(`Broke: ${r1} and ${r2}`);
  // The first mistake as a chip, then +1 that names the rest.
  expect(row.textContent).toContain(fomo);
  const more = within(row).getByTitle('oversized');
  expect(more.textContent).toContain('+1');
});

test('recent trades name the instrument, keeping the symbol in the title', async () => {
  await renderRecent({
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

/** An open ES long of 3 contracts at 6,000; `exits` are the contracts sold so far at 6,002. */
function openTrade(id: string, exits: number): Trade {
  const base = dashboardFixture().trades[0]!;
  const sell = (qty: number) => ({
    id: `${id}-x`,
    accountId: 'acc-a',
    symbol: 'ESZ5',
    side: 'sell' as const,
    qty,
    price: 6002,
    time: '2026-11-20T14:10:00.000Z',
    fees: 0,
    commission: 0,
  });
  const t: Trade = {
    ...base,
    id,
    serial: 20,
    status: 'open',
    openedAt: '2026-11-20T14:00:00.000Z',
    avgEntry: 6000,
    maxPosition: 3,
    gross: 0,
    fees: 0,
    net: 0,
    strategyIds: [],
    ruleChecks: [],
    tagIds: [],
    executions: [
      {
        id: `${id}-e`,
        accountId: 'acc-a',
        symbol: 'ESZ5',
        side: 'buy',
        qty: 3,
        price: 6000,
        time: '2026-11-20T14:00:00.000Z',
        fees: 0,
        commission: 0,
      },
      ...(exits > 0 ? [sell(exits)] : []),
    ],
  };
  delete t.closedAt;
  delete t.avgExit;
  return t;
}

const openTab = async () => {
  const group = await screen.findByRole('radiogroup', {
    name: 'Recent trades view',
  });
  fireEvent.click(within(group).getByRole('radio', { name: 'Open positions' }));
  return screen.findByRole('table', { name: 'Open positions' });
};

test('recent trades opens on the closed trades, with an Open positions tab beside them', async () => {
  await renderRecent();
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  expect(table).toBeTruthy();
  const group = screen.getByRole('radiogroup', { name: 'Recent trades view' });
  expect(
    within(group)
      .getAllByRole('radio')
      .map((r) => (r as HTMLInputElement).labels?.[0]?.textContent),
  ).toEqual(['Closed', 'Open positions']);
});

test('the closed table answers to the width of its card: time, instrument and result, then side and rules, then strategy and mistake', async () => {
  await renderRecent();
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  // The card is the container the columns measure themselves against.
  expect(table.closest('.\\@container')).not.toBeNull();
  const head = (name: string) =>
    within(table).getByRole('columnheader', { name });
  // Always there: the instrument and the result; the time folds under the symbol in a card under 20rem.
  expect(head('Instrument').className).not.toContain('hidden');
  expect(head('Net P&L').className).not.toContain('hidden');
  expect(head('Time').className).toContain('@max-[20rem]:hidden');
  // From 36rem: the side and the rules.
  for (const name of ['Side', 'Rules']) {
    expect(head(name).className).toContain('hidden');
    expect(head(name).className).toContain('@[36rem]:table-cell');
  }
  // From 56rem: the strategy and the mistake.
  for (const name of ['Strategy', 'Mistake']) {
    expect(head(name).className).toContain('hidden');
    expect(head(name).className).toContain('@[56rem]:table-cell');
  }
  // The cells follow their headers, so a narrow card never clips a column.
  const first = within(table).getAllByRole('row')[1]!;
  const cells = within(first).getAllByRole('cell');
  expect(cells[2]!.className).toContain('@[36rem]:table-cell');
  expect(cells[3]!.className).toContain('@[56rem]:table-cell');
  expect(cells[4]!.className).toContain('@[56rem]:table-cell');
  expect(cells[5]!.className).not.toContain('hidden');
  expect(cells[6]!.className).toContain('@[36rem]:table-cell');
  // Under 20rem the time reads under the symbol, and only there.
  expect(cells[1]!.querySelector('.\\@\\[20rem\\]\\:hidden')).not.toBeNull();
});

test('the card has no header link: a row is the way into a trade', async () => {
  await renderRecent({
    url: '/app/dashboard?from=2026-11-02&to=2026-11-19&account=acc-b',
  });
  const region = await screen.findByRole('region', { name: 'Recent trades' });
  expect(within(region).queryByRole('link', { name: 'All trades' })).toBeNull();
  // The rows' own links are all the card has.
  for (const link of within(region).getAllByRole('link'))
    expect(link.getAttribute('href')).toMatch(/^\/app\/trades\/[^/]+/);
});

test('open positions: each open trade with its quantity, entry and realized P&L from a partial exit', async () => {
  await renderRecent({
    edit: (s) => {
      s.trades.push(openTrade('o-1', 1));
    },
  });
  const table = await openTab();
  const headers = within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(headers).toEqual([
    'Opened',
    'Instrument',
    'Side',
    'Quantity',
    'Avg entry',
    'Realized, net',
  ]);
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.textContent).toContain('20 Nov 09:00');
  expect(row.textContent).toContain('Long');
  // 3 bought, 1 sold: 2 still open.
  expect(within(row).getAllByRole('cell')[3]!.textContent).toBe('2');
  expect(row.textContent).toContain('6,000.00');
  // One contract exited 2 points up, 50 a point.
  expect(row.textContent).toContain('+$100.00');
  expect(within(row).getByRole('link').getAttribute('href')).toContain(
    '/app/trades/o-1',
  );
  // The closed table is gone while this tab shows.
  expect(screen.queryByRole('table', { name: 'Recent trades' })).toBeNull();
});

test('an open trade with no exit yet has no realized P&L, and says None', async () => {
  await renderRecent({
    edit: (s) => {
      s.trades.push(openTrade('o-2', 0));
    },
  });
  const table = await openTab();
  const row = within(table).getAllByRole('row')[1]!;
  expect(within(row).getAllByRole('cell')[5]!.textContent).toBe('None');
  expect(within(row).getAllByRole('cell')[3]!.textContent).toBe('3');
});

test('open positions with none open says so', async () => {
  await renderRecent();
  const group = await screen.findByRole('radiogroup', {
    name: 'Recent trades view',
  });
  fireEvent.click(within(group).getByRole('radio', { name: 'Open positions' }));
  const region = screen.getByRole('region', { name: 'Recent trades' });
  await waitFor(() =>
    expect(region.textContent).toContain('No open positions.'),
  );
  expect(screen.queryByRole('table', { name: 'Open positions' })).toBeNull();
});

test('open positions read the display unit: ticks of the contracts closed so far', async () => {
  await renderRecent({
    prefs: { displayUnit: 'ticks' },
    edit: (s) => {
      s.trades.push(openTrade('o-1', 1));
    },
  });
  const table = await openTab();
  const cell = within(table).getAllByRole('cell')[5]!;
  // One contract closed 2 points up on a 0.25 tick.
  expect(cell.textContent).toContain('+8.0 ticks');
  expect(cell.textContent).not.toContain('$');
});

test('open positions read R when R is shown', async () => {
  await renderRecent({
    prefs: { displayUnit: 'r' },
    edit: (s) => {
      const t = openTrade('o-1', 1);
      t.initialRisk = 5_000;
      for (const x of s.trades) x.initialRisk = 10_000;
      s.trades.push(t);
    },
  });
  const table = await openTab();
  // ++$100.00 booked over $50.00 risked.
  expect(within(table).getAllByRole('cell')[5]!.textContent).toContain(
    '+2.00R',
  );
});

test('on a phone the open positions are two-line rows that link to the trade', async () => {
  await renderRecent({
    edit: (s) => {
      s.trades.push(openTrade('o-1', 1));
    },
  });
  await openTab();
  const list = screen.getByRole('list', { name: 'Open positions' });
  expect(list.className).toContain('@[48rem]:hidden');
  const row = within(list).getAllByRole('listitem')[0]!;
  const link = within(row).getByRole('link');
  expect(link.getAttribute('href')).toContain('/app/trades/o-1');
  const one = row.querySelector('[data-line="1"]')!.textContent!;
  expect(one).toContain('20 Nov 09:00');
  expect(one).toContain('+$100.00');
  const two = row.querySelector('[data-line="2"]')!.textContent!;
  expect(two).toContain('Long');
  expect(two).toContain('2');
  expect(two).toContain('6,000.00');
  // The table keeps from 640px up.
  expect(
    screen.getByRole('table', { name: 'Open positions' }).className,
  ).toContain('@max-[48rem]:hidden');
});

test('open trades with no closed one still open on their tab', async () => {
  await renderRecent({
    edit: (s) => {
      s.trades = [openTrade('o-1', 1)];
    },
  });
  const table = await screen.findByRole('table', { name: 'Open positions' });
  expect(table.textContent).toContain('+$100.00');
  expect(
    (
      screen.getByRole('radio', {
        name: 'Open positions',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
});

test('recent trades follow the basis: gross reads the Gross P&L column', async () => {
  await renderRecent({ prefs: { pnlBasis: 'gross' } });
  const table = await screen.findByRole('table', { name: 'Recent trades' });
  expect(
    within(table).getByRole('columnheader', { name: 'Gross P&L' }),
  ).toBeTruthy();
  expect(table.textContent).toContain('−$395.00');
});

test('ungraded imports still show their trades, not graded (Review Focus 1)', async () => {
  await renderRecent({ graded: false });
  const rows = within(
    await screen.findByRole('table', { name: 'Recent trades' }),
  )
    .getAllByRole('row')
    .slice(1);
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.textContent).toContain('Not graded');
    expect(row.textContent).toContain('None');
  }
  expect(rows[0]!.textContent).toContain('−$400.00');
});

test('under R the recent trades are the ones with a stop, so none is left out', async () => {
  // Only the first trade has a risk: the list is that trade alone.
  await renderRecent({
    prefs: { displayUnit: 'r' },
    edit: (s) => {
      s.trades[0]!.initialRisk = 10000;
    },
  });
  const recent = await screen.findByRole('table', { name: 'Recent trades' });
  expect(within(recent).getAllByRole('row').slice(1)).toHaveLength(1);
});

test('filters that match no trade leave the card saying so', async () => {
  await renderRecent({ url: '/app/dashboard?symbol=ZZZ' });
  expect(said('recent')).toContain('No trades in this range.');
  expect(screen.queryByRole('table')).toBeNull();
});

test('the closed tab with only open trades says so, and the open one lists them', async () => {
  await renderRecent({
    edit: (s) => {
      s.trades = [openTrade('o-1', 1)];
    },
  });
  await waitFor(() => expect(said('recent')).toContain('Open positions'));
  fireEvent.click(screen.getByRole('radio', { name: 'Closed' }));
  expect(said('recent')).toContain('No closed trades in this range.');
});

test('recent trades keep the tab through a filter change', async () => {
  await renderRecent({
    edit: (s) => {
      s.trades.push(openTrade('o-1', 1));
    },
  });
  await openTab();
  window.history.replaceState(null, '', '/app/dashboard?account=acc-a');
  await waitFor(() =>
    expect(
      (
        screen.getByRole('radio', {
          name: 'Open positions',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true),
  );
});

test('under Privacy the realized amounts are hidden, in cells and in the names a screen reader gets', async () => {
  await renderRecent({
    prefs: { displayUnit: 'privacy' },
    edit: (s) => {
      s.trades.push(openTrade('o-1', 1));
    },
  });
  const closed = await screen.findByRole('table', { name: 'Recent trades' });
  expect(closed.textContent).not.toMatch(/\d,?\d{3}\.\d\d|[+−]\$\d/);
  expect(closed.textContent).toContain('$•••');
  const table = await openTab();
  expect(table.textContent).not.toContain('100.00');
  expect(table.textContent).toContain('$•••');
});

// ---- The challenge widget (C11) ----------------------------------------------

const WS = SAMPLE_WORKSPACE.id;
const RULES: PropRuleSet = {
  firm: 'Apex',
  phase: 'evaluation',
  profitTarget: 800_000,
  dailyLossLimit: 100_000,
  maxDrawdown: 1_000_000,
  drawdownType: 'trailing',
  minTradingDays: 5,
  consistencyPct: 0.4,
};
const propAccount = (id: string, name: string): Account => ({
  id,
  workspaceId: WS,
  name,
  broker: 'Apex',
  type: 'prop-evaluation',
  currency: 'USD',
  startingBalance: 10_000_000,
  status: 'active',
  propRules: RULES,
});
const challenge = (over: Partial<Challenge>): Challenge => ({
  id: 'c-1',
  workspaceId: WS,
  name: 'Forex 100K',
  firm: 'Apex',
  steps: 2,
  phases: [
    { step: 'step-1', accountId: 'p-1' },
    { step: 'step-2' },
    { step: 'funded' },
  ],
  phase: 'evaluation',
  status: 'active',
  ...over,
});
const propTrade = (id: string, accountId: string, net: number, day: string) =>
  makeTrade({
    id,
    workspaceId: WS,
    accountId,
    net,
    gross: net,
    fees: 0,
    serial: Number(id.replace(/\D/g, '')) + 100,
    openedAt: `${day}T14:00:00Z`,
    closedAt: `${day}T15:00:00Z`,
  });

/** Two challenges: the first clean and up $5,000, the second broke its daily loss limit. */
function twoChallenges(): SampleWorkspace {
  const s = fixtureSample();
  s.accounts.push(
    propAccount('p-1', 'Forex evaluation'),
    propAccount('p-2', 'Futures evaluation'),
  );
  s.challenges.push(
    challenge({}),
    challenge({
      id: 'c-2',
      name: 'Futures 100K',
      phases: [
        { step: 'step-1', accountId: 'p-2' },
        { step: 'step-2' },
        { step: 'funded' },
      ],
    }),
  );
  s.trades.push(
    propTrade('t-p1', 'p-1', 500_000, '2026-11-18'),
    // $1,500 lost in a day on a $1,000 daily limit.
    propTrade('t-p2', 'p-2', -150_000, '2026-11-10'),
  );
  return s;
}

describe('the challenge widget', () => {
  const card = () => widget('challenge');
  const line = (name: string) =>
    [...card().querySelectorAll<HTMLElement>('[data-rule]')].find(
      (l) => l.dataset.rule === name,
    )!;

  test('shows the most urgent active challenge by default: the one that broke a limit', async () => {
    await renderWidgets(['challenge'], { sample: twoChallenges });
    await waitFor(() =>
      expect(
        within(card()).getByRole('heading', { name: 'Futures 100K' }),
      ).toBeTruthy(),
    );
    expect(said('challenge')).toContain('Apex, Step 1 of 2');
    expect(said('challenge')).toContain(
      'Daily loss limit broken on 10 Nov (−$1,500.00 of −$1,000.00).',
    );
    // The trader's own status stays Active until they say otherwise.
    expect(within(card()).getByText('Active')).toBeTruthy();
  });

  test('shows the challenge the settings name, whichever is more urgent', async () => {
    await renderWidgets(
      [{ key: 'challenge', settings: { challengeId: 'c-1' } }],
      {
        sample: twoChallenges,
      },
    );
    await waitFor(() =>
      expect(
        within(card()).getByRole('heading', { name: 'Forex 100K' }),
      ).toBeTruthy(),
    );
    expect(said('challenge')).not.toContain('Futures 100K');
    expect(said('challenge')).not.toContain('Daily loss limit broken');
  });

  test('a challenge that is gone reads as none being named', async () => {
    await renderWidgets(
      [{ key: 'challenge', settings: { challengeId: 'c-deleted' } }],
      { sample: twoChallenges },
    );
    await waitFor(() =>
      expect(
        within(card()).getByRole('heading', { name: 'Futures 100K' }),
      ).toBeTruthy(),
    );
  });

  test('draws the card compactly: the balance and the five tracked rules, each with its figures', async () => {
    await renderWidgets(
      [{ key: 'challenge', settings: { challengeId: 'c-1' } }],
      {
        sample: twoChallenges,
      },
    );
    await waitFor(() => expect(said('challenge')).toContain('Forex 100K'));
    expect(said('challenge')).toContain('$105,000.00');
    expect(said('challenge')).toContain('from $100,000.00');
    expect(
      [...card().querySelectorAll<HTMLElement>('[data-rule]')].map(
        (l) => l.dataset.rule,
      ),
    ).toEqual([
      'profit',
      'daily-loss',
      'drawdown',
      'trading-days',
      'consistency',
    ]);
    // Up $5,000 of an $8,000 target: 63%.
    expect(line('profit').textContent).toContain('+$5,000.00 of $8,000.00');
    expect(line('daily-loss').textContent).toContain(
      '$0.00 of $1,000.00 used today',
    );
    expect(line('trading-days').textContent).toContain('1 of 5');
    expect(line('consistency').textContent).toContain('limit 40%');
    // A track for each, the drawdown's named by its type.
    expect(line('drawdown').textContent).toContain('Max drawdown, trailing');
    for (const key of ['profit', 'daily-loss', 'drawdown', 'trading-days'])
      expect(line(key).querySelector('[data-track]')).not.toBeNull();
    // The card has the info tip of the challenge, and no editing of its own.
    expect(
      card().querySelector('[data-metric-tip="challenge-card"]'),
    ).not.toBeNull();
    expect(within(card()).queryByRole('button', { name: /^Edit/ })).toBeNull();
    expect(
      within(card()).queryByRole('button', { name: 'Mark as breached' }),
    ).toBeNull();
  });

  test('a challenge settings control lists the challenges and saves the one picked on the widget', async () => {
    const { repo } = await renderWidgets(['challenge'], {
      sample: twoChallenges,
    });
    const shownBy = (name: string) => () =>
      within(card()).getByRole('button', { name: `Challenge shown, ${name}` });
    const trigger = await waitFor(shownBy('Most urgent'));
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const items = await screen.findAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual([
      'Most urgent',
      'Forex 100K',
      'Futures 100K',
    ]);
    fireEvent.click(items[1]!);
    await waitFor(async () => {
      const prefs = await repo.prefs.get();
      expect(prefs.dashboards?.templates[0]?.lower[0]?.settings).toEqual({
        challengeId: 'c-1',
      });
    });
    // The page follows: the card is Forex 100K now and the control says so.
    await waitFor(() =>
      expect(
        within(card()).getByRole('heading', { name: 'Forex 100K' }),
      ).toBeTruthy(),
    );
    expect(shownBy('Forex 100K')()).toBeTruthy();
    // Back to the default clears the choice rather than saving an empty one.
    fireEvent.keyDown(shownBy('Forex 100K')(), { key: 'Enter' });
    fireEvent.click((await screen.findAllByRole('menuitemradio'))[0]!);
    await waitFor(async () => {
      const prefs = await repo.prefs.get();
      const settings = prefs.dashboards?.templates[0]?.lower[0]?.settings;
      expect(settings === undefined || !('challengeId' in settings)).toBe(true);
    });
    await waitFor(() =>
      expect(
        within(card()).getByRole('heading', { name: 'Futures 100K' }),
      ).toBeTruthy(),
    );
  });

  test('with no challenge the widget says so and links to the Prop firms page', async () => {
    await renderWidgets(['challenge'], { sample: fixtureSample });
    await waitFor(() =>
      expect(said('challenge')).toContain('No challenge yet.'),
    );
    const link = within(card()).getByRole('link', { name: 'Open Prop firms' });
    expect(link.getAttribute('href')).toBe('/app/prop-firms');
    // It has no settings control to offer either.
    expect(
      within(card()).queryByRole('button', { name: /Challenge shown/ }),
    ).toBeNull();
  });

  test('under Privacy no amount shows, in the card or in the sentence a screen reader gets', async () => {
    await renderWidgets(['challenge'], {
      sample: twoChallenges,
      prefs: { displayUnit: 'privacy' },
    });
    await waitFor(() => expect(said('challenge')).toContain('Futures 100K'));
    expect(card().textContent).not.toMatch(/\d,\d{3}|\$\d/);
    expect(card().textContent).toContain('$•••');
    expect(card().textContent).toContain('hidden amount');
  });

  test('a funded challenge has no target to read', async () => {
    await renderWidgets(['challenge'], {
      sample: () => {
        const s = twoChallenges();
        s.challenges[0] = challenge({
          phase: 'funded',
          phases: [
            { step: 'step-1', accountId: 'p-1' },
            { step: 'step-2', accountId: 'p-1' },
            { step: 'funded', accountId: 'p-1' },
          ],
        });
        s.challenges.pop();
        return s;
      },
    });
    await waitFor(() => expect(said('challenge')).toContain('Forex 100K'));
    expect(said('challenge')).toContain('Funded');
    expect(line('profit').textContent).toContain('no target once funded');
  });
});

// ---- The report widget (C10) -------------------------------------------------

describe('the report widget', () => {
  // Three trading days: +$100.00, −$50.00, +$200.00. Running net: 100, 50, 250.
  const three = byDay([
    ['2026-11-02', 10_000],
    ['2026-11-03', -5_000],
    ['2026-11-04', 20_000],
  ]);
  const card = () => widget('report');
  const chart = () => within(card()).getByRole('img');
  const saved = async (repo: { prefs: { get(): Promise<UserPrefs> } }) =>
    (await repo.prefs.get()).dashboards?.templates[0]?.lower[0]?.settings;
  const open = async () => {
    fireEvent.click(
      await waitFor(() =>
        within(card()).getByRole('button', { name: 'Metrics' }),
      ),
    );
    return screen.findByRole('dialog', { name: 'Choose metrics' });
  };

  test('plots three metrics by day, as the comp does: net P&L, profit factor and win rate, running', async () => {
    await renderWidgets(['report'], { sample: three });
    await waitFor(() => expect(said('report')).toContain('By day, 3 metrics'));
    expect(said('report')).toContain('Report');
    expect(
      card().querySelector('[data-metric-tip="report-chart"]'),
    ).not.toBeNull();
    const label = chart().getAttribute('aria-label')!;
    expect(label).toMatch(
      /^Net P&L \(running\), Profit factor \(running\), Win rate \(running\) by day, all time\./,
    );
    // Where each runs: the net from 50 to 250 over the three days.
    expect(label).toContain('Net P&L (running) runs from +$50.00 to +$250.00.');
  });

  test('every chart has a role, a label and a table a screen reader reads', async () => {
    await renderWidgets(['report'], { sample: three });
    await waitFor(() => expect(said('report')).toContain('By day'));
    expect(chart().getAttribute('aria-label')!.length).toBeGreaterThan(20);
    expect(within(card()).getByRole('table')).toBeTruthy();
  });

  test('the template’s own metrics are drawn, with their kind and mode', async () => {
    await renderWidgets(
      [
        {
          key: 'report',
          settings: { metrics: ['wins:bar', 'net:line:running'] },
        },
      ],
      { sample: three },
    );
    await waitFor(() => expect(said('report')).toContain('By day, 2 metrics'));
    expect(chart().getAttribute('aria-label')).toMatch(
      /^Winning trades, Net P&L \(running\) by day/,
    );
    // A bar series and a line series.
    expect(card().querySelectorAll('[data-mark="bar"]').length).toBeGreaterThan(
      0,
    );
    expect(
      card().querySelectorAll('[data-mark="line"]').length,
    ).toBeGreaterThan(0);
  });

  test('ids this build does not know are dropped, and only the first three are plotted', async () => {
    await renderWidgets(
      [
        {
          key: 'report',
          settings: {
            metrics: ['from-the-future', 'wins', 'losses', 'trades', 'fees'],
          },
        },
      ],
      { sample: three },
    );
    await waitFor(() => expect(said('report')).toContain('By day, 3 metrics'));
    expect(chart().getAttribute('aria-label')).toMatch(
      /^Winning trades, Losing trades, Trades by day/,
    );
  });

  test('the Metrics menu lists the plotted metrics with their kind and mode, and removing one saves the rest on the widget', async () => {
    const { repo } = await renderWidgets(['report'], { sample: three });
    const menu = await open();
    const list = within(menu).getByRole('list', { name: 'Plotted metrics' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('span')!.textContent),
    ).toEqual(['Net P&L', 'Profit factor', 'Win rate']);
    // Each metric has its own bars or line, and period or running.
    expect(
      within(list).getByRole('radiogroup', { name: 'Net P&L chart type' }),
    ).toBeTruthy();
    expect(
      within(list).getByRole('radiogroup', { name: 'Net P&L plotted' }),
    ).toBeTruthy();
    fireEvent.click(
      within(list).getByRole('button', { name: 'Remove Profit factor' }),
    );
    await waitFor(async () =>
      expect(await saved(repo)).toEqual({
        metrics: ['net:line:running', 'win-rate:line:running'],
      }),
    );
    await waitFor(() => expect(said('report')).toContain('By day, 2 metrics'));
  });

  test('switching a metric to bars and to per day is saved with it', async () => {
    const { repo } = await renderWidgets(
      [{ key: 'report', settings: { metrics: ['net:line:running'] } }],
      { sample: three },
    );
    const menu = await open();
    fireEvent.click(within(menu).getByRole('radio', { name: 'Bar' }));
    await waitFor(async () =>
      expect(await saved(repo)).toEqual({ metrics: ['net:bar:running'] }),
    );
    fireEvent.click(within(menu).getByRole('radio', { name: 'Period' }));
    await waitFor(async () =>
      expect(await saved(repo)).toEqual({ metrics: ['net:bar'] }),
    );
  });

  test('a fourth metric is refused, with the reason; removing one makes room', async () => {
    const { repo } = await renderWidgets(['report'], { sample: three });
    const menu = await open();
    const fourth = within(menu).getByRole('checkbox', {
      name: 'Expectancy',
    }) as HTMLInputElement;
    expect(fourth.disabled).toBe(true);
    const reason = document.getElementById(
      fourth.getAttribute('aria-describedby')!,
    )!;
    expect(reason.textContent).toBe(
      'Three metrics at most. Remove one to add another.',
    );
    fireEvent.click(fourth);
    // Nothing was saved, and the chart still plots three.
    expect(await saved(repo)).toBeUndefined();
    expect(said('report')).toContain('By day, 3 metrics');
    // The three that are plotted stay ticked and can be unticked.
    expect(
      (
        within(menu).getByRole('checkbox', {
          name: 'Win rate',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    fireEvent.click(within(menu).getByRole('checkbox', { name: 'Win rate' }));
    await waitFor(async () =>
      expect(await saved(repo)).toEqual({
        metrics: ['net:line:running', 'profit-factor:line:running'],
      }),
    );
    await waitFor(() => expect(fourth.disabled).toBe(false));
    fireEvent.click(fourth);
    // A new metric comes in as the catalogue has it: bars here, per day.
    await waitFor(async () =>
      expect(await saved(repo)).toEqual({
        metrics: [
          'net:line:running',
          'profit-factor:line:running',
          'expectancy:bar',
        ],
      }),
    );
  });

  test('the catalogue can be searched', async () => {
    await renderWidgets(['report'], { sample: three });
    const menu = await open();
    fireEvent.change(
      within(menu).getByRole('searchbox', { name: 'Search metrics' }),
      {
        target: { value: 'drawdown' },
      },
    );
    const boxes = within(menu)
      .getAllByRole('checkbox')
      .map((b) => b.getAttribute('aria-label'));
    expect(boxes).toEqual([
      'Max drawdown',
      'Average drawdown',
      'Daily drawdown',
    ]);
  });

  test('with no metric picked it says to pick one, and the menu stays', async () => {
    await renderWidgets([{ key: 'report', settings: { metrics: [] } }], {
      sample: three,
    });
    await waitFor(() =>
      expect(said('report')).toContain('Pick a metric to chart it.'),
    );
    expect(said('report')).toContain('By day, 0 metrics');
    expect(
      within(card()).getByRole('button', { name: 'Metrics' }),
    ).toBeTruthy();
  });

  test('a metric with no value in some days says why', async () => {
    await renderWidgets(
      [{ key: 'report', settings: { metrics: ['avg-daily-win-loss'] } }],
      {
        sample: byDay([
          ['2026-11-02', 10_000],
          ['2026-11-03', 5_000],
        ]),
      },
    );
    await waitFor(() =>
      expect(said('report')).toContain(
        'Average daily win/loss shows only for periods with both a green and a red day.',
      ),
    );
  });

  test('no closed trade in the filters says so', async () => {
    await renderWidgets(['report'], {
      sample: three,
      url: '/app/dashboard?symbol=ZZZ',
    });
    await waitFor(() =>
      expect(said('report')).toContain('No closed trades in this range.'),
    );
  });

  test('the date range clips what is plotted, from its first day', async () => {
    await renderWidgets(['report'], {
      sample: three,
      url: '/app/dashboard?from=2026-11-03&to=2026-11-04',
    });
    await waitFor(() => expect(said('report')).toContain('By day, 3 metrics'));
    // The running net starts at the range: −$50.00, then +$150.00.
    expect(chart().getAttribute('aria-label')).toContain(
      'Net P&L (running) runs from −$50.00 to +$150.00.',
    );
  });

  test('under Privacy the amounts and the ratios are hidden in the label and in the table', async () => {
    await renderWidgets(['report'], {
      sample: three,
      prefs: { displayUnit: 'privacy' },
    });
    await waitFor(() => expect(said('report')).toContain('By day'));
    const label = chart().getAttribute('aria-label')!;
    expect(label).not.toMatch(/\$\d|\d\.\d\d/);
    expect(label).toContain('runs from hidden amount to hidden amount');
    expect(label).toContain('runs from hidden ratio to hidden ratio');
    const table = within(card()).getByRole('table').textContent!;
    expect(table).not.toMatch(/\$\d/);
    expect(table).toContain('$•••');
  });
});

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
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { resolveInstrument } from '@/domain/instruments';
import { everyString } from '../__fixtures__/every-string';
import { renderApp } from '../__fixtures__/render-app';
import { StrategyView } from './strategy-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

/** str-1 on both closed trades; its Risk rule shows on losers only. */
async function sample(): Promise<SampleWorkspace> {
  const fx = fixtureSample();
  fx.trades[1]!.strategyIds = ['str-1'];
  fx.strategies[0]!.groups[1]!.rules[0]!.showWhen = 'loser';
  return fx;
}

const open = (id = 'str-1') =>
  renderApp(<StrategyView id={id} />, {
    sample,
    url: `/app/strategies/${id}`,
  });

test("shows the rules under the strategy's own groups, with a chip on a rule that is not always graded", async () => {
  open();
  const table = await screen.findByRole('table', { name: 'Rules' });
  expect(within(table).getByText('Entry')).toBeTruthy();
  expect(within(table).getByText('Risk')).toBeTruthy();
  expect(
    within(table).getByText('Wait for the 15-minute range to close'),
  ).toBeTruthy();
  const loserRow = within(table)
    .getByText('Stop beyond the far side of the range')
    .closest('tr')!;
  expect(within(loserRow).getByText('On losers')).toBeTruthy();
  const alwaysRow = within(table)
    .getByText('Wait for the 15-minute range to close')
    .closest('tr')!;
  expect(within(alwaysRow).queryByText(/^On /)).toBeNull();
});

test('View n trades goes to the log filtered by the strategy; Edit goes to the editor', async () => {
  open();
  const view = await screen.findByRole('link', { name: 'View 2 trades' });
  expect(view.getAttribute('href')).toBe('/app/trades?strategy=str-1');
  expect(
    screen.getByRole('link', { name: 'Edit strategy' }).getAttribute('href'),
  ).toBe('/app/strategies/str-1/edit');
});

test('Archive sets it aside, and the button turns into Unarchive', async () => {
  const { repo } = open();
  fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
  await waitFor(async () =>
    expect(
      (await repo.strategies.get(SAMPLE_WORKSPACE.id, 'str-1'))!.status,
    ).toBe('archived'),
  );
  expect(await screen.findByRole('button', { name: 'Unarchive' })).toBeTruthy();
});

test('a strategy that is not there says so', async () => {
  open('nope');
  expect(await screen.findByText("That strategy isn't here.")).toBeTruthy();
});

/** str-1 on two base-currency trades and a third in euros. */
async function mixed(): Promise<SampleWorkspace> {
  const fx = await sample();
  fx.trades[2]!.strategyIds = ['str-1'];
  fx.trades[2]!.pnlCurrency = 'EUR';
  fx.trades[2]!.accountId = 'acc-a';
  return fx;
}

test('trades in another currency are left out, and the page says so', async () => {
  renderApp(<StrategyView id="str-1" />, {
    sample: mixed,
    url: '/app/strategies/str-1',
  });
  // The log lists what the figures read: the two base-currency trades, named by currency.
  const view = await screen.findByRole('link', { name: 'View 2 trades' });
  expect(view.getAttribute('href')).toBe('/app/trades?strategy=str-1&ccy=USD');
  expect(
    screen.getByText(
      '1 trade in another currency is left out of these figures.',
    ),
  ).toBeTruthy();
});

test('with every trade in the base currency there is no left-out note', async () => {
  open();
  await screen.findByRole('link', { name: 'View 2 trades' });
  expect(screen.queryByText(/left out of these figures/)).toBeNull();
});

test('the equity line is an image that says its range, trade count and end value', async () => {
  open();
  const line = await screen.findByRole('img', { name: /^Equity of / });
  const name = line.getAttribute('aria-label')!;
  expect(name).toContain('Opening range breakout');
  expect(name).toContain('16 Nov 2026 to 17 Nov 2026');
  expect(name).toContain('2 closed trades');
  expect(name).toMatch(/ends at \+\$116\.00/);
});

test('under Privacy the equity line names no amount', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<StrategyView id="str-1" />, {
    repository,
    url: '/app/strategies/str-1',
  });
  const line = await screen.findByRole('img', { name: /^Equity of / });
  expect(line.getAttribute('aria-label')).toContain('hidden amount');
  fireEvent.focus(line.closest('[data-equity-points]')!);
  expect(everyString(document.body).filter((t) => /\$\d/.test(t))).toEqual([]);
});

test('under Privacy the strategy page hides its profit factor and keeps the win rate and counts', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample,
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<StrategyView id="str-1" />, {
    repository,
    url: '/app/strategies/str-1',
  });
  await screen.findByRole('img', { name: /^Equity of / });
  const pf = document.querySelector('[data-metric-tip="profit-factor"]')!;
  const card = pf.closest('div')!.parentElement!;
  expect(card.textContent).toContain('hidden ratio');
  expect(card.textContent).not.toMatch(/\d\.\d\d/);
  const rate = document.querySelector('[data-metric-tip="win-rate"]')!;
  expect(rate.closest('div')!.parentElement!.textContent).toMatch(/\d%/);
});

test('focusing the equity line reads a point, and the arrow keys move along it', async () => {
  open();
  const line = await screen.findByRole('img', { name: /^Equity of / });
  const points = line.closest('[data-equity-points]') as HTMLElement;
  expect(points.getAttribute('tabindex')).toBe('0');
  const readout = screen.getByRole('status', { name: 'Equity readout' });
  expect(readout.textContent).toBe('');
  fireEvent.focus(points);
  expect(readout.textContent).toContain('17 Nov 2026');
  expect(readout.textContent).toContain('after trade 2 of 2');
  fireEvent.keyDown(points, { key: 'ArrowLeft' });
  expect(readout.textContent).toContain('16 Nov 2026');
  expect(readout.textContent).toContain('after trade 1 of 2');
  fireEvent.keyDown(points, { key: 'Home' });
  expect(readout.textContent).toContain('Before the first trade');
  fireEvent.blur(points);
  expect(readout.textContent).toBe('');
});

test('the rules are also stacked per rule for narrow screens: the text, three figures, then two', async () => {
  open();
  const list = await screen.findByRole('list', {
    name: 'Rules, one card each',
  });
  const card = within(list)
    .getByText('Wait for the 15-minute range to close')
    .closest('li')!;
  const text = card.textContent!;
  const order = [
    'Wait for the 15-minute range to close',
    'Follow rate',
    'P&L when followed',
    'Cost when broken',
    'Win rate kept',
    'PF kept',
  ].map((t) => text.indexOf(t));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  // The first three share one line; the last two sit on the next.
  const lines = card.querySelectorAll('[data-line]');
  expect(lines).toHaveLength(2);
  expect(lines[0]!.textContent).toContain('Cost when broken');
  expect(lines[1]!.textContent).toContain('PF kept');
});

test('the average win, the drawdown and the broken cost follow the display unit', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample,
  });
  await repository.prefs.update({ displayUnit: 'ticks' });
  renderApp(<StrategyView id="str-1" />, {
    repository,
    url: '/app/strategies/str-1',
  });
  const stats = (await screen.findByRole('heading', { name: 'Stats' })).closest(
    'section',
  )!;
  expect(stats.textContent).toContain('avg win');
  expect(stats.textContent).not.toMatch(/\$\d/);
});

test('if archiving fails the header says so, neutrally', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample,
  });
  repository.strategies.update = async () => {
    throw new Error('quota');
  };
  renderApp(<StrategyView id="str-1" />, {
    repository,
    url: '/app/strategies/str-1',
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("couldn't be archived");
  expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy();
});

/** The losers-only Risk rule broken on the losing trade; the always-on Entry rule kept on both. */
async function brokenOnLoser(): Promise<SampleWorkspace> {
  const fx = await sample();
  fx.trades[1]!.ruleChecks = [
    { ruleId: 'r-1', followed: true },
    { ruleId: 'r-2', followed: false },
  ];
  return fx;
}

test('a losers-only rule says so in its kept win rate and profit factor, and is never the costliest', async () => {
  renderApp(<StrategyView id="str-1" />, {
    sample: brokenOnLoser,
    url: '/app/strategies/str-1',
  });
  const table = await screen.findByRole('table', { name: 'Rules' });
  const loserRow = within(table)
    .getByText('Stop beyond the far side of the range')
    .closest('tr')!;
  // Its kept trades can only be losers: a win rate and a profit factor of them mean nothing.
  expect(within(loserRow).getAllByText('Losers')).toHaveLength(2);
  expect(loserRow.textContent).not.toContain('Costliest');
  expect(table.textContent).not.toContain('Costliest');
  const alwaysRow = within(table)
    .getByText('Wait for the 15-minute range to close')
    .closest('tr')!;
  expect(within(alwaysRow).queryByText('Losers')).toBeNull();
});

/** str-1 on f-1 (16 Nov) and f-2 (17 Nov) in acc-a, and f-3 (18 Nov) in the archived acc-b. */
async function threeAccounts(): Promise<SampleWorkspace> {
  const fx = await sample();
  fx.trades[2]!.strategyIds = ['str-1'];
  return fx;
}

const openAt = (query: string) =>
  renderApp(<StrategyView id="str-1" />, {
    sample: threeAccounts,
    url: `/app/strategies/str-1${query}`,
  });

test('a date range narrows every figure to the trades inside it', async () => {
  openAt('?from=2026-11-17&to=2026-11-17');
  expect(
    await screen.findByRole('link', { name: 'View 1 trade' }),
  ).toBeTruthy();
  expect(screen.getByText('1 closed, 0 open')).toBeTruthy();
  // f-2 is the loser: the winner is out of the range.
  expect(screen.getByText('0 won, 1 lost')).toBeTruthy();
  expect(screen.getByText('on 0 trades')).toBeTruthy();
});

test('an account filter narrows the figures to that account, archived or not', async () => {
  openAt('?account=acc-b');
  expect(
    await screen.findByRole('link', { name: 'View 1 trade' }),
  ).toBeTruthy();
  expect(screen.getByText('1 closed, 0 open')).toBeTruthy();
});

test('the trade link carries the filters, with this strategy', async () => {
  openAt('?from=2026-11-17&to=2026-11-17');
  const view = await screen.findByRole('link', { name: 'View 1 trade' });
  expect(view.getAttribute('href')).toBe(
    '/app/trades?from=2026-11-17&to=2026-11-17&strategy=str-1',
  );
});

test('with no trade in the filters it says the filters hide them, and Clear filters brings them back', async () => {
  openAt('?from=2030-01-01&to=2030-01-31');
  expect(
    await screen.findByText("Your filters hide this strategy's trades."),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(
    await screen.findByRole('link', { name: 'View 2 trades' }),
  ).toBeTruthy();
  expect(window.location.search).toBe('');
});

test('under a unit that keeps none of its trades the page says so', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: threeAccounts,
  });
  await repository.prefs.update({ displayUnit: 'pips' });
  renderApp(<StrategyView id="str-1" />, {
    repository,
    url: '/app/strategies/str-1',
  });
  expect(
    await screen.findByText(
      "Pips counts forex trades only, so none of this strategy's trades show.",
    ),
  ).toBeTruthy();
});

/** str-1 on f-1 and f-2, plus an open trade, a trade in euros and, with `held`, an ES trade out over 16 and 17 Nov. */
function withOthers(held = false) {
  return async (): Promise<SampleWorkspace> => {
    const fx = await sample();
    const base = fx.trades[1]!;
    const open = { ...base };
    delete open.closedAt;
    delete open.avgExit;
    const fill = (
      id: string,
      side: 'buy' | 'sell',
      qty: number,
      price: number,
      time: string,
    ) => ({
      id,
      accountId: 'acc-a',
      symbol: 'ESZ5',
      side,
      qty,
      price,
      time,
      fees: 0,
      commission: 0,
    });
    fx.trades.push(
      {
        ...open,
        id: 'm-open',
        serial: 50,
        status: 'open',
        net: 0,
        gross: 0,
        ruleChecks: [],
        openedAt: '2026-11-18T15:00:00.000Z',
      },
      { ...base, id: 'm-eur', serial: 51, pnlCurrency: 'EUR', ruleChecks: [] },
    );
    if (held)
      // Long two ES: one out on 16 Nov at -$100, the other on 17 Nov at -$20.
      fx.trades.push({
        ...base,
        id: 'm-held',
        serial: 52,
        direction: 'long',
        avgEntry: 4500,
        avgExit: 4498.8,
        maxPosition: 2,
        net: -12000,
        gross: -12000,
        fees: 0,
        ruleChecks: [],
        openedAt: '2026-11-16T15:00:00.000Z',
        closedAt: '2026-11-17T16:00:00.000Z',
        executions: [
          fill('h1', 'buy', 2, 4500, '2026-11-16T15:00:00.000Z'),
          fill('h2', 'sell', 1, 4498, '2026-11-16T16:00:00.000Z'),
          fill('h3', 'sell', 1, 4499.6, '2026-11-17T16:00:00.000Z'),
        ],
      });
    return fx;
  };
}

test('View n trades counts what the log will list: closed trades in the base currency (I7)', async () => {
  renderApp(<StrategyView id="str-1" />, {
    sample: withOthers(),
    url: '/app/strategies/str-1',
  });
  // f-1 and f-2: the open trade is not on the log's Closed list, the euro trade is named away.
  const view = await screen.findByRole('link', { name: 'View 2 trades' });
  expect(view.getAttribute('href')).toBe('/app/trades?strategy=str-1&ccy=USD');
});

test("the trade link keeps the page's strategy choice and exclusions (I7)", async () => {
  renderApp(<StrategyView id="str-1" />, {
    sample: async () => {
      const fx = await sample();
      fx.strategies.push({ ...fx.strategies[0]!, id: 'str-9', name: 'Other' });
      return fx;
    },
    url: '/app/strategies/str-1?strategy=str-1&xstrat=str-9',
  });
  const view = await screen.findByRole('link', { name: /^View \d+ trades?$/ });
  const params = new URLSearchParams(view.getAttribute('href')!.split('?')[1]);
  expect(params.get('strategy')).toBe('str-1');
  expect(params.get('xstrat')).toBe('str-9');
});

test('the max drawdown reads only the exits inside the date range (I7)', async () => {
  renderApp(<StrategyView id="str-1" />, {
    sample: withOthers(true),
    url: '/app/strategies/str-1?from=2026-11-17&to=2026-11-17',
  });
  const stats = (await screen.findByRole('heading', { name: 'Stats' })).closest(
    'section',
  )!;
  const dd = stats
    .querySelector('[data-metric-tip="max-drawdown"]')!
    .closest('div')!;
  // 17 Nov: f-2 lost $129.50 and m-held's second exit $20; the $100 exit on 16 Nov is outside.
  expect(dd.querySelector('b')!.textContent).toBe('−$149.50');
});

/** str-1 on two ES trades (+8 ticks for $100, -4 ticks for $500) and a euro-dollar win of $1,000 that carries its rule checks. */
async function partlyInTicks(): Promise<SampleWorkspace> {
  const fx = await sample();
  const [a, b] = fx.trades;
  Object.assign(a!, {
    avgEntry: 4500,
    avgExit: 4502,
    net: 10000,
    gross: 10000,
    fees: 0,
    ruleChecks: [],
    executions: [],
  });
  Object.assign(b!, {
    direction: 'long',
    avgEntry: 4500,
    avgExit: 4499,
    net: -50000,
    gross: -50000,
    fees: 0,
    ruleChecks: [],
    executions: [],
  });
  fx.trades.push({
    ...a!,
    id: 'fx-1',
    serial: 60,
    instrument: resolveInstrument('EURUSD')!,
    avgEntry: 1.07,
    avgExit: 1.08,
    net: 100000,
    gross: 100000,
    ruleChecks: [{ ruleId: 'r-1', followed: true }],
  });
  return fx;
}

test('under Ticks a strategy with forex and futures reads only the futures: profit factor in ticks, and its rules kept empty (Task 24 M1)', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: partlyInTicks,
  });
  await repository.prefs.update({ displayUnit: 'ticks' });
  renderApp(<StrategyView id="str-1" />, {
    repository,
    url: '/app/strategies/str-1',
  });
  const stats = (await screen.findByRole('heading', { name: 'Stats' })).closest(
    'section',
  )!;
  const value = (id: string) =>
    stats
      .querySelector(`[data-metric-tip="${id}"]`)!
      .closest('div')!
      .querySelector('b')!.textContent;
  // 8 ticks won over 4 lost; in dollars it would be 100 over 500.
  expect(value('profit-factor')).toBe('2.00');
  expect(value('win-rate')).toBe('50.0%');
  // The only trade with rule checks is the forex one, which Ticks leaves out.
  expect(value('rule-adherence')).toBe('None');
  expect(value('pnl')).toBe('+4.0 ticks');
});

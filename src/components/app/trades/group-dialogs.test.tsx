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
import { resolveInstrument } from '@/domain/instruments';
import { buildTrades } from '@/domain/trade-builder';
import type { Account, Execution, Trade } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { TradesView } from './trades-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = 'sample';
const DAY = '2026-11-02';

let n = 0;
/** A fill on DAY at hh:mm:ss (the profile zone is UTC here, so the clock reads the same). */
function fill(
  accountId: string,
  symbol: string,
  clock: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
): Execution {
  n += 1;
  return {
    id: `x-${n}`,
    accountId,
    symbol,
    side,
    qty,
    price,
    time: `${DAY}T${clock}Z`,
    fees: 0,
    commission: 0,
  };
}

/** One trade from the fills, with the id and serial the test names. */
function trade(serial: number, fills: Execution[]): Trade {
  const [built] = buildTrades(fills, {
    workspaceId: WS,
    startSerial: serial,
    resolve: (s) => resolveInstrument(s),
    accountCurrency: (id) => (id === 'acc-eur' ? 'EUR' : 'USD'),
  }).trades;
  return { ...built!, id: `t-${serial}`, serial };
}

const account = (
  id: string,
  name: string,
  over: Partial<Account>,
): Account => ({
  id,
  workspaceId: WS,
  name,
  broker: 'Broker',
  type: 'live',
  currency: 'USD',
  startingBalance: 0,
  status: 'active',
  ...over,
});

/**
 * Trades 1 and 2: two ES trips in Futures main (1 has three fills, 2 two).
 * 3: an NQ trip in Futures main. 4: an ES trip in Euro futures (EUR).
 * 5: an open ES trade with one fill. 6: the comp's four fills (buy 2, buy 1,
 * sell 1, sell 2). 7: an ES trip in the archived Old demo.
 */
function scenario(): SampleWorkspace {
  const fx = fixtureSample();
  const a = 'acc-a';
  return {
    ...fx,
    accounts: [
      ...fx.accounts,
      account('acc-eur', 'Euro futures', { currency: 'EUR' }),
      account('acc-usd', 'Stocks and options', {}),
    ],
    trades: [
      trade(1, [
        fill(a, 'ESZ5', '09:41:12', 'buy', 1, 6612.25),
        fill(a, 'ESZ5', '09:44:30', 'buy', 1, 6611.5),
        fill(a, 'ESZ5', '09:52:05', 'sell', 2, 6618.75),
      ]),
      trade(2, [
        fill(a, 'ESZ5', '09:58:40', 'buy', 1, 6615),
        fill(a, 'ESZ5', '10:06:12', 'sell', 1, 6619.25),
      ]),
      trade(3, [
        fill(a, 'NQZ5', '11:00:00', 'buy', 1, 21000),
        fill(a, 'NQZ5', '11:10:00', 'sell', 1, 21010),
      ]),
      trade(4, [
        fill('acc-eur', 'ESZ5', '12:00:00', 'buy', 1, 6600),
        fill('acc-eur', 'ESZ5', '12:10:00', 'sell', 1, 6604),
      ]),
      trade(5, [fill(a, 'ESZ5', '13:00:00', 'buy', 1, 6620)]),
      trade(6, [
        fill(a, 'ESZ5', '14:00:00', 'buy', 2, 6592.25),
        fill(a, 'ESZ5', '14:05:00', 'buy', 1, 6589.5),
        fill(a, 'ESZ5', '14:10:00', 'sell', 1, 6598),
        fill(a, 'ESZ5', '14:15:00', 'sell', 2, 6600.75),
      ]),
      trade(7, [
        fill('acc-b', 'ESZ5', '15:00:00', 'buy', 1, 6600),
        fill('acc-b', 'ESZ5', '15:10:00', 'sell', 1, 6601),
      ]),
    ],
  };
}

async function setup(url = '/app/trades') {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => scenario(),
  });
  // The profile zone is UTC, so a fill's clock reads as it was written.
  await repo.prefs.update({ timeZone: 'UTC' });
  const view = renderApp(<TradesView />, { repository: repo, url });
  return view;
}

const MENU = 'Merge, split or move';

/** Ticks the log's rows by serial. */
async function pick(...serials: number[]) {
  for (const s of serials)
    fireEvent.click(
      await screen.findByRole('checkbox', { name: `Select trade ${s}` }),
    );
}
const bar = () => screen.findByRole('toolbar');
/** Radix opens a menu on a key. */
async function openMenu() {
  fireEvent.keyDown(within(await bar()).getByRole('button', { name: MENU }), {
    key: 'Enter',
  });
}
const item = (name: RegExp) => screen.findByRole('menuitem', { name });
const closeMenu = async () => {
  fireEvent.keyDown(await screen.findByRole('menu'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
};
const open = (view: 'Closed' | 'Open') =>
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${view}`) }));

beforeEach(() => {
  window.innerWidth = 1024;
});

describe('the menu', () => {
  test('it sits after Export CSV, between the dividers, and is named for what it holds', async () => {
    await setup();
    await pick(1, 2);
    const toolbar = await bar();
    const buttons = within(toolbar).getAllByRole('button');
    const names = buttons.map(
      (b) => b.getAttribute('aria-label') ?? b.textContent,
    );
    expect(names.indexOf(MENU)).toBe(names.indexOf('Export CSV') + 1);
    expect(names.indexOf('Delete')).toBe(names.indexOf(MENU) + 1);
  });

  test('Merge is disabled for a mixed selection, with its reason', async () => {
    await setup();
    // An ES and an NQ trade in one account: two instruments.
    await pick(1, 3);
    await openMenu();
    const merge = await item(/^Merge/);
    expect(merge.getAttribute('aria-disabled')).toBe('true');
    expect(merge.textContent).toContain(
      'Merge needs one account and one instrument.',
    );
    // Two ES trades in two accounts: two accounts.
    await closeMenu();
    await pick(3, 4);
    await openMenu();
    const again = await item(/^Merge/);
    expect(again.getAttribute('aria-disabled')).toBe('true');
    expect(again.textContent).toContain(
      'Merge needs one account and one instrument.',
    );
    // Trades 1 and 2, both ES in one account: merge is on.
    await closeMenu();
    await pick(4, 2);
    await openMenu();
    expect((await item(/^Merge/)).getAttribute('aria-disabled')).toBeNull();
  });

  test('an item that is off keeps its place on the keyboard path and gives its reason as its description', async () => {
    await setup();
    await pick(1, 3);
    await openMenu();
    const merge = await item(/^Merge/);
    // Opened from the keyboard, the first item takes the focus though it is off.
    await waitFor(() => expect(document.activeElement).toBe(merge));
    expect(merge.getAttribute('aria-disabled')).toBe('true');
    expect(merge.hasAttribute('data-disabled')).toBe(false);
    // Named by its label alone; the reason is its description.
    const labelled = document.getElementById(
      merge.getAttribute('aria-labelledby')!,
    );
    expect(labelled?.textContent).toBe('Merge');
    const described = document.getElementById(
      merge.getAttribute('aria-describedby')!,
    );
    expect(described?.textContent).toBe(
      'Merge needs one account and one instrument.',
    );
    // The arrow keys reach the next item, Split, off for two trades too.
    fireEvent.keyDown(merge, { key: 'ArrowDown' });
    const split = await item(/^Split/);
    await waitFor(() => expect(document.activeElement).toBe(split));
    // Choosing an item that is off opens nothing, and the menu stays.
    fireEvent.keyDown(split, { key: 'Enter' });
    fireEvent.click(merge);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  test('Split needs exactly one trade with two or more fills', async () => {
    await setup();
    // Two trades: one at a time.
    await pick(1, 2);
    await openMenu();
    const two = await item(/^Split/);
    expect(two.getAttribute('aria-disabled')).toBe('true');
    expect(two.textContent).toContain('Split works on one trade at a time.');
    await closeMenu();
    await pick(1, 2);
    // One trade with one fill (open, in the Open tab).
    open('Open');
    await pick(5);
    await openMenu();
    const one = await item(/^Split/);
    expect(one.getAttribute('aria-disabled')).toBe('true');
    expect(one.textContent).toContain(
      'Split needs a trade with two or more executions.',
    );
    await closeMenu();
    await pick(5);
    // One trade with fills: on.
    open('Closed');
    await pick(6);
    await openMenu();
    expect((await item(/^Split/)).getAttribute('aria-disabled')).toBeNull();
  });
});

describe('merge', () => {
  test('the merge dialog ticks every fill, and what it will do follows the ticks', async () => {
    const { repo } = await setup();
    await pick(1, 2);
    await openMenu();
    fireEvent.click(await item(/^Merge/));
    const dialog = await screen.findByRole('dialog', {
      name: 'Merge 2 trades',
    });
    const table = within(dialog).getByRole('table', { name: 'Executions' });
    const boxes = within(table).getAllByRole('checkbox') as HTMLInputElement[];
    // The header's box, then five fills, every one ticked.
    expect(boxes).toHaveLength(6);
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(dialog.textContent).toContain('5 of 5 executions ticked');
    expect(dialog.textContent).toContain(
      'opened first, so it keeps its record (note, rating, rule checks) and takes all 5 executions.',
    );
    expect(dialog.textContent).toContain('There is no undo.');
    // Newest last: the times read in order.
    const times = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => /\d\d:\d\d:\d\d/.exec(r.textContent!)![0]);
    expect(times).toEqual([...times].sort());

    // Leaving one of trade 2's fills out keeps it in trade 2.
    fireEvent.click(
      within(table).getByRole('checkbox', {
        name: /^10:06:12 Sell 1 at 6,619.25/,
      }),
    );
    expect(dialog.textContent).toContain('4 of 5 executions ticked');
    expect(dialog.textContent).toContain(
      'keeps the 1 execution you left unticked',
    );
    // Taking all of trade 2's fills out leaves nothing to join.
    fireEvent.click(
      within(table).getByRole('checkbox', {
        name: /^09:58:40 Buy 1 at 6,615/,
      }),
    );
    const merge = within(dialog).getByRole('button', {
      name: 'Merge',
    }) as HTMLButtonElement;
    expect(merge.disabled).toBe(true);
    expect(dialog.textContent).toContain(
      'Tick executions from at least two trades to merge.',
    );
    // All back on, and confirm.
    fireEvent.click(
      within(table).getByRole('checkbox', { name: 'Select all executions' }),
    );
    expect(merge.disabled).toBe(false);
    fireEvent.click(merge);

    await waitFor(async () =>
      expect(await repo.trades.get(WS, 't-2')).toBeUndefined(),
    );
    const kept = (await repo.trades.get(WS, 't-1'))!;
    expect(kept.executions).toHaveLength(5);
    expect(kept.grouping).toBe('manual');
    expect(
      (await screen.findByRole('status', { name: 'Result' })).textContent,
    ).toContain('Merged 2 trades into trade 1.');
    // The selection is spent: its bar is gone.
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    // The keyboard lands on the log, not on the page's body.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('region', { name: 'Trade log' }),
      ),
    );
  });

  test("the kept trade's own executions stay in it: their boxes are ticked and off, with the reason", async () => {
    await setup();
    await pick(1, 2);
    await openMenu();
    fireEvent.click(await item(/^Merge/));
    const dialog = await screen.findByRole('dialog', {
      name: 'Merge 2 trades',
    });
    const table = within(dialog).getByRole('table', { name: 'Executions' });
    const box = (name: RegExp) =>
      within(table).getByRole('checkbox', { name }) as HTMLInputElement;
    // Trade 1 opened first, so it keeps its record and every fill it has.
    const kept = [/^09:41:12/, /^09:44:30/, /^09:52:05/].map(box);
    for (const b of kept) {
      expect(b.checked).toBe(true);
      expect(b.disabled).toBe(true);
      expect(
        document.getElementById(b.getAttribute('aria-describedby')!)
          ?.textContent,
      ).toBe(
        'Trade 1 keeps all of its own executions, so their boxes stay ticked.',
      );
    }
    fireEvent.click(kept[0]!);
    expect(kept[0]!.checked).toBe(true);
    expect(dialog.textContent).toContain('5 of 5 executions ticked');
    // Trade 2's fills join only when ticked.
    const joining = box(/^09:58:40/);
    expect(joining.disabled).toBe(false);
    expect(joining.getAttribute('aria-describedby')).toBeNull();
    fireEvent.click(joining);
    expect(joining.checked).toBe(false);
    expect(dialog.textContent).toContain('4 of 5 executions ticked');
    // Unticking all leaves no trade to keep, and every box is free again.
    fireEvent.click(
      within(table).getByRole('checkbox', { name: 'Select all executions' }),
    );
    fireEvent.click(
      within(table).getByRole('checkbox', { name: 'Select all executions' }),
    );
    expect(dialog.textContent).toContain('0 of 5 executions ticked');
    for (const b of [/^09:41:12/, /^09:44:30/, /^09:52:05/].map(box))
      expect(b.disabled).toBe(false);
  });

  test('trades in an archived account are left out of a merge, and the menu says so', async () => {
    await setup('/app/trades?account=acc-a&account=acc-b');
    await pick(7, 6);
    await openMenu();
    const merge = await item(/^Merge/);
    expect(merge.getAttribute('aria-disabled')).toBe('true');
    expect(merge.textContent).toContain(
      'Merge needs two or more trades outside archived accounts.',
    );
  });
});

describe('split', () => {
  test('a split ticks nothing to begin with and needs one fill to stay', async () => {
    const { repo } = await setup();
    await pick(6);
    await openMenu();
    fireEvent.click(await item(/^Split/));
    const dialog = await screen.findByRole('dialog', { name: 'Split trade 6' });
    const table = within(dialog).getByRole('table', { name: 'Executions' });
    const boxes = () =>
      within(table).getAllByRole('checkbox').slice(1) as HTMLInputElement[];
    expect(boxes()).toHaveLength(4);
    expect(boxes().every((b) => !b.checked)).toBe(true);
    const split = within(dialog).getByRole('button', {
      name: 'Split',
    }) as HTMLButtonElement;
    expect(split.disabled).toBe(true);
    expect(dialog.textContent).toContain('0 of 4 ticked');
    // The running position reads down the table.
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.lastElementChild!.textContent),
    ).toEqual(['+2', '+3', '+2', 'Flat']);

    // All of them: nothing would stay.
    fireEvent.click(
      within(table).getByRole('checkbox', { name: 'Select all executions' }),
    );
    expect(split.disabled).toBe(true);
    expect(dialog.textContent).toContain(
      'Leave at least one execution in the trade.',
    );

    // All off, then the middle two (buy 1, sell 1).
    fireEvent.click(
      within(table).getByRole('checkbox', { name: 'Select all executions' }),
    );
    fireEvent.click(boxes()[1]!);
    fireEvent.click(boxes()[2]!);
    expect(split.disabled).toBe(false);
    expect(dialog.textContent).toContain('2 of 4 ticked');
    expect(dialog.textContent).toContain(
      'keeps 2 executions, buy 2 and sell 2, and ends flat.',
    );
    expect(dialog.textContent).toContain(
      'A new trade, 8, takes the 2 ticked executions, buy 1 and sell 1, and ends flat.',
    );
    expect(dialog.textContent).toContain("It copies 6's tags and strategies.");
    expect(dialog.textContent).toContain('There is no undo.');
    fireEvent.click(split);

    await waitFor(async () =>
      expect(
        (await repo.trades.list(WS)).filter((t) => t.grouping === 'manual'),
      ).toHaveLength(2),
    );
    const trades = await repo.trades.list(WS);
    const original = trades.find((t) => t.id === 't-6')!;
    expect(original.executions).toHaveLength(2);
    expect(trades.find((t) => t.serial === 8)?.executions).toHaveLength(2);
    expect(
      (await screen.findByRole('status', { name: 'Result' })).textContent,
    ).toContain('Split trade 6. Trade 8 takes the 2 executions you moved.');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('region', { name: 'Trade log' }),
      ),
    );
  });
});

describe('move', () => {
  test('Move lists other active accounts and notes a currency change', async () => {
    const { repo } = await setup();
    const before = (await repo.trades.get(WS, 't-2'))!;
    await pick(1, 2);
    await openMenu();
    fireEvent.click(await item(/^Move to account/));
    const dialog = await screen.findByRole('dialog', { name: 'Move 2 trades' });
    const group = within(dialog).getByRole('radiogroup', { name: 'Account' });
    // Not its own account, not the archived one.
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.closest('label')!.querySelector('b')!.textContent),
    ).toEqual(['Euro futures', 'Stocks and options']);
    expect(dialog.textContent).toContain('Only active accounts are listed.');
    expect(dialog.textContent).toContain('There is no undo.');
    const move = within(dialog).getByRole('button', {
      name: 'Move 2 trades',
    }) as HTMLButtonElement;
    expect(move.disabled).toBe(true);

    // Another currency: a line says the trades keep theirs.
    fireEvent.click(within(group).getByRole('radio', { name: /Euro futures/ }));
    expect(dialog.textContent).toContain(
      'Euro futures is in EUR. These trades keep their own currency, USD, and every figure on them stays as it is.',
    );
    // The same currency: no line.
    fireEvent.click(
      within(group).getByRole('radio', { name: /Stocks and options/ }),
    );
    expect(dialog.textContent).not.toContain('keep their own currency');
    fireEvent.click(within(group).getByRole('radio', { name: /Euro futures/ }));
    expect(move.disabled).toBe(false);
    fireEvent.click(move);

    await waitFor(async () =>
      expect((await repo.trades.get(WS, 't-1'))?.accountId).toBe('acc-eur'),
    );
    const moved = (await repo.trades.get(WS, 't-2'))!;
    expect(moved.accountId).toBe('acc-eur');
    // Its own currency and figures stay (B6).
    expect(moved.pnlCurrency).toBe('USD');
    expect(moved.net).toBe(before.net);
    expect(
      (await screen.findByRole('status', { name: 'Result' })).textContent,
    ).toContain('Moved 2 trades to Euro futures.');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('region', { name: 'Trade log' }),
      ),
    );
  });

  test('a selection in two accounts lists neither of them', async () => {
    await setup();
    await pick(1, 4);
    await openMenu();
    fireEvent.click(await item(/^Move to account/));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(within(dialog).getByRole('radiogroup', { name: 'Account' }))
        .getAllByRole('radio')
        .map((r) => r.closest('label')!.querySelector('b')!.textContent),
    ).toEqual(['Stocks and options']);
  });
});

describe('on a phone', () => {
  beforeEach(() => {
    window.innerWidth = 390;
  });

  test('the fills are two-line rows, the box first, in a full-height sheet', async () => {
    await setup();
    await pick(1, 2);
    await openMenu();
    fireEvent.click(await item(/^Merge/));
    const dialog = await screen.findByRole('dialog', {
      name: 'Merge 2 trades',
    });
    expect(within(dialog).queryByRole('table')).toBeNull();
    const rows = within(dialog)
      .getByRole('list', { name: 'Executions' })
      .querySelectorAll('li');
    expect(rows).toHaveLength(5);
    const first = rows[0]!;
    expect(first.querySelector('[data-line="1"]')!.textContent).toContain(
      '09:41:12',
    );
    expect(first.querySelector('[data-line="1"]')!.textContent).toContain(
      'Buy',
    );
    expect(first.querySelector('[data-line="2"]')!.textContent).toContain(
      '1 at 6,612.25',
    );
    expect(first.querySelector('[data-line="2"]')!.textContent).toContain(
      'Trade 1',
    );
    expect(
      first.firstElementChild!.querySelector('input[type=checkbox]'),
    ).toBeTruthy();
  });
});

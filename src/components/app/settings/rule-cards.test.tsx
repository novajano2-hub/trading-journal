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
import type { NewFeeRule, NewTargetRule } from '@/data/repository';
import { resolveInstrument } from '@/domain/instruments';
import { everyString } from '../__fixtures__/every-string';
import { renderApp } from '../__fixtures__/render-app';
import { TradingSettings } from './trading';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const S = 'sample';
const NQ = resolveInstrument('NQZ5')!;

function repo() {
  let clock = Date.parse('2026-11-20T15:00:00.000Z');
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    // Each reading is a second later, so rules made in turn come back newest first.
    now: () => new Date((clock += 1000)),
    sample: async () => fixtureSample(),
  });
}
type Repo = ReturnType<typeof repo>;
const show = (r: Repo) =>
  renderApp(<TradingSettings />, {
    repository: r,
    url: '/app/settings/trading',
  });

/** A closed NQ long in Futures main, 2 contracts in at `entry` and out at `exit`. */
function nq(r: Repo, minute: string, over: { plannedStop?: number } = {}) {
  const at = (m: string) => `2026-11-18T14:${m}:00.000Z`;
  return r.trades.createManual(S, {
    accountId: 'acc-a',
    instrument: NQ,
    fills: [
      {
        time: at(minute),
        side: 'buy',
        qty: 2,
        price: 21000,
        commission: 0,
        fees: 0,
      },
      {
        time: at(String(Number(minute) + 5).padStart(2, '0')),
        side: 'sell',
        qty: 2,
        price: 21010,
        commission: 0,
        fees: 0,
      },
    ],
    ...over,
  });
}

const targetRule = (over: Partial<NewTargetRule> = {}): NewTargetRule => ({
  accountId: 'acc-a',
  assetClass: 'future',
  symbols: ['NQ'],
  target: { unit: 'points', levels: [{ value: 50, pct: 100 }] },
  stop: { unit: 'points', levels: [{ value: 25, pct: 100 }] },
  ...over,
});
const feeRule = (over: Partial<NewFeeRule> = {}): NewFeeRule => ({
  accountId: 'acc-a',
  assetClass: 'future',
  symbols: ['NQ'],
  mode: 'per-contract',
  applyOn: 'all',
  commission: 129,
  fee: 138,
  ...over,
});

const card = (name: string) => screen.findByRole('region', { name });
const open = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });

/** Opens one of a card's dialogs from its Add rule button. */
async function addRule(card: HTMLElement, button: RegExp) {
  fireEvent.click(within(card).getByRole('button', { name: button }));
  return screen.findByRole('dialog', {
    name: /^New (target and stop|commission and fee) rule$/,
  });
}

/** Picks an option of one of the dialog's selects (Account, Instrument). */
async function pick(dialog: HTMLElement, label: string, option: string) {
  open(within(dialog).getByRole('button', { name: new RegExp(`^${label},`) }));
  fireEvent.click(await screen.findByRole('menuitemradio', { name: option }));
}

/** The rows' menu: its button, then the item. */
async function chooseFromMenu(name: RegExp, item: string) {
  open(await screen.findByRole('button', { name }));
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
}

const targets = (r: Repo) => r.targetRules.list(S);
const fees = (r: Repo) => r.feeRules.list(S);

test('the cards sit under one note, each with its own empty line and Add rule', async () => {
  show(repo());
  const t = await card('Targets and stops');
  const f = await card('Commissions and fees');
  // After the existing Trading card, in this order.
  const order = screen
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent);
  expect(order).toEqual([
    'Trading',
    'Targets and stops',
    'Commissions and fees',
  ]);
  expect(
    screen.getAllByText(
      /Both kinds of rule below fill in trades as you import/,
    ),
  ).toHaveLength(1);
  expect(within(t).getByText(/No rules yet/)).toBeTruthy();
  expect(within(f).getByText(/No rules yet/)).toBeTruthy();
  expect(
    within(t).getByRole('button', { name: 'Add rule for targets and stops' }),
  ).toBeTruthy();
  expect(
    within(f).getByRole('button', {
      name: 'Add rule for commissions and fees',
    }),
  ).toBeTruthy();
  expect(within(t).queryByRole('table')).toBeNull();
});

test('each card lists its rules as a table: account, instrument, symbols, and the summary', async () => {
  const r = repo();
  await r.targetRules.create(
    S,
    targetRule({
      symbols: ['ES', 'MES'],
      target: {
        unit: 'points',
        levels: [
          { value: 8, pct: 50 },
          { value: 16, pct: 50 },
        ],
      },
      stop: { unit: 'points', levels: [{ value: 6, pct: 100 }] },
    }),
  );
  await r.targetRules.create(
    S,
    targetRule({
      assetClass: 'forex',
      symbols: [],
      target: { unit: 'pips', levels: [{ value: 30, pct: 100 }] },
      stop: {
        unit: 'pips',
        levels: [
          { value: 15, pct: 50 },
          { value: 25, pct: 50 },
        ],
      },
    }),
  );
  await r.feeRules.create(
    S,
    feeRule({ symbols: [], commission: 129, fee: 138 }),
  );
  await r.feeRules.create(
    S,
    feeRule({
      assetClass: 'forex',
      symbols: ['EURUSD', 'USDJPY'],
      applyOn: 'exit',
      commission: 700,
      fee: 0,
    }),
  );
  show(r);
  const t = await card('Targets and stops');
  expect(await within(t).findByText('2 rules')).toBeTruthy();
  const heads = within(t)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(heads).toEqual([
    'Account',
    'Instrument',
    'Symbols',
    'Levels',
    'Actions',
  ]);
  // Newest first: the forex rule, then the futures one.
  const rows = within(t).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  expect(rows[0]!.textContent).toContain('Futures main');
  expect(rows[0]!.textContent).toContain('Forex');
  expect(rows[0]!.textContent).toContain('All symbols');
  expect(rows[0]!.textContent).toContain('Target 30 pips (100%)');
  expect(rows[0]!.textContent).toContain('Stops 15 pips (50%), 25 pips (50%)');
  expect(rows[1]!.textContent).toContain('Future');
  expect(rows[1]!.textContent).toContain('ES');
  expect(rows[1]!.textContent).toContain('MES');
  expect(rows[1]!.textContent).toContain(
    'Targets 8 points (50%), 16 points (50%)',
  );
  expect(rows[1]!.textContent).toContain('Stop 6 points (100%)');

  const f = await card('Commissions and fees');
  expect(await within(f).findByText('2 rules')).toBeTruthy();
  const costs = within(f).getAllByRole('row').slice(1);
  expect(costs[0]!.textContent).toContain('$7.00 commission, $0.00 fee');
  expect(costs[0]!.textContent).toContain('Per contract, on exits');
  expect(costs[0]!.textContent).toContain('EURUSD');
  expect(costs[1]!.textContent).toContain('$1.29 commission, $1.38 fee');
  expect(costs[1]!.textContent).toContain('Per contract, on every execution');
  expect(costs[1]!.textContent).toContain('All symbols');
});

test('the dialogs open with the defaults', async () => {
  show(repo());
  const t = await card('Targets and stops');
  const target = await addRule(t, /^Add rule for targets and stops/);
  expect(
    within(target).getByRole('heading', { name: 'New target and stop rule' }),
  ).toBeTruthy();
  // Nothing chosen yet.
  expect(
    within(target).getByRole('button', { name: 'Account, Choose an account' }),
  ).toBeTruthy();
  expect(
    within(target).getByRole('button', {
      name: 'Instrument, Choose an instrument',
    }),
  ).toBeTruthy();
  expect(
    within(target).queryAllByRole('button', { name: /^Remove [A-Z]/ }),
  ).toHaveLength(0);
  // Each side opens with one level, its share at 100 and its value not set.
  for (const side of ['Target', 'Stop']) {
    const value = within(target).getByRole('textbox', {
      name: `${side} level 1`,
    });
    expect((value as HTMLInputElement).value).toBe('');
    const share = within(target).getByRole('textbox', {
      name: `${side} share 1`,
    });
    expect((share as HTMLInputElement).value).toBe('100');
  }
  expect(
    (
      within(target).getByRole('button', {
        name: 'Create',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(within(target).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  const f = await card('Commissions and fees');
  const fee = await addRule(f, /^Add rule for commissions and fees/);
  expect(
    within(fee).getByRole('heading', { name: 'New commission and fee rule' }),
  ).toBeTruthy();
  expect(
    within(fee)
      .getByRole('switch', { name: 'All symbols' })
      .getAttribute('aria-checked'),
  ).toBe('true');
  expect(within(fee).queryByLabelText('Symbols')).toBeNull();
  expect(
    (
      within(fee).getByRole('radio', {
        name: 'Per execution',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    (
      within(fee).getByRole('radio', {
        name: 'Every execution',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    (
      within(fee).getByRole('textbox', {
        name: 'Commission',
      }) as HTMLInputElement
    ).value,
  ).toBe('0.00');
  expect(
    (within(fee).getByRole('textbox', { name: 'Fee' }) as HTMLInputElement)
      .value,
  ).toBe('0.00');
  // The instrument list, in the comp's order.
  open(
    within(fee).getByRole('button', {
      name: 'Instrument, Choose an instrument',
    }),
  );
  const list = await screen.findAllByRole('menuitemradio');
  expect(list.map((i) => i.textContent)).toEqual([
    'Stock',
    'Option',
    'Future option',
    'Future',
    'Forex',
    'Crypto',
    'CFD',
  ]);
});

test('the All symbols switch has a 44px hit area on a coarse pointer and keeps its look on a fine one', async () => {
  show(repo());
  const f = await card('Commissions and fees');
  const fee = await addRule(f, /^Add rule for commissions and fees/);
  const classes = within(fee)
    .getByRole('switch', { name: 'All symbols' })
    .className.split(/\s+/);
  // The fine pointer's track is as it was; the coarse track stays 28px tall
  // and a pseudo-element adds 8px above and below it, to 44px.
  expect(classes).toEqual(expect.arrayContaining(['h-6', 'w-10']));
  expect(classes).toEqual(
    expect.arrayContaining([
      'pointer-coarse:h-7',
      'pointer-coarse:before:absolute',
      'pointer-coarse:before:inset-x-0',
      'pointer-coarse:before:-inset-y-2',
      "pointer-coarse:before:content-['']",
    ]),
  );
});

test('Create waits for an account, an instrument and a level, in either dialog', async () => {
  show(repo());
  const t = await card('Targets and stops');
  const dialog = await addRule(t, /^Add rule for targets and stops/);
  const create = within(dialog).getByRole('button', {
    name: 'Create',
  }) as HTMLButtonElement;
  const level = (v: string) =>
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Target level 1' }),
      { target: { value: v } },
    );
  // An instrument and a level, no account.
  await pick(dialog, 'Instrument', 'Future');
  level('50');
  expect(create.disabled).toBe(true);
  // An account joins: ready.
  await pick(dialog, 'Account', 'Futures main');
  await waitFor(() => expect(create.disabled).toBe(false));
  // Take the level away again: not ready.
  level('');
  await waitFor(() => expect(create.disabled).toBe(true));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  const f = await card('Commissions and fees');
  const fee = await addRule(f, /^Add rule for commissions and fees/);
  const make = within(fee).getByRole('button', {
    name: 'Create',
  }) as HTMLButtonElement;
  // An account alone is not enough; an instrument makes it so.
  await pick(fee, 'Account', 'Futures main');
  expect(make.disabled).toBe(true);
  await pick(fee, 'Instrument', 'Future');
  await waitFor(() => expect(make.disabled).toBe(false));
});

test('the unit select waits for an instrument', async () => {
  show(repo());
  const t = await card('Targets and stops');
  const dialog = await addRule(t, /^Add rule for targets and stops/);
  const waiting = within(dialog).getByRole('button', {
    name: 'Targets unit, pick an instrument first',
  });
  expect(waiting.getAttribute('aria-disabled')).toBe('true');
  expect(waiting.getAttribute('title')).toBe('Pick an instrument first');
  // It does not open.
  open(waiting);
  expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);

  const units = async (instrument: string) => {
    await pick(dialog, 'Instrument', instrument);
    open(within(dialog).getByRole('button', { name: /^Targets unit,/ }));
    const items = await screen.findAllByRole('menuitemradio');
    const labels = items.map((i) => i.textContent);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0),
    );
    return labels;
  };
  expect(await units('Future')).toEqual([
    'Price',
    'Price movement',
    'Ticks',
    'Points',
    'Amount',
  ]);
  expect(await units('Forex')).toEqual([
    'Price',
    'Price movement',
    'Amount',
    'Pips',
  ]);
  expect(await units('Stock')).toEqual(['Price', 'Price movement', 'Amount']);
  expect(await units('Future option')).toEqual([
    'Price',
    'Price movement',
    'Ticks',
    'Points',
    'Amount',
  ]);
  // Each side has its own unit.
  expect(
    within(dialog).getByRole('button', { name: 'Stops unit, Price' }),
  ).toBeTruthy();
});

test('a new target and stop rule is saved with its levels, and the card lists it', async () => {
  const r = repo();
  show(r);
  const t = await card('Targets and stops');
  const dialog = await addRule(t, /^Add rule for targets and stops/);
  await pick(dialog, 'Account', 'Futures main');
  await pick(dialog, 'Instrument', 'Future');
  const symbols = within(dialog).getByLabelText('Symbols');
  fireEvent.change(symbols, { target: { value: 'es, mes ' } });
  expect(
    within(dialog).getByRole('button', { name: 'Remove ES' }),
  ).toBeTruthy();
  expect(
    within(dialog).getByRole('button', { name: 'Remove MES' }),
  ).toBeTruthy();

  // Points on both sides: two targets at half each, one stop.
  for (const side of ['Targets', 'Stops']) {
    open(within(dialog).getByRole('button', { name: `${side} unit, Price` }));
    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Points' }),
    );
  }
  const type = (name: string, value: string) =>
    fireEvent.change(within(dialog).getByRole('textbox', { name }), {
      target: { value },
    });
  type('Target level 1', '8');
  type('Target share 1', '50');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Add level for targets' }),
  );
  type('Target level 2', '16');
  type('Target share 2', '50');
  type('Stop level 1', '6');
  const create = within(dialog).getByRole('button', { name: 'Create' });
  await waitFor(() =>
    expect((create as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(create);

  await waitFor(async () => expect(await targets(r)).toHaveLength(1));
  const [rule] = await targets(r);
  expect(rule).toMatchObject({
    accountId: 'acc-a',
    assetClass: 'future',
    symbols: ['ES', 'MES'],
    target: {
      unit: 'points',
      levels: [
        { value: 8, pct: 50 },
        { value: 16, pct: 50 },
      ],
    },
    stop: { unit: 'points', levels: [{ value: 6, pct: 100 }] },
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    await within(t).findByText('Targets 8 points (50%), 16 points (50%)'),
  ).toBeTruthy();
  expect(within(t).getByText('1 rule')).toBeTruthy();
});

test('a rule of one side only saves; a level that is not a number shows its error and saves nothing', async () => {
  const r = repo();
  show(r);
  const t = await card('Targets and stops');
  const dialog = await addRule(t, /^Add rule for targets and stops/);
  await pick(dialog, 'Account', 'Futures main');
  await pick(dialog, 'Instrument', 'Forex');
  const type = (name: string, value: string) =>
    fireEvent.change(within(dialog).getByRole('textbox', { name }), {
      target: { value },
    });
  type('Stop level 1', 'abc');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
  const alert = await within(dialog).findByText('Enter a price above 0.');
  expect(alert.getAttribute('role')).toBe('alert');
  expect(
    within(dialog)
      .getByRole('textbox', { name: 'Stop level 1' })
      .getAttribute('aria-invalid'),
  ).toBe('true');
  expect(await targets(r)).toHaveLength(0);

  // A share past 100 is refused too.
  type('Stop level 1', '1.1050');
  type('Stop share 1', '150');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
  expect(
    await within(dialog).findByText('Enter a share above 0 and up to 100.'),
  ).toBeTruthy();
  expect(await targets(r)).toHaveLength(0);

  type('Stop share 1', '100');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
  await waitFor(async () => expect(await targets(r)).toHaveLength(1));
  const [rule] = await targets(r);
  expect(rule!.target).toBeUndefined();
  expect(rule!.stop).toEqual({
    unit: 'price',
    levels: [{ value: 1.105, pct: 100 }],
  });
  expect(rule!.symbols).toEqual([]);
});

test('a new fee rule saves cents, and the card lists it', async () => {
  const r = repo();
  show(r);
  const f = await card('Commissions and fees');
  const dialog = await addRule(f, /^Add rule for commissions and fees/);
  await pick(dialog, 'Account', 'Futures main');
  await pick(dialog, 'Instrument', 'Future');
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Per contract' }));
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Exits' }));
  fireEvent.change(
    within(dialog).getByRole('textbox', { name: 'Commission' }),
    {
      target: { value: '1.29' },
    },
  );
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Fee' }), {
    target: { value: '1.38' },
  });
  // All symbols off: a symbol is needed.
  fireEvent.click(within(dialog).getByRole('switch', { name: 'All symbols' }));
  const create = within(dialog).getByRole('button', { name: 'Create' });
  expect((create as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('Symbols'), {
    target: { value: 'nq,' },
  });
  await waitFor(() =>
    expect((create as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(create);
  await waitFor(async () => expect(await fees(r)).toHaveLength(1));
  expect((await fees(r))[0]).toMatchObject({
    accountId: 'acc-a',
    assetClass: 'future',
    symbols: ['NQ'],
    mode: 'per-contract',
    applyOn: 'exit',
    commission: 129,
    fee: 138,
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    await within(f).findByText('$1.29 commission, $1.38 fee'),
  ).toBeTruthy();
  expect(within(f).getByText('Per contract, on exits')).toBeTruthy();
});

test('a fee that is not an amount of zero or more is refused', async () => {
  const r = repo();
  show(r);
  const f = await card('Commissions and fees');
  const dialog = await addRule(f, /^Add rule for commissions and fees/);
  await pick(dialog, 'Account', 'Futures main');
  await pick(dialog, 'Instrument', 'Stock');
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Fee' }), {
    target: { value: '-1' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
  expect(
    await within(dialog).findByText('Enter an amount of zero or more.'),
  ).toBeTruthy();
  expect(await fees(r)).toHaveLength(0);
});

test('Edit opens the rule filled in and saves it as one rule, a side left out cleared', async () => {
  const r = repo();
  const made = await r.targetRules.create(S, targetRule());
  show(r);
  const t = await card('Targets and stops');
  await chooseFromMenu(/^Actions for Futures main/, 'Edit');
  const dialog = await screen.findByRole('dialog', {
    name: 'Edit target and stop rule',
  });
  expect(
    within(dialog).getByRole('button', { name: 'Account, Futures main' }),
  ).toBeTruthy();
  expect(
    within(dialog).getByRole('button', { name: 'Instrument, Future' }),
  ).toBeTruthy();
  expect(
    within(dialog).getByRole('button', { name: 'Remove NQ' }),
  ).toBeTruthy();
  expect(
    within(dialog).getByRole('button', { name: 'Targets unit, Points' }),
  ).toBeTruthy();
  expect(
    (
      within(dialog).getByRole('textbox', {
        name: 'Target level 1',
      }) as HTMLInputElement
    ).value,
  ).toBe('50');
  // Take the stop away and change the target.
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Remove stop level 1' }),
  );
  fireEvent.change(
    within(dialog).getByRole('textbox', { name: 'Target level 1' }),
    {
      target: { value: '60' },
    },
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save rule' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(async () =>
    expect((await targets(r))[0]!.target?.levels[0]?.value).toBe(60),
  );
  const all = await targets(r);
  expect(all).toHaveLength(1);
  expect(all[0]!.id).toBe(made.id);
  expect(all[0]!.stop).toBeUndefined();
  await waitFor(() =>
    expect(within(t).getByText('Target 60 points (100%)')).toBeTruthy(),
  );
});

test('Delete asks first and says what stays; the rule goes and what it filled stays', async () => {
  const r = repo();
  const trade = await nq(r, '30');
  await r.targetRules.create(S, targetRule());
  await r.targetRules.applyExisting(S, (await targets(r))[0]!.id, false);
  show(r);
  await card('Targets and stops');
  await chooseFromMenu(/^Actions for Futures main/, 'Delete');
  const dialog = await screen.findByRole('dialog');
  expect(
    within(dialog).getByText(/keep the targets and stops it gave them/),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await targets(r)).toHaveLength(1);

  await chooseFromMenu(/^Actions for Futures main/, 'Delete');
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: 'Delete rule',
    }),
  );
  await waitFor(async () => expect(await targets(r)).toHaveLength(0));
  expect((await r.trades.get(S, trade.id))!.targets).toBeDefined();
  expect(
    await within(await card('Targets and stops')).findByText(/No rules yet/),
  ).toBeTruthy();
});

test('Apply to existing shows the count and the override box', async () => {
  const r = repo();
  // Two trades with nothing set, one with a stop of its own.
  await nq(r, '10');
  await nq(r, '20');
  const own = await nq(r, '30', { plannedStop: 20990 });
  await r.targetRules.create(S, targetRule());
  show(r);
  const t = await card('Targets and stops');
  await chooseFromMenu(/^Actions for Futures main/, 'Apply to existing trades');
  const dialog = await screen.findByRole('dialog', {
    name: 'Apply this rule to existing trades?',
  });
  expect(
    within(dialog).getByText(
      /It matches 3 trades in Futures main on NQ, manual trades included\./,
    ),
  ).toBeTruthy();
  const box = within(dialog).getByRole('checkbox', {
    name: /Replace targets and stops already set/,
  }) as HTMLInputElement;
  expect(box.checked).toBe(false);
  expect(
    within(dialog).getByText(
      /Left unticked, only trades with no targets or stops get them\./,
    ),
  ).toBeTruthy();
  // Unticked it fills what is missing: two trades.
  expect(within(dialog).getByText('2 trades')).toBeTruthy();
  expect(within(dialog).getByText(/will change\./)).toBeTruthy();
  expect(
    within(dialog).getByRole('button', { name: 'Apply to 2 trades' }),
  ).toBeTruthy();
  // Ticked it replaces: all three.
  fireEvent.click(box);
  expect(within(dialog).getByText('3 trades')).toBeTruthy();
  expect(
    within(dialog).getByRole('button', { name: 'Apply to 3 trades' }),
  ).toBeTruthy();
  fireEvent.click(box);
  expect(
    within(dialog).getByRole('button', { name: 'Apply to 2 trades' }),
  ).toBeTruthy();

  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Apply to 2 trades' }),
  );
  const result = await within(t).findByRole('status', { name: 'Result' });
  expect(result.textContent).toContain('Changed 2 trades.');
  const trades = (await r.trades.list(S)).filter(
    (x) => x.instrument.root === 'NQ',
  );
  expect(trades.filter((x) => x.targets).length).toBe(2);
  // The one with its own stop was left alone.
  expect(trades.find((x) => x.id === own.id)!.targets).toBeUndefined();
  // Nothing is left for the unticked run: the apply button waits.
  await chooseFromMenu(/^Actions for Futures main/, 'Apply to existing trades');
  const again = await screen.findByRole('dialog', {
    name: 'Apply this rule to existing trades?',
  });
  expect(within(again).getByText('No trade will change.')).toBeTruthy();
  expect(
    (within(again).getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  // With the box ticked the one trade with its own stop changes.
  fireEvent.click(within(again).getByRole('checkbox'));
  fireEvent.click(
    within(again).getByRole('button', { name: 'Apply to 1 trade' }),
  );
  await waitFor(() =>
    expect(
      within(t).getByRole('status', { name: 'Result' }).textContent,
    ).toContain('Changed 1 trade.'),
  );
  expect(
    (await r.trades.list(S)).filter(
      (x) => x.targets && x.instrument.root === 'NQ',
    ),
  ).toHaveLength(3);
});

test('Apply to existing for a fee rule counts trades without costs, and the box replaces them', async () => {
  const r = repo();
  await nq(r, '10');
  await nq(r, '20');
  // A trade that already carries costs.
  await r.trades.createManual(S, {
    accountId: 'acc-a',
    instrument: NQ,
    fills: [
      {
        time: '2026-11-18T15:00:00.000Z',
        side: 'buy',
        qty: 1,
        price: 21000,
        commission: 50,
        fees: 0,
      },
      {
        time: '2026-11-18T15:05:00.000Z',
        side: 'sell',
        qty: 1,
        price: 21001,
        commission: 50,
        fees: 0,
      },
    ],
  });
  await r.feeRules.create(S, feeRule());
  show(r);
  const f = await card('Commissions and fees');
  await chooseFromMenu(/^Actions for Futures main/, 'Apply to existing trades');
  const dialog = await screen.findByRole('dialog', {
    name: 'Apply this rule to existing trades?',
  });
  expect(
    within(dialog).getByText(/It matches 3 trades in Futures main on NQ/),
  ).toBeTruthy();
  expect(within(dialog).getByText(/\$1\.29 commission/)).toBeTruthy();
  expect(
    within(dialog).getByText(/Replace commissions and fees already set/),
  ).toBeTruthy();
  expect(within(dialog).getByText('2 trades')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('checkbox'));
  expect(within(dialog).getByText('3 trades')).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Apply to 3 trades' }),
  );
  const result = await within(f).findByRole('status', { name: 'Result' });
  expect(result.textContent).toContain('Changed 3 trades.');
  const done = (await r.trades.list(S)).filter(
    (x) => x.instrument.root === 'NQ',
  );
  // 2 contracts x $1.29 + $1.38 on each of two fills.
  expect(done.every((x) => x.executions.every((e) => e.commission > 0))).toBe(
    true,
  );
  // The result can be dismissed.
  fireEvent.click(within(f).getByRole('button', { name: 'Dismiss' }));
  expect(within(f).queryByRole('status', { name: 'Result' })).toBeNull();
});

test('a rule in an archived account cannot be applied, and says so', async () => {
  const r = repo();
  await r.targetRules.create(
    S,
    targetRule({ accountId: 'acc-b', symbols: [] }),
  );
  show(r);
  await card('Targets and stops');
  await chooseFromMenu(/^Actions for Old demo/, 'Apply to existing trades');
  const dialog = await screen.findByRole('dialog', {
    name: 'Apply this rule to existing trades?',
  });
  expect(
    within(dialog).getByText(
      /Old demo is archived, so its trades cannot change\./,
    ),
  ).toBeTruthy();
  expect(
    (within(dialog).getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test('a save or an apply that fails says so, in the dialog, and writes nothing', async () => {
  const r = repo();
  await nq(r, '10');
  const made = await r.targetRules.create(S, targetRule());
  const flaky = {
    ...r,
    targetRules: {
      ...r.targetRules,
      update: async () => {
        throw new Error('disk full');
      },
      applyExisting: async () => {
        throw new Error('disk full');
      },
    },
  };
  show(flaky);
  await card('Targets and stops');
  // Edit, then Save rule.
  await chooseFromMenu(/^Actions for Futures main/, 'Edit');
  const edit = await screen.findByRole('dialog', {
    name: 'Edit target and stop rule',
  });
  fireEvent.change(
    within(edit).getByRole('textbox', { name: 'Target level 1' }),
    { target: { value: '70' } },
  );
  fireEvent.click(within(edit).getByRole('button', { name: 'Save rule' }));
  const alert = await within(edit).findByRole('alert');
  expect(alert.textContent).toBe("Couldn't save the rule. Try again.");
  expect(
    screen.queryByRole('dialog', { name: 'Edit target and stop rule' }),
  ).toBeTruthy();
  fireEvent.click(within(edit).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((await targets(r))[0]!.target?.levels[0]?.value).toBe(50);
  expect((await targets(r))[0]!.id).toBe(made.id);

  // Apply.
  await chooseFromMenu(/^Actions for Futures main/, 'Apply to existing trades');
  const apply = await screen.findByRole('dialog', {
    name: 'Apply this rule to existing trades?',
  });
  fireEvent.click(
    await within(apply).findByRole('button', { name: 'Apply to 1 trade' }),
  );
  expect((await within(apply).findByRole('alert')).textContent).toContain(
    "Couldn't apply the rule",
  );
  expect(screen.queryByRole('status', { name: 'Result' })).toBeNull();
  expect((await r.trades.list(S)).filter((x) => x.targets)).toHaveLength(0);
});

test('the Account select lists the active accounts, and an edited rule keeps its own', async () => {
  const r = repo();
  await r.targetRules.create(
    S,
    targetRule({ accountId: 'acc-b', symbols: [] }),
  );
  show(r);
  const t = await card('Targets and stops');
  const fresh = await addRule(t, /^Add rule for targets and stops/);
  open(within(fresh).getByRole('button', { name: /^Account,/ }));
  expect(
    (await screen.findAllByRole('menuitemradio')).map((i) => i.textContent),
  ).toEqual(['Futures main']);
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  fireEvent.click(within(fresh).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  await chooseFromMenu(/^Actions for Old demo/, 'Edit');
  const edit = await screen.findByRole('dialog', {
    name: 'Edit target and stop rule',
  });
  open(within(edit).getByRole('button', { name: /^Account,/ }));
  expect(
    (await screen.findAllByRole('menuitemradio')).map((i) => i.textContent),
  ).toEqual(['Futures main', 'Old demo']);
});

test('symbols are chips: a comma or Enter adds one, a repeat is kept once, Backspace takes the last off', async () => {
  show(repo());
  const t = await card('Targets and stops');
  const dialog = await addRule(t, /^Add rule for targets and stops/);
  const box = within(dialog).getByLabelText('Symbols');
  fireEvent.change(box, { target: { value: 'es,' } });
  fireEvent.change(box, { target: { value: 'MES' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  fireEvent.change(box, { target: { value: 'es ' } });
  const chips = () =>
    within(dialog)
      .getAllByRole('button', { name: /^Remove [A-Z]+$/ })
      .map((b) => b.getAttribute('aria-label'));
  expect(chips()).toEqual(['Remove ES', 'Remove MES']);
  fireEvent.keyDown(box, { key: 'Backspace' });
  expect(chips()).toEqual(['Remove ES']);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove ES' }));
  expect(
    within(dialog).queryAllByRole('button', { name: /^Remove [A-Z]+$/ }),
  ).toHaveLength(0);
  // Enter in the box adds a chip and does not submit the dialog.
  expect(screen.queryByRole('dialog')).toBeTruthy();
});

test('Privacy masks rule amounts and fee amounts, in the cards and in the dialogs', async () => {
  const r = repo();
  await r.targetRules.create(
    S,
    targetRule({
      target: { unit: 'amount', levels: [{ value: 300, pct: 100 }] },
      stop: { unit: 'amount', levels: [{ value: 150, pct: 100 }] },
    }),
  );
  await r.feeRules.create(S, feeRule({ commission: 129, fee: 138 }));
  await r.prefs.update({ displayUnit: 'privacy' });
  const { container } = show(r);
  const t = await card('Targets and stops');
  const f = await card('Commissions and fees');
  await waitFor(() => expect(t.textContent).toContain('$•••'));
  expect(f.textContent).toContain('$•••');
  expect(f.textContent).toContain('commission');
  const shown = everyString(container).join(' ');
  expect(shown).not.toMatch(/\$\s?\d/);
  expect(shown).not.toContain('300');
  expect(shown).not.toContain('150');
  expect(shown).not.toContain('1.29');
  expect(shown).not.toContain('1.38');
  // The share is not money: it stays.
  expect(t.textContent).toContain('(100%)');

  // The edit dialogs hide them too, and say how to change them.
  await chooseFromMenu(
    /^Actions for Futures main, Future, NQ, commissions and fees/,
    'Edit',
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Edit commission and fee rule',
  });
  const commission = within(dialog).getByRole('textbox', {
    name: 'Commission',
  }) as HTMLInputElement;
  expect(commission.value).toBe('$•••');
  expect(commission.readOnly).toBe(true);
  expect(
    within(dialog).getByText(
      /Amounts are hidden by Privacy\. Turn it off to edit them\./,
    ),
  ).toBeTruthy();
  const inDialog = everyString(dialog).join(' ');
  expect(inDialog).not.toContain('1.29');
  expect(inDialog).not.toContain('1.38');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  // The apply dialog's sentence hides them as well.
  await chooseFromMenu(
    /^Actions for Futures main, Future, NQ, commissions and fees/,
    'Apply to existing trades',
  );
  const apply = await screen.findByRole('dialog', {
    name: 'Apply this rule to existing trades?',
  });
  expect(everyString(apply).join(' ')).not.toMatch(/\$\s?\d/);
  expect(apply.textContent).toContain('$•••');
});

test('on a phone each rule is a two-line row with a menu', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q) =>
      ({
        matches: !q.includes('min-width: 640px'),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  const r = repo();
  await r.targetRules.create(
    S,
    targetRule({
      symbols: ['ES', 'MES'],
      target: {
        unit: 'points',
        levels: [
          { value: 8, pct: 50 },
          { value: 16, pct: 50 },
        ],
      },
      stop: { unit: 'points', levels: [{ value: 6, pct: 100 }] },
    }),
  );
  await r.feeRules.create(S, feeRule({ symbols: [] }));
  show(r);
  const t = await card('Targets and stops');
  expect(within(t).queryByRole('table')).toBeNull();
  const row = (await within(t).findByText('Futures main')).closest('li')!;
  const lines = row.querySelectorAll('[data-line]');
  expect(lines).toHaveLength(2);
  expect(lines[0]!.textContent).toContain('Futures main');
  expect(lines[0]!.textContent).toContain('Future, ES and MES');
  expect(lines[1]!.textContent).toContain('Targets 8 and 16 points, 50% each');
  expect(lines[1]!.textContent).toContain('Stop 6 points, 100%');
  expect(
    within(row).getByRole('button', { name: /^Actions for Futures main/ }),
  ).toBeTruthy();
  const f = await card('Commissions and fees');
  const costs = (await within(f).findByText('Futures main')).closest('li')!;
  expect(costs.textContent).toContain('Future, all symbols');
  expect(costs.textContent).toContain('$1.29 commission, $1.38 fee');
});

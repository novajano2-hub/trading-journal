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
import type { HistoryRow, UserPrefs } from '@/domain/types';
import { everyString } from '../__fixtures__/every-string';
import { renderApp } from '../__fixtures__/render-app';
import { HistoryCard } from './history-card';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let serial = 0;
/** A stored row: a trade edited by you unless told otherwise. */
function row(r: Partial<HistoryRow> & Pick<HistoryRow, 'at'>): HistoryRow {
  serial += 1;
  return {
    id: `h-${String(serial).padStart(4, '0')}`,
    workspaceId: 'sample',
    type: 'trade',
    action: 'edited',
    source: 'you',
    entityId: 'f-1',
    label: 'ES 2026-11-16',
    ...r,
  };
}

/** An instant `minutes` after 20 Nov 2026, 12:00 UTC. */
const at = (minutes: number) =>
  new Date(Date.UTC(2026, 10, 20, 12, 0) + minutes * 60_000).toISOString();

/** The History card over the fixture sample, its history list the given rows (in the order given). */
async function show(
  given: HistoryRow[] | ((repo: Repository) => Promise<HistoryRow[]>),
  prefs: Partial<UserPrefs> = {},
): Promise<Repository> {
  const base = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await base.prefs.update({ timeZone: 'America/New_York', ...prefs });
  const rows = typeof given === 'function' ? await given(base) : given;
  const repository: Repository = {
    ...base,
    history: { list: async () => rows.map((r) => ({ ...r })) },
  };
  renderApp(<HistoryCard />, {
    repository,
    url: '/app/settings/import-history',
  });
  return repository;
}

const table = () => screen.findByRole('table', { name: 'Edit history' });
const bodyRows = (t: HTMLElement) =>
  Array.from(t.querySelectorAll('tbody tr')) as HTMLElement[];
const cells = (tr: HTMLElement) =>
  Array.from(tr.querySelectorAll('td')).map((td) =>
    (td.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
/** The pager's "1 to 50 of 120". */
const count = () =>
  screen.getByText(/^[\d,]+ to [\d,]+ of [\d,]+$/).textContent;

async function pick(chip: string, option: string) {
  fireEvent.click(screen.getByRole('button', { name: chip }));
  fireEvent.click(await screen.findByRole('radio', { name: option }));
  await waitFor(() =>
    expect(screen.queryByRole('radio', { name: option })).toBeNull(),
  );
}

async function clear(chip: string) {
  fireEvent.click(screen.getByRole('button', { name: chip }));
  fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull(),
  );
}

test('rows are newest first and page at 50', async () => {
  // 117 tags made a minute apart, then one edit of a trade that changed three fields at once.
  const tags = Array.from({ length: 117 }, (_, i) =>
    row({
      at: at(i),
      type: 'tag',
      action: 'created',
      entityId: `t-${i}`,
      label: `tag ${i}`,
    }),
  );
  // Given out of order: the card puts them in order.
  await show([
    ...tags.slice(0, 60),
    row({ at: at(120), field: 'reviewed', oldValue: false, newValue: true }),
    ...tags.slice(60).reverse(),
    row({ at: at(120), field: 'tagIds', oldValue: null, newValue: 'tag-fomo' }),
    row({ at: at(120), field: 'rating', oldValue: null, newValue: 4 }),
  ]);

  const t = await table();
  let shown = bodyRows(t);
  expect(shown).toHaveLength(50);
  // One edit's rows share their time: they read in field order.
  expect(cells(shown[0]!)[2]).toMatch(/^Rating/);
  expect(cells(shown[1]!)[2]).toMatch(/^Reviewed/);
  expect(cells(shown[2]!)[2]).toMatch(/^Tags/);
  // Then newest first.
  expect(cells(shown[3]!)[1]).toBe('Tag tag 116');
  expect(cells(shown[4]!)[1]).toBe('Tag tag 115');
  expect(cells(shown[49]!)[1]).toBe('Tag tag 70');
  expect(count()).toBe('1 to 50 of 120');
  expect(
    (screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(count()).toBe('51 to 100 of 120'));
  shown = bodyRows(t);
  expect(shown).toHaveLength(50);
  expect(cells(shown[0]!)[1]).toBe('Tag tag 69');

  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(count()).toBe('101 to 120 of 120'));
  shown = bodyRows(t);
  expect(shown).toHaveLength(20);
  expect(cells(shown[19]!)[1]).toBe('Tag tag 0');
  expect(
    (screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  await waitFor(() => expect(count()).toBe('51 to 100 of 120'));
});

test('search and each filter narrow the rows', async () => {
  await show([
    row({ at: at(50), field: 'fees', oldValue: 820, newValue: 1250 }),
    row({
      at: at(40),
      type: 'account',
      action: 'created',
      entityId: 'acc-a',
      label: 'Futures main',
    }),
    row({
      at: at(30),
      type: 'import',
      action: 'created',
      source: 'import',
      entityId: 'imp-1',
      label: 'first.csv',
      field: 'trades',
      oldValue: null,
      newValue: 2,
    }),
    row({
      at: at(20),
      source: 'rule',
      entityId: 'f-2',
      label: 'NQ 2026-11-17',
      field: 'stops',
      oldValue: null,
      newValue: JSON.stringify({
        unit: 'points',
        levels: [{ value: 8, qty: 1 }],
      }),
    }),
    row({
      at: at(10),
      type: 'strategy',
      action: 'deleted',
      entityId: 'str-9',
      label: 'Gap fill',
    }),
    row({
      at: at(0),
      action: 'moved',
      field: 'accountId',
      oldValue: 'acc-b',
      newValue: 'acc-a',
    }),
  ]);
  const t = await table();
  expect(bodyRows(t)).toHaveLength(6);
  const search = screen.getByRole('searchbox', { name: 'Search edit history' });

  // By type, by identifier, by field.
  fireEvent.change(search, { target: { value: 'strategy' } });
  await waitFor(() => expect(bodyRows(t)).toHaveLength(1));
  expect(cells(bodyRows(t)[0]!)[1]).toBe('Strategy Gap fill');
  fireEvent.change(search, { target: { value: 'FUTURES' } });
  await waitFor(() => expect(bodyRows(t)).toHaveLength(1));
  expect(cells(bodyRows(t)[0]!)[1]).toBe('Account Futures main');
  fireEvent.change(search, { target: { value: 'fees' } });
  await waitFor(() => expect(bodyRows(t)).toHaveLength(1));
  expect(cells(bodyRows(t)[0]!)[2]).toMatch(/^Fees/);
  expect(count()).toBe('1 to 1 of 1');
  fireEvent.change(search, { target: { value: '' } });
  await waitFor(() => expect(bodyRows(t)).toHaveLength(6));

  // Type.
  await pick('Type', 'Trade');
  expect(bodyRows(t).map((r) => cells(r)[2]!.split(' ')[0])).toEqual([
    'Fees',
    'Stops',
    'Account',
  ]);
  // Type and Source together.
  await pick('Source', 'You');
  expect(bodyRows(t)).toHaveLength(2);
  await clear('You');
  await clear('Trade');
  await waitFor(() => expect(bodyRows(t)).toHaveLength(6));

  // Action.
  await pick('Action', 'Moved');
  expect(bodyRows(t)).toHaveLength(1);
  expect(cells(bodyRows(t)[0]!)[3]).toBe('Moved');
  await clear('Moved');

  // Source.
  await pick('Source', 'Rule');
  expect(bodyRows(t)).toHaveLength(1);
  expect(cells(bodyRows(t)[0]!)).toEqual([
    '20 Nov, 07:20 GMT−5',
    'Trade NQ 2026-11-17',
    'Stops None to 8 points',
    'Edited',
    'Rule',
  ]);
});

const MONEY_ROWS = () => [
  row({ at: at(60), field: 'fees', oldValue: 820, newValue: 1250 }),
  row({ at: at(50), field: 'swap', oldValue: null, newValue: -486 }),
  row({
    at: at(40),
    type: 'account',
    entityId: 'acc-a',
    label: 'Futures main',
    field: 'startingBalance',
    oldValue: 5_000_000,
    newValue: 6_000_000,
  }),
  row({
    at: at(30),
    type: 'cash-flow',
    entityId: 'cf-1',
    label: 'Futures main 2026-11-18',
    field: 'amount',
    oldValue: -50_000,
    newValue: -60_000,
  }),
  row({
    at: at(20),
    field: 'targets',
    oldValue: null,
    newValue: JSON.stringify({
      unit: 'amount',
      levels: [{ value: 300, qty: 1 }],
    }),
  }),
  row({
    at: at(10),
    type: 'fee-rule',
    entityId: 'fr-1',
    label: 'Futures main, Future, ES',
    field: 'commission',
    oldValue: 129,
    newValue: 175,
  }),
];

test('money values are masked under Privacy', async () => {
  // In dollars, the amounts read.
  await show(MONEY_ROWS());
  let t = await table();
  let text = cells(bodyRows(t)[0]!)[2];
  expect(text).toBe('Fees $8.20 to $12.50');
  expect(cells(bodyRows(t)[1]!)[2]).toBe('Swap None to −$4.86');
  expect(cells(bodyRows(t)[2]!)[2]).toBe(
    'Starting balance $50,000.00 to $60,000.00',
  );
  expect(cells(bodyRows(t)[3]!)[2]).toBe('Amount −$500.00 to −$600.00');
  expect(cells(bodyRows(t)[4]!)[2]).toBe('Targets None to $300.00');
  expect(cells(bodyRows(t)[5]!)[2]).toBe('Commission $1.29 to $1.75');
  cleanup();

  // Under Privacy, none of them does.
  await show(MONEY_ROWS(), { displayUnit: 'privacy' });
  t = await table();
  text = cells(bodyRows(t)[0]!)[2];
  expect(text).toContain('$•••');
  const shown = everyString(document.body).join(' ');
  expect(shown).not.toMatch(/\$\s?\d/);
  for (const figure of [
    '8.20',
    '12.50',
    '4.86',
    '50,000',
    '600.00',
    '300.00',
    '1.29',
    '1.75',
  ])
    expect(shown).not.toContain(figure);
  // The field names stay.
  expect(cells(bodyRows(t)[2]!)[2]).toMatch(/^Starting balance/);
});

test('the empty and no-match states', async () => {
  await show([]);
  expect(await screen.findByText('No changes yet')).toBeTruthy();
  expect(screen.queryByRole('table', { name: 'Edit history' })).toBeNull();
  cleanup();

  await show([
    row({ at: at(1), field: 'rating', oldValue: 3, newValue: 4 }),
    row({
      at: at(0),
      type: 'tag',
      action: 'created',
      entityId: 't-1',
      label: 'late entry',
    }),
  ]);
  expect(bodyRows(await table())).toHaveLength(2);
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Search edit history' }),
    { target: { value: 'zzz' } },
  );
  expect(await screen.findByText('No changes match')).toBeTruthy();
  // The table gives way to the words, and the filters stay to change.
  expect(screen.queryByRole('table', { name: 'Edit history' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Type' })).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: 'Clear the search and filters' }),
  );
  expect(bodyRows(await table())).toHaveLength(2);
  expect(
    (
      screen.getByRole('searchbox', {
        name: 'Search edit history',
      }) as HTMLInputElement
    ).value,
  ).toBe('');
  expect(screen.queryByText('No changes match')).toBeNull();
});

test('values read as display text: names, counts, levels, labels and None', async () => {
  await show([
    row({
      at: at(90),
      action: 'merged',
      field: 'fills',
      oldValue: 3,
      newValue: 5,
    }),
    row({
      at: at(80),
      action: 'moved',
      field: 'accountId',
      oldValue: 'acc-b',
      newValue: 'acc-a',
    }),
    row({
      at: at(70),
      field: 'tagIds',
      oldValue: null,
      newValue: 'tag-setup,tag-fomo',
    }),
    row({ at: at(69), field: 'rating', oldValue: null, newValue: 4 }),
    row({ at: at(68), field: 'reviewed', oldValue: false, newValue: true }),
    row({
      at: at(60),
      field: 'stops',
      oldValue: JSON.stringify({
        unit: 'pips',
        levels: [{ value: 30, qty: 1 }],
      }),
      newValue: JSON.stringify({
        unit: 'pips',
        levels: [
          { value: 30, qty: 0.5 },
          { value: 25, qty: 0.5 },
        ],
      }),
    }),
    row({
      at: at(59),
      field: 'strategyIds',
      oldValue: 'str-1',
      newValue: null,
    }),
    row({
      at: at(50),
      type: 'account',
      entityId: 'acc-a',
      label: 'Futures main',
      field: 'costMethod',
      oldValue: 'fifo',
      newValue: 'lifo',
    }),
    row({
      at: at(40),
      type: 'import',
      action: 'created',
      source: 'import',
      entityId: 'imp-1',
      label: 'first.csv',
      field: 'trades',
      newValue: 38,
    }),
    row({
      at: at(30),
      type: 'account',
      action: 'created',
      entityId: 'acc-c',
      label: 'Futures 100K funded',
    }),
    row({
      at: at(20),
      type: 'cash-flow',
      entityId: 'cf-1',
      label: 'Futures main 2026-11-18',
      field: 'at',
      oldValue: '2026-11-18',
      newValue: '2026-11-19',
    }),
    row({
      at: at(10),
      type: 'tag-category',
      entityId: 'setups',
      label: 'Setups',
      field: 'color',
      oldValue: '#D97706',
      newValue: '#CB4B8A',
    }),
    row({
      at: at(0),
      type: 'strategy',
      source: 'system',
      entityId: 'str-1',
      label: 'Opening range breakout',
      field: 'status',
      oldValue: 'active',
      newValue: 'archived',
    }),
  ]);
  const t = await table();
  expect(bodyRows(t).map((r) => cells(r)[2])).toEqual([
    'Fills 3 to 5',
    'Account Old demo to Futures main',
    'Tags None to breakout, fomo',
    'Rating None to 4 of 5',
    'Reviewed No to Yes',
    'Stops 30 pips to 30 and 25 pips',
    'Strategies Opening range breakout to None',
    'Cost method FIFO to LIFO',
    'Trades None to 38',
    'None',
    'Date 18 Nov 2026 to 19 Nov 2026',
    'Colour Marigold to Rose',
    'Status Active to Archived',
  ]);
  expect(bodyRows(t).map((r) => cells(r)[3])).toEqual([
    'Merged',
    'Moved',
    'Edited',
    'Edited',
    'Edited',
    'Edited',
    'Edited',
    'Edited',
    'Created',
    'Created',
    'Edited',
    'Edited',
    'Edited',
  ]);
  expect(cells(bodyRows(t)[12]!)[4]).toBe('System');
  expect(cells(bodyRows(t)[11]!)[1]).toBe('Tag category Setups');
  expect(cells(bodyRows(t)[10]!)[1]).toBe(
    'Balance adjustment Futures main 2026-11-18',
  );
});

test('times read in the profile zone with its GMT offset', async () => {
  await show([
    row({
      at: '2026-11-25T21:42:00.000Z',
      field: 'rating',
      oldValue: 3,
      newValue: 4,
    }),
    row({
      at: '2026-10-30T13:05:00.000Z',
      field: 'rating',
      oldValue: 2,
      newValue: 3,
    }),
  ]);
  const t = await table();
  expect(cells(bodyRows(t)[0]!)[0]).toBe('25 Nov, 16:42 GMT−5');
  expect(cells(bodyRows(t)[1]!)[0]).toBe('30 Oct, 09:05 GMT−4');
  expect(
    screen.getByText('Changes from the last 30 days, in New York time'),
  ).toBeTruthy();
});

test('a photo stored as a strategy is made reads as part of its creation', async () => {
  await show([
    // Made with a photo: the photo is linked a moment after the strategy exists.
    row({
      at: '2026-11-20T15:00:00.400Z',
      type: 'strategy',
      entityId: 'str-2',
      label: 'Gap fill',
      field: 'photoId',
      oldValue: null,
      newValue: 'file-1',
    }),
    row({
      at: '2026-11-20T15:00:00.000Z',
      type: 'strategy',
      action: 'created',
      entityId: 'str-2',
      label: 'Gap fill',
    }),
    // A photo added later is its own change.
    row({
      at: '2026-11-21T15:00:00.000Z',
      type: 'strategy',
      entityId: 'str-1',
      label: 'Opening range breakout',
      field: 'photoId',
      oldValue: null,
      newValue: 'file-2',
    }),
    row({
      at: '2026-11-20T09:00:00.000Z',
      type: 'strategy',
      action: 'created',
      entityId: 'str-1',
      label: 'Opening range breakout',
    }),
  ]);
  const t = await table();
  expect(bodyRows(t).map((r) => `${cells(r)[1]} | ${cells(r)[2]}`)).toEqual([
    'Strategy Opening range breakout | Photo None to A photo',
    'Strategy Gap fill | None',
    'Strategy Opening range breakout | None',
  ]);
  expect(count()).toBe('1 to 3 of 3');
});

test('on a phone each change is two lines: the time and the record, then the change, action and source', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q) =>
      ({
        matches: !q.includes('min-width: 640px'),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  await show([
    row({
      at: '2026-11-25T21:42:00.000Z',
      field: 'fees',
      oldValue: 0,
      newValue: 516,
      source: 'rule',
    }),
    row({
      at: '2026-11-23T14:12:00.000Z',
      type: 'account',
      action: 'created',
      entityId: 'acc-c',
      label: 'Futures 100K funded',
    }),
  ]);
  const list = await screen.findByRole('list', { name: 'Edit history' });
  expect(screen.queryByRole('table', { name: 'Edit history' })).toBeNull();
  const items = within(list).getAllByRole('listitem');
  expect(items).toHaveLength(2);
  const line = (li: HTMLElement, n: number) =>
    (li.querySelector(`[data-line="${n}"]`)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  expect(line(items[0]!, 1)).toBe('Trade ES 2026-11-16 25 Nov, 16:42 GMT−5');
  expect(line(items[0]!, 2)).toBe('Fees: $0.00 to $5.16 Edited Rule');
  expect(line(items[1]!, 1)).toBe(
    'Account Futures 100K funded 23 Nov, 09:12 GMT−5',
  );
  expect(line(items[1]!, 2)).toBe('No field Created You');
  expect(count()).toBe('1 to 2 of 2');
});

test('money reads in the currency of its own record', async () => {
  await show(async (repo) => {
    const pounds = await repo.accounts.create('sample', {
      name: 'Pound account',
      broker: 'b',
      type: 'live',
      currency: 'GBP',
      startingBalance: 0,
      status: 'active',
    });
    return [
      row({
        at: at(2),
        type: 'account',
        entityId: pounds.id,
        label: 'Pound account',
        field: 'startingBalance',
        oldValue: 0,
        newValue: 100_000,
      }),
      // A trade's fees are in its P&L currency; one that is gone reads in the base currency.
      row({ at: at(1), field: 'fees', oldValue: 0, newValue: 250 }),
      row({
        at: at(0),
        entityId: 'gone',
        label: 'CL 2026-11-02',
        field: 'fees',
        oldValue: 0,
        newValue: 125,
      }),
    ];
  });
  const t = await table();
  await waitFor(() =>
    expect(cells(bodyRows(t)[0]!)[2]).toBe(
      'Starting balance £0.00 to £1,000.00',
    ),
  );
  expect(cells(bodyRows(t)[1]!)[2]).toBe('Fees $0.00 to $2.50');
  expect(cells(bodyRows(t)[2]!)[2]).toBe('Fees $0.00 to $1.25');
});

test('while the history loads, skeleton rows stand in for it', async () => {
  const base = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  renderApp(<HistoryCard />, {
    repository: { ...base, history: { list: () => new Promise(() => {}) } },
    url: '/app/settings/import-history',
  });
  expect(
    await screen.findByRole('status', { name: 'Loading the edit history' }),
  ).toBeTruthy();
  expect(screen.queryByRole('table', { name: 'Edit history' })).toBeNull();
  expect(screen.queryByText('No changes yet')).toBeNull();
});

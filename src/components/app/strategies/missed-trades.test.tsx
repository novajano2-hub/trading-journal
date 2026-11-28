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
import type { NewMissedTrade } from '@/data/repository';
import type { UserPrefs } from '@/domain/types';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { renderApp } from '../__fixtures__/render-app';
import { StrategiesView } from './strategies-view';
import { StrategyView } from './strategy-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = SAMPLE_WORKSPACE.id;
const ZONE = 'America/New_York';

/** 10:42, 09:58 and 14:20 in New York (UTC-5 in November). */
const SEED: NewMissedTrade[] = [
  {
    strategyId: 'str-1',
    symbol: 'ES',
    at: '2026-11-24T15:42:00.000Z',
    price: 6618.5,
    commission: 258,
    fees: 276,
  },
  {
    strategyId: 'str-1',
    symbol: 'NQ',
    at: '2026-11-20T14:58:00.000Z',
    price: 22512.25,
    commission: 258,
    fees: 276,
  },
  {
    strategyId: 'str-1',
    symbol: 'EURUSD',
    at: '2026-11-18T19:20:00.000Z',
    price: 1.1584,
    commission: 700,
    fees: 0,
  },
];

/** The page of str-1 over a store that already holds `seed`, the profile zone fixed. */
async function open(
  seed: NewMissedTrade[] = [],
  prefs: Partial<UserPrefs> = {},
  view: 'page' | 'list' = 'page',
  photo = false,
) {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repo.prefs.update({ timeZone: ZONE, ...prefs });
  for (const m of seed) await repo.missedTrades.create(WS, m);
  if (photo) {
    const file = await repo.files.add(
      WS,
      'strategy:str-1',
      { bytes: new ArrayBuffer(4), type: 'image/png', name: 'p.png' },
      { images: true },
    );
    await repo.strategies.update(WS, 'str-1', { photoId: file.id });
  }
  const out = renderApp(
    view === 'page' ? <StrategyView id="str-1" /> : <StrategiesView />,
    {
      repository: repo,
      url: view === 'page' ? '/app/strategies/str-1' : '/app/strategies',
    },
  );
  return { ...out, repo };
}

const card = () => screen.findByRole('region', { name: 'Missed trades' });
const addButton = async () =>
  within(await card()).getByRole('button', { name: 'Add a missed trade' });
/** The table's rows, once the list has loaded (its header is the first). */
const rows = async () =>
  within(
    await within(await card()).findByRole('table', { name: 'Missed trades' }),
  ).getAllByRole('row');
/** A button of a row of the table (the phone's list repeats them). */
const rowButton = async (name: string) =>
  within(
    await within(await card()).findByRole('table', { name: 'Missed trades' }),
  ).getByRole('button', { name });

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function openAdd() {
  fireEvent.click(await addButton());
  return screen.findByRole('dialog', { name: 'Add a missed trade' });
}

test('with none logged the card says so, and Add is there', async () => {
  await open();
  const c = await card();
  expect(await within(c).findByText('No missed trades yet.')).toBeTruthy();
  expect(
    within(c).getByText('Kept apart: no figure, filter or report counts them'),
  ).toBeTruthy();
  expect(await addButton()).toBeTruthy();
  // Nothing missed, nothing to count in the header.
  expect(screen.queryByText(/\d+ missed/)).toBeNull();
});

test('the card lists them newest first, in the profile zone, with the header and the card counting them', async () => {
  await open(SEED);
  const table = await within(await card()).findByRole('table', {
    name: 'Missed trades',
  });
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent),
  ).toEqual([
    'Date and time',
    'Symbol',
    'Price',
    'Commission',
    'Fees',
    'Actions',
  ]);
  const body = (await rows()).slice(1);
  expect(body.map((r) => r.textContent)).toEqual([
    expect.stringMatching(/^Tue 24 Nov\s?10:42ES6,618\.50\$2\.58\$2\.76/),
    expect.stringMatching(/^Fri 20 Nov\s?09:58NQ22,512\.25\$2\.58\$2\.76/),
    expect.stringMatching(/^Wed 18 Nov\s?14:20EURUSD1\.1584\$7\.00\$0\.00/),
  ]);
  // The header counts them beside its trade count.
  expect(screen.getByText('3 missed')).toBeTruthy();
  // A phone reads each as two lines.
  const phone = within(await card()).getByRole('list', {
    name: 'Missed trades, one row each',
  });
  expect(within(phone).getAllByRole('listitem')).toHaveLength(3);
});

test('a missed trade saves exactly its fields: symbol, date and time, price, commission and fees', async () => {
  const { repo } = await open();
  const dialog = await openAdd();
  // The form holds exactly those five, and no side or quantity.
  for (const label of [
    'Symbol',
    'Date and time',
    'Price',
    'Commission',
    'Fees',
  ])
    expect(within(dialog).getByLabelText(label)).toBeTruthy();
  expect(within(dialog).queryByLabelText(/side|quantity|size|qty/i)).toBeNull();
  expect(
    within(dialog)
      .getAllByRole('textbox')
      .concat(
        Array.from(dialog.querySelectorAll<HTMLInputElement>('input')).filter(
          (i) => i.type === 'datetime-local',
        ),
      ),
  ).toHaveLength(5);

  fill('Symbol', ' es ');
  fill('Date and time', '2026-11-24T10:42');
  fill('Price', '6,618.50');
  fill('Commission', '2.58');
  fill('Fees', '2.76');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

  await waitFor(async () =>
    expect(await repo.missedTrades.list(WS, 'str-1')).toHaveLength(1),
  );
  const [saved] = await repo.missedTrades.list(WS, 'str-1');
  expect(saved).toEqual({
    id: saved!.id,
    workspaceId: WS,
    strategyId: 'str-1',
    symbol: 'ES',
    at: '2026-11-24T15:42:00.000Z',
    price: 6618.5,
    commission: 258,
    fees: 276,
  });
  // The row is on the card and the dialog is gone.
  expect((await rows()).slice(1)[0]!.textContent).toMatch(/ES/);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByText('1 missed')).toBeTruthy();
});

test('the commission and fees fields bring up a keyboard with a minus key, as a credit reads', async () => {
  await open();
  const dialog = await openAdd();
  for (const label of ['Commission', 'Fees'])
    expect(within(dialog).getByLabelText(label).getAttribute('inputmode')).toBe(
      'text',
    );
});

test('a price, commission and fees can be left empty: they show as None', async () => {
  const { repo } = await open();
  const dialog = await openAdd();
  fill('Symbol', 'EURUSD');
  fill('Date and time', '2026-11-18T14:20');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
  await waitFor(async () =>
    expect(await repo.missedTrades.list(WS, 'str-1')).toHaveLength(1),
  );
  const [saved] = await repo.missedTrades.list(WS, 'str-1');
  expect(Object.keys(saved!).sort()).toEqual([
    'at',
    'id',
    'strategyId',
    'symbol',
    'workspaceId',
  ]);
  const row = (await rows())[1]!;
  expect(within(row).getAllByText('None')).toHaveLength(3);
});

test('a form that is not right says what, saves nothing, and keeps the dialog', async () => {
  const { repo } = await open();
  const dialog = await openAdd();
  const add = () =>
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

  // No symbol.
  fill('Date and time', '2026-11-24T10:42');
  add();
  expect(await within(dialog).findByText('Enter the symbol.')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByLabelText('Symbol'));

  // No time.
  fill('Symbol', 'ES');
  fill('Date and time', '');
  add();
  expect(await within(dialog).findByText('Pick a date and time.')).toBeTruthy();

  fill('Date and time', '2026-11-24T10:42');
  fill('Price', 'abc');
  add();
  expect(
    await within(dialog).findByText(
      'Enter a price above zero, or leave it empty.',
    ),
  ).toBeTruthy();

  fill('Price', '6618.5');
  fill('Commission', '2,5');
  add();
  expect(
    await within(dialog).findByText(
      'Enter an amount like 2.58, or leave it empty.',
    ),
  ).toBeTruthy();

  expect(await repo.missedTrades.list(WS, 'str-1')).toEqual([]);
  expect(
    screen.getByRole('dialog', { name: 'Add a missed trade' }),
  ).toBeTruthy();
});

test('Edit opens the trade filled in, and saving changes it; an emptied price is cleared', async () => {
  const { repo } = await open(SEED);
  await rows();
  fireEvent.click(await rowButton('Edit NQ, Fri 20 Nov 09:58'));
  const dialog = await screen.findByRole('dialog', {
    name: 'Edit missed trade',
  });
  expect(
    (within(dialog).getByLabelText('Symbol') as HTMLInputElement).value,
  ).toBe('NQ');
  expect(
    (within(dialog).getByLabelText('Date and time') as HTMLInputElement).value,
  ).toBe('2026-11-20T09:58');
  expect(
    (within(dialog).getByLabelText('Price') as HTMLInputElement).value,
  ).toBe('22512.25');
  expect(
    (within(dialog).getByLabelText('Commission') as HTMLInputElement).value,
  ).toBe('2.58');

  fill('Symbol', 'MNQ');
  fill('Price', '');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  await waitFor(async () =>
    expect(
      (await repo.missedTrades.list(WS, 'str-1')).map((m) => m.symbol),
    ).toContain('MNQ'),
  );
  const edited = (await repo.missedTrades.list(WS, 'str-1')).find(
    (m) => m.symbol === 'MNQ',
  )!;
  expect(edited).not.toHaveProperty('price');
  expect(edited.commission).toBe(258);
  expect(edited.at).toBe('2026-11-20T14:58:00.000Z');
  // Still three, and it kept its place by date.
  expect(await rows()).toHaveLength(4);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Delete asks first, and removes just that one', async () => {
  const { repo } = await open(SEED);
  await rows();
  fireEvent.click(await rowButton('Delete ES, Tue 24 Nov 10:42'));
  const dialog = await screen.findByRole('dialog', {
    name: 'Delete this missed trade?',
  });
  // Cancel keeps it.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await repo.missedTrades.list(WS, 'str-1')).toHaveLength(3);

  fireEvent.click(await rowButton('Delete ES, Tue 24 Nov 10:42'));
  fireEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'Delete this missed trade?' }),
    ).getByRole('button', { name: 'Delete' }),
  );
  await waitFor(async () =>
    expect(
      (await repo.missedTrades.list(WS, 'str-1')).map((m) => m.symbol),
    ).toEqual(['NQ', 'EURUSD']),
  );
  await waitFor(async () => expect(await rows()).toHaveLength(3));
  expect(screen.getByText('2 missed')).toBeTruthy();
});

test('under Privacy the commission and fees are hidden and cannot be edited', async () => {
  await open(SEED, { displayUnit: 'privacy' });
  const body = (await rows()).slice(1);
  // The price is a level, not money; the costs are.
  expect(body[0]!.textContent).toContain('6,618.50');
  expect(body[0]!.textContent).not.toMatch(/2\.58|2\.76/);
  fireEvent.click(await rowButton('Edit ES, Tue 24 Nov 10:42'));
  const dialog = await screen.findByRole('dialog', {
    name: 'Edit missed trade',
  });
  const commission = within(dialog).getByLabelText(
    'Commission',
  ) as HTMLInputElement;
  expect(commission.readOnly).toBe(true);
  expect(commission.value).not.toContain('2.58');
  expect(
    within(dialog).getByText(
      'Amounts are hidden by Privacy. Turn it off to edit them.',
    ),
  ).toBeTruthy();
});

test('a strategy card counts them beside its trades, and a strategy with none says nothing of them', async () => {
  await open(SEED, {}, 'list');
  const heading = await screen.findByRole('heading', {
    name: 'Opening range breakout',
  });
  const article = heading.closest('article')!;
  // "n open, n missed" under the trade count.
  await waitFor(() =>
    expect(article.textContent).toMatch(/none open, 3 missed/),
  );
});

test('a strategy with none reads as before on its card', async () => {
  await open([], {}, 'list');
  const heading = await screen.findByRole('heading', {
    name: 'Opening range breakout',
  });
  const article = heading.closest('article')!;
  expect(article.textContent).not.toMatch(/missed/);
});

test('adding a missed trade changes no figure on the strategy page', async () => {
  await open();
  const sections = async () =>
    Object.fromEntries(
      ['Rules', 'Equity', 'Stats', 'Checklist'].map((name) => [
        name,
        screen.getByRole('region', { name }).textContent,
      ]),
    );
  await screen.findByRole('region', { name: 'Stats' });
  const link = () =>
    screen.getByRole('link', { name: /^View \d+ trades?$/ }).textContent;
  const before = { ...(await sections()), view: link() };

  const dialog = await openAdd();
  fill('Symbol', 'ES');
  fill('Date and time', '2026-11-16T09:31');
  fill('Price', '100');
  fill('Commission', '9999.99');
  fill('Fees', '9999.99');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
  await waitFor(async () => expect(await rows()).toHaveLength(2));

  expect({ ...(await sections()), view: link() }).toEqual(before);
});

test('deleting a strategy says that its missed trades and photo go with it, and they do', async () => {
  const { repo } = await open(SEED, {}, 'list', true);
  await screen.findByText('Opening range breakout');
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'More for Opening range breakout' }),
    { key: 'Enter' },
  );
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  expect(
    await within(dialog).findByText(
      /this strategy\. Its 3 missed trades and its photo are deleted with it\.$/,
    ),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(async () =>
    expect(await repo.strategies.get(WS, 'str-1')).toBeUndefined(),
  );
  expect(await repo.missedTrades.list(WS, 'str-1')).toEqual([]);
  expect(await repo.files.list(WS, 'strategy:str-1')).toEqual([]);
});

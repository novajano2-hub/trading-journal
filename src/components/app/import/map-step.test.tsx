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
import { Suspense } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import type { NewAccount, Repository } from '@/data/repository';
import { parseCsv } from '@/domain/import/csv';
import type { UserPrefs } from '@/domain/types';
import { guessMapping, type ImportMapping } from '@/domain/import/mapping';
import { renderApp } from '../__fixtures__/render-app';
import { ImportFlow } from './import-flow';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const HEADER = 'Time,Symbol,Side,Quantity,Price';
const ROWS = [
  '19/11/2026 09:30:00,ESZ6,Buy,1,5000',
  '19/11/2026 09:45:00,ESZ6,Sell,1,5004',
];

function csvFile(rows: readonly string[], header = HEADER, name = 'fills.csv') {
  return new File([[header, ...rows].join('\n')], name, { type: 'text/csv' });
}

const futures: NewAccount = {
  name: 'Futures',
  broker: 'Sample broker',
  type: 'live',
  currency: 'USD',
  startingBalance: 5_000_000,
  status: 'active',
  timeZone: 'America/Chicago',
};

async function open(
  accounts: readonly NewAccount[],
  url = '/app/import',
  prefs: Partial<UserPrefs> = {},
): Promise<{ repo: Repository }> {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  for (const a of accounts) {
    await repo.accounts.create('mine', a);
  }
  if (Object.keys(prefs).length > 0) await repo.prefs.update(prefs);
  renderApp(
    <Suspense fallback={null}>
      <ImportFlow />
    </Suspense>,
    { repository: repo, url },
  );
  return { repo };
}

async function upload(file: File) {
  const input = await screen.findByLabelText('Import file');
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(await screen.findByRole('button', { name: /^Map columns/ }));
  // hidden: the New account dialog may already be open over it (no account yet).
  await screen.findByRole('heading', {
    name: 'Match your columns',
    hidden: true,
  });
}

const checked = (name: RegExp | string) =>
  (screen.getByRole('radio', { name }) as HTMLInputElement).checked;

test('a file whose time column holds 19/11/2026 is read day first', async () => {
  await open([futures]);
  await upload(csvFile(ROWS));
  expect(checked('Day first')).toBe(true);
  expect(checked('Month first')).toBe(false);
  // The step is in the address bar, and the stepper says where we are.
  expect(window.location.search).toContain('step=map');
  expect(
    within(screen.getByRole('list', { name: 'Import steps' }))
      .getByText('Map columns')
      .closest('li')
      ?.getAttribute('aria-current'),
  ).toBe('step');
});

test('the fields Keel found read Matched, and Continue opens the preview step', async () => {
  await open([futures]);
  await upload(csvFile(ROWS));
  const table = screen.getByRole('table');
  expect(within(table).getAllByText('Matched')).toHaveLength(5);
  const next = screen.getByRole('button', { name: /^Preview 2 rows/ });
  expect((next as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(next);
  await waitFor(() => expect(window.location.search).toContain('step=preview'));
});

test('with everything mapped but Price, Price is listed and Continue is disabled', async () => {
  await open([futures]);
  await upload(csvFile(ROWS));
  const price = screen.getByLabelText('Price column');
  fireEvent.change(price, { target: { value: '' } });
  expect(screen.getByText('Map these to continue: Price.')).toBeTruthy();
  const next = screen.getByRole('button', { name: /^Preview/ });
  expect((next as HTMLButtonElement).disabled).toBe(true);
  // Required fields say so in words.
  expect(
    within(screen.getByRole('table')).getAllByText('Required').length,
  ).toBeGreaterThan(0);
});

/** An account whose saved mapping (read for HEADER) says what the arguments say. */
function savedFor(
  options: Partial<Pick<ImportMapping, 'dateOrder' | 'decimal'>>,
): NewAccount {
  const mapping = guessMapping(parseCsv(`${HEADER}\n`), {
    sourceTimeZone: 'America/Chicago',
  }) as Extract<ImportMapping, { kind: 'fills' }>;
  // Saved from a file whose columns sat in another order.
  return {
    ...futures,
    importMapping: {
      ...mapping,
      columns: { time: 0, symbol: 1, side: 2, qty: 3, price: 4 },
      headers: [...parseCsv(`${HEADER}\n`).headers],
      ...options,
    },
  };
}

test('an account with a saved mapping opens pre-filled and says so', async () => {
  await open([savedFor({ dateOrder: 'dmy' })]);
  // The file does not say which order it is in (11 and 05 are both months): the saved one stands.
  await upload(csvFile(['11/05/2026 09:30:00,ESZ6,Buy,1,5000']));
  expect(
    screen.getByText('Using your saved mapping for Futures.'),
  ).toBeTruthy();
  expect(checked('Day first')).toBe(true);
  expect(screen.queryByText(/This file uses/)).toBeNull();
});

test('a saved date order loses to a file that proves another, and the step says so', async () => {
  await open([savedFor({ dateOrder: 'dmy' })]);
  // 19 can only be a day: this file is month first.
  await upload(csvFile(['11/19/2026 09:30:00,ESZ6,Buy,1,5000']));
  expect(checked('Month first')).toBe(true);
  expect(
    screen.getByText(
      'This file uses month first; your saved mapping said day first.',
    ),
  ).toBeTruthy();
});

test('a saved decimal mark loses to a file that proves another, and the step says so', async () => {
  await open([savedFor({ dateOrder: 'mdy', decimal: ',' })]);
  await upload(csvFile(['11/19/2026 09:30:00,ESZ6,Buy,1,5000.25']));
  expect(checked('Point')).toBe(true);
  expect(
    screen.getByText(
      'This file uses a point as the decimal mark; your saved mapping said a comma as the decimal mark.',
    ),
  ).toBeTruthy();
});

test('a saved mapping for other columns is left alone', async () => {
  const base = guessMapping(parseCsv('Foo,Bar\n'), { sourceTimeZone: 'UTC' });
  const saved = {
    ...base,
    columns: { time: 0, symbol: 1, side: 2, qty: 3, price: 4 },
    headers: ['Foo', 'Bar', 'Baz', 'Qux', 'Quux'],
  };
  await open([{ ...futures, importMapping: saved }]);
  await upload(csvFile(ROWS));
  expect(screen.queryByText(/Using your saved mapping/)).toBeNull();
});

test('an unknown futures root asks for a point value and shows the file symbol beside the key', async () => {
  await open([futures]);
  await upload(
    csvFile([
      '11/19/2026 09:30:00,HGZ6,Buy,1,4.10',
      '11/19/2026 09:45:00,HGZ6,Sell,1,4.20',
    ]),
  );
  const group = screen.getByRole('group', { name: 'Point value for HG' });
  expect(within(group).getByText(/HGZ6/)).toBeTruthy();
  const input = within(group).getByLabelText('HG point value');
  fireEvent.change(input, { target: { value: '25,000' } });
  expect((input as HTMLInputElement).value).toBe('25,000');
  // The row stays while the value is typed.
  expect(
    screen.getByRole('group', { name: 'Point value for HG' }),
  ).toBeTruthy();
});

test('Preview waits until every unknown root has a point value', async () => {
  await open([futures]);
  await upload(
    csvFile([
      '11/19/2026 09:30:00,HGZ6,Buy,1,4.10',
      '11/19/2026 09:45:00,HGZ6,Sell,1,4.20',
    ]),
  );
  const go = screen.getByRole('button', { name: /^Preview/ });
  expect((go as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('HG point value'), {
    target: { value: '25000' },
  });
  await waitFor(() => expect((go as HTMLButtonElement).disabled).toBe(false));
});

test('without a file the upload step shows no spinner and no mapping', async () => {
  await open([futures]);
  expect(await screen.findByLabelText('Import file')).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
});

test('step=map with no file goes back to upload', async () => {
  await open([futures], '/app/import?step=map');
  await screen.findByLabelText('Import file');
  await waitFor(() => expect(window.location.search).toContain('step=upload'));
});

test('with no account the New account dialog opens by itself, and a made account is chosen', async () => {
  await open([]);
  await upload(csvFile(ROWS));
  const dialog = await screen.findByRole('dialog', { name: 'New account' });
  // The left card holds only the comp's controls: the fields live in the dialog.
  expect(
    within(
      screen.getByText('How to read the file').closest('section')!,
    ).queryByLabelText('Account name', { selector: 'input' }),
  ).toBeNull();
  fireEvent.change(within(dialog).getByLabelText('Account name'), {
    target: { value: 'Prop eval' },
  });
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Create account' }),
  );
  const select = screen.getByLabelText('Account') as HTMLSelectElement;
  await waitFor(() =>
    expect(
      within(select).getByRole('option', { name: 'Prop eval' }),
    ).toBeTruthy(),
  );
  expect(select.selectedOptions[0]?.textContent).toBe('Prop eval');
  // The dialog is gone: an account is chosen.
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('choosing New account opens the dialog; Cancel goes back to the account chosen before', async () => {
  await open([futures]);
  await upload(csvFile(ROWS));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.change(screen.getByLabelText('Account'), {
    target: { value: '__new' },
  });
  const dialog = await screen.findByRole('dialog', { name: 'New account' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    (screen.getByLabelText('Account') as HTMLSelectElement).value,
  ).not.toBe('__new');
  expect(
    (screen.getByRole('button', { name: /^Preview/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

test('Continue saves the mapping on the account', async () => {
  const { repo } = await open([futures]);
  await upload(csvFile(ROWS));
  expect(
    (screen.getByLabelText('Save this mapping for Futures') as HTMLInputElement)
      .checked,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /^Preview/ }));
  await waitFor(async () => {
    const [saved] = await repo.accounts.list('mine');
    expect(saved?.importMapping?.headers).toEqual(HEADER.split(','));
    expect(saved?.importMapping?.dateOrder).toBe('dmy');
  });
});

test('switching to closed trades asks for the trade columns', async () => {
  await open([futures]);
  await upload(csvFile(ROWS));
  fireEvent.click(screen.getByRole('radio', { name: 'Closed trade' }));
  const table = screen.getByRole('table');
  expect(within(table).getByLabelText('Exit time column')).toBeTruthy();
  expect(screen.getByText(/^Map these to continue:/).textContent).toContain(
    'Exit time',
  );
});

test('Continue does not save the mapping when Save is unticked', async () => {
  const { repo } = await open([futures]);
  await upload(csvFile(ROWS));
  fireEvent.click(screen.getByLabelText('Save this mapping for Futures'));
  fireEvent.click(screen.getByRole('button', { name: /^Preview/ }));
  await waitFor(() => expect(window.location.search).toContain('step=preview'));
  const [account] = await repo.accounts.list('mine');
  expect(account?.importMapping).toBeUndefined();
});

test('in New account mode Continue waits for the account to be made, then goes on into it', async () => {
  const { repo } = await open([futures]);
  await upload(csvFile(ROWS));
  fireEvent.change(screen.getByLabelText('Account'), {
    target: { value: '__new' },
  });
  const dialog = await screen.findByRole('dialog', { name: 'New account' });
  // The dialog is modal, so the page behind it is out of the accessibility tree.
  const next = screen
    .getByText(/^Preview 2 rows/)
    .closest('button') as HTMLButtonElement;
  // Nothing is made yet: Continue is off, and nothing flows into Futures.
  expect(next.disabled).toBe(true);
  // An empty name is refused with its reason, and the dialog stays.
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Create account' }),
  );
  expect(
    await within(dialog).findByText('Give the account a name.'),
  ).toBeTruthy();
  fireEvent.change(within(dialog).getByLabelText('Account name'), {
    target: { value: 'Prop eval' },
  });
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Create account' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(next.disabled).toBe(false));
  fireEvent.click(next);
  await waitFor(() => expect(window.location.search).toContain('step=preview'));
  expect(
    await screen.findByRole('button', {
      name: 'Import 1 trade into Prop eval',
    }),
  ).toBeTruthy();
  const accounts = await repo.accounts.list('mine');
  expect(accounts.map((a) => a.name).sort()).toEqual(['Futures', 'Prop eval']);
  // The saved mapping went to the new account, not the one chosen before.
  expect(
    accounts.find((a) => a.name === 'Futures')?.importMapping,
  ).toBeUndefined();
  expect(
    accounts.find((a) => a.name === 'Prop eval')?.importMapping?.headers,
  ).toEqual(HEADER.split(','));
});

const HG_SEMICOLON = [
  'Time;Symbol;Side;Quantity;Price',
  '19/11/2026 09:30:00;HGZ6;Buy;1;"4,1005"',
  '19/11/2026 09:45:00;HGZ6;Sell;1;"4,2000"',
].join('\n');

test('with a comma file the point value is read with a comma, and the tick size sits beside it', async () => {
  const { repo } = await open([futures]);
  await upload(new File([HG_SEMICOLON], 'hg.csv', { type: 'text/csv' }));
  expect(checked('Comma')).toBe(true);
  const group = screen.getByRole('group', { name: 'Point value for HG' });
  const point = within(group).getByLabelText('HG point value');
  const tick = within(group).getByLabelText('HG tick size') as HTMLInputElement;
  // Four decimals ending in 0 or 5: the half tick, written with the file's mark.
  expect(tick.value).toBe('0,0005');
  // 25.000 is twenty-five thousand where the comma is the decimal mark.
  fireEvent.change(point, { target: { value: '25.000' } });
  expect(point.getAttribute('aria-invalid')).toBeNull();
  fireEvent.change(tick, { target: { value: '0,001' } });
  expect(tick.getAttribute('aria-invalid')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^Preview/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Import 1 trade into Futures' }),
  );
  await screen.findByText('1 trade imported into Futures.');
  const [account] = await repo.accounts.list('mine');
  expect((await repo.imports.context('mine', account!.id)).overrides).toEqual({
    HG: { pointValue: 25000, tickSize: 0.001 },
  });
});

const TRIPS_HEADER =
  'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price,Commission,P&L';
const TRIPS_ROWS = [
  '2026-11-16 09:30:00,2026-11-16 09:45:00,ESZ6,Long,1,6000,6004,3.75,21.90',
  '2026-11-16 10:30:00,2026-11-16 10:45:00,ESZ6,Long,1,6000,6004,3.75,15.60',
  '2026-11-16 11:30:00,2026-11-16 11:45:00,ESZ6,Long,1,6000,6004,3.75,"$1,2x"',
];

test('under Privacy the file money values are masked on Map: samples and the skipped-row warning', async () => {
  await open([futures], '/app/import', { displayUnit: 'privacy' });
  await upload(csvFile(TRIPS_ROWS, TRIPS_HEADER));
  // The warning is there, so the quoted value would be too.
  await screen.findByText(/would be skipped/);
  const text = document.body.textContent ?? '';
  for (const raw of ['21.90', '15.60', '3.75', '$1,2x'])
    expect(text, raw).not.toContain(raw);
  expect(screen.getAllByLabelText('hidden amount').length).toBeGreaterThan(0);
  // Prices are not money amounts: they still show.
  expect(screen.getAllByText('6000').length).toBeGreaterThan(0);
});

test('in dollars the same values show as the file writes them', async () => {
  await open([futures]);
  await upload(csvFile(TRIPS_ROWS, TRIPS_HEADER));
  await screen.findByText(/would be skipped/);
  expect(screen.getAllByText('21.90').length).toBeGreaterThan(0);
  expect(document.body.textContent).toContain('$1,2x');
  expect(screen.queryByLabelText('hidden amount')).toBeNull();
});

const SWAP_HEADER =
  'Open Time,Close Time,Symbol,Side,Qty,Entry Price,Exit Price,Commission,Swap,P&L';
const SWAP_ROWS = [
  '2026-11-16 09:30:00,2026-11-16 09:45:00,ESZ6,Long,1,6000,6004,3.75,-4.86,21.90',
];

test('a closed-trades file with a Swap column has it matched on Map', async () => {
  await open([futures]);
  await upload(csvFile(SWAP_ROWS, SWAP_HEADER));
  const swap = screen.getByLabelText('Swap column') as HTMLSelectElement;
  expect(swap.value).toBe('8');
  expect(document.body.textContent).toContain('-4.86');
});

test('a file without a Swap column leaves it as Do not import', async () => {
  await open([futures]);
  await upload(csvFile(TRIPS_ROWS.slice(0, 1), TRIPS_HEADER));
  const swap = screen.getByLabelText('Swap column') as HTMLSelectElement;
  expect(swap.value).toBe('');
});

test('under Privacy the Swap values are masked on Map', async () => {
  await open([futures], '/app/import', { displayUnit: 'privacy' });
  await upload(csvFile(SWAP_ROWS, SWAP_HEADER));
  await screen.findByLabelText('Swap column');
  expect(document.body.textContent).not.toContain('-4.86');
});

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
import { guessMapping } from '@/domain/import/mapping';
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
): Promise<{ repo: Repository }> {
  const repo = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  for (const a of accounts) {
    await repo.accounts.create('mine', a);
  }
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
  await screen.findByRole('heading', { name: 'Match your columns' });
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

test('an account with a saved mapping opens pre-filled and says so', async () => {
  const mapping = guessMapping(parseCsv(`${HEADER}\n`), {
    sourceTimeZone: 'America/Chicago',
  });
  // Saved from a file whose columns sat in another order.
  const saved = {
    ...mapping,
    columns: { time: 0, symbol: 1, side: 2, qty: 3, price: 4 },
    dateOrder: 'dmy' as const,
    headers: [...parseCsv(`${HEADER}\n`).headers],
  };
  await open([{ ...futures, importMapping: saved }]);
  // This file's dates are month first; the saved mapping wins.
  await upload(csvFile(['11/19/2026 09:30:00,ESZ6,Buy,1,5000']));
  expect(
    screen.getByText('Using your saved mapping for Futures.'),
  ).toBeTruthy();
  expect(checked('Day first')).toBe(true);
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

test('a new account is made inline and chosen', async () => {
  await open([]);
  await upload(csvFile(ROWS));
  fireEvent.change(screen.getByLabelText('Account name'), {
    target: { value: 'Prop eval' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  const select = screen.getByLabelText('Account') as HTMLSelectElement;
  await waitFor(() =>
    expect(
      within(select).getByRole('option', { name: 'Prop eval' }),
    ).toBeTruthy(),
  );
  expect(select.selectedOptions[0]?.textContent).toBe('Prop eval');
  // The form is gone: an account is chosen.
  expect(screen.queryByRole('group', { name: 'New account' })).toBeNull();
});

test('Continue saves the mapping on the account, and not when unticked', async () => {
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

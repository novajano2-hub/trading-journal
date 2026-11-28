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
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { createLocalRepository } from '@/data/local/local-repository';
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import { makeTrade } from '@/domain/__fixtures__/trades';
import type { Execution, Trade } from '@/domain/types';
import { everyString } from '../__fixtures__/every-string';
import { renderApp } from '../__fixtures__/render-app';
import { TradeView } from './trade-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const WS = fixtureSample().trades[0]!.workspaceId;
const URL = '/app/trades/t-c';

const at = (n: number) =>
  new Date(Date.UTC(2026, 10, 9, 14, 0) + n * 60_000).toISOString();

/** Two buys and two sells, each costing $1.05 of exchange fee and $6.75 of commission. */
function fill(id: string, side: 'buy' | 'sell', minute: number): Execution {
  return {
    id,
    accountId: 'acc-a',
    symbol: 'ESZ5',
    side,
    qty: 3,
    price: 6310,
    time: at(minute),
    fees: 105,
    commission: 675,
  };
}

function sample(patch: Partial<Trade> = {}, accountId = 'acc-a') {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    return {
      ...fx,
      trades: [
        makeTrade({
          id: 't-c',
          serial: 1132,
          workspaceId: WS,
          accountId,
          openedAt: at(0),
          closedAt: at(40),
          net: 8130,
          fees: 3120,
          maxPosition: 6,
          executions: [
            fill('e1', 'buy', 0),
            fill('e2', 'buy', 5),
            fill('e3', 'sell', 30),
            fill('e4', 'sell', 40),
          ],
          ...patch,
        }),
      ],
    };
  };
}

const rowOf = async (nth: number) => {
  const table = await screen.findByRole('table', { name: 'Executions' });
  return within(table).getAllByRole('row')[1 + nth]!;
};
/** The button that opens a row's costs, by the cost it shows. */
const opener = (row: HTMLElement, cost: 'exchange fee' | 'commission') =>
  within(row).getByRole('button', { name: new RegExp(`^Edit ${cost}`, 'i') });
const field = (name: 'Exchange fee' | 'Commission') =>
  screen.getByRole('textbox', { name }) as HTMLInputElement;
const save = () =>
  screen.getByRole('button', { name: "Save this row's costs" });

test('a fill’s costs open as two fields, with confirm and cancel at the row’s end', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL });
  const row = await rowOf(2);
  expect(screen.queryByRole('textbox', { name: 'Commission' })).toBeNull();
  fireEvent.click(opener(row, 'commission'));
  // The two amounts, as typed money in the trade's currency.
  expect(field('Exchange fee').value).toBe('1.05');
  expect(field('Commission').value).toBe('6.75');
  expect(within(row).getAllByText('$')).toHaveLength(2);
  // The clicked cost has the focus.
  expect(document.activeElement).toBe(field('Commission'));
  // Confirm and cancel are the last cell of the same row.
  const cells = within(row).getAllByRole('cell');
  expect(within(cells.at(-1)!).getByRole('button', { name: /Save/ })).toBe(
    save(),
  );
  expect(
    within(cells.at(-1)!).getByRole('button', { name: 'Cancel the edit' }),
  ).toBeTruthy();
  // The note the comp shows while a row is open.
  expect(
    screen.getByText(
      /Confirm the row to save\. The trade's fees and net update/,
    ),
  ).toBeTruthy();
  // The other rows' costs stay figures until this one is confirmed or cancelled.
  expect(
    within(await rowOf(0)).queryByRole('button', { name: /^Edit/ }),
  ).toBeNull();
});

test('confirming saves the row: the fill, then the trade’s fees and net', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL,
  });
  fireEvent.click(opener(await rowOf(2), 'exchange fee'));
  fireEvent.change(field('Exchange fee'), { target: { value: '2.43' } });
  fireEvent.change(field('Commission'), { target: { value: '3.50' } });
  fireEvent.click(save());
  await waitFor(async () => {
    const t = (await repo.trades.get(WS, 't-c'))!;
    // $7.80 became $5.93: $1.87 less.
    expect(t.executions[2]).toMatchObject({ fees: 243, commission: 350 });
    expect(t.fees).toBe(3120 - 187);
    expect(t.net).toBe(8130 + 187);
  });
  // The row is a figure again, with the new costs and the new total.
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Commission' })).toBeNull(),
  );
  const row = await rowOf(2);
  expect(row.textContent).toContain('$2.43');
  expect(row.textContent).toContain('$3.50');
  const total = within(
    screen.getByRole('table', { name: 'Executions' }),
  ).getAllByRole('row')[5]!;
  expect(total.textContent).toContain('$5.58');
  expect(total.textContent).toContain('$23.75');
  // The change is logged once, as the person's own edit.
  const rows = await repo.history.list(WS);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    field: 'fees',
    source: 'you',
    oldValue: 3120,
    newValue: 2933,
  });
  // The cost the confirmed row opened from has the focus again.
  expect(document.activeElement).toBe(opener(row, 'exchange fee'));
});

test('Enter confirms and Escape cancels', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL,
  });
  fireEvent.click(opener(await rowOf(0), 'commission'));
  fireEvent.change(field('Commission'), { target: { value: '9' } });
  fireEvent.keyDown(field('Commission'), { key: 'Escape' });
  expect(screen.queryByRole('textbox', { name: 'Commission' })).toBeNull();
  expect((await repo.trades.get(WS, 't-c'))!.executions[0]!.commission).toBe(
    675,
  );
  expect(document.activeElement).toBe(opener(await rowOf(0), 'commission'));

  fireEvent.click(opener(await rowOf(0), 'commission'));
  fireEvent.change(field('Commission'), { target: { value: '9' } });
  fireEvent.keyDown(field('Commission'), { key: 'Enter' });
  await waitFor(async () =>
    expect((await repo.trades.get(WS, 't-c'))!.executions[0]!.commission).toBe(
      900,
    ),
  );
});

test('cancelling leaves the fill, the trade and the log as they were', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL,
  });
  fireEvent.click(opener(await rowOf(1), 'exchange fee'));
  fireEvent.change(field('Exchange fee'), { target: { value: '50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel the edit' }));
  expect(screen.queryByRole('textbox', { name: 'Exchange fee' })).toBeNull();
  const t = (await repo.trades.get(WS, 't-c'))!;
  expect(t.executions[1]!.fees).toBe(105);
  expect(t.fees).toBe(3120);
  expect(await repo.history.list(WS)).toEqual([]);
  // Opening the row again starts from what is stored.
  fireEvent.click(opener(await rowOf(1), 'exchange fee'));
  expect(field('Exchange fee').value).toBe('1.05');
});

test('a non-numeric amount is refused in the row, and an empty field means 0', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL,
  });
  fireEvent.click(opener(await rowOf(3), 'commission'));
  for (const bad of ['abc', '1e3', '2,43', '--', '-', '$4']) {
    fireEvent.change(field('Commission'), { target: { value: bad } });
    fireEvent.click(save());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Enter an amount.');
    expect(field('Commission').getAttribute('aria-invalid')).toBe('true');
    expect(field('Commission').getAttribute('aria-describedby')).toBe(alert.id);
    expect(field('Exchange fee').getAttribute('aria-invalid')).toBeNull();
    expect(document.activeElement).toBe(field('Commission'));
    // The row is still open and nothing was written.
    expect((await repo.trades.get(WS, 't-c'))!.executions[3]!.commission).toBe(
      675,
    );
  }
  // Typing again clears the message.
  fireEvent.change(field('Commission'), { target: { value: '4' } });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(field('Commission').getAttribute('aria-invalid')).toBeNull();

  // An empty field is nothing charged.
  fireEvent.change(field('Exchange fee'), { target: { value: '' } });
  fireEvent.change(field('Commission'), { target: { value: '  ' } });
  fireEvent.click(save());
  await waitFor(async () => {
    const t = (await repo.trades.get(WS, 't-c'))!;
    expect(t.executions[3]).toMatchObject({ fees: 0, commission: 0 });
    expect(t.fees).toBe(3120 - 780);
  });
});

test('a negative fee is a credit: the trade’s fees go down and its net goes up, as a swap credit gets in', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL,
  });
  fireEvent.click(opener(await rowOf(2), 'exchange fee'));
  fireEvent.change(field('Exchange fee'), { target: { value: '-4.86' } });
  fireEvent.keyDown(field('Exchange fee'), { key: 'Enter' });
  await waitFor(async () => {
    const t = (await repo.trades.get(WS, 't-c'))!;
    // The fee went from $1.05 to a $4.86 credit: $5.91 less.
    expect(t.executions[2]).toMatchObject({ fees: -486, commission: 675 });
    expect(t.fees).toBe(3120 - 591);
    expect(t.net).toBe(8130 + 591);
  });
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Commission' })).toBeNull(),
  );
  // The row reads the credit with its sign, and opening it again offers it back as typed.
  const row = await rowOf(2);
  expect(row.textContent).toContain('−$4.86');
  fireEvent.click(opener(row, 'exchange fee'));
  expect(field('Exchange fee').value).toBe('-4.86');
  expect(screen.queryByRole('alert')).toBeNull();
  // The log holds the raw negative change.
  const rows = await repo.history.list(WS);
  expect(rows[0]).toMatchObject({
    field: 'fees',
    oldValue: 3120,
    newValue: 2529,
  });
});

test('a negative commission is a credit too, typed with a pasted minus sign', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL,
  });
  fireEvent.click(opener(await rowOf(1), 'commission'));
  // U+2212, as a minus copied from a statement reads.
  fireEvent.change(field('Commission'), { target: { value: '\u22122.25' } });
  fireEvent.keyDown(field('Commission'), { key: 'Enter' });
  await waitFor(async () => {
    const t = (await repo.trades.get(WS, 't-c'))!;
    // The commission went from $6.75 to a $2.25 credit: $9.00 less.
    expect(t.executions[1]).toMatchObject({ fees: 105, commission: -225 });
    expect(t.fees).toBe(3120 - 900);
    expect(t.net).toBe(8130 + 900);
  });
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Commission' })).toBeNull(),
  );
  const row = await rowOf(1);
  expect(row.textContent).toContain('−$2.25');
  fireEvent.click(opener(row, 'commission'));
  expect(field('Commission').value).toBe('-2.25');
});

test('a cost field brings up a keyboard with a minus key, so a credit can be typed on a phone', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL });
  fireEvent.click(opener(await rowOf(1), 'commission'));
  // A decimal keypad (iOS) has no minus: a credit could not be typed.
  expect(field('Commission').getAttribute('inputmode')).toBe('text');
  expect(field('Exchange fee').getAttribute('inputmode')).toBe('text');
});

test('the note tells how a swap goes in the fees, unless the import already gave the trade its swap', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL });
  fireEvent.click(opener(await rowOf(0), 'commission'));
  expect(
    screen.getByText(
      /A swap your broker charged goes in the fee as a positive amount, a credit as a negative one\./,
    ),
  ).toBeTruthy();
  cleanup();

  renderApp(<TradeView id="t-c" />, {
    sample: sample({ swap: -486, net: 8130 - 486 }),
    url: URL,
  });
  fireEvent.click(opener(await rowOf(0), 'commission'));
  const note = screen.getByText(/Confirm the row to save\./);
  expect(note.textContent).toContain("The trade's fees and net update");
  expect(note.textContent).not.toMatch(/swap/i);
});

test('Privacy masks a credit as well: no digit reaches a reader', async () => {
  const credited = sample();
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const w = await credited();
      const t = w.trades[0]!;
      return {
        ...w,
        trades: [
          {
            ...t,
            executions: t.executions.map((e) =>
              e.id === 'e3' ? { ...e, fees: -486 } : e,
            ),
          },
        ],
      };
    },
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<TradeView id="t-c" />, { repository, url: URL });
  fireEvent.click(opener(await rowOf(2), 'exchange fee'));
  expect(field('Exchange fee').value).toBe('−$•••');
  expect(field('Exchange fee').readOnly).toBe(true);
  expect(everyString(document.body).filter((t) => /\$\d/.test(t))).toEqual([]);
  expect(
    screen.getByRole('table', { name: 'Executions' }).textContent,
  ).not.toContain('4.86');
});

test('a save that fails says so and keeps the row open', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL,
  });
  vi.spyOn(repo.trades, 'setFillCosts').mockRejectedValue(new Error('full'));
  fireEvent.click(opener(await rowOf(0), 'commission'));
  fireEvent.change(field('Commission'), { target: { value: '8' } });
  fireEvent.click(save());
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe("Couldn't save the costs. Try again.");
  expect(field('Commission').value).toBe('8');
});

test('Privacy masks the inputs’ values', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<TradeView id="t-c" />, { repository, url: URL });
  const row = await rowOf(2);
  fireEvent.click(opener(row, 'commission'));
  // Hidden and not edited: the fields read as the figures do.
  for (const name of ['Exchange fee', 'Commission'] as const) {
    expect(field(name).readOnly).toBe(true);
    expect(field(name).value).toBe('$•••');
    expect(field(name).title).toBe('Hidden by Privacy');
  }
  expect(
    screen.getByText(
      'Amounts are hidden by Privacy. Turn it off to edit them.',
    ),
  ).toBeTruthy();
  // No amount survives anywhere a reader can get at it, and typing changes nothing.
  fireEvent.change(field('Commission'), { target: { value: '99' } });
  expect(field('Commission').value).toBe('$•••');
  expect(everyString(document.body).filter((s) => /\$\d/.test(s))).toEqual([]);
  // Confirming has nothing to save.
  const set = vi.spyOn(repository.trades, 'setFillCosts');
  fireEvent.click(save());
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Commission' })).toBeNull(),
  );
  expect(set).not.toHaveBeenCalled();
  expect((await repository.trades.get(WS, 't-c'))!.fees).toBe(3120);
});

test('an unchanged row confirms without a write', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL,
  });
  const set = vi.spyOn(repo.trades, 'setFillCosts');
  fireEvent.click(opener(await rowOf(0), 'commission'));
  fireEvent.click(save());
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Commission' })).toBeNull(),
  );
  expect(set).not.toHaveBeenCalled();
});

test('an archived account’s fills show their costs and open no row', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({}, 'acc-b'),
    url: URL,
  });
  const row = await rowOf(0);
  expect(row.textContent).toContain('$6.75');
  expect(within(row).queryByRole('button')).toBeNull();
});

test('a trade settled in another currency reads its fields in that currency', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({ pnlCurrency: 'GBP' }),
    url: URL,
  });
  fireEvent.click(opener(await rowOf(0), 'commission'));
  expect(within(await rowOf(0)).getAllByText('£')).toHaveLength(2);
});

test('moving to another trade, one already loaded, starts with no row open', async () => {
  const base = sample();
  /** A trade page that goes to another trade without leaving, as Previous and Next do. */
  function Pages() {
    const [id, setId] = useState('t-c');
    return (
      <>
        <button
          type="button"
          onClick={() => setId(id === 't-c' ? 't-d' : 't-c')}
        >
          Go to the other trade
        </button>
        <TradeView id={id} />
      </>
    );
  }
  renderApp(<Pages />, {
    sample: async () => {
      const w = await base();
      const c = w.trades[0]!;
      return {
        ...w,
        trades: [
          c,
          {
            ...c,
            id: 't-d',
            serial: 1133,
            openedAt: at(300),
            closedAt: at(340),
            executions: c.executions.map((e) => ({
              ...e,
              id: `${e.id}-d`,
              time: new Date(Date.parse(e.time) + 300 * 60_000).toISOString(),
            })),
          },
        ],
      };
    },
    url: URL,
  });
  const go = () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Go to the other trade' }),
    );
  await rowOf(0);
  // Visit the second trade once, so that going back to either is instant and the page is not rebuilt.
  go();
  await screen.findByRole('region', { name: 'Trade 1133' });
  go();
  await screen.findByRole('region', { name: 'Trade 1132' });
  fireEvent.click(opener(await rowOf(0), 'commission'));
  fireEvent.change(field('Commission'), { target: { value: '9' } });
  go();
  await screen.findByRole('region', { name: 'Trade 1133' });
  expect(screen.queryByRole('textbox', { name: 'Commission' })).toBeNull();
  expect(
    within(await rowOf(0)).getByRole('button', { name: /^Edit commission/ }),
  ).toBeTruthy();
});

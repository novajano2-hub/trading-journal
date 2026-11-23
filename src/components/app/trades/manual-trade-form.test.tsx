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
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import { resolveInstrument } from '@/domain/instruments';
import { buildManualTrade } from '@/domain/manual-trade';
import { renderApp } from '../__fixtures__/render-app';
import { ManualTradeForm } from './manual-trade-form';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const WS = fixtureSample().trades[0]!.workspaceId;

/** The sample, with acc-a read in New York time, and optionally a manual ES trade tagged `tag-setup`. */
function sample(withManual = false) {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    fx.accounts = fx.accounts.map((a) =>
      a.id === 'acc-a' ? { ...a, timeZone: 'America/New_York' } : a,
    );
    if (withManual) {
      const built = buildManualTrade(
        {
          accountId: 'acc-a',
          instrument: resolveInstrument('ESZ6')!,
          fills: [
            {
              time: '2026-11-19T14:30:00.000Z',
              side: 'buy',
              qty: 2,
              price: 5000,
              commission: 0,
              fees: 0,
            },
            {
              time: '2026-11-19T15:00:00.000Z',
              side: 'sell',
              qty: 2,
              price: 5010,
              commission: 0,
              fees: 0,
            },
          ],
        },
        { workspaceId: WS, serial: 900, accountCurrency: 'USD', id: 'man-1' },
      );
      if (!built.ok) throw new Error('fixture');
      fx.trades = [
        ...fx.trades,
        { ...built.trade, tagIds: ['tag-setup'], rating: 3 },
      ];
    }
    return fx;
  };
}

function set(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}
function setDate(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}

async function fillFuture() {
  await screen.findByText(/^Times in New York, UTC-0[45]:00$/);
  set('Asset type', 'future');
  set('Symbol', 'ESZ6');
  setDate('Fill 1 date', '2026-11-19');
  setDate('Fill 1 time', '09:30');
  set('Fill 1 quantity', '1');
  set('Fill 1 price', '5000');
}
function addExit(qty: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add fill' }));
  setDate('Fill 2 date', '2026-11-19');
  setDate('Fill 2 time', '10:00');
  set('Fill 2 side', 'sell');
  set('Fill 2 quantity', qty);
  set('Fill 2 price', '5010');
}

test('a fill typed in the account zone is stored in UTC, and saving goes to the trade page', async () => {
  const { repo } = renderApp(<ManualTradeForm />, {
    sample: sample(),
    url: '/app/trades/new',
  });
  await fillFuture();
  addExit('1');
  fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
  await waitFor(() =>
    expect(window.location.pathname).toMatch(/^\/app\/trades\/manual%3A/),
  );
  const made = (await repo.trades.list(WS)).find((t) => t.source === 'manual')!;
  expect(made.executions[0]!.time).toBe('2026-11-19T14:30:00.000Z');
  expect(made.executions[1]!.time).toBe('2026-11-19T15:00:00.000Z');
  expect(made).toMatchObject({ status: 'closed', gross: 50000 });
  expect(decodeURIComponent(window.location.pathname)).toBe(
    `/app/trades/${made.id}`,
  );
});

test('a reversal shows its sentence at the fills and creates nothing', async () => {
  const { repo } = renderApp(<ManualTradeForm />, {
    sample: sample(),
    url: '/app/trades/new',
  });
  await fillFuture();
  addExit('3');
  const before = (await repo.trades.list(WS)).length;
  fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
  const msg = await screen.findByText(
    'These fills reverse the position. Split them into two trades.',
  );
  expect(msg.id).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: 'Add fill' })
      .getAttribute('aria-describedby'),
  ).toContain(msg.id);
  expect((await repo.trades.list(WS)).length).toBe(before);
  expect(window.location.pathname).toBe('/app/trades/new');
});

test('errors sit at the field, with focus on the first', async () => {
  renderApp(<ManualTradeForm />, { sample: sample(), url: '/app/trades/new' });
  await fillFuture();
  // An unlisted root needs its multiplier.
  set('Symbol', 'ZZZ6');
  addExit('1');
  fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
  const multiplier = await screen.findByRole('textbox', { name: 'Multiplier' });
  const msg = await screen.findByText('Enter the contract multiplier for ZZ.');
  expect(multiplier.getAttribute('aria-describedby')).toContain(msg.id);
  expect(multiplier.getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(multiplier);

  // A bad fill names its row.
  set('Multiplier', '25');
  set('Fill 2 quantity', '0');
  fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
  const row = await screen.findByText(
    'Check fill 2: quantity and price must be above zero.',
  );
  expect(
    screen.getByLabelText('Fill 2 quantity').getAttribute('aria-describedby'),
  ).toContain(row.id);
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByLabelText('Fill 2 quantity'),
    ),
  );
});

test('no fills, and the option fields, are refused in place', async () => {
  renderApp(<ManualTradeForm />, { sample: sample(), url: '/app/trades/new' });
  await screen.findByText(/^Times in New York, UTC-0[45]:00$/);
  set('Asset type', 'option');
  set('Symbol', 'AAPL');
  fireEvent.click(screen.getByRole('button', { name: 'Remove fill 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
  expect(await screen.findByText('Add at least one fill.')).toBeTruthy();
  expect(
    screen.getByText('Enter the strike, expiry and call or put.'),
  ).toBeTruthy();
  // Multiplier defaults to 100 for an option.
  expect(
    (screen.getByRole('textbox', { name: 'Multiplier' }) as HTMLInputElement)
      .value,
  ).toBe('100');
});

test('each type shows its own fields', async () => {
  renderApp(<ManualTradeForm />, { sample: sample(), url: '/app/trades/new' });
  await screen.findByText(/^Times in New York, UTC-0[45]:00$/);
  expect(screen.queryByRole('textbox', { name: 'Strike' })).toBeNull();
  set('Asset type', 'future-option');
  for (const n of ['Strike', 'Multiplier', 'Tick size'])
    expect(screen.getByRole('textbox', { name: n })).toBeTruthy();
  expect(screen.getByLabelText('Expiry')).toBeTruthy();
  set('Asset type', 'forex');
  expect(screen.queryByRole('textbox', { name: 'Strike' })).toBeNull();
  expect(screen.getByLabelText('Fill 1 quantity')).toBeTruthy();
  expect(screen.getAllByText('Lots').length).toBeGreaterThan(0);
});

test('editing a manual trade keeps its tags and rating, and rebuilds the fills', async () => {
  const { repo } = renderApp(<ManualTradeForm tradeId="man-1" />, {
    sample: sample(true),
    url: '/app/trades/man-1/edit',
  });
  await screen.findByText(/^Times in New York, UTC-0[45]:00$/);
  // The fills come back in the account's zone.
  expect((screen.getByLabelText('Fill 1 time') as HTMLInputElement).value).toBe(
    '09:30',
  );
  expect((screen.getByLabelText('Fill 1 date') as HTMLInputElement).value).toBe(
    '2026-11-19',
  );
  set('Fill 2 quantity', '1');
  fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
  await waitFor(() =>
    expect(window.location.pathname).toBe('/app/trades/man-1'),
  );
  const t = (await repo.trades.get(WS, 'man-1'))!;
  expect(t).toMatchObject({
    status: 'open',
    tagIds: ['tag-setup'],
    rating: 3,
    serial: 900,
    source: 'manual',
  });
});

test('an imported trade cannot be edited here', async () => {
  renderApp(<ManualTradeForm tradeId="f-1" />, {
    sample: sample(),
    url: '/app/trades/f-1/edit',
  });
  const note = await screen.findByText(/only trades you entered by hand/i);
  expect(
    within(note.closest('div')!.parentElement!).getByRole('link', {
      name: 'Back to trade',
    }),
  ).toBeTruthy();
});

test('the links back to a trade encode an id that holds a slash', async () => {
  const renamed =
    (withManual: boolean, from: string) =>
    async (): Promise<SampleWorkspace> => {
      const w = await sample(withManual)();
      return {
        ...w,
        trades: w.trades.map((t) =>
          t.id === from ? { ...t, id: 'acc:EUR/USD:x' } : t,
        ),
      };
    };
  renderApp(<ManualTradeForm tradeId="acc:EUR/USD:x" />, {
    sample: renamed(false, 'f-1'),
    url: '/app/trades/x/edit',
  });
  const back = await screen.findByRole('link', { name: 'Back to trade' });
  expect(back.getAttribute('href')).toBe('/app/trades/acc%3AEUR%2FUSD%3Ax');
  cleanup();
  renderApp(<ManualTradeForm tradeId="acc:EUR/USD:x" />, {
    sample: renamed(true, 'man-1'),
    url: '/app/trades/x/edit',
  });
  await screen.findByText(/^Times in New York, UTC-0[45]:00$/);
  for (const cancel of screen.getAllByRole('link', { name: /Cancel|Back/ }))
    expect(cancel.getAttribute('href')).toBe('/app/trades/acc%3AEUR%2FUSD%3Ax');
});

test('a negative commission or fee is refused at its fill, not flipped', async () => {
  const { repo } = renderApp(<ManualTradeForm />, {
    sample: sample(),
    url: '/app/trades/new',
  });
  await fillFuture();
  addExit('1');
  const before = (await repo.trades.list(WS)).length;
  for (const field of ['commission', 'fees']) {
    set(`Fill 1 ${field}`, '-1.5');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    const msg = await screen.findByText('Enter fees as a positive amount.');
    expect(
      screen.getByLabelText(`Fill 1 ${field}`).getAttribute('aria-describedby'),
    ).toContain(msg.id);
    expect((await repo.trades.list(WS)).length).toBe(before);
    set(`Fill 1 ${field}`, '');
  }
  expect(window.location.pathname).toBe('/app/trades/new');
});

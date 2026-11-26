// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { DataProvider } from '@/data/query/provider';
import type { SampleWorkspace } from '@/data/seed/generate';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import type { Trade } from '@/domain/types';
import { QueryClient } from '@tanstack/react-query';
import { everyString } from '../__fixtures__/every-string';
import { renderApp } from '../__fixtures__/render-app';
import { STAT_IDS, TradeView } from './trade-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

const WS = fixtureSample().trades[0]!.workspaceId;
const URL_C = '/app/trades/t-c';

/** Two trades: C (ES, with two target levels and a stop, the one under test) and D. */
function sample(patch: Partial<Trade> = {}, accountId = 'acc-a') {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    const at = (n: number) =>
      new Date(Date.UTC(2026, 10, 9, 14, 0) + n * 3_600_000).toISOString();
    const mk = (id: string, serial: number, n: number, p: Partial<Trade>) =>
      makeTrade({
        id,
        serial,
        workspaceId: WS,
        accountId,
        openedAt: at(n),
        closedAt: at(n + 0.5),
        net: 8130,
        fees: 3120,
        gross: 11250,
        avgEntry: 6309.75,
        avgExit: 6313.5,
        maxPosition: 6,
        ...p,
      });
    return {
      ...fx,
      trades: [
        mk('t-c', 1132, 2, {
          targets: {
            unit: 'price',
            levels: [
              { value: 6314, qty: 3 },
              { value: 6316, qty: 3 },
            ],
          },
          ...patch,
        }),
        mk('t-d', 1133, 3, {}),
      ],
    };
  };
}

// The open dialog hides the page from the accessibility tree, so look past that.
const exec = () =>
  screen.getByRole('region', { name: 'Execution', hidden: true });
const text = () => exec().textContent ?? '';

async function openChooser() {
  fireEvent.click(await screen.findByRole('button', { name: 'Choose stats' }));
  return screen.findByRole('dialog', { name: 'Choose stats' });
}

const FUTURES_LABELS = [
  'Avg entry',
  'Avg exit',
  'Quantity',
  'Duration',
  'Gross P&L',
  'Fees',
  'Swap',
  'Cost basis',
  'Planned R',
  'Realized R',
  'Planned reward',
  'Planned risk',
  'MAE',
  'MFE',
  'Points',
  'Ticks',
  'Contracts',
];

test('every row is on by default', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL_C });
  await screen.findByRole('region', { name: 'Execution' });
  for (const label of FUTURES_LABELS) expect(text()).toContain(label);
  expect(screen.getByRole('group', { name: 'Targets' })).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Stops' })).toBeTruthy();

  const d = await openChooser();
  const boxes = within(d).getAllByRole('checkbox') as HTMLInputElement[];
  // The 17 cells above and the two level blocks.
  expect(boxes).toHaveLength(19);
  expect(boxes.every((b) => b.checked)).toBe(true);
  // The header figures are not in the list; they always show.
  for (const header of ['Net P&L', 'Net ROI'])
    expect(within(d).queryByRole('checkbox', { name: header })).toBeNull();
  const head = screen.getByRole('region', {
    name: 'Trade 1132',
    hidden: true,
  });
  expect(head.textContent).toContain('Net P&L');
  expect(head.textContent).toContain('Realized R');
});

test('STAT_IDS lists the rows in the order the page draws them, with Swap after Fees', () => {
  expect(STAT_IDS.indexOf('swap')).toBe(STAT_IDS.indexOf('fees') + 1);
  expect(new Set(STAT_IDS).size).toBe(STAT_IDS.length);
  expect(STAT_IDS.slice(0, 8)).toEqual([
    'avg-entry',
    'avg-exit',
    'quantity',
    'duration',
    'gross-pnl',
    'fees',
    'swap',
    'cost-basis',
  ]);
});

test('each row of the chooser shows the value the page shows', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({ swap: -486, mae: -2079 }),
    url: URL_C,
  });
  const d = await openChooser();
  const t = d.textContent ?? '';
  expect(t).toContain('Avg entry6,309.75');
  expect(t).toContain('Fees−$31.20');
  expect(t).toContain('Swap−$4.86');
  expect(t).toContain('Targets2 levels');
  expect(t).toContain('StopsNone');
  expect(t).toContain('MAE−$20.79');
  expect(t).toContain('MFENot recorded');
  expect(t).toContain('Contracts6');
});

test('unticking hides the row and saves per user', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample({ swap: -486 }),
    url: URL_C,
  });
  await screen.findByRole('region', { name: 'Execution' });
  const d = await openChooser();
  fireEvent.click(within(d).getByRole('checkbox', { name: 'Swap' }));
  fireEvent.click(within(d).getByRole('checkbox', { name: 'MAE' }));
  fireEvent.click(within(d).getByRole('checkbox', { name: 'Targets' }));
  // Nothing moves until Save.
  expect(text()).toContain('Swap');
  fireEvent.click(within(d).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  expect(text()).not.toContain('Swap');
  expect(text()).not.toContain('MAE');
  expect(text()).toContain('MFE');
  expect(text()).toContain('Fees');
  expect(screen.queryByRole('group', { name: 'Targets' })).toBeNull();
  expect(screen.getByRole('group', { name: 'Stops' })).toBeTruthy();

  const saved = (await repo.prefs.get()).tradeStats;
  expect(saved).toEqual(
    STAT_IDS.filter((id) => !['swap', 'mae', 'targets'].includes(id)),
  );
  expect(saved).toHaveLength(STAT_IDS.length - 3);

  // Per user: another trade in the same browser lists the same rows.
  cleanup();
  const again = render(
    <DataProvider
      repository={repo}
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false, staleTime: Infinity } },
        })
      }
    >
      <TradeView id="t-d" />
    </DataProvider>,
  );
  await screen.findByRole('region', { name: 'Trade 1133' });
  expect(text()).not.toContain('Swap');
  expect(text()).toContain('Fees');
  again.unmount();
});

test('a row hidden here is still ticked in the chooser of a trade that lacks it', async () => {
  // A forex trade has no Points, Ticks or Contracts: saving from it keeps them on.
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample({
      instrument: resolveInstrument('EURUSD')!,
      avgEntry: 1.1,
      avgExit: 1.1025,
      maxPosition: 1,
      gross: 5000,
      executions: [],
    }),
    url: URL_C,
  });
  const d = await openChooser();
  expect(within(d).queryByRole('checkbox', { name: 'Points' })).toBeNull();
  expect(within(d).getByRole('checkbox', { name: 'Pips' })).toBeTruthy();
  fireEvent.click(within(d).getByRole('checkbox', { name: 'Swap' }));
  fireEvent.click(within(d).getByRole('button', { name: 'Save' }));
  await waitFor(async () =>
    expect((await repo.prefs.get()).tradeStats).toBeDefined(),
  );
  const saved = (await repo.prefs.get()).tradeStats!;
  for (const id of ['points', 'ticks', 'contracts'])
    expect(saved).toContain(id);
  expect(saved).not.toContain('swap');
});

test('Reset to default clears the pref', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  await repository.prefs.update({ tradeStats: ['fees', 'mfe'] });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  await screen.findByRole('region', { name: 'Execution' });
  // Only the chosen cells show.
  expect(text()).toContain('Fees');
  expect(text()).toContain('MFE');
  expect(text()).not.toContain('Avg entry');
  const d = await openChooser();
  expect(
    (within(d).getAllByRole('checkbox') as HTMLInputElement[]).filter(
      (b) => b.checked,
    ),
  ).toHaveLength(2);
  fireEvent.click(within(d).getByRole('button', { name: 'Reset to default' }));
  fireEvent.click(within(d).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const prefs = await repository.prefs.get();
  expect(prefs.tradeStats).toBeUndefined();
  expect('tradeStats' in prefs).toBe(false);
  // Every row is back.
  for (const label of FUTURES_LABELS) expect(text()).toContain(label);
});

test('a hidden row leaves no hole: the cells that stay fill whole rows', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  await repository.prefs.update({
    tradeStats: ['avg-entry', 'avg-exit', 'fees', 'mae'],
  });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  await screen.findByRole('region', { name: 'Execution' });
  const cell = screen.getByText('Avg entry').closest('div')!;
  const grid = cell.parentElement!;
  // Three cells and a blank one, so the hairlines show no empty box.
  expect(grid.children).toHaveLength(4);
  expect(grid.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  // The plan block is gone, with its heading and its entry rule.
  expect(screen.queryByRole('group', { name: 'Plan' })).toBeNull();
  expect(screen.queryByText(/^Avg entry 6,309.75/)).toBeNull();
});

test('only the plan figures that stay are drawn, and the entry rule needs both sides', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  await repository.prefs.update({ tradeStats: ['targets', 'planned-reward'] });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  await screen.findByRole('region', { name: 'Execution' });
  expect(screen.getByRole('group', { name: 'Plan' })).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Targets' })).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Stops' })).toBeNull();
  expect(text()).toContain('Planned reward');
  expect(text()).not.toContain('Planned risk');
  expect(text()).not.toContain('Planned R');
  expect(text()).not.toContain('Avg entry');
});

test('with every row off the card says so, and the header figures still show', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  await repository.prefs.update({ tradeStats: [] });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  await screen.findByRole('region', { name: 'Execution' });
  expect(text()).toContain('No stats to show.');
  expect(text()).not.toContain('Gross P&L');
  expect(
    screen.getByRole('region', { name: 'Trade 1132' }).textContent,
  ).toContain('+$81.30');
  // Choose stats is still there to bring them back.
  const d = await openChooser();
  expect(
    (within(d).getAllByRole('checkbox') as HTMLInputElement[]).some(
      (b) => b.checked,
    ),
  ).toBe(false);
});

test('a failed save leaves the card as it was and says so in the dialog', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL_C,
  });
  await screen.findByRole('region', { name: 'Execution' });
  vi.spyOn(repo.prefs, 'update').mockRejectedValue(new Error('storage'));
  const d = await openChooser();
  fireEvent.click(within(d).getByRole('checkbox', { name: 'Fees' }));
  fireEvent.click(within(d).getByRole('button', { name: 'Save' }));
  const alert = await within(d).findByRole('alert');
  expect(alert.textContent).toContain("Couldn't save");
  expect(text()).toContain('Fees');
});

test('Privacy masks the chooser values', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample({ swap: -486, mae: -2079 }),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  const d = await openChooser();
  expect(d.textContent).toContain('Fees−$•••');
  expect(d.textContent).toContain('Swap−$•••');
  expect(everyString(d).filter((s) => /\$\d/.test(s))).toEqual([]);
});

test('an archived account can still choose its stats (the choice is the reader’s own)', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample({}, 'acc-b'),
    url: URL_C,
  });
  await screen.findByText(
    'This account is archived. Its trades are read-only.',
  );
  const d = await openChooser();
  fireEvent.click(within(d).getByRole('checkbox', { name: 'Cost basis' }));
  fireEvent.click(within(d).getByRole('button', { name: 'Save' }));
  await waitFor(async () =>
    expect((await repo.prefs.get()).tradeStats).toBeDefined(),
  );
  await waitFor(() => expect(text()).not.toContain('Cost basis'));
});

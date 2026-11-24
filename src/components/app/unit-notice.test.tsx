// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { EMPTY_FILTERS } from '@/data/filters';
import { useTradeSet } from '@/data/query/derived';
import { createLocalRepository } from '@/data/local/local-repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import type { DisplayUnit } from '@/domain/types';
import { renderApp } from './__fixtures__/render-app';
import { UnitNotice } from './unit-notice';

vi.mock('next/navigation', () => import('./__fixtures__/navigation'));

afterEach(cleanup);

/** The fixture's two ES trades, plus a forex trade on the same account. */
const sample = async () => {
  const base = fixtureSample();
  return {
    ...base,
    trades: [
      ...base.trades,
      makeTrade({
        id: 'fx-1',
        serial: 4,
        workspaceId: SAMPLE_WORKSPACE.id,
        accountId: 'acc-a',
        instrument: resolveInstrument('EURUSD')!,
        openedAt: '2026-11-18T09:00:00Z',
        closedAt: '2026-11-18T10:00:00Z',
        avgEntry: 1.07483,
        avgExit: 1.07688,
        net: 20_500,
      }),
    ],
  };
};

async function inUnit(displayUnit: DisplayUnit, url = '/app/dashboard') {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample,
  });
  await repository.prefs.update({ displayUnit });
  return renderApp(<UnitNotice />, { repository, url });
}

test('a narrowed page says in one line how many trades the unit leaves out', async () => {
  await inUnit('ticks');
  expect(
    await screen.findByText(
      'Ticks counts futures trades only, so 1 trade is left out.',
    ),
  ).toBeTruthy();
});

test.each([
  ['pips', 'Pips counts forex trades only, so 2 trades are left out.'],
  ['points', 'Points counts futures trades only, so 1 trade is left out.'],
  ['r', 'R-multiple counts trades with a stop only, so 3 trades are left out.'],
] as const)('under %s it reads %j', async (unit, line) => {
  await inUnit(unit);
  expect(await screen.findByText(line)).toBeTruthy();
});

test('its control goes back to Dollar, and the line goes', async () => {
  const { repo } = await inUnit('pips');
  fireEvent.click(
    await screen.findByRole('button', { name: 'Switch to Dollar' }),
  );
  await waitFor(async () =>
    expect((await repo.prefs.get()).displayUnit).toBe('dollar'),
  );
  await waitFor(() => expect(screen.queryByText(/left out/)).toBeNull());
});

test('nothing shows when the unit keeps every trade', async () => {
  await inUnit('dollar');
  // The region appears once the trade set has loaded, so the line had its chance.
  await screen.findByTestId('unit-notice');
  expect(screen.queryByText(/left out/)).toBeNull();
});

test('a page the filters do not drive shows no line, though its unit leaves trades out', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample,
  });
  await repository.prefs.update({ displayUnit: 'pips' });
  renderApp(
    <>
      <UnitNotice />
      <Loaded />
    </>,
    { repository, url: '/app/strategies' },
  );
  // Once the trade set has loaded (2 trades left out), a filtered page
  // would show the line: this one shows no region at all.
  expect((await screen.findByTestId('loaded')).textContent).toBe('2');
  expect(screen.queryByTestId('unit-notice')).toBeNull();
  expect(screen.queryByText(/left out/)).toBeNull();
});

/** The trade set the notice reads, once it has loaded: its left-out count. */
function Loaded(): React.JSX.Element | null {
  const set = useTradeSet(EMPTY_FILTERS);
  return set.data ? (
    <span data-testid="loaded">{set.data.unitLeftOut}</span>
  ) : null;
}

test('a unit that leaves nothing out says nothing', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repository.prefs.update({ displayUnit: 'ticks' });
  renderApp(<UnitNotice />, { repository });
  // The region appears once the trade set has loaded.
  await screen.findByTestId('unit-notice');
  expect(screen.queryByText(/left out/)).toBeNull();
});

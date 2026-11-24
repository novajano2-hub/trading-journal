// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
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

test('nothing shows when the unit keeps every trade, or the page does not read the filters', async () => {
  await inUnit('dollar');
  // The fixture loads; a narrowed page would have spoken by now.
  await screen.findByTestId('unit-notice');
  expect(screen.queryByText(/left out/)).toBeNull();
  cleanup();
  await inUnit('pips', '/app/strategies');
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText(/left out/)).toBeNull();
});

test('a unit that leaves nothing out says nothing', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repository.prefs.update({ displayUnit: 'ticks' });
  renderApp(<UnitNotice />, { repository });
  await screen.findByTestId('unit-notice');
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText(/left out/)).toBeNull();
});

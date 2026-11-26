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
import { useRef, useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { createLocalRepository } from '@/data/local/local-repository';
import { usePropFinance } from '@/data/query/derived';
import { PayoutRefusedError, type Repository } from '@/data/repository';
import {
  generateSampleWorkspace,
  SAMPLE_SEED,
  type SampleWorkspace,
} from '@/data/seed/generate';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import type { Challenge } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { LogPayout } from './log-payout';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const WS = SAMPLE_WORKSPACE.id;
const sample: SampleWorkspace = generateSampleWorkspace({
  seed: SAMPLE_SEED,
  endDate: '2026-11-19',
});
const FUTURES_50K = 'sample-challenge-futures-50k';

function repo(extra: (s: SampleWorkspace) => void = () => {}): Repository {
  const s = structuredClone(sample);
  extra(s);
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => s,
  });
}

const funded = (id: string, name: string, over: Partial<Challenge> = {}) =>
  ({
    id,
    workspaceId: WS,
    name,
    firm: 'Sample firm B',
    steps: 1,
    phases: [{ step: 'step-1' }, { step: 'funded' }],
    phase: 'funded',
    status: 'active',
    ...over,
  }) satisfies Challenge;

/** The button that opens the dialog, as the tabs' header has it. */
function Harness({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const origin = useRef<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          origin.current = e.currentTarget;
          setOpen(true);
        }}
      >
        Log payout
      </button>
      <Earned />
      {open ? (
        <LogPayout
          origin={origin}
          returnFocus={origin}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function Earned() {
  const f = usePropFinance({});
  return (
    <output aria-label="Total earned">
      {f.data ? f.data.totals.earned : 'loading'}
    </output>
  );
}

const open = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Log payout' }));
  return screen.findByRole('dialog', { name: 'Log a payout' });
};

test('Log a payout asks for the funded account, the amount and the date received, and says it counts at once', async () => {
  renderApp(<Harness />, { repository: repo() });
  const dialog = await open();
  expect(dialog.textContent).toContain('It counts in total earned at once.');
  expect(within(dialog).getByLabelText('Funded account')).toBeTruthy();
  expect(within(dialog).getByLabelText('Amount')).toBeTruthy();
  expect(within(dialog).getByLabelText('Date received')).toBeTruthy();
  expect(
    within(dialog).getByRole('button', { name: 'Add payout' }),
  ).toBeTruthy();
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  // The amount is what is typed first: the cursor is there, not on Close.
  expect(document.activeElement).toBe(within(dialog).getByLabelText('Amount'));
});

test('the select lists only funded challenges that have not breached, by name and firm', async () => {
  const r = repo((s) => {
    s.challenges.push(
      funded('c-b-funded', 'Futures 150K', { firm: 'Sample firm B' }),
      funded('c-breached', 'Futures 25K', { status: 'breached' }),
      funded('c-passed', 'Waiting', { phase: 'evaluation', status: 'passed' }),
    );
  });
  renderApp(<Harness />, { repository: r });
  const dialog = await open();
  const select = within(dialog).getByLabelText(
    'Funded account',
  ) as HTMLSelectElement;
  // The sample's evaluation (Forex 100K) and breached (Futures 100K) are not here either.
  expect([...select.options].map((o) => o.textContent)).toEqual([
    'Futures 150K, Sample firm B',
    'Futures 50K, Sample prop firm',
  ]);
  // The first is chosen.
  expect(select.value).toBe('c-b-funded');
});

test('with no funded challenge it says so and links to Accounts; nothing can be added', async () => {
  const r = repo((s) => {
    s.challenges = s.challenges.filter((c) => c.phase !== 'funded');
  });
  renderApp(<Harness />, { repository: r });
  const dialog = await open();
  expect(dialog.textContent).toContain('No challenge is funded yet.');
  const link = within(dialog).getByRole('link', { name: 'Go to Accounts' });
  expect(link.getAttribute('href')).toBe('/app/prop-firms/accounts');
  expect(
    within(dialog).queryByRole('button', { name: 'Add payout' }),
  ).toBeNull();
  expect(within(dialog).queryByLabelText('Amount')).toBeNull();
  // It can still be dismissed.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Add payout logs a positive payout on the challenge, dated as typed, and it counts in total earned at once', async () => {
  const r = repo();
  await r.prefs.update({ timeZone: 'America/New_York' });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
  renderApp(<Harness />, { repository: r });
  await waitFor(() =>
    expect(screen.getByLabelText('Total earned').textContent).toBe('450000'),
  );
  const dialog = await open();
  // The date received starts as today.
  const date = within(dialog).getByLabelText(
    'Date received',
  ) as HTMLInputElement;
  expect(date.value).toBe('2026-11-25');
  fireEvent.change(within(dialog).getByLabelText('Amount'), {
    target: { value: '1,500.00' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add payout' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const payout = (await r.propTxns.list(WS)).find(
    (t) => t.date === '2026-11-25',
  )!;
  expect(payout).toMatchObject({
    challengeId: FUTURES_50K,
    firm: 'Sample prop firm',
    category: 'payout',
    amount: 150_000,
    status: 'not-reviewed',
    description: 'Payout',
  });
  // It counts at once, and it wrote no withdrawal.
  await waitFor(() =>
    expect(screen.getByLabelText('Total earned').textContent).toBe('600000'),
  );
  // Focus is back on the button that opened the dialog.
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Log payout' }),
  );
});

test('the date received can be another day', async () => {
  const r = repo();
  renderApp(<Harness />, { repository: r });
  const dialog = await open();
  fireEvent.change(within(dialog).getByLabelText('Date received'), {
    target: { value: '2026-11-12' },
  });
  fireEvent.change(within(dialog).getByLabelText('Amount'), {
    target: { value: '250.5' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add payout' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    (await r.propTxns.list(WS)).find((t) => t.date === '2026-11-12'),
  ).toMatchObject({ amount: 25_050, category: 'payout' });
});

test('a payout is a positive amount: zero, negative and words are refused, and nothing is written', async () => {
  const r = repo();
  renderApp(<Harness />, { repository: r });
  const dialog = await open();
  const amount = within(dialog).getByLabelText('Amount');
  for (const bad of ['', '0', '-100', '−100', 'abc']) {
    fireEvent.change(amount, { target: { value: bad } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add payout' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Enter an amount above zero.',
    );
    expect(amount.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(amount);
  }
  fireEvent.change(amount, { target: { value: '100' } });
  fireEvent.change(within(dialog).getByLabelText('Date received'), {
    target: { value: '' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add payout' }));
  expect((await within(dialog).findByRole('alert')).textContent).toBe(
    'Pick the date it was received.',
  );
  expect(await r.propTxns.list(WS)).toHaveLength(9);
});

test('a challenge that has breached or left funded since the dialog opened is refused in plain words', async () => {
  const r = repo();
  const log = vi.spyOn(r.propTxns, 'logPayout');
  renderApp(<Harness />, { repository: r });
  const dialog = await open();
  fireEvent.change(within(dialog).getByLabelText('Amount'), {
    target: { value: '100' },
  });
  log.mockRejectedValueOnce(new PayoutRefusedError(FUTURES_50K, 'breached'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add payout' }));
  expect((await within(dialog).findByRole('alert')).textContent).toBe(
    "That challenge has breached, so a payout can't be logged on it.",
  );
  // The dialog stays, the amount stays.
  expect(
    (within(dialog).getByLabelText('Amount') as HTMLInputElement).value,
  ).toBe('100');
  log.mockRejectedValueOnce(new PayoutRefusedError(FUTURES_50K, 'not-funded'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add payout' }));
  await waitFor(() =>
    expect(within(dialog).getByRole('alert').textContent).toBe(
      "That challenge isn't in its funded phase, so a payout can't be logged on it.",
    ),
  );
  expect(await r.propTxns.list(WS)).toHaveLength(9);
});

test('any other failure says to try again and keeps the dialog', async () => {
  const r = repo();
  vi.spyOn(r.propTxns, 'logPayout').mockRejectedValue(new Error('disk full'));
  renderApp(<Harness />, { repository: r });
  const dialog = await open();
  fireEvent.change(within(dialog).getByLabelText('Amount'), {
    target: { value: '100' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add payout' }));
  expect((await within(dialog).findByRole('alert')).textContent).toBe(
    "Couldn't save that. Try again.",
  );
  expect(screen.getByRole('dialog', { name: 'Log a payout' })).toBeTruthy();
});

test('Escape and Cancel close it and hand focus back to the button; nothing is written', async () => {
  const r = repo();
  renderApp(<Harness />, { repository: r });
  const opener = await screen.findByRole('button', { name: 'Log payout' });
  const dialog = await open();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(opener);
  const again = await open();
  fireEvent.click(within(again).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(opener);
  expect(await r.propTxns.list(WS)).toHaveLength(9);
});

test('the amount carries the base currency’s symbol', async () => {
  const r = repo();
  await r.prefs.update({ baseCurrency: 'EUR' });
  renderApp(<Harness />, { repository: r });
  const dialog = await open();
  expect(dialog.querySelector('[data-currency]')?.textContent).toBe('€');
});

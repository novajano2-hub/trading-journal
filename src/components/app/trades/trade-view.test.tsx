// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { createLocalRepository } from '@/data/local/local-repository';
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { SampleWorkspace } from '@/data/seed/generate';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import type { Execution, Trade } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import type { NoteEditorHandle } from '../notes/note-editor';
import { TradeView } from './trade-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const WS = fixtureSample().trades[0]!.workspaceId;

function fill(
  id: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  time: string,
): Execution {
  return {
    id,
    accountId: 'acc-a',
    symbol: 'ESZ5',
    side,
    qty,
    price,
    time,
    fees: 105,
    commission: 675,
  };
}

/** Four trades, ten minutes apart: A (ES), B (NQ), C (ES, the one under test), D (ES). */
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
        ...p,
      });
    const c = mk('t-c', 1132, 2, {
      avgEntry: 6309.75,
      avgExit: 6313.5,
      maxPosition: 6,
      executions: [
        fill('e1', 'buy', 3, 6310.5, at(2)),
        fill('e2', 'buy', 3, 6309, at(2.1)),
        fill('e3', 'sell', 3, 6312.5, at(2.3)),
        fill('e4', 'sell', 3, 6314.5, at(2.5)),
      ],
      strategyIds: ['str-1'],
      ...patch,
    });
    return {
      ...fx,
      trades: [
        mk('t-a', 1130, 0, {}),
        mk('t-b', 1131, 1, { instrument: resolveInstrument('NQZ5')! }),
        c,
        mk('t-d', 1133, 3, {}),
      ],
    };
  };
}

/** A realized R figure such as +0.54R (the label "Realized R" does not match). */
const R_FIGURE = /^[+−]?\d+\.\d{2}R$/;
const URL_C = '/app/trades/t-c?symbol=ES';

test('the header shows the net and the realized R once a stop is known', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({ initialRisk: 15000 }),
    url: URL_C,
  });
  const head = await screen.findByRole('region', { name: 'Trade 1132' });
  expect(within(head).getByText('+$81.30')).toBeTruthy();
  expect(within(head).getByText('+0.54R')).toBeTruthy();
  expect(within(head).getByText('Long')).toBeTruthy();
  expect(within(head).getByText('Closed')).toBeTruthy();
});

test('Previous and Next stay within ?symbol=ES, by open time, and keep the params', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL_C });
  const next = await screen.findByRole('link', { name: /Next trade/ });
  expect(next.getAttribute('href')).toBe('/app/trades/t-d?symbol=ES');
  const prev = screen.getByRole('link', { name: /Previous trade/ });
  // t-b is an NQ trade: the filter skips it.
  expect(prev.getAttribute('href')).toBe('/app/trades/t-a?symbol=ES');
  expect(
    screen.getByRole('link', { name: /Back to trades/ }).getAttribute('href'),
  ).toBe('/app/trades?symbol=ES');
});

test('setting the planned stop saves it and the realized R follows', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL_C,
  });
  const head = await screen.findByRole('region', { name: 'Trade 1132' });
  expect(within(head).queryByText(R_FIGURE)).toBeNull();
  const stop = screen.getByRole('textbox', { name: 'Planned stop' });
  fireEvent.change(stop, { target: { value: '6304.75' } });
  fireEvent.blur(stop);
  await waitFor(async () =>
    expect((await repo.trades.get(WS, 't-c'))?.plannedStop).toBe(6304.75),
  );
  // The risk comes from riskFromStop.
  const saved = (await repo.trades.get(WS, 't-c'))!;
  expect(saved.initialRisk).toBeGreaterThan(0);
  await waitFor(() =>
    expect(within(head).getAllByText(R_FIGURE).length).toBe(1),
  );
});

test('marking a rule broken saves followed: false, for that rule only', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample({ ruleChecks: [{ ruleId: 'r-2', followed: true }] }),
    url: URL_C,
  });
  const rule = await screen.findByRole('group', {
    name: 'Wait for the 15-minute range to close',
  });
  expect(screen.getByRole('heading', { name: 'Entry' })).toBeTruthy();
  fireEvent.click(within(rule).getByRole('button', { name: 'Broken' }));
  await waitFor(async () =>
    expect((await repo.trades.get(WS, 't-c'))?.ruleChecks).toEqual([
      { ruleId: 'r-2', followed: true },
      { ruleId: 'r-1', followed: false },
    ]),
  );
  await waitFor(() =>
    expect(
      within(rule)
        .getByRole('button', { name: 'Broken' })
        .getAttribute('aria-pressed'),
    ).toBe('true'),
  );
  // Pressing it again leaves the rule not graded.
  fireEvent.click(within(rule).getByRole('button', { name: 'Broken' }));
  await waitFor(async () =>
    expect((await repo.trades.get(WS, 't-c'))?.ruleChecks).toEqual([
      { ruleId: 'r-2', followed: true },
    ]),
  );
});

test('a rule for losing trades stays out of a winner, and the page says so', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: async () => {
      const s = await sample()();
      s.strategies[0]!.groups[0]!.rules.push({
        id: 'r-3',
        text: 'No re-entry after two failed breaks',
        showWhen: 'loser',
      });
      return s;
    },
    url: URL_C,
  });
  await screen.findByRole('group', { name: /Wait for the 15-minute/ });
  expect(screen.queryByRole('group', { name: /No re-entry/ })).toBeNull();
  expect(screen.getByText(/1 rule shows on losing trades only/)).toBeTruthy();
});

test('removing a strategy drops the checks of its rules', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample({
      ruleChecks: [
        { ruleId: 'r-1', followed: true },
        { ruleId: 'other', followed: false },
      ],
    }),
    url: URL_C,
  });
  const pick = await screen.findByRole('button', {
    name: 'Opening range breakout',
  });
  expect(pick.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(pick);
  await waitFor(async () => {
    const t = (await repo.trades.get(WS, 't-c'))!;
    expect(t.strategyIds).toEqual([]);
    expect(t.ruleChecks).toEqual([{ ruleId: 'other', followed: false }]);
  });
  await waitFor(() =>
    expect(screen.queryByRole('group', { name: /Wait for the 15/ })).toBeNull(),
  );
});

test('the rating is a radio group that saves', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample({ rating: 4 }),
    url: URL_C,
  });
  const group = await screen.findByRole('radiogroup', {
    name: 'Rating: 4 of 5',
  });
  fireEvent.click(within(group).getByRole('radio', { name: '2 stars' }));
  await waitFor(async () =>
    expect((await repo.trades.get(WS, 't-c'))?.rating).toBe(2),
  );
  await screen.findByRole('radiogroup', { name: 'Rating: 2 of 5' });
});

test('Reviewed toggles and saves', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL_C,
  });
  const toggle = await screen.findByRole('button', { name: 'Reviewed' });
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(toggle);
  await waitFor(async () =>
    expect((await repo.trades.get(WS, 't-c'))?.reviewed).toBe(true),
  );
});

test('tags are grouped by their category and each has its own picker', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({ tagIds: ['tag-setup'] }),
    url: URL_C,
  });
  const setups = await screen.findByRole('group', { name: 'Setups' });
  expect(within(setups).getByText('Breakout')).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Mistakes' })).toBeTruthy();
  expect(
    within(setups).getByRole('button', { name: 'Remove Breakout' }),
  ).toBeTruthy();
});

test('the fills timeline is labelled with its span and fill count', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL_C });
  const chart = await screen.findByRole('group', { name: /^Fills from / });
  expect(chart.getAttribute('aria-label')).toMatch(/, 4 fills$/);
  // One focusable marker per fill, each with its readout.
  const markers = within(chart).getAllByRole('img');
  expect(markers).toHaveLength(4);
  expect(markers[0]!.getAttribute('aria-label')).toMatch(/^Buy 3 at 6,310\.50/);
  fireEvent.focus(markers[2]!);
  expect(
    screen.getByRole('status', { name: 'Fill readout' }).textContent,
  ).toMatch(/Sell 3 at 6,312\.50/);
  // The executions table.
  const table = screen.getByRole('table', { name: 'Executions' });
  expect(within(table).getAllByRole('row')).toHaveLength(1 + 4 + 1);
});

test('typing in the note creates one trade note and links it, then autosaves', async () => {
  const handle: { current: NoteEditorHandle | null } = { current: null };
  const { repo } = renderApp(<TradeView id="t-c" noteHandleRef={handle} />, {
    sample: sample(),
    url: URL_C,
  });
  await screen.findByRole('toolbar', { name: 'Formatting' });
  await waitFor(() => expect(handle.current).not.toBeNull());
  act(() => handle.current!.runSlashCommand('Checklist'));
  await waitFor(async () => {
    const t = (await repo.trades.get(WS, 't-c'))!;
    expect(t.noteId).toBeDefined();
  });
  // Still one note after the autosave (600 ms later).
  await waitFor(
    async () => {
      const notes = (await repo.journal.list(WS)).filter(
        (n) => n.kind === 'trade-note' && n.linkedTradeIds.includes('t-c'),
      );
      expect(notes).toHaveLength(1);
      expect(JSON.stringify(notes[0]!.body)).toContain('taskList');
    },
    { timeout: 3000 },
  );
  await screen.findByText('Saved');
});

test('an archived account makes the trade read-only', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({}, 'acc-b'),
    url: '/app/trades/t-c',
  });
  await screen.findByText(
    'This account is archived. Its trades are read-only.',
  );
  expect(
    screen.getByRole('button', { name: 'Reviewed' }).hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen
      .getByRole('textbox', { name: 'Planned stop' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(
    within(screen.getByRole('radiogroup', { name: /Rating/ }))
      .getAllByRole('radio')
      .every((r) => r.hasAttribute('disabled')),
  ).toBe(true);
  const rule = screen.getByRole('group', { name: /Wait for the 15-minute/ });
  for (const b of within(rule).getAllByRole('button'))
    expect(b.hasAttribute('disabled')).toBe(true);
  expect(screen.queryByRole('toolbar', { name: 'Formatting' })).toBeNull();
});

test('manual trades can edit their fills or be deleted; imported ones cannot', async () => {
  const manual = renderApp(<TradeView id="t-c" />, {
    sample: sample({ source: 'manual' }),
    url: URL_C,
  });
  const edit = await screen.findByRole('link', { name: 'Edit fills' });
  expect(edit.getAttribute('href')).toBe('/app/trades/t-c/edit?symbol=ES');
  fireEvent.click(screen.getByRole('button', { name: 'Delete trade' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(async () =>
    expect(await manual.repo.trades.get(WS, 't-c')).toBeUndefined(),
  );
  await waitFor(() => expect(window.location.pathname).toBe('/app/trades'));
  cleanup();

  renderApp(<TradeView id="t-c" />, {
    sample: sample({ source: 'import' }),
    url: URL_C,
  });
  await screen.findByRole('region', { name: 'Trade 1132' });
  expect(screen.queryByRole('link', { name: 'Edit fills' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete trade' })).toBeNull();
});

test('an unknown id says the trade is not in this workspace', async () => {
  renderApp(<TradeView id="nope" />, {
    sample: sample(),
    url: '/app/trades/nope',
  });
  await screen.findByText("This trade isn't in this workspace.");
  expect(
    screen.getByRole('link', { name: 'Back to trades' }).getAttribute('href'),
  ).toBe('/app/trades');
});

test('under Privacy the header hides money', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  const head = await screen.findByRole('region', { name: 'Trade 1132' });
  expect(head.textContent).not.toMatch(/\$\d/);
  expect(within(head).getAllByText('hidden amount').length).toBeGreaterThan(0);
});

test('only looking at a trade never creates its note', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL_C,
  });
  await screen.findByRole('toolbar', { name: 'Formatting' });
  await new Promise((r) => setTimeout(r, 900));
  expect((await repo.trades.get(WS, 't-c'))?.noteId).toBeUndefined();
  expect(screen.queryByText('Saved')).toBeNull();
});

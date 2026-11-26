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
import { everyString } from '../__fixtures__/every-string';
import { renderApp } from '../__fixtures__/render-app';
import type { NoteEditorHandle } from '../notes/note-editor';
import { NOTE_SAVE_DELAY_MS } from './trade-journal';
import { TradeView } from './trade-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
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
  expect(within(head).getByText('Win')).toBeTruthy();
  expect(within(head).queryByText('Closed')).toBeNull();
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

test('Back to trades, the delete redirect and the not-found link return to the log view last used, with the filters', async () => {
  window.sessionStorage.setItem('keel.tradeLogView', 'week');
  const manual = renderApp(<TradeView id="t-c" />, {
    sample: sample({ source: 'manual' }),
    url: URL_C,
  });
  expect(
    (await screen.findByRole('link', { name: /Back to trades/ })).getAttribute(
      'href',
    ),
  ).toBe('/app/trades/week?symbol=ES');
  fireEvent.click(screen.getByRole('button', { name: 'Delete trade' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(async () =>
    expect(await manual.repo.trades.get(WS, 't-c')).toBeUndefined(),
  );
  await waitFor(() =>
    expect(window.location.pathname).toBe('/app/trades/week'),
  );
  expect(window.location.search).toBe('?symbol=ES');
  cleanup();

  window.sessionStorage.setItem('keel.tradeLogView', 'day');
  renderApp(<TradeView id="nope" />, {
    sample: sample(),
    url: '/app/trades/nope?symbol=ES',
  });
  await screen.findByText("This trade isn't in this workspace.");
  expect(
    screen.getByRole('link', { name: 'Back to trades' }).getAttribute('href'),
  ).toBe('/app/trades/day?symbol=ES');
});

test('trade ids with a slash are encoded in every link', async () => {
  const base = sample({ source: 'manual' });
  const rename: Record<string, string> = {
    't-a': 'acc:EUR/USD:a',
    't-c': 'acc:EUR/USD:c',
    't-d': 'acc:EUR/USD:d',
  };
  renderApp(<TradeView id="acc:EUR/USD:c" />, {
    sample: async () => {
      const w = await base();
      return {
        ...w,
        trades: w.trades.map((t) => ({ ...t, id: rename[t.id] ?? t.id })),
      };
    },
    url: URL_C,
  });
  const next = await screen.findByRole('link', { name: /Next trade/ });
  expect(next.getAttribute('href')).toBe(
    '/app/trades/acc%3AEUR%2FUSD%3Ad?symbol=ES',
  );
  expect(
    screen.getByRole('link', { name: /Previous trade/ }).getAttribute('href'),
  ).toBe('/app/trades/acc%3AEUR%2FUSD%3Aa?symbol=ES');
  expect(
    screen.getByRole('link', { name: 'Edit fills' }).getAttribute('href'),
  ).toBe('/app/trades/acc%3AEUR%2FUSD%3Ac/edit?symbol=ES');
});

test('adding a stop level saves it and the realized R follows', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL_C,
  });
  const head = await screen.findByRole('region', { name: 'Trade 1132' });
  expect(within(head).queryByText(R_FIGURE)).toBeNull();
  const stops = screen.getByRole('group', { name: 'Stops' });
  fireEvent.click(within(stops).getByRole('button', { name: 'Add level' }));
  const stop = screen.getByRole('textbox', { name: 'Stop level 1' });
  fireEvent.change(stop, { target: { value: '6304.75' } });
  fireEvent.blur(stop);
  await waitFor(async () =>
    expect((await repo.trades.get(WS, 't-c'))?.stops?.levels).toEqual([
      { value: 6304.75, qty: 6 },
    ]),
  );
  // The stored risk is the stop side's loss: 5 points on 6 contracts at $50.
  const saved = (await repo.trades.get(WS, 't-c'))!;
  expect(saved.initialRisk).toBe(150000);
  expect(saved.plannedStop).toBeUndefined();
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
  expect(within(setups).getByText('breakout')).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Mistakes' })).toBeTruthy();
  expect(
    within(setups).getByRole('button', { name: 'Remove breakout' }),
  ).toBeTruthy();
});

test('two quick tag picks keep both', async () => {
  const base = sample();
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: async () => {
      const w = await base();
      return {
        ...w,
        tags: [
          ...w.tags,
          {
            id: 'tag-pull',
            workspaceId: WS,
            name: 'pullback',
            categoryId: 'setups',
          },
        ],
      };
    },
    url: URL_C,
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Add to Setups' }));
  const first = await screen.findByRole('option', { name: 'breakout' });
  const second = screen.getByRole('option', { name: 'pullback' });
  // Both picks land before the first save has come back through the props.
  act(() => {
    fireEvent.click(first);
    fireEvent.click(second);
  });
  await waitFor(async () =>
    expect([...(await repo.trades.get(WS, 't-c'))!.tagIds].sort()).toEqual([
      'tag-pull',
      'tag-setup',
    ]),
  );
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
  await waitFor(
    async () => {
      const t = (await repo.trades.get(WS, 't-c'))!;
      expect(t.noteId).toBeDefined();
    },
    { timeout: 3000 },
  );
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
  await screen.findByText('Saved', undefined, { timeout: 3000 });
});

test('the note editor stays mounted and focused across the first change', async () => {
  const handle: { current: NoteEditorHandle | null } = { current: null };
  const { repo } = renderApp(<TradeView id="t-c" noteHandleRef={handle} />, {
    sample: sample(),
    url: URL_C,
  });
  const box = await screen.findByRole('textbox', { name: 'Trade note' });
  await waitFor(() => expect(handle.current).not.toBeNull());
  act(() => box.focus());
  act(() => handle.current!.runSlashCommand('Checklist'));
  await waitFor(
    async () =>
      expect((await repo.trades.get(WS, 't-c'))?.noteId).toBeDefined(),
    { timeout: 3000 },
  );
  // Give the refetch with the new note id time to land.
  await screen.findByText('Saved', undefined, { timeout: 3000 });
  expect(screen.getByRole('textbox', { name: 'Trade note' })).toBe(box);
  expect(box.isConnected).toBe(true);
  expect(document.activeElement).toBe(box);
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
      .getByRole('button', { name: 'Stops unit, Price' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(
    within(screen.getByRole('group', { name: 'Targets' }))
      .getByRole('button', { name: 'Add level' })
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

test('under Privacy no amount survives anywhere on the trade page, and the fills readout says hidden amount', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample({ initialRisk: 15000, plannedStop: 6304.75, mae: -2079 }),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  await screen.findByRole('region', { name: 'Trade 1132' });
  // The Execution header, its stats grid and the executions table.
  const exec = screen.getByRole('region', { name: 'Execution' });
  expect(within(exec).getAllByText('hidden amount').length).toBeGreaterThan(0);
  const marker = screen.getAllByRole('img', { name: /^Buy 3 at/ })[0]!;
  fireEvent.focus(marker);
  const readout = screen.getByRole('status', { name: 'Fill readout' });
  expect(within(readout).getAllByText('hidden amount')).toHaveLength(2);
  expect(everyString(document.body).filter((s) => /\$\d/.test(s))).toEqual([]);
});

test('the Execution header gives a futures point value as a multiplier, with no dollar amount, under Privacy', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample({ instrument: resolveInstrument('ESZ5')! }),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  const exec = await screen.findByRole('region', { name: 'Execution' });
  const head = exec.querySelector('h2')!.parentElement!;
  expect(head.textContent).toContain('×50 multiplier');
  expect(head.textContent).not.toMatch(/\$|per point/);
});

test('the labels of the R figures, planned reward and risk, MAE and MFE carry their definitions', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({ initialRisk: 15000 }),
    url: URL_C,
  });
  const exec = await screen.findByRole('region', { name: 'Execution' });
  const tips = (root: Element) =>
    [...root.querySelectorAll('[data-metric-tip]')].map(
      (e) => (e as HTMLElement).dataset.metricTip,
    );
  expect(tips(exec)).toEqual(
    expect.arrayContaining([
      'realized-r',
      'planned-r',
      'planned-reward',
      'planned-risk',
      'mae',
      'mfe',
    ]),
  );
  const head = screen.getByRole('region', { name: 'Trade 1132' });
  expect(tips(head)).toEqual(
    expect.arrayContaining(['pnl', 'net-roi', 'realized-r']),
  );
});

test('the planned stop and target are drawn as dashed lines with their zones and legend', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({
      initialRisk: 15000,
      plannedStop: 6304.75,
      plannedTarget: 6319,
    }),
    url: URL_C,
  });
  const fills = await screen.findByRole('region', { name: 'Fills' });
  const chart = within(fills).getByRole('group', { name: /^Fills from/ });
  expect(chart.querySelector('[data-plan="target-zone"]')).not.toBeNull();
  expect(chart.querySelector('[data-plan="risk-zone"]')).not.toBeNull();
  expect(chart.querySelector('[data-plan="target-line"]')).not.toBeNull();
  expect(chart.querySelector('[data-plan="stop-line"]')).not.toBeNull();
  // happy-dom has no layout, so the chart is at its narrow width and short labels.
  expect(chart.textContent).toContain('Target');
  expect(chart.textContent).toContain('6,319.00');
  expect(chart.textContent).toContain('Stop');
  expect(chart.textContent).toContain('6,304.75');
  expect(within(fills).getByText('Target zone')).toBeTruthy();
  expect(within(fills).getByText('Risk zone')).toBeTruthy();
});

test('without a plan the chart draws no planned lines and the legend has no zones', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL_C });
  const fills = await screen.findByRole('region', { name: 'Fills' });
  expect(fills.querySelector('[data-plan]')).toBeNull();
  expect(within(fills).queryByText('Target zone')).toBeNull();
});

test('the position strip steps through the running position and ends flat', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL_C });
  const strip = await screen.findByRole('img', {
    name: 'Position size: 3, then 6, then 3, then flat',
  });
  expect(strip.textContent).toContain('max 6');
  const quantities = [...strip.querySelectorAll('[data-qty]')].map(
    (e) => e.textContent,
  );
  expect(quantities).toEqual(['3', '6', '3']);
});

test('an absent figure reads None and says what would add it, never a dash', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL_C,
  });
  const exec = await screen.findByRole('region', { name: 'Execution' });
  expect(exec.textContent).toContain('Planned RNone');
  expect(exec.textContent).toContain('Realized RNone');
  // Under the headline R, with no planned R to compare it with.
  expect(document.body.textContent).toContain('add a target for planned R');
  expect(document.body.textContent).not.toContain('set a stop and target');
  expect(document.body.textContent).not.toContain('Not available');
  const texts = everyString(document.body);
  expect(texts).toContain('None');
  expect(texts.filter((s) => s.trim() === '-')).toEqual([]);
});

test('at phone width Net, ROI and R share one row of three, and the crumb replaces Back to trades', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({ initialRisk: 15000 }),
    url: URL_C,
  });
  const head = await screen.findByRole('region', { name: 'Trade 1132' });
  expect(head.className).toContain('max-sm:grid-cols-[1.5fr_1fr_1fr]');
  // The title and the neighbours take the full width; the three figures one cell each.
  const cells = [...head.children] as HTMLElement[];
  const spans = cells.map((c) => c.className.includes('max-sm:col-span-3'));
  expect(spans).toEqual([true, false, false, false, true]);
  // Not a button or a chip: the link only hides on a phone, where the top bar's "Trades" crumb leads back.
  const back = screen.getByRole('link', { name: /Back to trades/ });
  expect(back.className).toContain('max-sm:hidden');
});

/** The Execution card's unit rows: label then value, as the card prints them. */
function execText(): string {
  return screen.getByRole('region', { name: 'Execution' }).textContent ?? '';
}

test('a futures trade shows points, ticks, contracts and cost basis', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL_C });
  await screen.findByRole('region', { name: 'Execution' });
  const text = execText();
  // 3.75 points on 6 contracts closed: 15 ticks each.
  expect(text).toContain('Points+22.5 pts');
  expect(text).toContain('Ticks+90.0 ticks');
  expect(text).toContain('Contracts6');
  expect(text).not.toContain('closed');
  // 6309.75 x 6 x 50.
  expect(text).toContain('Cost basis$1,892,925.00');
  expect(text).not.toContain('Pips');
  expect(text).not.toContain('Money per pip');
});

test('a forex trade shows pips, money per pip and cost basis, and no futures rows', async () => {
  renderApp(<TradeView id="t-c" />, {
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
  await screen.findByRole('region', { name: 'Execution' });
  const text = execText();
  expect(text).toContain('Pips+25.0 pips');
  expect(text).toContain('Money per pip$2.00');
  expect(text).toContain('Cost basis');
  expect(text).not.toContain('Points');
  expect(text).not.toContain('Ticks');
  expect(text).not.toContain('Contracts');
});

test('money per pip reads None when the move is zero pips', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({
      instrument: resolveInstrument('EURUSD')!,
      avgEntry: 1.1,
      avgExit: 1.1,
      maxPosition: 1,
      gross: 0,
      executions: [],
    }),
    url: URL_C,
  });
  await screen.findByRole('region', { name: 'Execution' });
  expect(execText()).toContain('Money per pipNone');
});

test('a stock trade shows only the cost basis', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({
      instrument: resolveInstrument('AAPL')!,
      avgEntry: 200,
      avgExit: 210,
      maxPosition: 10,
      executions: [],
    }),
    url: URL_C,
  });
  await screen.findByRole('region', { name: 'Execution' });
  const text = execText();
  expect(text).toContain('Cost basis$2,000.00');
  for (const gone of ['Points', 'Ticks', 'Contracts', 'Pips', 'Money per pip'])
    expect(text).not.toContain(gone);
});

test('the cost basis is hidden under Privacy', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  await screen.findByRole('region', { name: 'Execution' });
  expect(execText()).toContain('Cost basis$•••');
  expect(execText()).not.toContain('1,892,925');
});

test('the notes card switches between the trade note and the day note, and links to the day in the Notebook', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL_C });
  await screen.findByRole('textbox', { name: 'Trade note' });
  expect(screen.queryByRole('textbox', { name: 'Daily note' })).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: 'Daily note' }));
  await screen.findByRole('textbox', { name: 'Daily note' });
  expect(screen.queryByRole('textbox', { name: 'Trade note' })).toBeNull();
  // No entry yet: the link opens the day, which the Notebook makes.
  expect(
    screen
      .getByRole('link', { name: 'Open in the Notebook' })
      .getAttribute('href'),
  ).toBe('/app/notebook/daily/2026-11-09');
  fireEvent.click(screen.getByRole('radio', { name: 'Trade note' }));
  await screen.findByRole('textbox', { name: 'Trade note' });
});

test('a trashed day note shows read-only with Restore', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  const note = await repository.journal.dailyNote(WS, '2026-11-09');
  await repository.journal.trash(WS, note.id);
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  await screen.findByRole('textbox', { name: 'Trade note' });
  fireEvent.click(screen.getByRole('radio', { name: 'Daily note' }));
  await screen.findByText("This day's note is in Trash.");
  // The link opens the trashed note itself.
  expect(
    screen
      .getByRole('link', { name: 'Open in the Notebook' })
      .getAttribute('href'),
  ).toBe(`/app/notebook/${note.id}`);
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  await waitFor(() =>
    expect(screen.queryByText("This day's note is in Trash.")).toBeNull(),
  );
  const days = (await repository.journal.list(WS)).filter(
    (e) => e.kind === 'daily-review' && e.date === '2026-11-09',
  );
  expect(days).toHaveLength(1);
  expect(days[0]!.deletedAt).toBeUndefined();
});

test('a refused Restore on the trade page says so and leaves the note in Trash', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample(),
  });
  const note = await repository.journal.dailyNote(WS, '2026-11-09');
  await repository.journal.trash(WS, note.id);
  vi.spyOn(repository.journal, 'restore').mockRejectedValue(
    new Error('The day is finished'),
  );
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  await screen.findByRole('textbox', { name: 'Trade note' });
  fireEvent.click(screen.getByRole('radio', { name: 'Daily note' }));
  await screen.findByText("This day's note is in Trash.");
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    "Couldn't restore that note. Try again.",
  );
  expect(screen.getByText("This day's note is in Trash.")).toBeTruthy();
});

test('editing the day note creates the daily entry for the exit date once, and the link then opens it', async () => {
  const handle: { current: NoteEditorHandle | null } = { current: null };
  const { repo } = renderApp(<TradeView id="t-c" noteHandleRef={handle} />, {
    sample: sample(),
    url: URL_C,
  });
  await screen.findByRole('textbox', { name: 'Trade note' });
  fireEvent.click(screen.getByRole('radio', { name: 'Daily note' }));
  await screen.findByRole('textbox', { name: 'Daily note' });
  await waitFor(() => expect(handle.current).not.toBeNull());
  // Looking creates nothing.
  expect(
    (await repo.journal.list(WS)).filter((e) => e.kind === 'daily-review'),
  ).toHaveLength(0);
  act(() => handle.current!.runSlashCommand('Divider'));
  await waitFor(
    async () => {
      const days = (await repo.journal.list(WS)).filter(
        (e) => e.kind === 'daily-review' && e.date === '2026-11-09',
      );
      expect(days).toHaveLength(1);
      expect(JSON.stringify(days[0]!.body)).toContain('horizontalRule');
    },
    { timeout: 3000 },
  );
  // The trade's own note is untouched.
  expect((await repo.trades.get(WS, 't-c'))?.noteId).toBeUndefined();
  await screen.findByText('Saved', undefined, { timeout: 3000 });
  const day = (await repo.journal.list(WS)).find(
    (e) => e.kind === 'daily-review' && e.date === '2026-11-09',
  )!;
  await waitFor(() =>
    expect(
      screen
        .getByRole('link', { name: 'Open in the Notebook' })
        .getAttribute('href'),
    ).toBe(`/app/notebook/${encodeURIComponent(day.id)}`),
  );
});

test("a day note trashed in another tab stays the date's note, read-only (M5, E109)", async () => {
  const handle: { current: NoteEditorHandle | null } = { current: null };
  const { repo } = renderApp(<TradeView id="t-c" noteHandleRef={handle} />, {
    sample: async () => {
      const fx = await sample()();
      fx.journal.push({
        id: 'd-9',
        workspaceId: WS,
        kind: 'daily-review',
        date: '2026-11-09',
        title: 'Mon 9 Nov',
        body: { type: 'doc', content: [] },
        linkedTradeIds: [],
        tags: [],
        updatedAt: '2026-11-09T20:00:00.000Z',
      });
      return fx;
    },
    url: URL_C,
  });
  await screen.findByRole('textbox', { name: 'Trade note' });
  fireEvent.click(screen.getByRole('radio', { name: 'Daily note' }));
  await screen.findByRole('textbox', { name: 'Daily note' });
  await waitFor(() => expect(handle.current).not.toBeNull());
  expect(
    screen
      .getByRole('link', { name: 'Open in the Notebook' })
      .getAttribute('href'),
  ).toBe('/app/notebook/d-9');
  // Another tab trashes the day's note and tells this one.
  await repo.journal.trash(WS, 'd-9');
  const other = new BroadcastChannel('keel-data');
  other.postMessage({ keys: [['keel', 'ws', WS, 'journal']] });
  other.close();
  // The trashed note is still the day's note (E109): read-only, with Restore.
  await screen.findByText("This day's note is in Trash.");
  expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
  const rows = (await repo.journal.list(WS)).filter(
    (e) => e.kind === 'daily-review' && e.date === '2026-11-09',
  );
  expect(rows.map((e) => e.id)).toEqual(['d-9']);
  expect(rows[0]!.deletedAt).toBeDefined();
});

test('a note trashed elsewhere during the save delay is saved onto a whole note, never a body alone (re-review N1)', async () => {
  // Hold the autosave's timer, so the trash lands inside the delay.
  const held: (() => void)[] = [];
  const realTimeout = globalThis.setTimeout;
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    fn: () => void,
    ms?: number,
    ...rest: unknown[]
  ) => {
    if (ms === NOTE_SAVE_DELAY_MS) {
      held.push(fn);
      return 0;
    }
    return realTimeout(fn, ms, ...rest);
  }) as typeof setTimeout);
  try {
    const handle: { current: NoteEditorHandle | null } = { current: null };
    const { repo } = renderApp(<TradeView id="t-c" noteHandleRef={handle} />, {
      sample: async () => {
        const fx = await sample()();
        fx.journal.push({
          id: 'd-9',
          workspaceId: WS,
          kind: 'daily-review',
          date: '2026-11-09',
          title: 'Mon 9 Nov',
          body: { type: 'doc', content: [] },
          linkedTradeIds: [],
          tags: [],
          updatedAt: '2026-11-09T20:00:00.000Z',
        });
        return fx;
      },
      url: URL_C,
    });
    await screen.findByRole('textbox', { name: 'Trade note' });
    fireEvent.click(screen.getByRole('radio', { name: 'Daily note' }));
    await screen.findByRole('textbox', { name: 'Daily note' });
    await waitFor(() => expect(handle.current).not.toBeNull());
    // A keystroke: its save waits out the delay.
    act(() => handle.current!.runSlashCommand('Divider'));
    expect(held).toHaveLength(1);
    // Inside the delay, another tab trashes the note and says so.
    await repo.journal.trash(WS, 'd-9');
    const other = new BroadcastChannel('keel-data');
    other.postMessage({ keys: [['keel', 'ws', WS, 'journal']] });
    other.close();
    await screen.findByText("This day's note is in Trash.");
    // The delay ends.
    act(() => held.at(-1)!());
    await screen.findByText('Saved', undefined, { timeout: 3000 });
    // Every stored note is whole, and the change went onto the trashed day note, which stays in Trash (E109).
    const rows = await repo.journal.list(WS);
    for (const row of rows) {
      expect(row.kind, row.id).toBeDefined();
      expect(Array.isArray(row.linkedTradeIds), row.id).toBe(true);
      expect(Array.isArray(row.tags), row.id).toBe(true);
    }
    expect((await repo.journal.get(WS, 'd-9'))?.deletedAt).toBeDefined();
    const day = rows.filter(
      (e) => e.kind === 'daily-review' && e.date === '2026-11-09',
    );
    expect(day).toHaveLength(1);
    expect(JSON.stringify(day[0]!.body)).toContain('horizontalRule');
  } finally {
    spy.mockRestore();
  }
});

test('a still-open trade takes the day note of its open date', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({
      status: 'open',
      closedAt: undefined,
      avgExit: undefined,
    }),
    url: URL_C,
  });
  await screen.findByRole('textbox', { name: 'Trade note' });
  fireEvent.click(screen.getByRole('radio', { name: 'Daily note' }));
  expect(
    (
      await screen.findByRole('link', { name: 'Open in the Notebook' })
    ).getAttribute('href'),
  ).toBe('/app/notebook/daily/2026-11-09');
});

test('an archived account shows the day note read-only', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({}, 'acc-b'),
    url: '/app/trades/t-c',
  });
  await screen.findByText(
    'This account is archived. Its trades are read-only.',
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Daily note' }));
  await screen.findByRole('textbox', { name: 'Daily note' });
  expect(screen.queryByRole('toolbar', { name: 'Formatting' })).toBeNull();
});

test('the tags card links to Settings > Tags, and so does the picker', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL_C });
  const links = await screen.findAllByRole('link', { name: 'Manage tags' });
  expect(links[0]!.getAttribute('href')).toBe('/app/settings/tags');
  // The first sits at the right of the card header, beside the title.
  expect(
    links[0]!.parentElement!.parentElement!.querySelector('h2')?.textContent,
  ).toBe('Tags and rating');
  fireEvent.click(screen.getByRole('button', { name: 'Add to Setups' }));
  await waitFor(() =>
    expect(screen.getAllByRole('link', { name: 'Manage tags' })).toHaveLength(
      2,
    ),
  );
});

test('a partly closed futures trade reads Contracts as closed of opened', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({
      executions: [
        fill('e1', 'buy', 5, 6310.5, '2026-11-09T16:00:00.000Z'),
        fill('e3', 'sell', 3, 6312.5, '2026-11-09T16:20:00.000Z'),
      ],
      maxPosition: 5,
    }),
    url: URL_C,
  });
  await screen.findByRole('region', { name: 'Execution' });
  expect(execText()).toContain('Contracts3 of 5 closed');
});

test('the day note opens with the default daily template and the first save keeps it', async () => {
  const handle: { current: NoteEditorHandle | null } = { current: null };
  const { repo } = renderApp(<TradeView id="t-c" noteHandleRef={handle} />, {
    sample: sample(),
    url: URL_C,
  });
  await screen.findByRole('textbox', { name: 'Trade note' });
  fireEvent.click(screen.getByRole('radio', { name: 'Daily note' }));
  const box = await screen.findByRole('textbox', { name: 'Daily note' });
  const template = (await repo.templates.list(WS)).find(
    (t) => t.kind === 'daily-review' && t.isDefault,
  )!;
  const first = JSON.stringify(template.body).match(/"text":"([^"]+)"/)![1]!;
  await waitFor(() => expect(box.textContent).toContain(first));
  act(() => handle.current!.runSlashCommand('Divider'));
  await waitFor(
    async () => {
      const day = (await repo.journal.list(WS)).find(
        (e) => e.kind === 'daily-review' && e.date === '2026-11-09',
      )!;
      const body = JSON.stringify(day.body);
      expect(body).toContain(first);
      expect(body).toContain('horizontalRule');
    },
    { timeout: 3000 },
  );
});

test('the trade note tab does not read the journal', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL_C,
  });
  const list = vi.spyOn(repo.journal, 'list');
  await screen.findByRole('textbox', { name: 'Trade note' });
  expect(list).not.toHaveBeenCalled();
});

test("the Daily note dates by the trader's zone, not the account's (K35)", async () => {
  const base = sample(
    {
      openedAt: '2026-11-20T03:00:00Z',
      closedAt: '2026-11-20T03:30:00Z',
      executions: [],
    },
    'acc-a',
  );
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const w = await base();
      return {
        ...w,
        accounts: w.accounts.map((a) =>
          a.id === 'acc-a' ? { ...a, timeZone: 'Asia/Tokyo' } : a,
        ),
      };
    },
  });
  await repository.prefs.update({ timeZone: 'America/New_York' });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  await screen.findByRole('textbox', { name: 'Trade note' });
  fireEvent.click(screen.getByRole('radio', { name: 'Daily note' }));
  const link = await screen.findByRole('link', {
    name: 'Open in the Notebook',
  });
  expect(link.getAttribute('href')).toBe('/app/notebook/daily/2026-11-19');
});

/** The ES trade with a swap of -$4.86 inside its net (gross $112.50, fees $31.20). */
const swapped = (patch: Partial<Trade> = {}) =>
  sample({ swap: -486, gross: 11250, net: 7644, ...patch });

test('the Swap row follows Fees in the first grid, signed, and fills its last cell', async () => {
  renderApp(<TradeView id="t-c" />, { sample: swapped(), url: URL_C });
  await screen.findByRole('region', { name: 'Execution' });
  const text = execText();
  expect(text).toContain('Swap−$4.86from the import');
  expect(text.indexOf('Fees')).toBeLessThan(text.indexOf('Swap'));
  expect(text.indexOf('Swap')).toBeLessThan(text.indexOf('Cost basis'));
  // Eight cells and no blank one: Swap shares the row with Gross P&L and Fees.
  const swapCell = screen.getByText('Swap').closest('div')!;
  const grid = swapCell.parentElement!;
  expect(grid.children).toHaveLength(8);
  expect(grid.querySelector('[aria-hidden="true"]')).toBeNull();
  // A charge reads in the loss colour, as in the comp.
  expect(swapCell.querySelector('b')!.className).toContain('text-loss');
});

test('a swap credit reads with a plus sign', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: swapped({ swap: 120, net: 8250 }),
    url: URL_C,
  });
  await screen.findByRole('region', { name: 'Execution' });
  expect(execText()).toContain('Swap+$1.20');
});

test('the header adds the swap to its sub-line so the figures add up to the net', async () => {
  renderApp(<TradeView id="t-c" />, { sample: swapped(), url: URL_C });
  const head = await screen.findByRole('region', { name: 'Trade 1132' });
  expect(within(head).getByText('+$76.44')).toBeTruthy();
  expect(head.textContent).toContain(
    '+$112.50 gross, −$31.20 fees, −$4.86 swap',
  );
});

test('a trade with no swap reads None on the row and leaves the header as it was', async () => {
  renderApp(<TradeView id="t-c" />, { sample: sample(), url: URL_C });
  const head = await screen.findByRole('region', { name: 'Trade 1132' });
  expect(execText()).toContain('SwapNone');
  expect(execText()).not.toContain('from the import');
  expect(head.textContent).toContain('+$112.50 gross, −$31.20 fees');
  expect(head.textContent).not.toContain('swap');
});

test('a swap of 0 reads $0.00 on the row and stays out of the header', async () => {
  renderApp(<TradeView id="t-c" />, {
    sample: sample({ swap: 0 }),
    url: URL_C,
  });
  const head = await screen.findByRole('region', { name: 'Trade 1132' });
  expect(execText()).toContain('Swap$0.00');
  expect(head.textContent).not.toContain('swap');
});

test('the Swap label carries its definition', async () => {
  renderApp(<TradeView id="t-c" />, { sample: swapped(), url: URL_C });
  const exec = await screen.findByRole('region', { name: 'Execution' });
  expect(exec.querySelector('[data-metric-tip="swap"]')).not.toBeNull();
});

test('Privacy masks swap in the row and in the header', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: swapped(),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  const head = await screen.findByRole('region', { name: 'Trade 1132' });
  expect(execText()).toContain('Swap−$•••hidden amount');
  expect(head.textContent).toContain('swap');
  expect(document.body.textContent).not.toContain('4.86');
  expect(everyString(document.body).filter((s) => /\$\d/.test(s))).toEqual([]);
});

test('the Attachments card sits between Tags and rating and Notes, and takes a file on the trade', async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample(),
    url: URL_C,
  });
  const tags = await screen.findByRole('region', { name: 'Tags and rating' });
  const files = screen.getByRole('region', { name: 'Attachments' });
  const notes = screen.getByRole('region', { name: 'Notes' });
  const follows = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  expect(follows(tags, files)).toBe(true);
  expect(follows(files, notes)).toBe(true);
  const input = files.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: {
      files: [
        new File([new Uint8Array(4)], 'plan.pdf', { type: 'application/pdf' }),
      ],
    },
  });
  await waitFor(async () =>
    expect((await repo.files.list(WS, 'trade:t-c')).map((f) => f.name)).toEqual(
      ['plan.pdf'],
    ),
  );
  expect(await within(files).findByText('plan.pdf')).toBeTruthy();
});

test("an archived account lists its trade's files without a way to add one", async () => {
  const { repo } = renderApp(<TradeView id="t-c" />, {
    sample: sample({}, 'acc-b'),
    url: URL_C,
  });
  await repo.files.add(
    WS,
    'trade:t-c',
    {
      bytes: new Uint8Array(4).buffer,
      type: 'application/pdf',
      name: 'kept.pdf',
    },
    { images: false },
  );
  const files = await screen.findByRole('region', { name: 'Attachments' });
  await waitFor(async () =>
    expect(await repo.files.list(WS, 'trade:t-c')).toHaveLength(1),
  );
  expect(files.querySelector('input[type="file"]')).toBeNull();
  expect(within(files).queryByText('Drop files here')).toBeNull();
});

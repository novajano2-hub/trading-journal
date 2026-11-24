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

test('the labels of realized R, planned R, MAE and MFE carry their definitions', async () => {
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
    expect.arrayContaining(['realized-r', 'planned-r', 'mae', 'mfe']),
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

test('a trashed daily entry for the date is ignored, as the Notebook does: a fresh one is made', async () => {
  const handle: { current: NoteEditorHandle | null } = { current: null };
  const base = sample();
  const { repo } = renderApp(<TradeView id="t-c" noteHandleRef={handle} />, {
    sample: async () => ({
      ...(await base()),
      journal: [
        {
          id: 'j-trashed',
          workspaceId: WS,
          kind: 'daily-review',
          date: '2026-11-09',
          title: 'Old day',
          body: { type: 'doc', content: [{ type: 'paragraph' }] },
          linkedTradeIds: [],
          tags: [],
          updatedAt: '2026-11-10T00:00:00.000Z',
          deletedAt: '2026-11-11T00:00:00.000Z',
        },
      ],
    }),
    url: URL_C,
  });
  await screen.findByRole('textbox', { name: 'Trade note' });
  fireEvent.click(screen.getByRole('radio', { name: 'Daily note' }));
  await screen.findByRole('textbox', { name: 'Daily note' });
  expect(
    screen
      .getByRole('link', { name: 'Open in the Notebook' })
      .getAttribute('href'),
  ).toBe('/app/notebook/daily/2026-11-09');
  await waitFor(() => expect(handle.current).not.toBeNull());
  act(() => handle.current!.runSlashCommand('Divider'));
  await waitFor(
    async () => {
      const live = (await repo.journal.list(WS)).filter(
        (e) =>
          e.kind === 'daily-review' &&
          e.date === '2026-11-09' &&
          e.deletedAt === undefined,
      );
      expect(live).toHaveLength(1);
      expect(live[0]!.id).not.toBe('j-trashed');
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

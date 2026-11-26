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
import { createLocalRepository } from '@/data/local/local-repository';
import { fixtureSample } from '@/data/__fixtures__/sample';
import type { Repository } from '@/data/repository';
import type { SampleWorkspace } from '@/data/seed/generate';
import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import type { LevelSide, Trade } from '@/domain/types';
import { everyString } from '../__fixtures__/every-string';
import { renderApp } from '../__fixtures__/render-app';
import { SizeHelper } from './size-helper';
import { TradeView } from './trade-view';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const WS = fixtureSample().trades[0]!.workspaceId;
const URL_C = '/app/trades/t-c';

/** The ES long every test starts from: 6 contracts at 6309.75, $50 a point, so a point is $300. */
function sample(patch: Partial<Trade> = {}) {
  return async (): Promise<SampleWorkspace> => {
    const fx = fixtureSample();
    const c = makeTrade({
      id: 't-c',
      serial: 1132,
      workspaceId: WS,
      accountId: 'acc-a',
      openedAt: '2026-11-09T16:00:00.000Z',
      closedAt: '2026-11-09T16:30:00.000Z',
      net: 81300,
      fees: 3120,
      avgEntry: 6309.75,
      avgExit: 6313.5,
      maxPosition: 6,
      ...patch,
    });
    return { ...fx, trades: [c] };
  };
}

const side = (
  unit: LevelSide['unit'],
  ...levels: [value: number, qty: number][]
): LevelSide => ({
  unit,
  levels: levels.map(([value, qty]) => ({ value, qty })),
});

const group = (name: string) => screen.getByRole('group', { name });
const box = (name: string) => screen.getByRole('textbox', { name });
const stored = async (repo: Repository) =>
  (await repo.trades.get(WS, 't-c')) as Trade;

function type(name: string, text: string) {
  const input = box(name);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
}

async function open(patch: Partial<Trade>, extra?: { url?: string }) {
  const view = renderApp(<TradeView id="t-c" />, {
    sample: sample(patch),
    url: extra?.url ?? URL_C,
  });
  await screen.findByRole('group', { name: 'Stops' });
  return view;
}

test('adding a level starts with what is left', async () => {
  const { repo } = await open({
    stops: side('price', [6304.75, 4]),
    initialRisk: 100000,
  });
  const stops = group('Stops');
  fireEvent.click(within(stops).getByRole('button', { name: 'Add level' }));
  // 6 contracts, 4 already stopped: 2 are left.
  const qty = box('Stop quantity 2') as HTMLInputElement;
  expect(qty.value).toBe('2');
  // A level with no price is not a level yet: nothing is saved until it has one.
  expect((await stored(repo)).stops?.levels).toHaveLength(1);
  type('Stop level 2', '6300');
  await waitFor(async () =>
    expect((await stored(repo)).stops?.levels).toEqual([
      { value: 6304.75, qty: 4 },
      { value: 6300, qty: 2 },
    ]),
  );
  // 4 x 5 + 2 x 9.75 points, at $50 a point.
  expect((await stored(repo)).initialRisk).toBe(
    Math.round((4 * 5 + 2 * 9.75) * 50 * 100),
  );
  // Nothing is left now.
  const add = within(group('Stops')).getByRole('button', {
    name: 'Add level',
  });
  expect(add.hasAttribute('disabled')).toBe(true);
});

test('the first level of a side is the whole position', async () => {
  await open({});
  fireEvent.click(
    within(group('Targets')).getByRole('button', { name: 'Add level' }),
  );
  expect((box('Target quantity 1') as HTMLInputElement).value).toBe('6');
  expect(
    within(group('Targets')).queryByText('No target levels yet.'),
  ).toBeNull();
});

test('a side with no levels says so, and a level with no price is not saved', async () => {
  const { repo } = await open({});
  expect(
    within(group('Targets')).getByText('No target levels yet.'),
  ).toBeTruthy();
  fireEvent.click(
    within(group('Targets')).getByRole('button', { name: 'Add level' }),
  );
  fireEvent.blur(box('Target level 1'));
  expect((await stored(repo)).targets).toBeUndefined();
});

test('a wrong-side level shows its error and does not save', async () => {
  const { repo } = await open({});
  fireEvent.click(
    within(group('Stops')).getByRole('button', { name: 'Add level' }),
  );
  // A long's stop above the average entry.
  type('Stop level 1', '6320');
  const alert = await within(group('Stops')).findByRole('alert');
  expect(alert.textContent).toBe(
    'A stop on a long goes below the average entry, 6,309.75.',
  );
  expect(box('Stop level 1').getAttribute('aria-invalid')).toBe('true');
  expect(box('Stop level 1').getAttribute('aria-describedby')).toBe(alert.id);
  const t = await stored(repo);
  expect(t.stops).toBeUndefined();
  expect(t.plannedStop).toBeUndefined();
  expect(t.initialRisk).toBeUndefined();
  // Fixing it saves it and the error goes.
  type('Stop level 1', '6304.75');
  await waitFor(async () =>
    expect((await stored(repo)).stops?.levels).toEqual([
      { value: 6304.75, qty: 6 },
    ]),
  );
  expect(within(group('Stops')).queryByRole('alert')).toBeNull();
  expect(box('Stop level 1').getAttribute('aria-invalid')).toBeNull();
});

test('a target on the loss side is refused, with the side named for a short', async () => {
  const { repo } = await open({ direction: 'short' });
  fireEvent.click(
    within(group('Targets')).getByRole('button', { name: 'Add level' }),
  );
  // A short's target above the entry.
  type('Target level 1', '6315');
  const alert = await within(group('Targets')).findByRole('alert');
  expect(alert.textContent).toBe(
    'A target on a short goes below the average entry, 6,309.75.',
  );
  expect((await stored(repo)).targets).toBeUndefined();
});

test('a level at the average entry is a break-even stop, not an error', async () => {
  const { repo } = await open({});
  fireEvent.click(
    within(group('Stops')).getByRole('button', { name: 'Add level' }),
  );
  type('Stop level 1', '6309.75');
  await waitFor(async () =>
    expect((await stored(repo)).stops?.levels).toHaveLength(1),
  );
  expect(within(group('Stops')).queryByRole('alert')).toBeNull();
});

test('over-size shows its error', async () => {
  // A merge or a split left these stops covering 8 of 6 contracts.
  await open({
    stops: side('price', [6304.75, 4], [6300, 4]),
    initialRisk: 1,
  });
  const alert = await within(group('Stops')).findByRole('alert');
  expect(alert.textContent).toBe(
    'Stops cover 8 contracts, more than the position of 6.',
  );
  // On the level that crosses the position.
  expect(box('Stop quantity 2').getAttribute('aria-invalid')).toBe('true');
  expect(box('Stop quantity 1').getAttribute('aria-invalid')).toBeNull();
});

test('an edit that takes a side past the position is refused, with the error', async () => {
  const { repo } = await open({
    stops: side('price', [6304.75, 6]),
    initialRisk: 180000,
  });
  type('Stop quantity 1', '7');
  const alert = await within(group('Stops')).findByRole('alert');
  expect(alert.textContent).toBe(
    'Stops cover 7 contracts, more than the position of 6.',
  );
  expect((await stored(repo)).stops?.levels).toEqual([
    { value: 6304.75, qty: 6 },
  ]);
  // The refused text stays to be corrected; Escape gives the saved one back.
  expect((box('Stop quantity 1') as HTMLInputElement).value).toBe('7');
  fireEvent.keyDown(box('Stop quantity 1'), { key: 'Escape' });
  expect((box('Stop quantity 1') as HTMLInputElement).value).toBe('6');
  expect(within(group('Stops')).queryByRole('alert')).toBeNull();
});

test('a level may not have no quantity', async () => {
  const { repo } = await open({
    stops: side('price', [6304.75, 6]),
    initialRisk: 180000,
  });
  type('Stop quantity 1', '0');
  const alert = await within(group('Stops')).findByRole('alert');
  expect(alert.textContent).toBe('A level needs a quantity above 0.');
  expect((await stored(repo)).stops?.levels[0]?.qty).toBe(6);
});

test('a price must be a number above 0', async () => {
  const { repo } = await open({
    stops: side('price', [6304.75, 6]),
    initialRisk: 180000,
  });
  type('Stop level 1', 'abc');
  expect((await within(group('Stops')).findByRole('alert')).textContent).toBe(
    'Enter a price above 0.',
  );
  type('Stop level 1', '-3');
  expect((await within(group('Stops')).findByRole('alert')).textContent).toBe(
    'Enter a price above 0.',
  );
  expect((await stored(repo)).stops?.levels[0]?.value).toBe(6304.75);
});

test('Enter saves a level, as leaving the field does', async () => {
  const { repo } = await open({
    stops: side('price', [6304.75, 6]),
    initialRisk: 180000,
  });
  const input = box('Stop level 1');
  input.focus();
  fireEvent.change(input, { target: { value: '6300' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(async () =>
    expect((await stored(repo)).stops?.levels[0]?.value).toBe(6300),
  );
});

test('removing the last level clears the side and its risk', async () => {
  const { repo } = await open({
    stops: side('price', [6304.75, 6]),
    initialRisk: 180000,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Remove stop level 1' }));
  await waitFor(async () => expect((await stored(repo)).stops).toBeUndefined());
  const t = await stored(repo);
  expect(t.initialRisk).toBeUndefined();
  expect(t.plannedStop).toBeUndefined();
  await waitFor(() =>
    expect(
      within(group('Stops')).getByText('No stop levels yet.'),
    ).toBeTruthy(),
  );
});

test('removing one of several levels keeps the others', async () => {
  const { repo } = await open({
    stops: side('price', [6304.75, 4], [6300, 2]),
    initialRisk: 1,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Remove stop level 1' }));
  await waitFor(async () =>
    expect((await stored(repo)).stops?.levels).toEqual([
      { value: 6300, qty: 2 },
    ]),
  );
});

test('the unit list follows the instrument', async () => {
  const futures = await open({});
  fireEvent.keyDown(screen.getByRole('button', { name: 'Stops unit, Price' }), {
    key: 'Enter',
  });
  const items = await screen.findAllByRole('menuitemradio');
  expect(items.map((i) => i.textContent)).toEqual([
    'Price',
    'Price movement',
    'Ticks',
    'Points',
    'Amount',
  ]);
  futures.unmount();
  cleanup();

  await open({
    instrument: resolveInstrument('EURUSD')!,
    avgEntry: 1.1,
    maxPosition: 1,
  });
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Targets unit, Price' }),
    { key: 'Enter' },
  );
  const forex = await screen.findAllByRole('menuitemradio');
  expect(forex.map((i) => i.textContent)).toEqual([
    'Price',
    'Price movement',
    'Amount',
    'Pips',
  ]);
});

test('changing the unit keeps every level where it is', async () => {
  const { repo } = await open({
    stops: side('price', [6304.75, 6]),
    initialRisk: 150000,
  });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Stops unit, Price' }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Ticks' }));
  await waitFor(async () =>
    expect((await stored(repo)).stops).toEqual(side('ticks', [20, 6])),
  );
  // The same loss: 5 points on 6 contracts at $50.
  expect((await stored(repo)).initialRisk).toBe(150000);
  await waitFor(() =>
    expect((box('Stop level 1') as HTMLInputElement).value).toBe('20'),
  );
  expect(within(group('Stops')).getByText('ticks')).toBeTruthy();
});

test('the unit of a side with no levels is kept for its first level', async () => {
  const { repo } = await open({});
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Targets unit, Price' }),
    { key: 'Enter' },
  );
  fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Points' }));
  fireEvent.click(
    within(group('Targets')).getByRole('button', { name: 'Add level' }),
  );
  type('Target level 1', '4');
  await waitFor(async () =>
    expect((await stored(repo)).targets).toEqual(side('points', [4, 6])),
  );
});

test('a trade saved before levels shows its stop as one level, and the first edit saves in levels', async () => {
  const { repo } = await open({ plannedStop: 6304.75, initialRisk: 150000 });
  expect((box('Stop level 1') as HTMLInputElement).value).toBe('6,304.75');
  expect((box('Stop quantity 1') as HTMLInputElement).value).toBe('6');
  type('Stop quantity 1', '3');
  await waitFor(async () =>
    expect((await stored(repo)).stops?.levels).toEqual([
      { value: 6304.75, qty: 3 },
    ]),
  );
  const t = await stored(repo);
  expect(t.plannedStop).toBeUndefined();
  // A shortfall counts only the covered quantity.
  expect(t.initialRisk).toBe(75000);
});

test('saving one side leaves the other as it was', async () => {
  const { repo } = await open({
    plannedStop: 6304.75,
    plannedTarget: 6319,
    initialRisk: 150000,
  });
  type('Stop level 1', '6300');
  await waitFor(async () =>
    expect((await stored(repo)).stops?.levels).toEqual([
      { value: 6300, qty: 6 },
    ]),
  );
  const t = await stored(repo);
  expect(t.targets?.levels).toEqual([{ value: 6319, qty: 6 }]);
  expect(t.plannedTarget).toBeUndefined();
  expect(t.plannedStop).toBeUndefined();
});

test('with a target and a stop the page shows planned R, realized R, reward and risk, in that order', async () => {
  await open({
    stops: side('price', [6304.75, 6]),
    targets: side('price', [6319, 6]),
    initialRisk: 150000,
  });
  const text = screen.getByRole('region', { name: 'Execution' }).textContent!;
  // 9.25 points x 6 x $50 over 5 points x 6 x $50.
  expect(text).toContain('Planned R1.85R');
  expect(text).toContain('Realized R+0.54R');
  expect(text).toContain('Planned reward$2,775.00');
  expect(text).toContain('Planned risk$1,500.00');
  const at = (s: string) => text.indexOf(s);
  expect(at('Planned R1.85R')).toBeLessThan(at('Realized R+0.54R'));
  expect(at('Realized R+0.54R')).toBeLessThan(at('Planned reward'));
  expect(at('Planned reward')).toBeLessThan(at('Planned risk$'));
  expect(text).toContain('if every target fills');
  expect(text).toContain('if every stop fills');
});

test('stops only: Planned R, reward and risk read None, Realized R a figure', async () => {
  await open({
    stops: side('price', [6304.75, 6]),
    initialRisk: 150000,
  });
  const text = screen.getByRole('region', { name: 'Execution' }).textContent!;
  expect(text).toContain('Planned RNone');
  expect(text).toContain('Planned rewardNone');
  expect(text).toContain('Planned riskNone');
  expect(text).toContain('Realized R+0.54R');
  expect(text).toContain('needs a target and a stop');
  expect(
    within(group('Targets')).getByText('No target levels yet.'),
  ).toBeTruthy();
});

test('an open trade has a planned R and no realized R', async () => {
  await open({
    status: 'open',
    closedAt: undefined,
    avgExit: undefined,
    stops: side('price', [6304.75, 6]),
    targets: side('price', [6319, 6]),
    initialRisk: 150000,
  });
  const text = screen.getByRole('region', { name: 'Execution' }).textContent!;
  expect(text).toContain('Planned R1.85R');
  expect(text).toContain('Realized RNone');
});

test('the planned reward and planned risk labels carry their definitions', async () => {
  await open({
    stops: side('price', [6304.75, 6]),
    targets: side('price', [6319, 6]),
    initialRisk: 150000,
  });
  const exec = screen.getByRole('region', { name: 'Execution' });
  const tips = [...exec.querySelectorAll('[data-metric-tip]')].map(
    (e) => (e as HTMLElement).dataset.metricTip,
  );
  expect(tips).toEqual(
    expect.arrayContaining(['planned-r', 'planned-reward', 'planned-risk']),
  );
});

test('Privacy masks reward, risk and amount levels', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: sample({
      stops: side('amount', [150, 6]),
      targets: side('amount', [300, 6]),
      initialRisk: 15000,
    }),
  });
  await repository.prefs.update({ displayUnit: 'privacy' });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  await screen.findByRole('group', { name: 'Stops' });
  const exec = screen.getByRole('region', { name: 'Execution' });
  expect(exec.textContent).toContain('Planned reward$•••');
  expect(exec.textContent).toContain('Planned risk$•••');
  // The level's amount is hidden, and the field says so rather than take edits.
  const stop = box('Stop level 1') as HTMLInputElement;
  expect(stop.value).toBe('$•••');
  expect(stop.readOnly).toBe(true);
  expect((box('Target level 1') as HTMLInputElement).value).toBe('$•••');
  // The quantity is not money: it stays editable.
  expect((box('Stop quantity 1') as HTMLInputElement).readOnly).toBe(false);
  expect(
    within(group('Stops'))
      .getByRole('button', { name: 'Add level' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(everyString(document.body).filter((s) => /\$\s?\d/.test(s))).toEqual(
    [],
  );
  expect(document.body.textContent).not.toMatch(/\b150\b|\b300\b|2,775|1,500/);
});

test('an archived account leaves every level read-only', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const w = await sample({
        stops: side('price', [6304.75, 6]),
        initialRisk: 150000,
      })();
      return {
        ...w,
        trades: w.trades.map((t) => ({ ...t, accountId: 'acc-b' })),
      };
    },
  });
  renderApp(<TradeView id="t-c" />, { repository, url: URL_C });
  await screen.findByRole('group', { name: 'Stops' });
  for (const name of ['Stop level 1', 'Stop quantity 1'])
    expect(box(name).hasAttribute('disabled')).toBe(true);
  const stops = group('Stops');
  expect(
    within(stops)
      .getByRole('button', { name: 'Add level' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen
      .getByRole('button', { name: 'Remove stop level 1' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen
      .getByRole('button', { name: 'Stops unit, Price' })
      .hasAttribute('disabled'),
  ).toBe(true);
});

test('at phone width a block stacks and a level row is value over quantity with remove at the end', async () => {
  await open({
    stops: side('price', [6304.75, 6]),
    initialRisk: 150000,
  });
  const row = box('Stop level 1').closest('[data-level-row]') as HTMLElement;
  expect(row.className).toContain('max-sm:grid-cols-[minmax(0,1fr)_44px]');
  const remove = screen.getByRole('button', { name: 'Remove stop level 1' });
  expect(remove.className).toContain('max-sm:size-11');
  expect(group('Stops').className).toContain('max-sm:grid-cols-1');
});

test('the average entry sits between the targets and the stops', async () => {
  await open({
    stops: side('price', [6304.75, 6]),
    initialRisk: 150000,
  });
  const plan = screen.getByRole('group', { name: 'Plan' });
  const text = plan.textContent!;
  expect(text).toContain('Avg entry 6,309.75, 6 contracts');
  expect(text.indexOf('Targets')).toBeLessThan(text.indexOf('Avg entry'));
  expect(text.indexOf('Avg entry')).toBeLessThan(text.indexOf('Stops'));
});

test('the size helper fills the quantity from a share of the position', async () => {
  const { repo } = await open({
    stops: side('price', [6304.75, 6]),
    initialRisk: 180000,
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Fill stop quantity 1 from a share of the position',
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: '50%' }));
  await waitFor(async () =>
    expect((await stored(repo)).stops?.levels[0]?.qty).toBe(3),
  );
});

test('the size helper offers shares, takes another, and refuses one outside 1 to 100', async () => {
  const onPick = vi.fn();
  render(<SizeHelper position={6} onPick={onPick} />);
  const open = () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Fill from a share of the position' }),
    );
  open();
  for (const share of ['25%', '50%', '75%', '100%'])
    expect(screen.getByRole('button', { name: share })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '25%' }));
  expect(onPick).toHaveBeenLastCalledWith(1.5);
  // It closes once it has filled.
  expect(screen.queryByRole('button', { name: '25%' })).toBeNull();

  open();
  const share = await screen.findByRole('textbox', {
    name: 'Other share, percent',
  });
  fireEvent.change(share, { target: { value: '33.5' } });
  fireEvent.submit(share.closest('form')!);
  expect(onPick).toHaveBeenLastCalledWith(2.01);

  open();
  const again = await screen.findByRole('textbox', {
    name: 'Other share, percent',
  });
  fireEvent.change(again, { target: { value: '150' } });
  fireEvent.submit(again.closest('form')!);
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Enter a share from 1 to 100.',
  );
  expect(onPick).toHaveBeenCalledTimes(2);
});

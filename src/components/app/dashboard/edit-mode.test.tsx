// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useEffect } from 'react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { useUpdatePrefs } from '@/data/query/hooks';
import { DEFAULT_TEMPLATE } from '@/domain/dashboard/templates';
import type { DashTemplate, WidgetRef } from '@/domain/types';
import { renderApp } from '../__fixtures__/render-app';
import { viewport } from '../__fixtures__/viewport';
import { TopBar } from '../top-bar';
import { DashboardView } from './dashboard-view';
import { DashboardEditProvider } from './edit-session';
import { EditSheet } from './edit-mode';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const review: DashTemplate = {
  id: 'review',
  name: 'Review',
  upper: [{ key: 'expectancy' }],
  lower: [{ key: 'drawdown' }, { key: 'trade-time' }],
};

type Dashboards = { inUse: string; templates: DashTemplate[] };

/** Lets a test write the prefs the way another part of the app would. */
let writePrefs: ((dashboards: Dashboards) => Promise<unknown>) | undefined;
function Poke(): null {
  const update = useUpdatePrefs();
  useEffect(() => {
    writePrefs = (dashboards) => update.mutateAsync({ dashboards });
  });
  return null;
}

async function mount(opts: { dashboards?: Dashboards; phone?: boolean } = {}) {
  viewport({ phone: opts.phone === true });
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  if (opts.dashboards)
    await repository.prefs.update({ dashboards: opts.dashboards });
  const rendered = renderApp(
    <DashboardEditProvider>
      <TopBar />
      <Poke />
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a plain link: the guard under test reads anchors */}
      <a
        href="/app/trades"
        onClick={(e) => e.preventDefault()}
        data-testid="elsewhere"
      >
        Trades
      </a>
      <DashboardView />
      <EditSheet />
    </DashboardEditProvider>,
    { repository },
  );
  await screen.findByTestId('dashboard-ready');
  return { ...rendered, repository };
}

const two: Dashboards = {
  inUse: 'main',
  templates: [DEFAULT_TEMPLATE, review],
};

/** Opens the template menu and presses Edit on `name`. */
async function edit(name = 'Main') {
  fireEvent.click(
    await screen.findByRole('button', { name: /^Dashboard template:/ }),
  );
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }));
}

/** Edit mode on a wide screen: its name field is there. */
const nameField = () =>
  screen.findByRole('textbox', {
    name: 'Template name',
  }) as Promise<HTMLInputElement>;

const card = (title: string) => screen.getByRole('region', { name: title });
const button = (name: string) => screen.getByRole('button', { name });

/** The widgets of a section, in order, as the bars name them. */
function order(section: 'upper' | 'lower'): string[] {
  const group = screen.getByRole('group', {
    name:
      section === 'upper' ? 'Upper section widgets' : 'Lower section widgets',
    hidden: true,
  });
  return [...group.querySelectorAll<HTMLElement>('[data-edit-item]')].map(
    (el) => el.getAttribute('aria-label')!,
  );
}

const keysOf = (refs: WidgetRef[]) => refs.map((r) => r.key);

async function stored(repository: {
  prefs: { get(): Promise<{ dashboards?: Dashboards }> };
}) {
  return (await repository.prefs.get()).dashboards;
}

async function save() {
  fireEvent.click(button('Save template'));
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull(),
  );
}

// ---------------------------------------------------------------------------
// The mode itself

test('Edit replaces the top bar with the name field, the move hint, Cancel and Save template; there is no reset control', async () => {
  await mount();
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
  await edit();
  const field = await nameField();
  expect(field.value).toBe('Main');
  expect(field.maxLength).toBe(40);
  // The field takes focus.
  expect(document.activeElement).toBe(field);
  expect(
    screen.getByText('Drag a widget, or use its arrows, to move it.'),
  ).toBeTruthy();
  button('Cancel');
  button('Save template');
  // The bar it replaced is gone, and TradeZella's reset has no counterpart.
  expect(screen.queryByRole('heading', { name: 'Dashboard' })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Import$/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
  expect(screen.queryByText(/reset to default/i)).toBeNull();
  // The page's own widgets are not drawn while editing.
  expect(document.querySelector('[data-testid="dashboard-ready"]')).toBeNull();
});

test('each widget shows its bar: a grip, Move earlier, Move later and Remove, over a dimmed body', async () => {
  await mount();
  await edit();
  await nameField();
  expect(order('upper')).toEqual([
    'Net P&L',
    'Trade win rate',
    'Profit factor',
    'Day win rate',
    'Average win to loss',
  ]);
  expect(order('lower')).toEqual([
    'Edge score',
    'Progress tracker',
    'Cumulative net P&L',
    'Net daily P&L',
    'Recent trades',
    'Account balance',
    'Calendar, with stats',
    'Drawdown',
    'Trade time performance',
    'Trade duration performance',
  ]);
  const edgeScore = card('Edge score');
  within(edgeScore).getByRole('button', { name: 'Move Edge score earlier' });
  within(edgeScore).getByRole('button', { name: 'Move Edge score later' });
  within(edgeScore).getByRole('button', { name: 'Remove Edge score' });
  expect(edgeScore.querySelector('[data-edit-grip]')).not.toBeNull();
  const body = edgeScore.querySelector('[data-edit-body]')!;
  expect(body.getAttribute('aria-hidden')).toBe('true');
  expect(body.className).toMatch(/opacity-/);
  expect(screen.getByRole('heading', { name: 'Upper section' })).toBeTruthy();
  expect(screen.getByText('Up to 5 figures; this one is full')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Lower section' })).toBeTruthy();
});

test('a full upper section has no add place; the lower section ends with one', async () => {
  await mount();
  await edit();
  await nameField();
  const slots = screen.getAllByRole('button', { name: /^Add a widget/ });
  expect(slots).toHaveLength(1);
  expect(slots[0]!.textContent).toContain('Lower section');
});

test('an upper section short of five shows one dashed add place for each empty one', async () => {
  await mount({
    dashboards: {
      inUse: 'main',
      templates: [
        { ...DEFAULT_TEMPLATE, upper: DEFAULT_TEMPLATE.upper.slice(0, 3) },
      ],
    },
  });
  await edit();
  await nameField();
  const slots = screen
    .getAllByRole('button', { name: /^Add a widget/ })
    .filter((b) => b.textContent?.includes('Upper section'));
  expect(slots).toHaveLength(2);
  expect(screen.getByText('Up to 5 figures; 2 places left')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Remove, add, move

test('Remove takes a widget off the draft; Save writes the template without it', async () => {
  const { repository } = await mount();
  await edit();
  await nameField();
  fireEvent.click(button('Remove Net P&L'));
  expect(order('upper')).toEqual([
    'Trade win rate',
    'Profit factor',
    'Day win rate',
    'Average win to loss',
  ]);
  // The empty place appears.
  expect(
    screen
      .getAllByRole('button', { name: /^Add a widget/ })
      .filter((b) => b.textContent?.includes('Upper section')),
  ).toHaveLength(1);
  // Nothing is written before Save.
  expect(await stored(repository)).toBeUndefined();
  await save();
  const saved = (await stored(repository))!;
  expect(saved.inUse).toBe('main');
  expect(keysOf(saved.templates[0]!.upper)).toEqual([
    'trade-win',
    'profit-factor',
    'day-win',
    'win-loss-ratio',
  ]);
  expect(keysOf(saved.templates[0]!.lower)).toEqual(
    keysOf(DEFAULT_TEMPLATE.lower),
  );
});

test('Remove hands focus to the next widget, or the one before when it was the last', async () => {
  await mount();
  await edit();
  await nameField();
  fireEvent.click(button('Remove Edge score'));
  await waitFor(() =>
    expect(document.activeElement).toBe(button('Remove Progress tracker')),
  );
  fireEvent.click(button('Remove Trade duration performance'));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      button('Remove Trade time performance'),
    ),
  );
});

test('removing the last widget of a section hands focus to its add place', async () => {
  await mount({
    dashboards: {
      inUse: 'one',
      templates: [
        {
          id: 'one',
          name: 'One',
          upper: [{ key: 'net-pnl' }],
          lower: [{ key: 'score' }],
        },
      ],
    },
  });
  await edit('One');
  await nameField();
  fireEvent.click(button('Remove Net P&L'));
  await waitFor(() =>
    expect(
      (document.activeElement as HTMLElement).getAttribute('data-edit-slot'),
    ).toBe('upper'),
  );
  fireEvent.click(button('Remove Edge score'));
  await waitFor(() =>
    expect(
      (document.activeElement as HTMLElement).getAttribute('data-edit-slot'),
    ).toBe('lower'),
  );
});

test('the lower add place opens a picker of only the lower widgets not on the template, each with an Add button', async () => {
  await mount();
  await edit();
  await nameField();
  fireEvent.click(screen.getByRole('button', { name: /^Add a widget/ }));
  const picker = await screen.findByRole('dialog', { name: 'Add a widget' });
  expect(
    within(picker).getByText(
      "For the lower section. Widgets already on this template aren't listed.",
    ),
  ).toBeTruthy();
  const rows = within(picker).getAllByRole('listitem');
  const names = rows.map((li) => li.querySelector('b')!.textContent);
  expect(names).toEqual([
    'Win rate, average win and average loss',
    'Daily and cumulative net P&L',
    'Calendar',
    'Challenge',
    'Mini calendar',
    'Report',
    'Year calendar',
  ]);
  // Each has its blurb and its Add button; nothing already placed is listed.
  expect(
    within(rows[0]!).getByText(
      'The three, running through the day, by the time each trade closed.',
    ),
  ).toBeTruthy();
  for (const li of rows) within(li).getByRole('button', { name: /^Add / });
  for (const placed of order('lower'))
    expect(within(picker).queryByText(placed)).toBeNull();
  // No upper widget is offered in the lower picker.
  expect(within(picker).queryByText('Net P&L')).toBeNull();
});

test('Add puts the widget at the end of its section, and the picker no longer lists it', async () => {
  const { repository } = await mount();
  await edit();
  await nameField();
  fireEvent.click(screen.getByRole('button', { name: /^Add a widget/ }));
  const picker = await screen.findByRole('dialog', { name: 'Add a widget' });
  fireEvent.click(within(picker).getByRole('button', { name: 'Add Calendar' }));
  expect(
    within(picker).queryByRole('button', { name: 'Add Calendar' }),
  ).toBeNull();
  expect(within(picker).getAllByRole('listitem')).toHaveLength(6);
  fireEvent.keyDown(picker, { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Add a widget' })).toBeNull(),
  );
  expect(order('lower').at(-1)).toBe('Calendar');
  await save();
  const saved = (await stored(repository))!.templates[0]!;
  expect(keysOf(saved.lower).at(-1)).toBe('calendar');
  expect(saved.lower.map((r) => r.key)).toHaveLength(11);
});

test('the picker lists a widget again once it is taken off the template, and the upper picker lists the upper ones', async () => {
  await mount();
  await edit();
  await nameField();
  fireEvent.click(button('Remove Net P&L'));
  const slot = screen
    .getAllByRole('button', { name: /^Add a widget/ })
    .find((b) => b.textContent?.includes('Upper section'))!;
  fireEvent.click(slot);
  const picker = await screen.findByRole('dialog', { name: 'Add a widget' });
  expect(
    within(picker).getByText(
      "For the upper section. Widgets already on this template aren't listed.",
    ),
  ).toBeTruthy();
  const names = within(picker)
    .getAllByRole('listitem')
    .map((li) => li.querySelector('b')!.textContent);
  expect(names).toEqual([
    'Net P&L',
    'Account balance and P&L',
    'Trade expectancy',
    'Winning day streak',
    'Winning trade streak',
    'Streaks',
    'Max drawdown',
    'Average drawdown',
  ]);
  // Those still on the template are not.
  expect(names).not.toContain('Trade win rate');
  expect(names).not.toContain('Profit factor');
});

test('adding to the upper section until it holds five greys the rest of the picker, and the add place is gone', async () => {
  await mount();
  await edit();
  await nameField();
  fireEvent.click(button('Remove Net P&L'));
  fireEvent.click(
    screen
      .getAllByRole('button', { name: /^Add a widget/ })
      .find((b) => b.textContent?.includes('Upper section'))!,
  );
  const picker = await screen.findByRole('dialog', { name: 'Add a widget' });
  // Room for one: every Add is on.
  for (const b of within(picker).getAllByRole('button', { name: /^Add / }))
    expect((b as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(within(picker).getByRole('button', { name: 'Add Streaks' }));
  expect(order('upper')).toContain('Streaks');
  for (const b of within(picker).getAllByRole('button', { name: /^Add / }))
    expect((b as HTMLButtonElement).disabled).toBe(true);
  expect(within(picker).getByText('The upper section is full.')).toBeTruthy();
  fireEvent.keyDown(picker, { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Add a widget' })).toBeNull(),
  );
  expect(
    screen
      .getAllByRole('button', { name: /^Add a widget/ })
      .filter((b) => b.textContent?.includes('Upper section')),
  ).toHaveLength(0);
  expect(screen.getByText('Up to 5 figures; this one is full')).toBeTruthy();
});

test('Move later and Move earlier reorder by keyboard, and focus stays on the control used', async () => {
  const { repository } = await mount();
  await edit();
  await nameField();
  const later = button('Move Edge score later');
  later.focus();
  fireEvent.click(later);
  expect(order('lower').slice(0, 3)).toEqual([
    'Progress tracker',
    'Edge score',
    'Cumulative net P&L',
  ]);
  await waitFor(() =>
    expect(document.activeElement).toBe(button('Move Edge score later')),
  );
  // A polite note says where it went.
  expect(screen.getByRole('status').textContent).toBe(
    'Edge score moved to place 2 of 10 in the lower section.',
  );
  fireEvent.click(button('Move Edge score earlier'));
  expect(order('lower').slice(0, 2)).toEqual([
    'Edge score',
    'Progress tracker',
  ]);
  await waitFor(() =>
    expect(document.activeElement).toBe(button('Move Edge score earlier')),
  );
  // The first widget has nowhere earlier to go, and says so without leaving the tab order.
  const first = button('Move Edge score earlier');
  expect(first.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(first);
  expect(order('lower')[0]).toBe('Edge score');
  // The upper section moves too.
  fireEvent.click(button('Move Net P&L later'));
  expect(order('upper').slice(0, 2)).toEqual(['Trade win rate', 'Net P&L']);
  fireEvent.click(button('Move Edge score later'));
  await save();
  const saved = (await stored(repository))!.templates[0]!;
  expect(keysOf(saved.upper).slice(0, 2)).toEqual(['trade-win', 'net-pnl']);
  expect(keysOf(saved.lower).slice(0, 2)).toEqual(['progress', 'score']);
});

test('dragging a grip onto another widget of its section moves it there; another section is ignored', async () => {
  const { repository } = await mount();
  await edit();
  await nameField();
  const at = (el: Element | null) => {
    document.elementFromPoint = () => el as Element;
  };
  const grip = card('Edge score').querySelector('[data-edit-grip]')!;
  fireEvent.pointerDown(grip, {
    button: 0,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
  });
  at(card('Net daily P&L').querySelector('[data-edit-body]'));
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: 20, clientY: 400 });
  expect(card('Net daily P&L').getAttribute('data-drop')).toBe('true');
  fireEvent.pointerUp(grip, { pointerId: 1, clientX: 20, clientY: 400 });
  expect(order('lower').slice(0, 4)).toEqual([
    'Progress tracker',
    'Cumulative net P&L',
    'Net daily P&L',
    'Edge score',
  ]);
  expect(card('Net daily P&L').hasAttribute('data-drop')).toBe(false);

  // Over the upper section nothing moves.
  const grip2 = card('Recent trades').querySelector('[data-edit-grip]')!;
  fireEvent.pointerDown(grip2, { button: 0, pointerId: 2 });
  at(card('Net P&L').querySelector('[data-edit-body]'));
  fireEvent.pointerMove(grip2, { pointerId: 2 });
  expect(card('Net P&L').hasAttribute('data-drop')).toBe(false);
  fireEvent.pointerUp(grip2, { pointerId: 2 });
  expect(order('upper')[0]).toBe('Net P&L');
  expect(order('lower')[4]).toBe('Recent trades');

  // A drag that is cancelled drops nothing.
  const grip3 = card('Drawdown').querySelector('[data-edit-grip]')!;
  fireEvent.pointerDown(grip3, { button: 0, pointerId: 3 });
  at(card('Progress tracker').querySelector('[data-edit-body]'));
  fireEvent.pointerMove(grip3, { pointerId: 3 });
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.pointerUp(grip3, { pointerId: 3 });
  expect(order('lower')[0]).toBe('Progress tracker');
  expect(order('lower')).toContain('Drawdown');
  expect(order('lower').indexOf('Drawdown')).toBe(7);

  await save();
  const saved = (await stored(repository))!.templates[0]!;
  expect(keysOf(saved.lower).slice(0, 4)).toEqual([
    'progress',
    'cum-pnl',
    'daily-pnl',
    'score',
  ]);
});

// ---------------------------------------------------------------------------
// Name, Save, Cancel

test('renaming and saving writes the name, puts the template in use and names the button for it', async () => {
  const { repository } = await mount();
  await edit();
  const field = await nameField();
  fireEvent.change(field, { target: { value: '  Morning review ' } });
  await save();
  const saved = (await stored(repository))!;
  expect(saved.inUse).toBe('main');
  expect(saved.templates[0]!.name).toBe('Morning review');
  const trigger = await screen.findByRole('button', {
    name: 'Dashboard template: Morning review',
  });
  // Focus goes back to the template button, and the page is back.
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  await screen.findByTestId('dashboard-ready');
});

test('a blank name is refused in words and nothing is written', async () => {
  const { repository } = await mount();
  await edit();
  const field = await nameField();
  fireEvent.change(field, { target: { value: '   ' } });
  fireEvent.click(button('Save template'));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('Name the template, up to 40 characters.');
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(field);
  expect(await stored(repository)).toBeUndefined();
  // Typing a name clears the complaint.
  fireEvent.change(field, { target: { value: 'Fine' } });
  expect(screen.queryByRole('alert')).toBeNull();
});

test('Cancel drops the draft: nothing is written and the page shows the template as it was', async () => {
  const { repository } = await mount();
  await edit();
  const field = await nameField();
  fireEvent.change(field, { target: { value: 'Scratch' } });
  fireEvent.click(button('Remove Net P&L'));
  fireEvent.click(button('Cancel'));
  await screen.findByTestId('dashboard-ready');
  expect(await stored(repository)).toBeUndefined();
  expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull();
  // The next edit starts from the stored template, not the dropped draft.
  await edit();
  expect((await nameField()).value).toBe('Main');
  expect(order('upper')).toHaveLength(5);
});

test('saving with nothing changed writes nothing and leaves the mode', async () => {
  const { repository } = await mount();
  await edit();
  await nameField();
  await save();
  expect(await stored(repository)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Unknown keys, settings, other templates

test('a widget this build does not know stays on the template through a save, and shows as a bar', async () => {
  const odd: DashTemplate = {
    id: 'odd',
    name: 'Odd',
    upper: [{ key: 'net-pnl' }],
    lower: [{ key: 'from-the-future' }, { key: 'score' }, { key: 'drawdown' }],
  };
  const { repository } = await mount({
    dashboards: { inUse: 'odd', templates: [odd] },
  });
  await edit('Odd');
  await nameField();
  expect(order('lower')).toEqual(['Unknown widget', 'Edge score', 'Drawdown']);
  fireEvent.click(button('Move Edge score earlier'));
  fireEvent.click(button('Remove Drawdown'));
  await save();
  const saved = (await stored(repository))!.templates[0]!;
  expect(keysOf(saved.lower)).toEqual(['score', 'from-the-future']);
});

test("a widget's settings survive moves, removals of others and a save", async () => {
  const withSettings: DashTemplate = {
    id: 'w',
    name: 'Settings',
    upper: [],
    lower: [
      { key: 'score' },
      { key: 'trade-time', settings: { time: 'exit' } },
      {
        key: 'report',
        settings: { metrics: ['net:line:running', 'wins:bar'] },
      },
      { key: 'challenge', settings: { challengeId: 'c-7' } },
    ],
  };
  const { repository } = await mount({
    dashboards: { inUse: 'w', templates: [withSettings] },
  });
  await edit('Settings');
  await nameField();
  fireEvent.click(button('Move Trade time performance later'));
  fireEvent.click(button('Move Challenge earlier'));
  fireEvent.click(button('Remove Edge score'));
  await save();
  const saved = (await stored(repository))!.templates[0]!;
  expect(saved.lower).toEqual([
    { key: 'report', settings: { metrics: ['net:line:running', 'wins:bar'] } },
    { key: 'challenge', settings: { challengeId: 'c-7' } },
    { key: 'trade-time', settings: { time: 'exit' } },
  ]);
});

test('Save puts the template being edited in use; Cancel leaves the one in use alone', async () => {
  const { repository } = await mount({ dashboards: two });
  await edit('Review');
  expect((await nameField()).value).toBe('Review');
  expect(order('upper')).toEqual(['Trade expectancy']);
  fireEvent.click(button('Cancel'));
  await screen.findByTestId('dashboard-ready');
  expect((await stored(repository))!.inUse).toBe('main');
  await edit('Review');
  await nameField();
  fireEvent.click(button('Remove Drawdown'));
  await save();
  const saved = (await stored(repository))!;
  expect(saved.inUse).toBe('review');
  expect(keysOf(saved.templates[1]!.lower)).toEqual(['trade-time']);
  expect(saved.templates[0]).toEqual(DEFAULT_TEMPLATE);
});

// ---------------------------------------------------------------------------
// Delete

test('Delete template is not offered on the last template', async () => {
  await mount();
  await edit();
  await nameField();
  expect(screen.queryByRole('button', { name: 'Delete template' })).toBeNull();
  fireEvent.click(button('Cancel'));
  await screen.findByTestId('dashboard-ready');
  // Nor on a saved list of one.
  cleanup();
  await mount({
    dashboards: { inUse: 'review', templates: [review] },
  });
  await edit('Review');
  await nameField();
  expect(screen.queryByRole('button', { name: 'Delete template' })).toBeNull();
});

test('Delete template asks first, then removes the one in use and points inUse at the first one left', async () => {
  const { repository } = await mount({
    dashboards: { inUse: 'review', templates: [DEFAULT_TEMPLATE, review] },
  });
  await edit('Review');
  await nameField();
  fireEvent.click(button('Delete template'));
  const confirm = await screen.findByRole('dialog', {
    name: 'Delete this template?',
  });
  expect(confirm.textContent).toContain('Review');
  // Keeping it changes nothing.
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Delete this template?' }),
    ).toBeNull(),
  );
  expect((await stored(repository))!.templates).toHaveLength(2);
  fireEvent.click(button('Delete template'));
  fireEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'Delete this template?' }),
    ).getByRole('button', { name: 'Delete template' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull(),
  );
  const saved = (await stored(repository))!;
  expect(saved.inUse).toBe('main');
  expect(saved.templates.map((t) => t.id)).toEqual(['main']);
  await screen.findByRole('button', { name: 'Dashboard template: Main' });
});

test('deleting a template that is not in use leaves the one in use in use', async () => {
  const { repository } = await mount({ dashboards: two });
  await edit('Review');
  await nameField();
  fireEvent.click(button('Delete template'));
  fireEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'Delete this template?' }),
    ).getByRole('button', { name: 'Delete template' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull(),
  );
  const saved = (await stored(repository))!;
  expect(saved.inUse).toBe('main');
  expect(saved.templates.map((t) => t.id)).toEqual(['main']);
});

// ---------------------------------------------------------------------------
// Leaving, and a template saved elsewhere

test('leaving by a link with unsaved changes asks first; keep editing stays, discard goes', async () => {
  const { repository } = await mount();
  await edit();
  await nameField();
  fireEvent.click(button('Remove Net P&L'));
  const link = screen.getByTestId('elsewhere');
  const proceeded = fireEvent.click(link, { button: 0 });
  // The click was held back.
  expect(proceeded).toBe(false);
  const ask = await screen.findByRole('dialog', {
    name: 'Leave without saving?',
  });
  expect(ask.textContent).toContain('Main');
  fireEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Leave without saving?' }),
    ).toBeNull(),
  );
  expect(window.location.pathname).toBe('/app/dashboard');
  expect(order('upper')).toHaveLength(4);

  fireEvent.click(link, { button: 0 });
  fireEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'Leave without saving?' }),
    ).getByRole('button', { name: 'Discard changes' }),
  );
  await waitFor(() => expect(window.location.pathname).toBe('/app/trades'));
  expect(await stored(repository)).toBeUndefined();
  expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull();
});

test('leaving with nothing changed, or after Cancel, does not ask', async () => {
  await mount();
  await edit();
  await nameField();
  const link = screen.getByTestId('elsewhere');
  // Nothing changed: the click goes through untouched (the test link cancels the navigation itself).
  const defaultPrevented = vi.fn();
  link.addEventListener('click', (e) => defaultPrevented(e.defaultPrevented));
  fireEvent.click(link, { button: 0 });
  expect(
    screen.queryByRole('dialog', { name: 'Leave without saving?' }),
  ).toBeNull();
  expect(defaultPrevented).toHaveBeenCalledWith(false);
});

/** Closing or reloading the tab: whether the browser is asked to confirm. */
function unloadAsks(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

test('closing or reloading the tab with unsaved changes asks the browser to confirm; clean, saved or cancelled does not', async () => {
  await mount();
  // No edit, nothing to lose.
  expect(unloadAsks()).toBe(false);
  await edit();
  await nameField();
  // An edit that changed nothing yet.
  expect(unloadAsks()).toBe(false);
  fireEvent.click(button('Remove Net P&L'));
  expect(unloadAsks()).toBe(true);
  // Cancel drops the draft: the guard goes with it.
  fireEvent.click(button('Cancel'));
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull(),
  );
  expect(unloadAsks()).toBe(false);

  // Saved changes are no longer unsaved.
  await edit();
  await nameField();
  fireEvent.click(button('Remove Net P&L'));
  expect(unloadAsks()).toBe(true);
  await save();
  expect(unloadAsks()).toBe(false);
});

test('a route change drops the draft: coming back to the Dashboard finds no edit mode', async () => {
  await mount();
  await edit();
  await nameField();
  fireEvent.click(button('Remove Net P&L'));
  act(() => window.history.pushState(null, '', '/app/trades'));
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull(),
  );
  act(() => window.history.pushState(null, '', '/app/dashboard'));
  await screen.findByTestId('dashboard-ready');
  expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull();
});

test('a template saved elsewhere does not overwrite the draft, and Save then warns before replacing it', async () => {
  const { repository } = await mount({ dashboards: two });
  await edit('Review');
  const field = await nameField();
  fireEvent.change(field, { target: { value: 'My review' } });
  // Another tab saves the same template differently; this tab hears of it.
  const theirs: DashTemplate = {
    ...review,
    name: 'Their review',
    lower: [{ key: 'score' }],
  };
  await act(async () => {
    await writePrefs!({ inUse: 'main', templates: [DEFAULT_TEMPLATE, theirs] });
  });
  // The draft is still mine.
  expect(field.value).toBe('My review');
  expect(order('lower')).toEqual(['Drawdown', 'Trade time performance']);

  fireEvent.click(button('Save template'));
  const note = await screen.findByRole('alert');
  expect(note.textContent).toBe(
    'This template was changed somewhere else since you opened it. Save again to replace it with your version, or Cancel to keep the other one.',
  );
  // Nothing was overwritten yet.
  expect((await stored(repository))!.templates[1]).toEqual(theirs);
  fireEvent.click(button('Save template'));
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull(),
  );
  const saved = (await stored(repository))!.templates[1]!;
  expect(saved.name).toBe('My review');
  expect(keysOf(saved.lower)).toEqual(['drawdown', 'trade-time']);
});

test('a template saved elsewhere with nothing in conflict still saves cleanly', async () => {
  const { repository } = await mount({ dashboards: two });
  await edit('Review');
  await nameField();
  fireEvent.click(button('Remove Drawdown'));
  // Another template changed elsewhere, not this one.
  await act(async () => {
    await writePrefs!({
      inUse: 'main',
      templates: [{ ...DEFAULT_TEMPLATE, name: 'Main elsewhere' }, review],
    });
  });
  await save();
  const saved = (await stored(repository))!;
  expect(saved.templates[0]!.name).toBe('Main elsewhere');
  expect(keysOf(saved.templates[1]!.lower)).toEqual(['trade-time']);
});

// ---------------------------------------------------------------------------
// The phone: a full-height sheet of two lists

test('on a phone edit mode is a full-height sheet of two lists, and the top bar has no edit bar', async () => {
  const { repository } = await mount({ phone: true });
  await edit();
  const sheet = await screen.findByRole('dialog', { name: 'Edit template' });
  expect(
    (
      within(sheet).getByRole('textbox', {
        name: 'Template name',
      }) as HTMLInputElement
    ).value,
  ).toBe('Main');
  const lists = within(sheet).getAllByRole('list');
  expect(lists).toHaveLength(2);
  expect(
    within(lists[0]!)
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('aria-label')),
  ).toEqual([
    'Net P&L',
    'Trade win rate',
    'Profit factor',
    'Day win rate',
    'Average win to loss',
  ]);
  expect(within(lists[1]!).getAllByRole('listitem')).toHaveLength(10);
  // The wide-screen bar (its hint) is not drawn.
  expect(
    screen.queryByText('Drag a widget, or use its arrows, to move it.'),
  ).toBeNull();
  // Up and down, remove.
  const edge = within(sheet).getByRole('listitem', { name: 'Edge score' });
  fireEvent.click(
    within(edge).getByRole('button', { name: 'Move Edge score later' }),
  );
  expect(
    within(within(sheet).getAllByRole('list')[1]!)
      .getAllByRole('listitem')
      .slice(0, 2)
      .map((li) => li.getAttribute('aria-label')),
  ).toEqual(['Progress tracker', 'Edge score']);
  fireEvent.click(
    within(sheet).getByRole('button', { name: 'Remove Net P&L' }),
  );
  expect(
    within(within(sheet).getAllByRole('list')[0]!).getAllByRole('listitem'),
  ).toHaveLength(4);
  // The add rows: the upper one appears with room, the lower one always.
  const adds = within(sheet).getAllByRole('button', { name: /^Add a widget/ });
  expect(adds).toHaveLength(2);
  fireEvent.click(adds[1]!);
  const picker = await screen.findByRole('dialog', { name: 'Add a widget' });
  fireEvent.click(within(picker).getByRole('button', { name: 'Add Report' }));
  fireEvent.keyDown(picker, { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Add a widget' })).toBeNull(),
  );
  expect(
    within(within(sheet).getAllByRole('list')[1]!).getAllByRole('listitem'),
  ).toHaveLength(11);
  // Save, Cancel and Delete (none: one template) at the foot.
  expect(
    within(sheet).queryByRole('button', { name: 'Delete template' }),
  ).toBeNull();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Save template' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Edit template' })).toBeNull(),
  );
  const saved = (await stored(repository))!.templates[0]!;
  expect(keysOf(saved.upper)).toEqual([
    'trade-win',
    'profit-factor',
    'day-win',
    'win-loss-ratio',
  ]);
  expect(keysOf(saved.lower).slice(0, 2)).toEqual(['progress', 'score']);
  expect(keysOf(saved.lower).at(-1)).toBe('report');
});

test('on a phone the sheet has Cancel and, with several templates, Delete template at its foot', async () => {
  const { repository } = await mount({ phone: true, dashboards: two });
  await edit('Review');
  const sheet = await screen.findByRole('dialog', { name: 'Edit template' });
  within(sheet).getByRole('button', { name: 'Delete template' });
  fireEvent.click(
    within(sheet).getByRole('button', { name: 'Remove Drawdown' }),
  );
  fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Edit template' })).toBeNull(),
  );
  expect((await stored(repository))!.templates[1]).toEqual(review);
});

// ---------------------------------------------------------------------------
// The edit bar is a pinned row (E52)

test("edit mode's bar is pinned and tells what pins under it how tall it is; leaving it hands the token back to the top bar", async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return {
        left: 0,
        width: 0,
        right: 0,
        top: 0,
        bottom: 0,
        height: this.tagName === 'HEADER' ? 92 : 0,
      } as DOMRect;
    },
  );
  await mount({ dashboards: two });
  await edit();
  await nameField();
  const bar = screen.getByRole('banner');
  expect(bar.getAttribute('aria-label')).toBe('Editing a dashboard template');
  expect(bar.hasAttribute('data-pinned')).toBe(true);
  await waitFor(() =>
    expect(document.documentElement.style.getPropertyValue('--top-bar')).toBe(
      '92px',
    ),
  );
  fireEvent.click(button('Cancel'));
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Template name' })).toBeNull(),
  );
  // The top bar is back and publishes its own height.
  await waitFor(() =>
    expect(screen.getByRole('banner').hasAttribute('data-pinned')).toBe(true),
  );
  expect(screen.getByRole('banner').getAttribute('aria-label')).toBeNull();
  expect(document.documentElement.style.getPropertyValue('--top-bar')).toBe(
    '92px',
  );
});

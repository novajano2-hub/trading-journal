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
import { afterEach, expect, test, vi } from 'vitest';
import { createLocalRepository } from '@/data/local/local-repository';
import { renderApp } from '../__fixtures__/render-app';
import { reportsSample } from '../__fixtures__/reports-sample';
import { figureKeys } from './overview-choice';
import { OverviewView } from './overview';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const URL = '/app/reports';

async function page(hidden?: string[]) {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: reportsSample,
  });
  if (hidden) await repository.prefs.update({ overviewHidden: hidden });
  const view = renderApp(<OverviewView />, { repository, url: URL });
  const root = await screen.findByTestId('reports-overview');
  return { ...view, root };
}

const shown = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-figure]')].map(
    (e) => (e as HTMLElement).dataset.figure,
  );

async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Choose figures' }));
  return screen.findByRole('dialog', { name: 'Choose figures' });
}

const group = (dialog: HTMLElement, name: string) =>
  within(dialog).getByRole('group', { name });

/** Drawn only while a closed trade carries a swap, listed in the dialog always. */
const WHILE_SWAPPED = ['gross-net:swap'];

test('every figure on the page is in the list, and every figure in the list is on the page', async () => {
  const { root } = await page();
  expect(shown(root).sort()).toEqual(
    figureKeys()
      .filter((k) => !WHILE_SWAPPED.includes(k))
      .sort(),
  );
  const dialog = await openDialog();
  const boxes = within(dialog).getAllByRole('checkbox');
  expect(boxes).toHaveLength(figureKeys().length);
  // All on by default.
  expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
});

test('with a swap on a trade, the page draws every figure in the list', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const s = await reportsSample();
      s.trades = s.trades.map((t, i) => (i === 0 ? { ...t, swap: -486 } : t));
      return s;
    },
  });
  renderApp(<OverviewView />, { repository, url: URL });
  const root = await screen.findByTestId('reports-overview');
  expect(shown(root).sort()).toEqual([...figureKeys()].sort());
});

test('the Swap line of Gross to net hides as gross-net:swap, apart from the Costs figure', async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => {
      const s = await reportsSample();
      s.trades = s.trades.map((t, i) => (i === 0 ? { ...t, swap: -486 } : t));
      return s;
    },
  });
  const view = renderApp(<OverviewView />, { repository, url: URL });
  const root = await screen.findByTestId('reports-overview');
  expect(shown(root)).toContain('gross-net:swap');
  const dialog = await openDialog();
  const box = within(group(dialog, 'Gross to net')).getByRole('checkbox', {
    name: 'Swap',
  }) as HTMLInputElement;
  expect(box.checked).toBe(true);
  fireEvent.click(box);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(root.querySelector('[data-figure="gross-net:swap"]')).toBeNull(),
  );
  // The Costs card's own Swap is a different figure and stays.
  expect(shown(root)).toContain('costs:swap');
  await waitFor(async () =>
    expect((await view.repo.prefs.get()).overviewHidden).toEqual([
      'gross-net:swap',
    ]),
  );
});

test('with no swap the dialog still lists the Gross to net Swap line, reading None', async () => {
  await page();
  const dialog = await openDialog();
  const box = within(group(dialog, 'Gross to net')).getByRole('checkbox', {
    name: 'Swap',
  }) as HTMLInputElement;
  expect(box.checked).toBe(true);
  expect(
    document.getElementById(box.getAttribute('aria-describedby')!)!.textContent,
  ).toBe('None');
});

test('the dialog shows each figure with its current value', async () => {
  await page();
  const dialog = await openDialog();
  const key = group(dialog, 'Key figures');
  const net = within(key).getByRole('checkbox', { name: 'Net P&L' });
  // Net +$125.00 on 9 trades; the value is described, not part of the name.
  expect(
    document.getElementById(net.getAttribute('aria-describedby')!)!.textContent,
  ).toBe('+$125.00');
  const winRate = within(key).getByRole('checkbox', { name: 'Win rate' });
  expect(
    document.getElementById(winRate.getAttribute('aria-describedby')!)!
      .textContent,
  ).toContain('55.6%');
  // The costs read as the page reads them.
  expect(within(group(dialog, 'Costs')).getAllByText('$0.00')).toHaveLength(2);
});

test('Save hides the unchecked figures, keeps the rest, and stores the choice', async () => {
  const { root, repo } = await page();
  const dialog = await openDialog();
  fireEvent.click(
    within(group(dialog, 'Key figures')).getByRole('checkbox', {
      name: 'Win rate',
    }),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(root.querySelector('[data-kpi="win-rate"]')).toBeNull();
  expect(root.querySelector('[data-kpi="pnl"]')).not.toBeNull();
  // The same metric in another group stays.
  expect(root.querySelector('[data-figure="sides:win-rate"]')).not.toBeNull();
  await waitFor(async () =>
    expect((await repo.prefs.get()).overviewHidden).toEqual(['key:win-rate']),
  );
  // Reopened, the box is off and the others are on.
  const again = await openDialog();
  expect(
    (
      within(group(again, 'Key figures')).getByRole('checkbox', {
        name: 'Win rate',
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});

test('Cancel and Escape leave the choice as it was, and focus returns to the button', async () => {
  const { root } = await page();
  const button = screen.getByRole('button', { name: 'Choose figures' });
  let dialog = await openDialog();
  fireEvent.click(
    within(group(dialog, 'Key figures')).getByRole('checkbox', {
      name: 'Win rate',
    }),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(root.querySelector('[data-kpi="win-rate"]')).not.toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(button));

  dialog = await openDialog();
  fireEvent.click(
    within(group(dialog, 'Key figures')).getByRole('checkbox', {
      name: 'Win rate',
    }),
  );
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(root.querySelector('[data-kpi="win-rate"]')).not.toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(button));
  // A reopened dialog starts from what is saved, not from the abandoned draft.
  const fresh = await openDialog();
  expect(
    (
      within(group(fresh, 'Key figures')).getByRole('checkbox', {
        name: 'Win rate',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
});

test('a group whose figures are all hidden disappears; one figure back brings it', async () => {
  const { root } = await page([
    'costs:commissions',
    'costs:fill-fees',
    'costs:swap',
    'hold:hold-time',
  ]);
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Costs' })).toBeNull(),
  );
  expect(screen.getByRole('region', { name: 'Hold time' })).toBeTruthy();
  expect(shown(root)).not.toContain('hold:hold-time');
  expect(shown(root)).toContain('hold:hold-time-wins');
  const dialog = await openDialog();
  // The hidden ones are listed, and off.
  expect(
    (
      within(group(dialog, 'Costs')).getByRole('checkbox', {
        name: 'Commissions',
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  fireEvent.click(
    within(group(dialog, 'Costs')).getByRole('checkbox', {
      name: 'Commissions',
    }),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Costs' })).toBeTruthy(),
  );
  expect(shown(root)).toContain('costs:commissions');
  expect(shown(root)).not.toContain('costs:fill-fees');
});

test('the Overview lists Swap in costs and can hide it', async () => {
  const { root, repo } = await page();
  expect(shown(root)).toContain('costs:swap');
  const dialog = await openDialog();
  const box = within(group(dialog, 'Costs')).getByRole('checkbox', {
    name: 'Swap',
  }) as HTMLInputElement;
  // On by default, and None while no closed trade carries a swap.
  expect(box.checked).toBe(true);
  expect(
    document.getElementById(box.getAttribute('aria-describedby')!)!.textContent,
  ).toBe('None');
  fireEvent.click(box);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(root.querySelector('[data-figure="costs:swap"]')).toBeNull(),
  );
  // The other costs stay, so does the card.
  expect(shown(root)).toContain('costs:commissions');
  expect(shown(root)).toContain('costs:fill-fees');
  await waitFor(async () =>
    expect((await repo.prefs.get()).overviewHidden).toEqual(['costs:swap']),
  );
});

test('hiding every key figure removes the key figures section', async () => {
  const { root } = await page(figureKeys().filter((k) => k.startsWith('key:')));
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Key figures' })).toBeNull(),
  );
  expect(root.querySelector('[data-kpi]')).toBeNull();
  expect(screen.getByRole('region', { name: 'Gross to net' })).toBeTruthy();
});

test('Show all turns every figure back on in the draft, and applies only at Save', async () => {
  const { root, repo } = await page(['costs:commissions', 'key:win-rate']);
  await waitFor(() =>
    expect(root.querySelector('[data-kpi="win-rate"]')).toBeNull(),
  );
  const dialog = await openDialog();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Show all' }));
  expect(
    within(dialog)
      .getAllByRole('checkbox')
      .every((b) => (b as HTMLInputElement).checked),
  ).toBe(true);
  // Not yet applied.
  expect(root.querySelector('[data-kpi="win-rate"]')).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(root.querySelector('[data-kpi="win-rate"]')).not.toBeNull(),
  );
  await waitFor(async () =>
    expect((await repo.prefs.get()).overviewHidden).toEqual([]),
  );
});

test('the footer is a sibling after the scrolling list, so rows never run past it', async () => {
  renderApp(<OverviewView />, { sample: reportsSample, url: URL });
  const root = await screen.findByTestId('reports-overview');
  fireEvent.click(within(root).getByRole('button', { name: 'Choose figures' }));
  const dialog = await screen.findByRole('dialog', { name: 'Choose figures' });
  const save = within(dialog).getByRole('button', { name: 'Save' });
  const firstRow = dialog.querySelector('[data-choice]')!;
  let scroller: HTMLElement | null = firstRow.parentElement;
  while (scroller && !scroller.className.includes('overflow-y-auto'))
    scroller = scroller.parentElement;
  expect(scroller).not.toBeNull();
  expect(scroller!.contains(save)).toBe(false);
  expect(scroller!.className).toContain('min-h-0');
  expect(scroller!.className).toContain('flex-1');
  expect(save.closest('.sticky')).toBeNull();
});

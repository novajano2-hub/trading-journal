// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { StatsChooser, type StatChoice } from './stats-chooser';

MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

const ROWS: StatChoice[] = [
  { id: 'avg-entry', label: 'Avg entry', value: '1.15390', listed: true },
  { id: 'fees', label: 'Fees', value: '−$14.00', listed: true },
  { id: 'swap', label: 'Swap', value: '−$4.86', listed: true },
  { id: 'targets', label: 'Targets', value: '2 levels', listed: true },
  { id: 'mae', label: 'MAE', value: 'Not recorded', listed: true },
  // A forex trade has no Points: not listed, kept as the choice has it.
  { id: 'points', label: 'Points', value: undefined, listed: false },
];
const ALL = ROWS.map((r) => r.id);

function open(shown: readonly string[] = ALL, onSave = vi.fn()) {
  render(<StatsChooser rows={ROWS} shown={shown} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose stats' }));
  return onSave;
}

const dialog = () => screen.findByRole('dialog', { name: 'Choose stats' });
const box = (name: string) =>
  screen.getByRole('checkbox', { name }) as HTMLInputElement;

test('every row is on by default', async () => {
  open();
  const d = await dialog();
  const boxes = within(d).getAllByRole('checkbox') as HTMLInputElement[];
  // Five listed rows; Points is not on this trade.
  expect(boxes).toHaveLength(5);
  expect(boxes.every((b) => b.checked)).toBe(true);
  expect(within(d).queryByText('Points')).toBeNull();
});

test('each row shows its current value, and the header figures are not listed', async () => {
  open();
  const d = await dialog();
  expect(d.textContent).toContain('Avg entry1.15390');
  expect(d.textContent).toContain('Fees−$14.00');
  expect(d.textContent).toContain('Targets2 levels');
  expect(d.textContent).toContain('MAENot recorded');
  expect(
    within(d).getByText(
      'Net P&L, Net ROI and Realized R at the top of the trade always show.',
    ),
  ).toBeTruthy();
  expect(within(d).queryByRole('checkbox', { name: 'Net P&L' })).toBeNull();
});

test('unticking is held until Save, then saves the rows still ticked', async () => {
  const onSave = open();
  await dialog();
  fireEvent.click(box('Swap'));
  fireEvent.click(box('MAE'));
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  // Points was never listed here; it stays on.
  expect(onSave).toHaveBeenCalledWith([
    'avg-entry',
    'fees',
    'targets',
    'points',
  ]);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('a row the trade lacks keeps the state the choice gave it', async () => {
  const onSave = open(['avg-entry', 'fees', 'swap', 'targets', 'mae']);
  await dialog();
  fireEvent.click(box('Fees'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  // Points was off and stays off.
  expect(onSave).toHaveBeenCalledWith(['avg-entry', 'swap', 'targets', 'mae']);
});

test('Cancel and Escape throw the change away, and the next open starts from the saved choice', async () => {
  const onSave = open(['avg-entry', 'fees']);
  await dialog();
  expect(box('Fees').checked).toBe(true);
  expect(box('Swap').checked).toBe(false);
  fireEvent.click(box('Swap'));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Choose stats' }));
  await dialog();
  expect(box('Swap').checked).toBe(false);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(onSave).not.toHaveBeenCalled();
});

test('Reset to default ticks every row, and Save then clears the choice', async () => {
  const onSave = open(['avg-entry']);
  await dialog();
  expect(
    (screen.getAllByRole('checkbox') as HTMLInputElement[]).filter(
      (b) => b.checked,
    ),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
  expect(
    (screen.getAllByRole('checkbox') as HTMLInputElement[]).every(
      (b) => b.checked,
    ),
  ).toBe(true);
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(undefined);
});

test('ticking every row again saves the default too, not a list', async () => {
  const onSave = open(['avg-entry', 'fees', 'swap', 'targets', 'points']);
  await dialog();
  fireEvent.click(box('MAE'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(undefined);
});

test('the search narrows the rows by their names, and says when none match', async () => {
  open();
  const d = await dialog();
  const search = within(d).getByRole('searchbox', { name: 'Search stats' });
  fireEvent.change(search, { target: { value: 'fee' } });
  expect(within(d).getAllByRole('checkbox')).toHaveLength(1);
  expect(box('Fees')).toBeTruthy();
});

test('a search hides rows without losing their ticks', async () => {
  const onSave = open();
  const d = await dialog();
  fireEvent.change(within(d).getByRole('searchbox', { name: 'Search stats' }), {
    target: { value: 'swap' },
  });
  fireEvent.click(box('Swap'));
  fireEvent.change(within(d).getByRole('searchbox', { name: 'Search stats' }), {
    target: { value: 'zzz' },
  });
  expect(within(d).queryAllByRole('checkbox')).toHaveLength(0);
  expect(within(d).getByText('No stat matches.')).toBeTruthy();
  fireEvent.change(within(d).getByRole('searchbox', { name: 'Search stats' }), {
    target: { value: '' },
  });
  fireEvent.click(within(d).getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith([
    'avg-entry',
    'fees',
    'targets',
    'mae',
    'points',
  ]);
});

test('a failed save keeps the dialog open and says so', async () => {
  const onSave = vi.fn(async () => {
    throw new Error('disk');
  });
  open(ALL, onSave);
  await dialog();
  fireEvent.click(box('Swap'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain("Couldn't save");
  expect(screen.getByRole('dialog')).toBeTruthy();
  // The choice is still the draft, so Save can be tried again.
  expect(box('Swap').checked).toBe(false);
});

test('the footer reads Reset to default, Cancel, Save; never the banned words', async () => {
  open();
  const d = await dialog();
  const buttons = within(d)
    .getAllByRole('button')
    .map((b) => b.textContent);
  expect(buttons).toEqual(
    expect.arrayContaining(['Reset to default', 'Cancel', 'Save']),
  );
  expect(d.textContent).not.toMatch(
    /Customize Info|Select Default|Update|Reset to defaults/,
  );
});

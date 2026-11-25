// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { MonthPicker } from './month-picker';

afterEach(cleanup);

function Harness({ onPick }: { onPick(d: string): void }) {
  const [month, setMonth] = useState('2026-11');
  return (
    <MonthPicker
      month={month}
      onMonth={setMonth}
      today="2026-11-19"
      weekStart="monday"
      label="Pick a day"
      onPick={onPick}
    />
  );
}

test('today is ringed and a future date can be picked', () => {
  const onPick = vi.fn();
  render(<Harness onPick={onPick} />);
  expect(
    screen
      .getByRole('gridcell', { name: /^19 November 2026$/ })
      .getAttribute('aria-current'),
  ).toBe('date');
  const future = screen.getByRole('gridcell', { name: /^28 November 2026$/ });
  expect(future.hasAttribute('disabled')).toBe(false);
  fireEvent.click(future);
  expect(onPick).toHaveBeenCalledWith('2026-11-28');
});

test('the week starts on the chosen day', () => {
  render(<Harness onPick={() => {}} />);
  const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
  expect(heads[0]).toBe('Mon');
  expect(heads[6]).toBe('Sun');
});

test('the month and year dropdowns and the arrows change the month', () => {
  render(<Harness onPick={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(
    screen.getByRole('gridcell', { name: /^1 December 2026$/ }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  expect(
    screen.getByRole('gridcell', { name: /^31 October 2026$/ }),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), {
    target: { value: '03' },
  });
  expect(
    screen.getByRole('gridcell', { name: /^15 March 2026$/ }),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Year' }), {
    target: { value: '2027' },
  });
  expect(
    screen.getByRole('gridcell', { name: /^15 March 2027$/ }),
  ).toBeTruthy();
});

test('arrow keys move and Enter picks', () => {
  const onPick = vi.fn();
  render(<Harness onPick={onPick} />);
  const today = screen.getByRole('gridcell', { name: /^19 November 2026$/ });
  today.focus();
  fireEvent.keyDown(today, { key: 'ArrowRight' });
  const next = screen.getByRole('gridcell', { name: /^20 November 2026$/ });
  expect(document.activeElement).toBe(next);
  fireEvent.keyDown(next, { key: 'ArrowDown' });
  const week = screen.getByRole('gridcell', { name: /^27 November 2026$/ });
  expect(document.activeElement).toBe(week);
  fireEvent.keyDown(week, { key: 'Enter' });
  expect(onPick).toHaveBeenCalledWith('2026-11-27');
});

test('arrowing past the month end moves to the next month', () => {
  render(<Harness onPick={() => {}} />);
  const last = screen.getByRole('gridcell', { name: /^30 November 2026$/ });
  last.focus();
  fireEvent.keyDown(last, { key: 'ArrowRight' });
  expect(document.activeElement?.getAttribute('aria-label') ?? '').toMatch(
    /^1 December 2026$/,
  );
});

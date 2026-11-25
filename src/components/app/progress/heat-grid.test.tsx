// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DayScore } from '@/domain/tracker/score';
import type { Tracker } from '@/domain/types';
import { defaultVersion } from '@/domain/tracker/defaults';
import { HeatGrid } from './heat-grid';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const today = '2026-11-24'; // a Tuesday
const tracker: Tracker = {
  id: 'tracker',
  workspaceId: 'w',
  startedOn: '2026-06-01',
  versions: [defaultVersion('2026-06-01')],
};
const day = (date: string, met: number, active = 8): DayScore => ({
  date,
  rules: [],
  met,
  active,
  perfect: met === active,
  finished: true,
});
const off = (date: string): DayScore => ({
  date,
  unscored: 'not-trading-day',
  rules: [],
  met: 0,
  active: 0,
  perfect: false,
  finished: false,
});
const days: DayScore[] = [
  day('2026-11-02', 8),
  day('2026-11-03', 4),
  day('2026-11-04', 0),
  day('2026-11-05', 8),
  off('2026-11-07'),
  day('2026-11-24', 6),
];

const grid = (p: Partial<Parameters<typeof HeatGrid>[0]> = {}) =>
  render(
    <HeatGrid
      days={days}
      today={today}
      tracker={tracker}
      markToday
      paging={false}
      label="Rules met each scored day"
      {...p}
    />,
  );
const cell = (name: string | RegExp) => screen.getByRole('gridcell', { name });

test('unscored days are blank and scored days carry their step', () => {
  grid();
  expect(cell('Mon 2 Nov, 8 of 8 rules met').getAttribute('data-step')).toBe(
    '4',
  );
  expect(cell('Tue 3 Nov, 4 of 8 rules met').getAttribute('data-step')).toBe(
    '2',
  );
  expect(cell('Wed 4 Nov, 0 of 8 rules met').getAttribute('data-step')).toBe(
    '0',
  );
  expect(cell('Tue 24 Nov, 6 of 8 rules met').getAttribute('data-step')).toBe(
    '3',
  );
  const blank = cell('Sat 7 Nov, not scored');
  expect(blank.hasAttribute('data-step')).toBe(false);
  // A day the scorer never saw is blank too.
  expect(cell('Sun 8 Nov, not scored').hasAttribute('data-step')).toBe(false);
});

test('the grid starts at the first day and stops at today', () => {
  grid({ tracker: { ...tracker, startedOn: '2026-11-04' } });
  expect(screen.queryByRole('gridcell', { name: /^Tue 3 Nov/ })).toBeNull();
  expect(screen.getByRole('gridcell', { name: /^Wed 4 Nov/ })).toBeTruthy();
  expect(screen.getByRole('gridcell', { name: /^Tue 24 Nov/ })).toBeTruthy();
  expect(screen.queryByRole('gridcell', { name: /^Wed 25 Nov/ })).toBeNull();
});

test('rows run in week order, Sunday first by default, Monday first on request', () => {
  const { unmount } = grid();
  const rows = () =>
    screen.getAllByRole('row').map((r) => r.getAttribute('data-weekday'));
  expect(rows()).toEqual(['0', '1', '2', '3', '4', '5', '6']);
  unmount();
  grid({ weekStart: 'monday' });
  expect(rows()).toEqual(['1', '2', '3', '4', '5', '6', '0']);
});

test('today carries a mark only when asked', () => {
  const { unmount } = grid();
  expect(cell(/^Tue 24 Nov/).hasAttribute('data-today')).toBe(true);
  unmount();
  grid({ markToday: false });
  expect(cell(/^Tue 24 Nov/).hasAttribute('data-today')).toBe(false);
});

test('hover and focus read the date and p of n rules met', () => {
  grid();
  const readout = screen.getByRole('status');
  expect(readout.textContent).not.toContain('rules met');
  fireEvent.mouseEnter(cell(/^Mon 2 Nov/));
  expect(readout.textContent).toContain('Mon 2 Nov, 8 of 8 rules met');
  fireEvent.mouseLeave(cell(/^Mon 2 Nov/));
  expect(readout.textContent).not.toContain('rules met');
  fireEvent.focus(cell(/^Tue 3 Nov/));
  expect(readout.textContent).toContain('Tue 3 Nov, 4 of 8 rules met');
});

test('arrow keys move through the grid on one tab stop', () => {
  grid();
  const stops = screen
    .getAllByRole('gridcell')
    .filter((c) => c.getAttribute('tabindex') === '0');
  expect(stops).toHaveLength(1);
  const start = cell(/^Tue 24 Nov/);
  expect(stops[0]).toBe(start);
  start.focus();
  fireEvent.keyDown(start, { key: 'ArrowLeft' });
  expect(document.activeElement).toBe(cell(/^Tue 17 Nov/));
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
  expect(document.activeElement).toBe(cell(/^Mon 16 Nov/));
});

test('the text alternative names the range and the perfect days', () => {
  grid();
  const g = screen.getByRole('grid');
  expect(g.getAttribute('aria-label')).toBe('Rules met each scored day');
  const text = document.getElementById(
    g.getAttribute('aria-describedby')!,
  )!.textContent!;
  expect(text).toContain('Mon 1 Jun to Tue 24 Nov');
  expect(text).toContain('5 scored days');
  expect(text).toContain('2 perfect days');
  expect(text).toContain('Mon 2 Nov');
  expect(text).toContain('Thu 5 Nov');
});

test('Today pages back to the latest weeks', () => {
  // Room for about seven weeks of small cells.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 160,
    height: 100,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 160,
    bottom: 100,
    toJSON: () => ({}),
  });
  grid({ paging: true });
  expect(screen.queryByRole('gridcell', { name: /^Mon 5 Oct/ })).toBeNull();
  expect(screen.getByRole('gridcell', { name: /^Tue 24 Nov/ })).toBeTruthy();
  const later = screen.getByRole('button', { name: 'Later weeks' });
  expect(later.getAttribute('aria-disabled')).toBe('true');

  fireEvent.click(screen.getByRole('button', { name: 'Earlier weeks' }));
  expect(screen.queryByRole('gridcell', { name: /^Tue 24 Nov/ })).toBeNull();
  expect(screen.getByRole('gridcell', { name: /^Mon 5 Oct/ })).toBeTruthy();
  expect(later.getAttribute('aria-disabled')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Today' }));
  expect(screen.getByRole('gridcell', { name: /^Tue 24 Nov/ })).toBeTruthy();
  expect(later.getAttribute('aria-disabled')).toBe('true');
});

test('without paging there are no controls', () => {
  grid();
  expect(screen.queryByRole('button', { name: 'Today' })).toBeNull();
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { EMPTY_FILTERS } from '@/data/filters';
import { ActiveFilters } from './active-filters';

afterEach(cleanup);

test('nothing shows while no such filter is set', () => {
  const { container } = render(
    <ActiveFilters filters={EMPTY_FILTERS} onChange={() => {}} />,
  );
  expect(container.textContent).toBe('');
});

test('each filter is a chip with a button that clears it alone', () => {
  const onChange = vi.fn();
  render(
    <ActiveFilters
      filters={{
        ...EMPTY_FILTERS,
        weekdays: [3],
        duration: { min: 1, max: 5, maxExclusive: true },
      }}
      onChange={onChange}
    />,
  );
  const list = screen.getByRole('list', { name: 'Other filters in use' });
  expect(list.textContent).toContain('Entry weekday: Wed');
  expect(list.textContent).toContain('Duration: 1 to under 5 min');
  fireEvent.click(
    screen.getByRole('button', { name: 'Clear Entry weekday: Wed' }),
  );
  expect(onChange).toHaveBeenCalledTimes(1);
  const next = onChange.mock.calls[0]![0];
  expect(next.weekdays).toEqual([]);
  expect(next.duration).toEqual({ min: 1, max: 5, maxExclusive: true });
});
